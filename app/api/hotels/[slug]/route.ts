import { fail, localeFrom, ok } from "@/lib/server/api";
import { buildHotel, getHotelSeed, HOTEL_SEEDS } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { liveHotelBySlug } from "@/lib/server/live-hotel";

/**
 * GET /api/hotels/{slug} — canonical static content, cacheable and independent
 * of live availability (§9.3). Indexable pages must render from this alone.
 *
 * Live supply resolves here too. It did not, which was a real inconsistency:
 * the consumer and agency pages have rendered Hotelbeds and TourMind properties
 * for weeks by calling `liveHotelBySlug` themselves, while this endpoint
 * answered "not found" for the very same slug. A front end that owns no backend
 * code — which is what the separated portals are — has nowhere else to ask.
 *
 * `similar` comes back with it for the same reason. Working it out needs the
 * seeded catalogue, and a separated front end does not carry one.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = localeFrom(req);

  // Demo inventory first, then live supply — the same resolution order the
  // pages use, so an endpoint and a page can never disagree about a property.
  const seed = getHotelSeed(slug);
  const hotel = seed ? buildHotel(seed, locale) : await liveHotelBySlug(slug, locale);
  if (!hotel) return fail("validation", "error.notFound", locale, { status: 404, action: "editInput" });

  const destination = getDestination(hotel.destinationId);

  // "Similar" only means anything inside a destination we hold; a live property
  // in a city with no seeded inventory gets none rather than borrowing another
  // city's.
  const similar = (destination ? HOTEL_SEEDS.filter((h) => h.destinationId === destination.id && h.slug !== slug) : [])
    .slice(0, 3)
    .map((entry) => {
      const other = buildHotel(entry, locale);
      return {
        slug: other.slug,
        name: other.name,
        neighborhood: other.address.neighborhood,
        category: other.category,
        image: other.images[0]?.url ?? "",
        imageSrcSet: other.images[0]?.srcSet,
        imageFallback: other.images[0]?.fallbackUrl,
      };
    });

  return ok({
    hotel,
    similar,
    destination: destination
      ? { id: destination.id, slug: destination.slug, timezone: destination.timezone }
      : null,
  });
}
