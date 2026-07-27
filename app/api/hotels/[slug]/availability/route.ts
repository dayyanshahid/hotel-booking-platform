import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { runHotelAvailability } from "@/lib/server/search";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { validateIntent } from "@/lib/server/validate";
import type { SearchIntent } from "@/lib/types";

/** POST /api/hotels/{slug}/availability — mapped rooms and rates for exact occupancy. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<{ intent: Partial<SearchIntent> }>(req);
  if (!body?.intent) return fail("validation", "error.validation", locale, { status: 400 });

  const validation = validateIntent(body.intent, locale);
  if (!validation.valid || !validation.intent) {
    return fail("validation", "error.validation", locale, { status: 422, fields: validation.fields });
  }

  const result = await runHotelAvailability(slug, validation.intent, locale, scenario);
  if (!result) {
    return ok({
      hotel: null,
      rooms: [],
      offers: [],
      searchToken: `st_${Date.now().toString(36)}`,
      partial: scenario === "supplierTimeout",
      fetchedAt: new Date().toISOString(),
    });
  }

  return ok({
    hotel: result.hotel,
    rooms: result.rooms,
    offers: result.offers,
    searchToken: `st_${Date.now().toString(36)}`,
    partial: scenario === "supplierTimeout",
    fetchedAt: new Date().toISOString(),
  });
}
