import { fail, localeFrom, ok } from "@/lib/server/api";
import { destinationLabel, destinationsInCountry } from "@/lib/data/destinations";
import { getCountry } from "@/lib/data/geo/countries";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { buildHotel, hotelsInDestination } from "@/lib/data/hotels";
import { destinationFromPrice, FROM_PRICE_BASIS } from "@/lib/server/from-price";
import type { CurrencyCode } from "@/lib/types";

/**
 * GET /api/countries/:code — one country and the places in it worth selling.
 *
 * Each city carries its property count, a from-price and one representative
 * stay. A country page renders all three, and asking for them separately would
 * be seven round trips to draw one screen — the sort of thing that makes going
 * through an API feel like a tax rather than a boundary.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const locale = localeFrom(req);

  const country = getCountry(code.toUpperCase());
  if (!country) return fail("validation", "error.notFound", locale, { status: 404 });

  const requested = new URL(req.url).searchParams.get("currency");
  const currency = (requested?.toUpperCase() || undefined) as CurrencyCode | undefined;

  return ok({
    country,
    // What "from" means, in the reader's language. It travels with the prices
    // it qualifies, so no front end has to keep its own copy of the wording.
    fromPriceBasis: FROM_PRICE_BASIS[locale],
    destinations: destinationsInCountry(country.code).map((seed) => {
      const inDestination = hotelsInDestination(seed.id);
      const highlight = inDestination[0] ? buildHotel(inDestination[0], locale) : null;
      return {
        id: seed.id,
        slug: seed.slug,
        name: destinationLabel(seed, locale),
        tier: seed.tier,
        curated: seed.curated,
        coordinates: seed.coordinates,
        photo: destinationPhoto(seed.slug, 0, { shape: PHOTO_SHAPE.card }),
        propertyCount: inDestination.length,
        fromPrice: currency ? destinationFromPrice(seed.id, currency, locale) : null,
        highlight,
      };
    }),
  });
}
