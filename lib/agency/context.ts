import { getDestination } from "../data/destinations";
import type { StoredOffer } from "../server/store";

/**
 * Where a stay actually is.
 *
 * The agency's markup can differ by country, so pricing an offer needs to know
 * which one it belongs to. The offer's search intent carries our own
 * destination id — true for demo inventory and live supply alike, because both
 * are searched by our geography rather than the supplier's — so the country
 * comes from there rather than from parsing a hotel name or an address string.
 *
 * Returns undefined rather than guessing when the destination is unknown; the
 * caller falls back to the agency's default rule, which is the safe direction.
 */
export function countryForOffer(offer?: Pick<StoredOffer, "intent">): string | undefined {
  const id = offer?.intent?.destinationId;
  if (!id) return undefined;
  return getDestination(id)?.countryCode;
}
