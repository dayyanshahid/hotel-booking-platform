import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Photo, SectionHeading, Stars } from "@/components/ui";
import { bookableCountryList, destinationsInCountry } from "@/lib/data/destinations";
import { localized } from "@/lib/data/catalog";
import { getCountry } from "@/lib/data/geo/countries";
import { buildHotel, hotelsInDestination } from "@/lib/data/hotels";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { destinationFromPrice, FROM_PRICE_BASIS } from "@/lib/server/from-price";
import { formatMoney } from "@/lib/format";
import { sceneUrl } from "@/lib/illustration/scenes";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { CurrencyCode, Locale } from "@/lib/types";

/** Indicative browse prices render server-side, before any client preference. */
const BROWSE_CURRENCY: CurrencyCode = "USD";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    bookableCountryList().map((c) => ({ locale, code: c.code.toLowerCase() })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}): Promise<Metadata> {
  const { locale: raw, code } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const country = getCountry(code);
  if (!country) return { title: "Not found" };
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
  const country = getCountry(code);
  if (!country) notFound();

  const t = createTranslator(locale);
  const name = locale === "ar" ? (country.nameAr ?? country.name) : country.name;
  const cities = destinationsInCountry(country.code).sort((a, b) => a.tier - b.tier);
  if (!cities.length) notFound();

  const totalProperties = cities.reduce((sum, c) => sum + hotelsInDestination(c.id).length, 0);

  // One representative stay per headline city, so the page shows inventory
  // rather than only a list of place names.
  const highlights = cities.slice(0, 6).flatMap((city) => {
    const seed = hotelsInDestination(city.id)[0];
    if (!seed) return [];
    const hotel = buildHotel(seed, locale);
    const hero = hotel.images.find((i) => i.category === "exterior") ?? hotel.images[0];
    return [
      {
        citySlug: city.slug,
        cityName: localized(city.name, locale),
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
      name: localized(city.name, locale),
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
          })}
        </p>
      </header>

      <section aria-labelledby="cities-heading">
        <SectionHeading id="cities-heading" title={t("browse.cities")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => {
            const count = hotelsInDestination(city.id).length;
            const from = destinationFromPrice(city.id, BROWSE_CURRENCY, locale);
            return (
              <li key={city.slug}>
                <Link href={href(locale, `/destinations/${city.slug}`)} className="block h-full">
                  <Card className="card-interactive h-full overflow-hidden">
                    <Photo
                      src={destinationPhoto(city.slug, 0, { shape: PHOTO_SHAPE.card }).src}
                      srcSet={destinationPhoto(city.slug, 0, { shape: PHOTO_SHAPE.card }).srcSet}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      fallbackSrc={sceneUrl(city.slug, "landmark", city.slug)}
                      alt=""
                      ratio="16/9"
                      fallbackLabel={t("hotel.imageFallback")}
                    />
                    <div className="p-4">
                      <p className="font-semibold tracking-[-0.01em]">{localized(city.name, locale)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {count} {t("results.count")}
                        </Badge>
                        {from && (
                          <span className="tabular text-xs font-semibold">
                            {t("home.fromPerNight", {
                              amount: formatMoney(from.amount, from.currency, locale),
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
        <p className="text-muted mt-3 text-xs">{FROM_PRICE_BASIS[locale]}</p>
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
          {bookableCountryList()
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
