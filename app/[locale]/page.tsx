import type { Metadata } from "next";
import { HomeView, type FeaturedStay } from "@/components/pages/home-view";
import {
  bookableCountryList,
  DESTINATIONS,
  destinationsInRegion,
  featuredDestinations,
} from "@/lib/data/destinations";
import { REGIONS } from "@/lib/data/geo/countries";
import { COLLECTIONS, PROPERTY_TYPES, PROPERTY_TYPE_KEYS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS, buildHotel, hotelsInDestination } from "@/lib/data/hotels";
import { destinationFromPrice, hotelFromPrice, FROM_PRICE_BASIS } from "@/lib/server/from-price";
import { createTranslator, isLocale } from "@/lib/i18n";
import type { CurrencyCode, Locale } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(isLocale(locale) ? locale : "en");
  return { title: t("home.heroTitle"), description: t("home.metaDescription") };
}

/**
 * The currency the server renders browse prices in. A visitor can switch the
 * display currency on the client, but the server cannot know that preference
 * before first paint, so indicative prices are computed in the home market's
 * currency and labelled as indicative.
 */
const BROWSE_CURRENCY: CurrencyCode = "USD";

/** How many stays the "guests love" rail shows. */
const LOVED_COUNT = 8;


/** The five home-page questions. The accordion and the JSON-LD both read this. */
const FAQ_KEYS = [1, 2, 3, 4, 5] as const;

/**
 * F-010 — home / explore.
 *
 * Everything a visitor reads before searching renders on the server, indicative
 * prices included: they come from the pricing model rather than from live
 * availability, so the page is indexable and never waits on a supplier (§12.4).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);

  // Headline destinations only, dealt round-robin across regions — rendering
  // all 183 here would be a directory, not a home page. The rest are reachable
  // from the region and country pages, and from search.
  const destinations = featuredDestinations(12).map((d) => ({
    id: d.id,
    slug: d.slug,
    name: localized(d.name, locale),
    country: localized(d.country, locale),
    blurb: localized(d.blurb, locale),
    propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id).length,
    fromPrice: destinationFromPrice(d.id, BROWSE_CURRENCY, locale),
  }));

  const collections = COLLECTIONS.map((c) => ({
    slug: c.slug,
    title: localized(c.title, locale),
    body: localized(c.body, locale),
    tag: c.tag,
    count: HOTEL_SEEDS.filter((h) => h.tags.includes(c.tag)).length,
  }));

  /*
   * Browse by property type. A traveller looking for a hostel or a villa is
   * looking for a different product, not a cheaper hotel, and the counts come
   * from the catalogue rather than being written down — a type with nothing in
   * it does not appear at all.
   */
  const typeCounts = new Map<string, number>();
  for (const seed of HOTEL_SEEDS) {
    typeCounts.set(seed.propertyType, (typeCounts.get(seed.propertyType) ?? 0) + 1);
  }
  const propertyTypes = PROPERTY_TYPE_KEYS.flatMap((key) => {
    const count = typeCounts.get(key) ?? 0;
    if (!count) return [];
    return [{ key, label: localized(PROPERTY_TYPES[key], locale), count }];
  }).sort((a, b) => b.count - a.count);

  /* Every region that has something to book, with its own headline city. */
  const regions = REGIONS.flatMap((region) => {
    const inRegion = destinationsInRegion(region);
    if (!inRegion.length) return [];
    const lead = [...inRegion].sort((a, b) => a.tier - b.tier)[0];
    const countries = new Set(inRegion.map((d) => d.countryCode));
    return [
      {
        key: region,
        label: t(`region.${region}` as never),
        citySlug: lead.slug,
        cities: inRegion.length,
        countries: countries.size,
      },
    ];
  });

  /*
   * Stays guests love — the best-reviewed property in each headline city, so
   * the rail is real inventory a visitor can click rather than a hand-kept list
   * that goes stale the moment the catalogue changes.
   */
  const loved: FeaturedStay[] = featuredDestinations(LOVED_COUNT)
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
        fromPrice: hotelFromPrice(seed, BROWSE_CURRENCY, locale),
      };
    });

  // The accordion renders these same five answers, so the structured data can
  // never describe content the page does not show.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map((n) => ({
      "@type": "Question",
      name: t(`home.faqQ${n}` as never),
      acceptedAnswer: { "@type": "Answer", text: t(`home.faqA${n}` as never) },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <HomeView
        locale={locale}
        destinations={destinations}
        collections={collections}
        featured={loved}
        propertyTypes={propertyTypes}
        regions={regions}
        fromPriceBasis={FROM_PRICE_BASIS[locale]}
        totalProperties={HOTEL_SEEDS.length}
        totalCities={DESTINATIONS.length}
        totalCountries={bookableCountryList().length}
      />
    </>
  );
}
