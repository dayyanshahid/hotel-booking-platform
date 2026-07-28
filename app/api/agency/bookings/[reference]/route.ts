import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgencyBooking } from "@/lib/agency/store";
import { getBooking } from "@/lib/server/store";

/**
 * One booking, from the agency's side.
 *
 * Two records join here: the canonical booking the guest holds, and the
 * commercial record that says what it cost the agency and what they sold it
 * for. Scoped by the session's agency — a reference belonging to someone else
 * is a 404, not a 403, because confirming that a reference exists is already
 * telling a stranger something.
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const trade = await getAgencyBooking(reference);
  if (!trade || trade.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  return ok({ booking, trade });
}
