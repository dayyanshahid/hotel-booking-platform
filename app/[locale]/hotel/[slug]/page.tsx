import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HotelDetailView } from "@/components/pages/hotel-detail-view";
import { buildHotel, getHotelSeed, HOTEL_SEEDS } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => HOTEL_SEEDS.map((h) => ({ locale, slug: h.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const seed = getHotelSeed(slug);
  if (!seed) return { title: "Not found" };
  const hotel = buildHotel(seed, locale);
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
  const seed = getHotelSeed(slug);
  if (!seed) notFound();

  const hotel = buildHotel(seed, locale);
  const destination = getDestination(seed.destinationId)!;
  const t = createTranslator(locale);
  const intent = intentFromSearchParams(query, locale);

  const similar = HOTEL_SEEDS.filter((h) => h.destinationId === seed.destinationId && h.slug !== slug)
    .slice(0, 3)
    .map((h) => {
      const other = buildHotel(h, locale);
      return {
        slug: other.slug,
        name: other.name,
        neighborhood: other.address.neighborhood,
        category: other.category,
        image: other.images[0]?.url ?? "",
      };
    });

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
