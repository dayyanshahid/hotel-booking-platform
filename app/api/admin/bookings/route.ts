import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings } from "@/lib/server/store";
import { listAgencies, listAgencyBookings } from "@/lib/agency/store";
import type { Booking } from "@/lib/types";

/**
 * Every booking on the platform, filterable.
 *
 * The one screen support actually lives in. Filtering happens here rather than
 * in the browser because "show me everything that needs attention" has to be
 * answerable when there are more bookings than a page can hold.
 *
 * Each row is labelled direct or trade, resolved from the commercial records
 * rather than inferred: a trade booking is indistinguishable from a direct one
 * in the booking itself, which is deliberate — the guest experience is the same.
 */
const ATTENTION = new Set(["pending", "processing", "reconciliationRequired", "failed"]);

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  const channel = url.searchParams.get("channel") ?? "all";
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  /**
   * Dates filter on when the booking was *made*, not when the stay is.
   * "What did we write last week" and "who is arriving next week" are different
   * questions; this screen answers the first, and the label says so.
   */
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const [all, agencies] = await Promise.all([listBookings(), listAgencies()]);

  const trade = new Map<string, { agencyId: string; agencyName: string; cost: number; sell: number }>();
  for (const agency of agencies) {
    for (const record of await listAgencyBookings(agency.id)) {
      trade.set(record.reference, {
        agencyId: agency.id,
        agencyName: agency.name,
        cost: record.cost,
        sell: record.sell,
      });
    }
  }

  const matches = (booking: Booking): boolean => {
    if (status === "attention" && !ATTENTION.has(booking.status)) return false;
    if (status !== "all" && status !== "attention" && booking.status !== status) return false;
    if (channel === "direct" && trade.has(booking.reference)) return false;
    if (channel === "trade" && !trade.has(booking.reference)) return false;
    const day = booking.createdAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!query) return true;
    return [booking.reference, booking.hotelName, booking.contact.email, booking.guests[0]?.surname ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  };

  const rows = all
    .filter(matches)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((booking) => ({
      reference: booking.reference,
      status: booking.status,
      hotelName: booking.hotelName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guest: `${booking.guests[0]?.firstName ?? ""} ${booking.guests[0]?.surname ?? ""}`.trim(),
      email: booking.contact.email,
      total: booking.price.total,
      currency: booking.price.currency,
      createdAt: booking.createdAt,
      channel: trade.has(booking.reference) ? ("trade" as const) : ("direct" as const),
      agencyName: trade.get(booking.reference)?.agencyName,
    }));

  if (url.searchParams.get("format") === "csv") {
    const csv = [
      ["reference", "status", "channel", "agency", "property", "guest", "email", "checkIn", "checkOut", "total", "currency", "bookedAt"].join(","),
      ...rows.map((row) =>
        [
          row.reference,
          row.status,
          row.channel,
          row.agencyName ?? "",
          // A property or guest name containing a comma would otherwise split
          // into two columns.
          `"${row.hotelName.replace(/"/g, '""')}"`,
          `"${row.guest.replace(/"/g, '""')}"`,
          row.email,
          row.checkIn,
          row.checkOut,
          row.total,
          row.currency,
          row.createdAt,
        ].join(","),
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bookings.csv"`,
      },
    });
  }

  return ok({ bookings: rows, total: all.length, shown: rows.length });
}
