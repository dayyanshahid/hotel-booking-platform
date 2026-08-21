import { fail, localeFrom, ok } from "@/lib/server/api";
import { destinationLabel, getDestination } from "@/lib/data/destinations";
import { buildHotel, hotelsInDestination } from "@/lib/data/hotels";
import { destinationFromPrice } from "@/lib/server/from-price";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import type { CurrencyCode } from "@/lib/types";

/**
 * GET /api/destinations/:id — one place, with what a destination page renders.
 *
 * The blurb, the neighbourhoods and the questions travellers ask are editorial
 * and only interesting here, so they are sent in full rather than summarised.
 * The properties come back built rather than as seeds: a client assembling a
 * hotel out of raw seed data would be a second implementation of `buildHotel`,
 * and the two would drift on the day somebody changed how a rating is derived.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const url = new URL(req.url);

  const seed = getDestination(id);
  if (!seed) return fail("validation", "error.notFound", locale, { status: 404 });

  /*
   * The currency the caller is quoting in, falling back to what travellers are
   * usually quoted locally. A "from" price in the wrong currency is worse than
   * none: it is a number somebody will compare against another number.
   */
  const currency = (url.searchParams.get("currency") ?? seed.currency) as CurrencyCode;

  return ok({
    destination: {
      id: seed.id,
      slug: seed.slug,
      type: seed.type,
      name: destinationLabel(seed, locale),
      country: seed.country[locale] || seed.country.en,
      countryCode: seed.countryCode,
      region: seed.region,
      timezone: seed.timezone,
      coordinates: seed.coordinates,
      currency: seed.currency,
      curated: seed.curated,
      blurb: seed.blurb[locale] || seed.blurb.en,
      neighborhoods: seed.neighborhoods.map((n) => ({
        key: n.key,
        name: n.name[locale] || n.name.en,
        blurb: n.blurb[locale] || n.blurb.en,
      })),
      faqs: seed.faqs.map((f) => ({ q: f.q[locale] || f.q.en, a: f.a[locale] || f.a.en })),
      photo: destinationPhoto(seed.slug, 0, { shape: PHOTO_SHAPE.banner }),
    },
    fromPrice: destinationFromPrice(seed.id, currency, locale),
    hotels: hotelsInDestination(seed.id).map((h) => buildHotel(h, locale)),
  });
}
