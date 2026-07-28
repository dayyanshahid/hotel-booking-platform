import { AgencyHotelView } from "@/components/pages/agency-hotel-view";
import { isLocale } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import type { Locale } from "@/lib/types";

/**
 * Agency portal — one property, every rate, priced for the agency.
 *
 * The search intent travels in the URL exactly as it does on the consumer
 * hotel page: a rate only means something against dates and occupancy, so a
 * link without them cannot be priced and says so rather than guessing.
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
  return <AgencyHotelView locale={locale} slug={slug} intent={intentFromSearchParams(query, locale)} />;
}
