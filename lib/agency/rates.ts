import type { Agency, AgencyOfferView } from "./types";
import { agencyOfferView } from "./pricing";

/**
 * Turning a public price into what an agent sees.
 *
 * Three numbers, in a fixed order, and the order is the point:
 *
 *   public price  → what a traveller would pay on the consumer site
 *   − commission  → the agency's cost, per its contract with us
 *   + its markup  → what the agency charges its own customer
 *
 * The supplier net rate is not in that chain and never enters this file. An
 * agency is entitled to know what *it* pays; what we pay is our commercial
 * relationship with the supplier, and the consumer contract (§9.4) forbids it
 * leaving the server in any response — B2B or not.
 */

/**
 * How many offers one quote request prices.
 *
 * Shared with the caller on purpose. The route used to take the first sixty
 * and say nothing about the rest, and the trade search used to ask for a page
 * of twelve, so the cap was never reached and the silence never noticed. The
 * moment the map started loading a whole city, the last eight rooms of a
 * sixty-eight property result came back unpriced. One number, imported by both
 * sides, so the batch the client sends cannot drift from the batch the server
 * answers.
 */
export const QUOTE_BATCH = 60;

/** The agency's cost for an offer we publish at `publicPrice`. */
export function agencyCost(publicPrice: number, agency: Agency): number {
  const commission = Math.min(Math.max(agency.commissionPercent, 0), 100);
  return Math.round(publicPrice * (1 - commission / 100));
}

/**
 * The full view of one offer for one agency.
 *
 * `publicPrice` is what the consumer site would charge, so an agent can see at
 * a glance whether their selling price is still competitive with the open
 * market — the question they are actually asked at the counter.
 *
 * `countryCode` is where the stay is, which decides which of the agency's
 * markup rules applies. Omitting it falls back to their default rather than
 * failing: a country we cannot resolve should still produce a sellable price.
 */
export function viewOffer(
  offerId: string,
  publicPrice: number,
  currency: string,
  agency: Agency,
  countryCode?: string,
): AgencyOfferView & { publicPrice: number } {
  const cost = agencyCost(publicPrice, agency);
  return { ...agencyOfferView(offerId, cost, currency, agency.markup, countryCode), publicPrice };
}
