import { localeFrom, ok } from "@/lib/server/api";
import { RECOMMENDATION_CRITERIA } from "@/lib/server/search";

/**
 * GET /api/search/criteria — how results are ordered, in the reader's language.
 *
 * A disclosure, and it belongs to whatever does the ranking. Shipping the list
 * inside a front end would let the two drift, and the failure mode is a page
 * telling travellers that distance counts for fifteen per cent when the ranker
 * has long since stopped agreeing.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  return ok({ criteria: RECOMMENDATION_CRITERIA[locale] });
}
