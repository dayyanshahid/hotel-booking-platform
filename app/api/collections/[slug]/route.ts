import { fail, localeFrom, ok } from "@/lib/server/api";
import { COLLECTIONS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS, buildHotel } from "@/lib/data/hotels";
import { collectionPhoto, PHOTO_SHAPE } from "@/lib/data/photos";

/** GET /api/collections/:slug — one grouping and the properties in it. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = localeFrom(req);

  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) return fail("validation", "error.notFound", locale, { status: 404 });

  return ok({
    collection: {
      slug: collection.slug,
      title: localized(collection.title, locale),
      body: localized(collection.body, locale),
      tag: collection.tag,
      accent: collection.accent,
      photo: collectionPhoto(collection.slug, collection.tag, { shape: PHOTO_SHAPE.banner }),
    },
    /*
     * Built rather than sent as seeds, for the same reason everywhere else: a
     * client assembling a hotel out of raw seed data is a second copy of
     * `buildHotel`, and the two drift the day a rating changes shape.
     */
    hotels: HOTEL_SEEDS.filter((h) => h.tags.includes(collection.tag)).map((seed) =>
      buildHotel(seed, locale),
    ),
  });
}
