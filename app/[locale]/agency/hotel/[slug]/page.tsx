import { notFound } from "next/navigation";
import { AgencyHotelView } from "@/components/pages/agency-hotel-view";
import { fetchHotel } from "@/lib/server/catalogue";
import { isLocale } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import type { Locale } from "@/lib/types";

/**
 * Agency portal — one property, every rate, priced for the agency.
 *
 * The property itself is resolved before the availability call, exactly as the
 * consumer page does. Photography, the description, the amenities and the
 * address do not depend on live rates, and they are the half an agent reads
 * aloud while the rates are still arriving.
 *
 * Read from the API rather than the catalogue, which is what the portal's own
 * copy of this page has always done. The two rendering the same screen from
 * different sources was the last place the combined app and the separated
 * front end could disagree about a property.
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

  // Seeded inventory first, then live supply — resolved by the endpoint, so a
  // Hotelbeds or TourMind property opens here exactly as it does in the shop.
  const found = await fetchHotel(slug, locale);
  if (!found) notFound();

  return (
    <AgencyHotelView
      locale={locale}
      hotel={found.hotel}
      initialIntent={intentFromSearchParams(query, locale)}
      similar={found.similar}
    />
  );
}
