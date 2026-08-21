import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Photo, SectionHeading, Stars } from "@/components/ui";
import { fetchCountries, fetchCountry } from "@/lib/server/catalogue";
import { formatMoney } from "@/lib/format";
import { sceneUrl } from "@/lib/illustration/scenes";
import { cityLabel, countLabel, createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { CurrencyCode, Locale } from "@/lib/types";

/** Indicative browse prices render server-side, before any client preference. */
const BROWSE_CURRENCY: CurrencyCode = "USD";

export async function generateStaticParams() {
  const { countries } = await fetchCountries("en");
  return LOCALES.flatMap((locale) =>
    countries.map((c) => ({ locale, code: c.code.toLowerCase() })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}): Promise<Metadata> {
  const { locale: raw, code } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const found = await fetchCountry(code, locale);
  if (!found) return { title: "Not found" };
  const country = found.country;
  const t = createTranslator(locale);
  const name = locale === "ar" ? (country.nameAr ?? country.name) : country.name;
  return {
    title: t("browse.countryTitle", { country: name }),
    description: t("browse.countryDescription", { country: name }),
    alternates: {
      canonical: `/${locale}/countries/${country.code.toLowerCase()}`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `/${l}/countries/${country.code.toLowerCase()}`]),
      ),
    },
  };
}

/**
 * A country landing page.
 *
 * The layer the catalogue was missing: with six cities, a visitor went from the
 * home page straight to a city. With a hundred and eighty, "hotels in Japan" is
 * a real question, and it is also how a crawler discovers the cities beneath it.
 */
export default async function CountryPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale: raw, code } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  /*
   * The country in full, and the index of the rest, in parallel. The strip of
   * neighbouring countries at the foot is a different question from this page's
   * own contents.
   */
  const [found, { countries }] = await Promise.all([
    fetchCountry(code, locale, BROWSE_CURRENCY),
    fetchCountries(locale),
  ]);
  if (!found) notFound();
  const country = found.country;

  const t = createTranslator(locale);
  const name = locale === "ar" ? (country.nameAr ?? country.name) : country.name;
  const cities = [...found.destinations].sort((a, b) => a.tier - b.tier);
  if (!cities.length) notFound();

  const totalProperties = cities.reduce((sum, c) => sum + c.propertyCount, 0);

  // One representative stay per headline city, so the page shows inventory
  // rather than only a list of place names. Chosen by the API, which has the
  // properties to hand.
  const highlights = cities.slice(0, 6).flatMap((city) => {
    const hotel = city.highlight;
    if (!hotel) return [];
    const hero = hotel.images.find((i) => i.category === "exterior") ?? hotel.images[0];
    return [
      {
        citySlug: city.slug,
        cityName: city.name,
        slug: hotel.slug,
        name: hotel.name,
        category: hotel.category,
        score: hotel.review?.score,
        image: hero?.url ?? "",
        imageSrcSet: hero?.srcSet,
        imageFallback: hero?.fallbackUrl,
      },
    ];
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("browse.countryTitle", { country: name }),
    about: { "@type": "Country", name: country.name },
    hasPart: cities.map((city) => ({
      "@type": "WebPage",
      name: city.name,
      url: `/${locale}/destinations/${city.slug}`,
    })),
  };

  return (
    <div className="space-y-9">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-muted text-xs">
        <ol className="flex flex-wrap gap-1">
          <li>
            <Link href={href(locale, "/destinations")} className="underline">
              {t("browse.allTitle")}
            </Link>
          </li>
          <li aria-hidden className="rtl-flip">›</li>
          <li>{name}</li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-[-0.025em] sm:text-[32px]">
          {t("browse.countryTitle", { country: name })}
        </h1>
        <p className="text-muted mt-3 max-w-2xl leading-relaxed">
          {t("browse.countryStats", {
            properties: totalProperties,
            cities: cities.length,
            currency: country.currency,
            propertyUnit: countLabel(t, totalProperties),
            // A country with one city is not a rounding error — Singapore is one.
            cityUnit: cityLabel(t, cities.length, locale),
          })}
        </p>
      </header>

      <section aria-labelledby="cities-heading">
        <SectionHeading id="cities-heading" title={t("browse.cities")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => {
            const count = city.propertyCount;
            const from = city.fromPrice;
            return (
              <li key={city.slug}>
                <Link href={href(locale, `/destinations/${city.slug}`)} className="block h-full">
                  <Card className="card-interactive h-full overflow-hidden">
                    <Photo
                      src={city.photo.src}
                      srcSet={city.photo.srcSet}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      fallbackSrc={sceneUrl(city.slug, "landmark", city.slug)}
                      alt=""
                      ratio="16/9"
                      fallbackLabel={t("hotel.imageFallback")}
                    />
                    <div className="p-4">
                      <p className="font-semibold tracking-[-0.01em]">{city.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {count} {countLabel(t, count)}
                        </Badge>
                        {from && (
                          <span className="tabular text-xs font-semibold">
                            {t("home.fromPerNight", {
                              amount: formatMoney(from.amount, from.currency as CurrencyCode, locale),
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-muted mt-3 text-xs">{found.fromPriceBasis}</p>
      </section>

      {highlights.length > 0 && (
        <section aria-labelledby="stays-heading">
          <SectionHeading id="stays-heading" title={t("browse.staysIn", { country: name })} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((stay) => (
              <li key={stay.slug}>
                <Link href={href(locale, `/hotel/${stay.slug}`)} className="block h-full">
                  <Card className="card-interactive h-full overflow-hidden">
                    <Photo
                      src={stay.image}
                      srcSet={stay.imageSrcSet}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      fallbackSrc={stay.imageFallback}
                      alt={stay.name}
                      ratio="16/9"
                      fallbackLabel={t("hotel.imageFallback")}
                    />
                    <div className="p-4">
                      <Stars count={stay.category} label={t("a11y.stars", { n: stay.category })} />
                      <p className="mt-1 font-semibold wrap-anywhere">{stay.name}</p>
                      <p className="text-muted text-xs">{stay.cityName}</p>
                      {stay.score && (
                        <Badge tone="brand" className="tabular mt-2">
                          {stay.score.toFixed(1)} / 10
                        </Badge>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="elsewhere-heading">
        <SectionHeading id="elsewhere-heading" title={t("browse.elsewhere")} />
        <ul className="flex flex-wrap gap-2">
          {countries
            .filter((c) => c.region === country.region && c.code !== country.code)
            .slice(0, 12)
            .map((other) => (
              <li key={other.code}>
                <Link href={href(locale, `/countries/${other.code.toLowerCase()}`)}>
                  <Button variant="secondary" size="sm">
                    {locale === "ar" ? (other.nameAr ?? other.name) : other.name}
                  </Button>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
