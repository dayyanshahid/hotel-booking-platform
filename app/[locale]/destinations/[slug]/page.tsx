import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accordion, Badge, Button, Card, Photo, SectionHeading, Stars } from "@/components/ui";
import { DestinationSearchCta } from "@/components/pages/destination-cta";
import { fetchDestination, fetchDestinations } from "@/lib/server/catalogue";
import { sceneUrl } from "@/lib/illustration/scenes";
import { countLabel, createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export async function generateStaticParams() {
  const destinations = await fetchDestinations("en");
  return LOCALES.flatMap((locale) => destinations.map((d) => ({ locale, slug: d.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const found = await fetchDestination(slug, locale);
  if (!found) return { title: "Not found" };
  const destination = found.destination;
  const t = createTranslator(locale);
  return {
    title: t("cms.destinationTitle", { destination: destination.name }),
    description: destination.blurb,
    alternates: {
      canonical: `/${locale}/destinations/${slug}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/destinations/${slug}`])),
    },
  };
}

/**
 * F-090 — indexable destination page.
 *
 * Curated properties, neighbourhood guidance, FAQs and internal links render on
 * the server and never depend on live availability (§5.2, §12.4).
 */
export default async function DestinationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  /*
   * The place and the index of the others, in parallel. Two reads rather than
   * one because the "other destinations" strip is genuinely a different
   * question, and folding it into the detail payload would send every page a
   * list it mostly does not use.
   */
  const [found, everywhere] = await Promise.all([
    fetchDestination(slug, locale),
    fetchDestinations(locale),
  ]);
  if (!found) notFound();
  const destination = found.destination;
  const t = createTranslator(locale);

  // Built by the API, so this only picks out what the cards render.
  const hotels = found.hotels.map((hotel) => ({
    slug: hotel.slug,
    name: hotel.name,
    category: hotel.category,
    neighborhood: hotel.address.neighborhood,
    image: hotel.images[0]?.url ?? "",
    imageSrcSet: hotel.images[0]?.srcSet,
    imageFallback: hotel.images[0]?.fallbackUrl,
    score: hotel.review?.score,
  }));

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: destination.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-muted text-xs">
        <ol className="flex gap-1">
          <li>
            <Link href={href(locale, "/")} className="underline">
              {t("nav.explore")}
            </Link>
          </li>
          <li aria-hidden className="rtl-flip">›</li>
          <li>{destination.country}</li>
          <li aria-hidden className="rtl-flip">›</li>
          <li>{destination.name}</li>
        </ol>
      </nav>

      <header>
        <div className="relative overflow-hidden rounded-[var(--radius-card)] border">
          <Photo
            src={destination.photo.src}
            srcSet={destination.photo.srcSet}
            sizes="100vw"
            fallbackSrc={sceneUrl(destination.slug, "landmark", destination.slug)}
            alt=""
            ratio="21/6"
            priority
            fallbackLabel=""
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
          <h1 className="absolute inset-x-0 bottom-0 p-5 text-2xl font-bold text-white sm:text-3xl">
            {t("cms.destinationTitle", { destination: destination.name })}
          </h1>
        </div>
        <p className="text-muted mt-3 max-w-3xl text-sm">{destination.blurb}</p>
        <div className="mt-4">
          <DestinationSearchCta locale={locale} destinationId={destination.id} label={destination.name} />
        </div>
      </header>

      <section aria-labelledby="areas-heading">
        <SectionHeading id="areas-heading" title={t("cms.exploreArea")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {destination.neighborhoods.map((hood) => (
            <li key={hood.key}>
              {(() => {
                const hoodCount = hotels.filter(
                  (h) => h.neighborhood === hood.name,
                ).length;
                return (
              <Card className="h-full p-4">
                <p className="font-semibold">{hood.name}</p>
                <p className="text-muted mt-1 text-sm">{hood.blurb}</p>
                <p className="text-brand-700 mt-2 text-xs">
                  {hoodCount} {countLabel(t, hoodCount)}
                </p>
              </Card>
                );
              })()}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="curated-heading">
        <SectionHeading id="curated-heading" title={t("cms.curated")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => (
            <li key={hotel.slug}>
              <Link href={href(locale, `/hotel/${hotel.slug}`)}>
                <Card className="hover:surface-sunken h-full overflow-hidden">
                  <Photo
                    src={hotel.image}
                    srcSet={hotel.imageSrcSet}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    fallbackSrc={hotel.imageFallback}
                    alt={hotel.name}
                    ratio="16/9"
                    fallbackLabel={t("hotel.imageFallback")}
                  />
                  <div className="p-3">
                    <Stars count={hotel.category} label={t("a11y.stars", { n: hotel.category })} />
                    <p className="mt-1 font-semibold wrap-anywhere">{hotel.name}</p>
                    <p className="text-muted text-xs">{hotel.neighborhood}</p>
                    {hotel.score && (
                      <Badge tone="brand" className="mt-2">
                        {hotel.score.toFixed(1)} / 10
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <SectionHeading id="faq-heading" title={t("cms.faq")} />
        <Accordion
          items={destination.faqs.map((faq, i) => ({
            id: `faq-${i}`,
            title: faq.q,
            content: <p className="wrap-anywhere">{faq.a}</p>,
            defaultOpen: i === 0,
          }))}
        />
      </section>

      <section aria-labelledby="other-heading">
        <SectionHeading id="other-heading" title={t("home.destinations")} />
        <ul className="flex flex-wrap gap-2">
          {everywhere
            .filter((d) => d.id !== destination.id)
            .slice(0, 24)
            .map((other) => (
            <li key={other.id}>
              <Link href={href(locale, `/destinations/${other.slug}`)}>
                <Button variant="secondary" size="sm">
                  {other.name}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
