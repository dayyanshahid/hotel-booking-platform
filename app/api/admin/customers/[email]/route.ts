import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings, listCases, listNotifications, listTravelers } from "@/lib/server/store";

/**
 * Everything we hold about one customer, on one screen.
 *
 * Support's most common failure is not missing data, it is data spread across
 * four screens while a person waits on the phone. Bookings, cases, saved
 * traveller profiles and what we have sent them are assembled here so the
 * answer to "what happened to my booking" is one request away.
 */
export async function GET(req: Request, ctx: { params: Promise<{ email: string }> }) {
  const { email: raw } = await ctx.params;
  const email = decodeURIComponent(raw).toLowerCase();
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const bookings = await listBookings(email);
  if (!bookings.length) return fail("validation", "error.notFound", locale, { status: 404 });

  const references = new Set(bookings.map((b) => b.reference));
  const cases = (await listCases()).filter((c) => c.bookingReference && references.has(c.bookingReference));

  return ok({
    email,
    bookings,
    cases,
    travellers: await listTravelers(email),
    // What we have sent them — the answer to "I never got a confirmation".
    notifications: (await listNotifications(email)).slice(0, 20),
  });
}
