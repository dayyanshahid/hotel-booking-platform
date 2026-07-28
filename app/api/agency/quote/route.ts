import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency } from "@/lib/agency/store";
import { viewOffer } from "@/lib/agency/rates";
import { getOffer } from "@/lib/server/store";

/**
 * What an agent quotes.
 *
 * Given offers the agent is looking at, returns cost, selling price and margin
 * for their agency. Server-side because the commission is contractual — an
 * agency that could compute its own cost in the browser could also change it.
 *
 * The response carries no supplier field. An agency is entitled to its own
 * cost; which wholesaler the room came from is our commercial relationship
 * (§9.4), and the shape here makes leaking it impossible rather than unlikely.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<{ offerIds: string[] }>(req);
  if (!Array.isArray(body?.offerIds) || !body.offerIds.length) {
    return fail("validation", "error.validation", locale, { status: 400 });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const quotes = body.offerIds.slice(0, 60).flatMap((offerId) => {
    const offer = getOffer(offerId);
    // A missing offer means the quote expired, not that pricing failed; the
    // caller sees which ids came back and re-searches for the rest.
    if (!offer) return [];
    return [viewOffer(offerId, offer.price.total, offer.price.currency, agency)];
  });

  return ok({ quotes, commissionPercent: agency.commissionPercent, markup: agency.markup });
}
