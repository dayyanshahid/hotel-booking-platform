import type { Metadata } from "next";
import { SearchResultsView } from "@/components/pages/search-results-view";
import { createTranslator, isLocale } from "@/lib/i18n";
import { filtersFromSearchParams, intentFromSearchParams, propertyTypeFromSearchParams } from "@/lib/nav";
import { fetchSearchCriteria } from "@/lib/server/catalogue";
import type { Locale } from "@/lib/types";

/** Volatile search URLs are not indexed, but must stay shareable (§12.4). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  // The ranking disclosure comes from whatever does the ranking, so the two
  // cannot drift into disagreeing about how results are ordered.
  const criteria = await fetchSearchCriteria(locale);
  const t = createTranslator(locale);
  const intent = intentFromSearchParams(query, locale);

  if (!intent) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-semibold">{t("search.needDestination")}</h1>
        <p className="text-muted mt-2 text-sm">{t("results.emptyBody")}</p>
      </div>
    );
  }

  return (
    <SearchResultsView
      initialPropertyType={propertyTypeFromSearchParams(query)}
      initialFilters={filtersFromSearchParams(query)}
      locale={locale}
      initialIntent={intent}
      recommendationCriteria={criteria}
    />
  );
}
