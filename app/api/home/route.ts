import { localeFrom, ok, sanitize } from "@/lib/server/api";
import {
  DESTINATIONS,
  bookableCountryList,
  destinationsInRegion,
  featuredDestinations,
} from "@/lib/data/destinations";
import { REGIONS } from "@/lib/data/geo/countries";
import { COLLECTIONS, PROPERTY_TYPES, PROPERTY_TYPE_KEYS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS, buildHotel, hotelsInDestination } from "@/lib/data/hotels";
import { destinationFromPrice, hotelFromPrice, FROM_PRICE_BASIS } from "@/lib/server/from-price";
import type { CurrencyCode } from "@/lib/types";

/**
 * GET /api/home — everything the shop's front page is made of, in one read.
 *
 * Deliberately a view rather than a resource. The home page composes five
 * different questions — where to go, what to browse by, what kind of place,
 * which regions have anything, and which stays are loved — and each is a scan
 * of the catalogue. Answering them separately would be twenty round trips to
 * paint one screen, which is how going through an API stops being a boundary
 * and starts being a tax.
 *
 * The counts come from the catalogue rather than being written down, so a
 * property type with nothing in it never appears.
 */

/** How many cities the front page leads with; the rest are a directory. */
const FEATURED = 12;
const LOVED = 8;

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const url = new URL(req.url);
  const currency = (sanitize(url.searchParams.get("currency"), 3).toUpperCase() || "USD") as CurrencyCode;

  const destinations = featuredDestinations(FEATURED).map((d) => ({
    id: d.id,
    slug: d.slug,
    name: localized(d.name, locale),
    country: localized(d.country, locale),
    blurb: localized(d.blurb, locale),
    propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id).length,
    fromPrice: destinationFromPrice(d.id, currency, locale),
  }));

  const collections = COLLECTIONS.map((c) => ({
    slug: c.slug,
    title: localized(c.title, locale),
    body: localized(c.body, locale),
    tag: c.tag,
    count: HOTEL_SEEDS.filter((h) => h.tags.includes(c.tag)).length,
  }));

  const typeCounts = new Map<string, number>();
  for (const seed of HOTEL_SEEDS) {
    typeCounts.set(seed.propertyType, (typeCounts.get(seed.propertyType) ?? 0) + 1);
  }
  const propertyTypes = PROPERTY_TYPE_KEYS.flatMap((key) => {
    const count = typeCounts.get(key) ?? 0;
    if (!count) return [];
    return [{ key, label: localized(PROPERTY_TYPES[key], locale), count }];
  }).sort((a, b) => b.count - a.count);

  /*
   * Regions carry their own headline city and their totals. The label is a
   * translation key the front end already owns, so only the shape travels.
   */
  const regions = REGIONS.flatMap((region) => {
    const inRegion = destinationsInRegion(region);
    if (!inRegion.length) return [];
    const lead = [...inRegion].sort((a, b) => a.tier - b.tier)[0];
    return [
      {
        key: region,
        citySlug: lead.slug,
        cities: inRegion.length,
        countries: new Set(inRegion.map((d) => d.countryCode)).size,
      },
    ];
  });

  /*
   * The best-reviewed property in each headline city — real inventory a
   * visitor can click, rather than a hand-kept list that goes stale the moment
   * the catalogue changes.
   */
  const loved = featuredDestinations(LOVED)
    .flatMap((destination) => {
      const best = hotelsInDestination(destination.id)
        .filter((seed) => seed.review)
        .sort((a, b) => (b.review?.score ?? 0) - (a.review?.score ?? 0))[0];
      return best ? [best] : [];
    })
    .map((seed) => {
      const hotel = buildHotel(seed, locale);
      const hero = hotel.images.find((i) => i.category === "exterior") ?? hotel.images[0];
      return {
        slug: hotel.slug,
        name: hotel.name,
        city: hotel.address.city,
        neighborhood: hotel.address.neighborhood,
        category: hotel.category,
        score: hotel.review?.score,
        scale: hotel.review?.scale ?? 10,
        image: hero?.url ?? "",
        imageSrcSet: hero?.srcSet,
        imageFallback: hero?.fallbackUrl,
        fromPrice: hotelFromPrice(seed, currency, locale),
      };
    });

  return ok({
    destinations,
    collections,
    propertyTypes,
    regions,
    loved,
    // The totals the page states about the catalogue, and the sentence that
    // qualifies a "from" price. Both describe the catalogue, so both come from
    // where the catalogue is.
    fromPriceBasis: FROM_PRICE_BASIS[locale],
    totals: {
      properties: HOTEL_SEEDS.length,
      cities: DESTINATIONS.length,
      countries: bookableCountryList().length,
    },
  });
}
