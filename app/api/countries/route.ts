import { ok } from "@/lib/server/api";
import { bookableCountryList } from "@/lib/data/destinations";
import { REGIONS } from "@/lib/data/geo/countries";

/**
 * GET /api/countries — the regions, and every country with something to sell.
 *
 * Bookable rather than every country we hold a record for. A country index
 * built from the full list is mostly dead ends, and a traveller who follows one
 * arrives at an empty page having been invited there by us.
 */
export async function GET() {
  return ok({ regions: REGIONS, countries: bookableCountryList() });
}
