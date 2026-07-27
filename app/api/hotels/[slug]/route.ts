import { fail, localeFrom, ok } from "@/lib/server/api";
import { buildHotel, getHotelSeed } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";

/**
 * GET /api/hotels/{slug} — canonical static content, cacheable and independent
 * of live availability (§9.3). Indexable pages must render from this alone.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = localeFrom(req);
  const seed = getHotelSeed(slug);
  if (!seed) return fail("validation", "error.notFound", locale, { status: 404, action: "editInput" });

  const hotel = buildHotel(seed, locale);
  const destination = getDestination(seed.destinationId);
  return ok({
    hotel,
    destination: destination
      ? { id: destination.id, slug: destination.slug, timezone: destination.timezone }
      : null,
  });
}
