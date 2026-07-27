import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { bookableCountryList, DESTINATIONS } from "@/lib/data/destinations";
import { localized } from "@/lib/data/catalog";
import { REGIONS, type Region } from "@/lib/data/geo/countries";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);
  return {
    title: t("browse.allTitle"),
    description: t("browse.allDescription", {
      cities: DESTINATIONS.length,
      countries: bookableCountryList().length,
    }),
    alternates: {
      canonical: `/${locale}/destinations`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/destinations`])),
    },
  };
}

/**
 * The full catalogue, by region and then by country.
 *
 * The home page shows a dozen headline cities; this is where the rest live. It
 * is also the page that makes the catalogue crawlable — every city is one hop
 * from here, which a search box alone can never provide (§12.4).
 */
export default async function DestinationsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);

  const countries = bookableCountryList();
  const propertyCount = new Map<string, number>();
  for (const seed of HOTEL_SEEDS) {
    propertyCount.set(seed.destinationId, (propertyCount.get(seed.destinationId) ?? 0) + 1);
  }

  const byRegion = REGIONS.map((region: Region) => ({
    region,
    label: t(`region.${region}` as never),
    countries: countries.filter((c) => c.region === region),
  })).filter((group) => group.countries.length > 0);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-[-0.025em] sm:text-[32px]">{t("browse.allTitle")}</h1>
        <p className="text-muted mt-3 max-w-2xl leading-relaxed">
          {t("browse.allDescription", {
            cities: DESTINATIONS.length,
            countries: countries.length,
          })}
        </p>
      </header>

      {/* Jump links, because seven regions of country lists is a long page. */}
      <nav aria-label={t("browse.regions")} className="flex flex-wrap gap-2">
        {byRegion.map((group) => (
          <a
            key={group.region}
            href={`#region-${group.region}`}
            className="surface hairline hover:border-brand-300 inline-flex min-h-9 items-center rounded-[var(--radius-pill)] border px-4 text-sm font-medium transition-colors duration-150"
          >
            {group.label}
          </a>
        ))}
      </nav>

      {byRegion.map((group) => (
        <section key={group.region} id={`region-${group.region}`} aria-labelledby={`h-${group.region}`}>
          <SectionHeading id={`h-${group.region}`} title={group.label} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.countries.map((country) => {
              const cities = DESTINATIONS.filter((d) => d.countryCode === country.code);
              const total = cities.reduce((sum, c) => sum + (propertyCount.get(c.id) ?? 0), 0);
              return (
                <li key={country.code}>
                  <Card className="h-full p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={href(locale, `/countries/${country.code.toLowerCase()}`)}
                        className="hover:text-brand-700 font-semibold transition-colors duration-150"
                      >
                        {locale === "ar" ? (country.nameAr ?? country.name) : country.name}
                      </Link>
                      <Badge tone="neutral">
                        {total} {t("results.count")}
                      </Badge>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
                      {cities.map((city) => (
                        <li key={city.slug}>
                          <Link
                            href={href(locale, `/destinations/${city.slug}`)}
                            className="text-muted hover:text-brand-700 transition-colors duration-150"
                          >
                            {localized(city.name, locale)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
