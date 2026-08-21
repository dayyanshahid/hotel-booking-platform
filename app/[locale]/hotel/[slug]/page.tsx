import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HotelDetailView } from "@/components/pages/hotel-detail-view";
import { fetchHotel, fetchHotelSlugs } from "@/lib/server/catalogue";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import type { Locale } from "@/lib/types";

/**
 * Pre-rendered from the seeded catalogue the API knows about. Live properties
 * were never in this list and still are not — they render on demand, which is
 * the only way to serve inventory that did not exist at build time.
 */
export async function generateStaticParams() {
  const slugs = await fetchHotelSlugs("en");
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  // A live property gets its real title and description too; leaving it as
  // "Not found" was telling crawlers a page that renders does not exist. The
  // API resolves seeded and live supply in that order, so this asks once.
  const found = await fetchHotel(slug, locale);
  if (!found) return { title: "Not found" };
  const hotel = found.hotel;
  return {
    title: hotel.seo.metaTitle,
    description: hotel.seo.metaDescription,
    alternates: {
      canonical: `/${locale}/hotel/${slug}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/hotel/${slug}`])),
    },
  };
}

/**
 * F-040 — hotel detail.
 *
 * Static, indexable content renders on the server and never depends on live
 * rates (§5.6). Availability is loaded separately by the client island below.
 */
export default async function HotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, slug } = await params;
  const query = await searchParams;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  /*
   * Demo inventory first, then live supply — resolved by the API, in that
   * order, so a page and an endpoint can never disagree about a property.
   *
   * Search has always returned Hotelbeds and TourMind properties, and every one
   * of them once landed here on a "page not found". A result a traveller cannot
   * open is worse than one they never saw, because they have already chosen it.
   *
   * `similar` comes back with it: working it out needs the seeded catalogue,
   * which this front end no longer carries.
   */
  const found = await fetchHotel(slug, locale);
  if (!found) notFound();
  const { hotel, similar, destination } = found;

  const t = createTranslator(locale);
  const intent = intentFromSearchParams(query, locale);

  // Structured data uses only values that are visible and accurately sourced (§12.4).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: hotel.name,
    description: hotel.seo.metaDescription,
    starRating: { "@type": "Rating", ratingValue: hotel.category },
    address: {
      "@type": "PostalAddress",
      streetAddress: hotel.address.line1,
      addressLocality: hotel.address.city,
      addressCountry: hotel.address.countryCode,
    },
    geo: { "@type": "GeoCoordinates", latitude: hotel.coordinates.lat, longitude: hotel.coordinates.lng },
    ...(hotel.review
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: hotel.review.score,
            bestRating: hotel.review.scale,
            ratingCount: hotel.review.count,
          },
        }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="text-muted mb-3 text-xs">
        <ol className="flex flex-wrap gap-1">
          {hotel.seo.breadcrumbs.map((crumb, i) => (
            <li key={crumb} className="flex gap-1">
              {i > 0 && <span aria-hidden className="rtl-flip">›</span>}
              <span>{crumb}</span>
            </li>
          ))}
        </ol>
      </nav>
      <HotelDetailView
        locale={locale}
        hotel={hotel}
        initialIntent={intent}
        similar={similar}
        strings={{ heading: t("hotel.rooms") }}
      />
    </>
  );
}
