import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { listAgencyBookings } from "@/lib/agency/store";

/**
 * The agency's book of business.
 *
 * Scoped to the agency on the session, never to an id in the query — an agency
 * id in a URL is an invitation to try someone else's.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const bookings = await listAgencyBookings(session.agencyId);
  // An agent sees the agency's bookings, not only their own: a counter has to
  // be able to service a booking the colleague on the earlier shift made.
  return ok({ bookings });
}
