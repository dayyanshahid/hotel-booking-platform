import { fail, localeFrom, ok } from "@/lib/server/api";
import { destinationLabel, destinationsInCountry } from "@/lib/data/destinations";
import { getCountry } from "@/lib/data/geo/countries";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";

/** GET /api/countries/:code — one country and the places in it worth selling. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const locale = localeFrom(req);

  const country = getCountry(code.toUpperCase());
  if (!country) return fail("validation", "error.notFound", locale, { status: 404 });

  return ok({
    country,
    destinations: destinationsInCountry(country.code).map((seed) => ({
      id: seed.id,
      slug: seed.slug,
      name: destinationLabel(seed, locale),
      tier: seed.tier,
      curated: seed.curated,
      coordinates: seed.coordinates,
      photo: destinationPhoto(seed.slug, 0, { shape: PHOTO_SHAPE.card }),
    })),
  });
}
