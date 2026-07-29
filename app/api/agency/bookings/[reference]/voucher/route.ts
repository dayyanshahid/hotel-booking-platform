import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, getAgencyBooking } from "@/lib/agency/store";
import { getBooking } from "@/lib/server/store";
import { fetchConfirmation } from "@/lib/server/confirmation";

/**
 * Everything a voucher is printed from, in one call.
 *
 * Three sources have to agree before an agent hands a document to a customer:
 * the booking as we recorded it, the confirmation as the supplier holds it, and
 * the agency's own branding. Assembling them here rather than in the page means
 * the front end — which on a separated deployment carries no supplier code at
 * all — needs to know nothing about who the supplier is.
 *
 * The supplier's identity, its net rate and its own reference are not in the
 * response. A voucher is handed to a traveller, and none of those are theirs to
 * see (§9.4). What does come through is the property's own confirmation number
 * where the supplier gives us one, because that is the thing a front desk can
 * actually look up.
 *
 * A held booking has no voucher. It is a room we are about to release unless
 * somebody issues it, and printing a confirmation for one would be promising a
 * stay that may be cancelled tonight.
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) {
    return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }

  const { reference } = await ctx.params;
  const [trade, booking, agency] = await Promise.all([
    getAgencyBooking(reference),
    getBooking(reference),
    getAgency(session.agencyId),
  ]);

  // Scoped to the agency that made it: a reference is guessable, and another
  // agency's customer is none of this account's business.
  if (!trade || !booking || trade.agencyId !== session.agencyId || !agency) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  if (trade.status === "held") {
    return fail("policyRestriction", "agency.voucherNeedsIssue", locale, { status: 409 });
  }

  const confirmation = await fetchConfirmation(reference);

  return ok({
    booking,
    trade,
    confirmation,
    // The branding the document is printed under. The agency's mark and
    // details, never ours and never the supplier's.
    branding: {
      name: agency.name,
      profile: agency.profile,
    },
  });
}

export const dynamic = "force-dynamic";
