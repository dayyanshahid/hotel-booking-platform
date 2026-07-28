import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings, listCases } from "@/lib/server/store";
import { listAgencies, listAgencyBookings } from "@/lib/agency/store";

/**
 * Who has booked.
 *
 * There is no customer table to read — this platform never asked anyone to
 * register, which is the point of the guest flow. A customer is therefore
 * *derived*: an email that appears on bookings, with everything else joined to
 * it. That is honest about what we actually hold, and it means the directory
 * cannot drift out of step with the bookings it is built from.
 *
 * Trade bookings are excluded. The email on those is the agent's, and listing
 * agency staff among travellers would put a counter in Karachi next to the
 * guest they booked for.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const [bookings, agencies] = await Promise.all([listBookings(), listAgencies()]);
  const trade = new Set<string>();
  for (const agency of agencies) {
    for (const record of await listAgencyBookings(agency.id)) trade.add(record.reference);
  }

  const cases = await listCases();

  interface Row {
    email: string;
    name: string;
    bookings: number;
    cancelled: number;
    lifetimeValue: number;
    currency: string;
    lastBookedAt: string;
    openCases: number;
    destinations: string[];
  }

  const byEmail = new Map<string, Row>();

  for (const booking of bookings) {
    if (trade.has(booking.reference)) continue;
    const email = booking.contact.email.toLowerCase();
    const lead = booking.guests[0];
    const row =
      byEmail.get(email) ??
      ({
        email,
        name: lead ? `${lead.firstName} ${lead.surname}`.trim() : email,
        bookings: 0,
        cancelled: 0,
        // Mixed currencies would make this meaningless, so it follows the
        // customer's own — almost always one, and stated rather than assumed.
        lifetimeValue: 0,
        currency: booking.price.currency,
        lastBookedAt: booking.createdAt,
        openCases: 0,
        destinations: [],
      } as Row);

    if (booking.status === "cancelled" || booking.status === "failed") {
      row.cancelled += 1;
    } else {
      row.bookings += 1;
      if (booking.price.currency === row.currency) row.lifetimeValue += booking.price.total;
    }
    if (booking.createdAt > row.lastBookedAt) row.lastBookedAt = booking.createdAt;
    if (!row.destinations.includes(booking.hotelName)) row.destinations.push(booking.hotelName);
    byEmail.set(email, row);
  }

  for (const supportCase of cases) {
    const booking = bookings.find((b) => b.reference === supportCase.bookingReference);
    const email = booking?.contact.email.toLowerCase();
    if (!email) continue;
    const row = byEmail.get(email);
    if (row && supportCase.status !== "resolved") row.openCases += 1;
  }

  /*
   * Price alerts are deliberately absent. `PriceAlert` records a destination
   * and a target price but no owner — the alert is held against a browser, not
   * a person — so a per-customer count would be zero for everyone. A column
   * that is always empty reads as "this customer has none", which is a
   * different claim from "we do not know".
   */

  const rows = [...byEmail.values()]
    .filter((row) => !query || `${row.email} ${row.name}`.toLowerCase().includes(query))
    .sort((a, b) => b.lastBookedAt.localeCompare(a.lastBookedAt));

  return ok({ customers: rows, total: byEmail.size });
}
