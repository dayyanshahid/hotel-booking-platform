import type { Metadata } from "next";
import { HomeView, type FeaturedStay } from "@/components/pages/home-view";
import { fetchHome } from "@/lib/server/catalogue";
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
  /*
   * One read, because the front page is one view.
   *
   * Every list here — where to go, what to browse by, which kinds of place,
   * which regions have anything, which stays are loved — is a scan of the
   * catalogue the shop no longer carries. Asking for them separately would be
   * twenty round trips to paint one screen.
   */
  const {
    destinations,
    collections,
    propertyTypes,
    regions: regionData,
    loved,
    fromPriceBasis,
    totals,
  } = await fetchHome(locale, BROWSE_CURRENCY);

  // The label is a translation the front end already owns, so only the shape
  // travels over the wire.
  const regions = regionData.map((region) => ({
    ...region,
    label: t(`region.${region.key}` as never),
  }));


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
        fromPriceBasis={fromPriceBasis}
        totalProperties={totals.properties}
        totalCities={totals.cities}
        totalCountries={totals.countries}
      />
    </>
  );
}
