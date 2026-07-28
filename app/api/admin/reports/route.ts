import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings } from "@/lib/server/store";
import { listAgencies, listAgencyBookings } from "@/lib/agency/store";
import type { Booking } from "@/lib/types";

/**
 * How the platform is actually trading.
 *
 * Split by channel throughout, because direct and trade earn differently on the
 * same room: on a direct booking we keep the whole markup, on a trade booking
 * we keep it less the agency's commission. A blended revenue line would move
 * for reasons nobody could explain.
 *
 * Cancelled bookings are counted but excluded from value. A cancellation rate
 * is a health number; counting its value as revenue is how a good month gets
 * reported off the back of bookings that no longer exist.
 */
interface Bucket {
  key: string;
  label: string;
  direct: number;
  trade: number;
  cancelled: number;
  gross: number;
  retained: number;
}

function bucket(key: string, label: string): Bucket {
  return { key, label, direct: 0, trade: 0, cancelled: 0, gross: 0, retained: 0 };
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const [bookings, agencies] = await Promise.all([listBookings(), listAgencies()]);

  const trade = new Map<string, { agencyId: string; agencyName: string; cost: number }>();
  for (const agency of agencies) {
    for (const record of await listAgencyBookings(agency.id)) {
      trade.set(record.reference, { agencyId: agency.id, agencyName: agency.name, cost: record.cost });
    }
  }

  const months = new Map<string, Bucket>();
  const properties = new Map<string, Bucket>();
  const league = new Map<string, Bucket>();

  const tally = (into: Map<string, Bucket>, key: string, label: string, booking: Booking) => {
    const row = into.get(key) ?? bucket(key, label);
    const record = trade.get(booking.reference);

    if (booking.status === "cancelled" || booking.status === "failed") {
      row.cancelled += 1;
    } else {
      if (record) row.trade += 1;
      else row.direct += 1;
      row.gross += booking.price.total;
      // What we keep: the whole public price on a direct sale, and the price
      // less the agency's cost on a trade one.
      row.retained += record ? booking.price.total - record.cost : booking.price.total;
    }
    into.set(key, row);
  };

  for (const booking of bookings) {
    const month = booking.createdAt.slice(0, 7);
    tally(months, month, month, booking);
    tally(properties, booking.hotelName, booking.hotelName, booking);
    const record = trade.get(booking.reference);
    if (record) tally(league, record.agencyId, record.agencyName, booking);
  }

  const live = bookings.filter((b) => b.status !== "cancelled" && b.status !== "failed");
  const cancelled = bookings.filter((b) => b.status === "cancelled" || b.status === "failed");

  return ok({
    totals: {
      bookings: live.length,
      cancelled: cancelled.length,
      cancellationRate: bookings.length ? Math.round((cancelled.length / bookings.length) * 1000) / 10 : 0,
      gross: live.reduce((sum, b) => sum + b.price.total, 0),
      direct: live.filter((b) => !trade.has(b.reference)).length,
      trade: live.filter((b) => trade.has(b.reference)).length,
      averageValue: live.length ? Math.round(live.reduce((sum, b) => sum + b.price.total, 0) / live.length) : 0,
    },
    months: [...months.values()].sort((a, b) => b.key.localeCompare(a.key)),
    properties: [...properties.values()].sort((a, b) => b.gross - a.gross).slice(0, 15),
    agencies: [...league.values()].sort((a, b) => b.retained - a.retained),
  });
}
