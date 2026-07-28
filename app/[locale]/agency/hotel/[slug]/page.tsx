import { notFound } from "next/navigation";
import { AgencyHotelView } from "@/components/pages/agency-hotel-view";
import { buildHotel, getHotelSeed, HOTEL_SEEDS } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { isLocale } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import { liveHotelBySlug } from "@/lib/server/live-hotel";
import type { Locale } from "@/lib/types";

/**
 * Agency portal — one property, every rate, priced for the agency.
 *
 * The property itself is resolved here rather than waiting on the availability
 * call, exactly as the consumer page does. Photography, the description, the
 * amenities and the address do not depend on live rates, and they are the half
 * an agent reads aloud while the rates are still arriving.
 *
 * The search intent travels in the URL, so a link an agent pastes to a
 * colleague prices the same stay. Without one the page opens on a default stay
 * with the search bar right there, rather than refusing to render.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, slug } = await params;
  const query = await searchParams;
  const locale = (isLocale(raw) ? raw : "en") as Locale;

  // Demo inventory first, then live supply — the same resolution the consumer
  // page uses, so a Hotelbeds or TourMind property opens on both sides.
  const seed = getHotelSeed(slug);
  const hotel = seed ? buildHotel(seed, locale) : await liveHotelBySlug(slug, locale);
  if (!hotel) notFound();

  const destination = getDestination(hotel.destinationId);
  // "Similar" only means anything within a destination we hold; a live property
  // in a city with no seeded inventory gets no suggestions rather than
  // suggestions from somewhere else.
  const similar = (destination ? HOTEL_SEEDS.filter((h) => h.destinationId === destination.id && h.slug !== slug) : [])
    .slice(0, 3)
    .map((h) => {
      const other = buildHotel(h, locale);
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

  return (
    <AgencyHotelView
      locale={locale}
      hotel={hotel}
      initialIntent={intentFromSearchParams(query, locale)}
      similar={similar}
    />
  );
}
