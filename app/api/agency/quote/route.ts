import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency } from "@/lib/agency/store";
import { QUOTE_BATCH, viewOffer } from "@/lib/agency/rates";
import { loadOffer } from "@/lib/server/store";
import { countryForOffer } from "@/lib/agency/context";

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

  /*
   * Awaited, and therefore able to reach the shared store.
   *
   * A missing offer still means "no price for this row", but until the offers
   * were published anywhere an instance that had not run the search missed
   * every one of them — measured at two rows priced out of twelve, with the
   * other ten showing an empty cost and sell rail on the one screen whose
   * whole purpose is those numbers.
   */
  const priced = await Promise.all(
    body.offerIds.slice(0, QUOTE_BATCH).map(async (offerId) => {
      const offer = await loadOffer(offerId);
      // A genuinely expired offer is not a pricing failure; the caller sees
      // which ids came back and re-searches for the rest.
      if (!offer) return null;
      return viewOffer(offerId, offer.price.total, offer.price.currency, agency, countryForOffer(offer));
    }),
  );
  const quotes = priced.filter((quote) => quote !== null);

  return ok({ quotes, commissionPercent: agency.commissionPercent, markup: agency.markup });
}
