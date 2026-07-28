import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, listAgencyBookings } from "@/lib/agency/store";
import type { AgencyBooking } from "@/lib/agency/types";

/**
 * Production.
 *
 * What the agency sold, by month and by the agent who sold it. Cancelled and
 * failed bookings are excluded from the totals rather than shown as zero rows:
 * a month's production is what stood, and counting a booking that was dropped
 * would flatter every figure on the page. They are still counted separately so
 * a high cancellation rate is visible rather than invisible.
 */
interface Bucket {
  key: string;
  label: string;
  bookings: number;
  cancelled: number;
  cost: number;
  sell: number;
  margin: number;
}

function bucket(key: string, label: string): Bucket {
  return { key, label, bookings: 0, cancelled: 0, cost: 0, sell: 0, margin: 0 };
}

function tally(into: Map<string, Bucket>, key: string, label: string, booking: AgencyBooking): void {
  const row = into.get(key) ?? bucket(key, label);
  if (booking.status === "cancelled" || booking.status === "failed") {
    row.cancelled += 1;
  } else {
    row.bookings += 1;
    row.cost += booking.cost;
    row.sell += booking.sell;
    row.margin += booking.sell - booking.cost;
  }
  into.set(key, row);
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [agency, bookings] = await Promise.all([getAgency(session.agencyId), listAgencyBookings(session.agencyId)]);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const byMonth = new Map<string, Bucket>();
  const byAgent = new Map<string, Bucket>();
  const byHotel = new Map<string, Bucket>();

  for (const booking of bookings) {
    const month = booking.createdAt.slice(0, 7);
    tally(byMonth, month, month, booking);
    tally(byAgent, booking.agentId, booking.agentName, booking);
    tally(byHotel, booking.hotelName, booking.hotelName, booking);
  }

  const sortByMargin = (a: Bucket, b: Bucket) => b.margin - a.margin;

  return ok({
    currency: agency.credit.currency,
    months: [...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key)),
    agents: [...byAgent.values()].sort(sortByMargin),
    hotels: [...byHotel.values()].sort(sortByMargin).slice(0, 10),
    totals: [...byMonth.values()].reduce(
      (sum, row) => ({
        bookings: sum.bookings + row.bookings,
        cancelled: sum.cancelled + row.cancelled,
        cost: sum.cost + row.cost,
        sell: sum.sell + row.sell,
        margin: sum.margin + row.margin,
      }),
      { bookings: 0, cancelled: 0, cost: 0, sell: 0, margin: 0 },
    ),
  });
}
