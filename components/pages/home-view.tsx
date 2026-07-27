"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { Accordion, Badge, Button, Card, Photo, SectionHeading, Stars, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { collectionPhoto, destinationPhoto, heroPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { sceneKindForTag, sceneUrl } from "@/lib/illustration/scenes";
import { formatMoney } from "@/lib/format";
import { href, searchHref } from "@/lib/nav";
import type { CurrencyCode, Locale, SearchIntent } from "@/lib/types";

interface DestinationSummary {
  id: string;
  slug: string;
  name: string;
  country: string;
  blurb: string;
  propertyCount: number;
  /** Indicative nightly "from" price, computed on the server. */
  fromPrice?: { amount: number; currency: CurrencyCode } | null;
}

export interface FeaturedStay {
  slug: string;
  name: string;
  city: string;
  neighborhood: string;
  category: number;
  score?: number;
  image: string;
  imageSrcSet?: string;
  imageFallback?: string;
  fromPrice: { amount: number; currency: CurrencyCode };
}

/** One worked example of the price stack, resolved on the server. */
export interface PriceProof {
  hotelName: string;
  hotelSlug: string;
  destinationId: string;
  currency: CurrencyCode;
  base: number;
  included: { label: string; amount: number }[];
  total: number;
  payAtProperty: { label: string; amount: number }[];
}

/** F-010 — hero search, collections, personalised recall and value messaging. */
export function HomeView({
  locale,
  destinations,
  collections,
  featured,
  proof,
  fromPriceBasis,
  totalProperties,
}: {
  locale: Locale;
  destinations: DestinationSummary[];
  collections: { slug: string; title: string; body: string; tag: string; count: number }[];
  featured: FeaturedStay[];
  proof: PriceProof;
  /** The disclosure that must accompany every indicative price on the page. */
  fromPriceBasis: string;
  totalProperties: number;
}) {
  const { t, recent, saved, currency } = useApp();

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[var(--radius-sheet)]">
        {/*
          A photograph sets the place; the brand wash over it is what keeps the
          heading and the search bar legible whatever the frame happens to be.
          If the image host is unreachable the drawn skyline shows through the
          same wash, so the hero never collapses to flat colour.
        */}
        <div className="from-brand-800 to-brand-600 absolute inset-0 bg-gradient-to-br" aria-hidden>
          <Photo
            src={heroPhoto().src}
            srcSet={heroPhoto().srcSet}
            sizes="100vw"
            fallbackSrc={sceneUrl("home-hero", "landmark", "dubai")}
            alt=""
            fill
            priority
            fallbackLabel=""
          />
          {/*
            Heaviest where the heading sits and thinning across the frame, so the
            copy clears contrast without flattening the photograph behind it.
          */}
          <div className="from-brand-900/95 via-brand-900/70 to-brand-800/45 absolute inset-0 bg-gradient-to-br" />
        </div>
        <div className="relative px-5 py-12 sm:px-10 sm:py-16">
          <h1 className="max-w-2xl text-[28px] font-bold leading-[1.1] text-white sm:text-[44px]">
            {t("home.heroTitle")}
          </h1>
          <p className="text-brand-50/90 mt-4 max-w-xl text-sm leading-relaxed sm:text-base">{t("home.heroSubtitle")}</p>
          <div className="mt-6">
            <SearchBar variant="hero" />
          </div>
          <AiPrompt />

          {/*
            Three claims the rest of the page then has to back up. They sit in
            the hero because they are the reason to use the search above them,
            not a footnote to it.
          */}
          <ul className="text-brand-50/85 mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm">
            {[t("home.trustTotal"), t("home.trustCancel"), t("home.trustLocal")].map((claim) => (
              <li key={claim} className="inline-flex items-center gap-2">
                <Icon name="check" size={15} className="text-brand-200" />
                {claim}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        The hero makes a claim; this is the claim opened up. One real stay from
        the catalogue, every line we know about, so "the real total" is
        something a visitor can check rather than something they have to accept.
      */}
      <section aria-labelledby="proof-heading" className="surface hairline rounded-[var(--radius-sheet)] border p-6 shadow-[var(--shadow-card)] sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-center">
          <div>
            <h2 id="proof-heading" className="text-2xl font-bold tracking-[-0.025em] sm:text-[32px]">
              {t("home.proofTitle")}
            </h2>
            <p className="text-muted mt-3 max-w-xl leading-relaxed">{t("home.proofBody")}</p>
            <ul className="mt-6 space-y-3">
              {[
                { title: t("value.total.title"), body: t("value.total.body"), icon: "receipt" as IconName },
                { title: t("value.room.title"), body: t("value.room.body"), icon: "bed" as IconName },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="bg-brand-50 text-brand-700 mt-0.5 grid size-9 shrink-0 place-items-center rounded-[12px]">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="text-muted block text-sm leading-relaxed">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={searchHref(locale, {
                destinationId: proof.destinationId,
                destinationDisplay: "",
                destinationType: "city",
                checkIn: "",
                checkOut: "",
                flexibility: "exact",
                rooms: [{ adults: 2, childrenAges: [] }],
                locale,
                currency,
              })}
              className="mt-6 inline-block"
            >
              <Button variant="secondary">{t("home.proofSearch")}</Button>
            </Link>
          </div>

          {/* The receipt itself. Tabular figures so the column reads as a sum. */}
          <div className="surface-sunken hairline rounded-[var(--radius-card)] border p-5">
            <p className="text-muted text-xs">{t("home.proofExample", { hotel: proof.hotelName })}</p>
            <dl className="tabular mt-4 space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">{t("home.proofRoom")}</dt>
                <dd>{formatMoney(proof.base, proof.currency, locale)}</dd>
              </div>
              {proof.included.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted wrap-anywhere">{line.label}</dt>
                  <dd>{formatMoney(line.amount, proof.currency, locale)}</dd>
                </div>
              ))}
              <div className="hairline flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="font-semibold">{t("home.proofTotal")}</dt>
                <dd className="text-xl font-bold tracking-[-0.02em]">
                  {formatMoney(proof.total, proof.currency, locale)}
                </dd>
              </div>
            </dl>
            {proof.payAtProperty.length > 0 && (
              <div className="hairline mt-4 border-t pt-4">
                <p className="text-caution-700 text-xs font-semibold">{t("home.proofAtProperty")}</p>
                <dl className="tabular mt-2 space-y-1 text-xs">
                  {proof.payAtProperty.map((line) => (
                    <div key={line.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted wrap-anywhere">{line.label}</dt>
                      <dd>{formatMoney(line.amount, proof.currency, locale)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <p className="text-muted mt-4 text-xs">{t("home.proofNothingElse")}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="featured-heading">
        <SectionHeading
          id="featured-heading"
          title={t("home.featuredTitle")}
          description={`${t("home.featuredBody")} ${t("home.catalogueSize", { count: totalProperties })}`}
          action={
            // Deals is a collections page, not a property list, so the label
            // promises what it actually opens.
            <Link href={href(locale, "/deals")}>
              <Button variant="secondary" size="sm">
                {t("home.collections")}
              </Button>
            </Link>
          }
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((stay) => (
            <li key={stay.slug}>
              <Link href={href(locale, `/hotel/${stay.slug}`)} className="block h-full">
                <Card className="card-interactive flex h-full flex-col overflow-hidden">
                  <Photo
                    src={stay.image}
                    srcSet={stay.imageSrcSet}
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    fallbackSrc={stay.imageFallback}
                    alt={stay.name}
                    ratio="4/3"
                    fallbackLabel={t("hotel.imageFallback")}
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center gap-2">
                      <Stars count={stay.category} label={t("a11y.stars", { n: stay.category })} />
                      {stay.score && (
                        <span className="text-muted tabular text-xs">{stay.score.toFixed(1)} / 10</span>
                      )}
                    </div>
                    <p className="mt-1 font-semibold tracking-[-0.01em] wrap-anywhere">{stay.name}</p>
                    <p className="text-muted text-xs wrap-anywhere">
                      {stay.neighborhood}, {stay.city}
                    </p>
                    <p className="tabular mt-auto pt-3 text-sm font-semibold">
                      {t("home.fromPerNight", {
                        amount: formatMoney(stay.fromPrice.amount, stay.fromPrice.currency, locale),
                      })}
                    </p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {/* Every indicative price on this page carries its basis (§8.2). */}
        <p className="text-muted mt-3 text-xs">{fromPriceBasis}</p>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <SectionHeading id="recent-heading" title={t("home.recent")} />
          <ul className="scrollbar-slim flex gap-3 overflow-x-auto pb-2">
            {recent.map((entry) => (
              <li key={entry.id} className="min-w-[240px]">
                <Link href={searchHref(locale, entry.intent)}>
                  <Card className="card-interactive h-full p-4">
                    <p className="font-medium">{entry.intent.destinationDisplay}</p>
                    <p className="text-muted mt-1 text-xs">
                      {entry.intent.checkIn} → {entry.intent.checkOut}
                    </p>
                    <p className="text-muted text-xs">
                      {entry.intent.rooms.length} {t("common.rooms")} ·{" "}
                      {entry.intent.rooms.reduce((s, r) => s + r.adults + r.childrenAges.length, 0)}{" "}
                      {t("common.guests")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {saved.length > 0 && (
        <section aria-labelledby="saved-heading">
          <SectionHeading
            id="saved-heading"
            title={t("home.saved")}
            action={
              <Link href={href(locale, "/saved")}>
                <Button variant="secondary" size="sm">
                  {t("common.showMore")}
                </Button>
              </Link>
            }
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {saved.slice(0, 4).map((hotel) => (
              <li key={hotel.slug}>
                <Link href={href(locale, `/hotel/${hotel.slug}`)}>
                  <Card className="h-full overflow-hidden">
                    <Photo src={hotel.image} alt={hotel.name} ratio="16/10" fallbackLabel={t("hotel.imageFallback")} />
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold">{hotel.name}</p>
                      <p className="text-muted text-xs">{hotel.city}</p>
                      {hotel.total && (
                        <p className="mt-1 text-sm font-bold">
                          {formatMoney(hotel.total, hotel.currency ?? currency, locale)}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="collections-heading">
        <SectionHeading id="collections-heading" title={t("home.collections")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((collection) => (
            <li key={collection.slug}>
              <Link href={href(locale, `/deals/${collection.slug}`)} className="block h-full">
                <Card className="card-interactive h-full overflow-hidden">
                  <Photo
                    src={collectionPhoto(collection.slug, collection.tag, { shape: PHOTO_SHAPE.strip }).src}
                    srcSet={collectionPhoto(collection.slug, collection.tag, { shape: PHOTO_SHAPE.strip }).srcSet}
                    sizes="(min-width: 1024px) 25vw, 100vw"
                    fallbackSrc={sceneUrl(`collection-${collection.slug}`, sceneKindForTag(collection.tag))}
                    alt=""
                    ratio="16/7"
                    fallbackLabel=""
                  />
                  <div className="p-4">
                    <p className="font-semibold">{collection.title}</p>
                    <p className="text-muted mt-1 text-sm">{collection.body}</p>
                    <Badge tone="brand" className="mt-3">
                      {collection.count} {t("results.count")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="value-heading">
        <SectionHeading id="value-heading" title={t("home.valueTitle")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: t("value.total.title"), body: t("value.total.body"), icon: "receipt" as IconName },
            { title: t("value.room.title"), body: t("value.room.body"), icon: "bed" as IconName },
            { title: t("value.care.title"), body: t("value.care.body"), icon: "lifebuoy" as IconName },
            { title: t("value.local.title"), body: t("value.local.body"), icon: "globe" as IconName },
          ].map((item) => (
            <li key={item.title}>
              <Card className="h-full p-4">
                <span className="bg-brand-50 text-brand-700 grid size-11 place-items-center rounded-[14px]">
                  <Icon name={item.icon} size={22} />
                </span>
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="text-muted mt-1 text-sm">{item.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/*
        Every destination, not the first three — this is the only place the
        catalogue's breadth is visible, and a partial list made the product look
        smaller than it is. The whole card is the link, so the caption does not
        need a button competing with it.
      */}
      <section aria-labelledby="explore-heading">
        <SectionHeading id="explore-heading" title={t("home.destinations")} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => (
            <li key={destination.id}>
              <Link href={href(locale, `/destinations/${destination.slug}`)} className="block h-full">
                <Card className="card-interactive relative h-full overflow-hidden">
                  {/* Ordinal 1, not 0: index 0 is the frame the hero above already uses. */}
                  <Photo
                    src={destinationPhoto(destination.slug, 1, { shape: PHOTO_SHAPE.card }).src}
                    srcSet={destinationPhoto(destination.slug, 1, { shape: PHOTO_SHAPE.card }).srcSet}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    fallbackSrc={sceneUrl(destination.slug, "landmark", destination.slug)}
                    alt=""
                    ratio="16/9"
                    fallbackLabel={t("hotel.imageFallback")}
                  />
                  <div className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold tracking-[-0.01em]">{destination.name}</p>
                      <p className="text-muted text-xs">{destination.country}</p>
                    </div>
                    <p className="text-muted mt-1 line-clamp-2 text-sm leading-relaxed">{destination.blurb}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {destination.propertyCount} {t("results.count")}
                      </Badge>
                      {destination.fromPrice && (
                        <span className="tabular text-xs font-semibold">
                          {t("home.fromPerNight", {
                            amount: formatMoney(
                              destination.fromPrice.amount,
                              destination.fromPrice.currency,
                              locale,
                            ),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        The questions a first-time visitor actually stops on. Server-rendered
        and indexable, with the answers stating the platform's real behaviour
        rather than reassurance (§12.4).
      */}
      <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl">
        <SectionHeading id="faq-heading" title={t("home.faqTitle")} />
        <div>
          <Accordion
            items={FAQ_KEYS.map((key, i) => ({
              id: `home-faq-${i}`,
              title: t(`home.faqQ${key}` as never),
              content: <p className="wrap-anywhere leading-relaxed">{t(`home.faqA${key}` as never)}</p>,
              defaultOpen: i === 0,
            }))}
          />
        </div>
      </section>
    </div>
  );
}

/** The five questions, in the order they get asked. Mirrored by the page's JSON-LD. */
const FAQ_KEYS = [1, 2, 3, 4, 5] as const;


/**
 * Optional AI inspiration (§5.2): natural language is converted into an
 * editable, structured search intent that is always shown before searching.
 */
function AiPrompt() {
  const { t, locale, currency, track } = useApp();
  const [prompt, setPrompt] = useState("");
  const [parsed, setParsed] = useState<Partial<SearchIntent> & { needs: string[] } | null>(null);

  function interpret() {
    const text = prompt.toLowerCase();
    const needs: string[] = [];
    if (/(family|kids|أطفال|عائل)/.test(text)) needs.push(locale === "ar" ? "غرف عائلية" : "family rooms");
    if (/(beach|sea|شاطئ|بحر)/.test(text)) needs.push(locale === "ar" ? "قرب الشاطئ" : "near the beach");
    if (/(free cancel|refundable|إلغاء مجاني)/.test(text)) needs.push(locale === "ar" ? "إلغاء مجاني" : "free cancellation");
    if (/(business|work|أعمال)/.test(text)) needs.push(locale === "ar" ? "مناسب للأعمال" : "business ready");

    const adults = Number(text.match(/(\d+)\s*(adults?|بالغ)/)?.[1] ?? 2);
    const nights = Number(text.match(/(\d+)\s*(nights?|ليال|ليلة)/)?.[1] ?? 3);

    setParsed({
      destinationDisplay: prompt.match(/(riyadh|jeddah|makkah|dubai|doha|istanbul|الرياض|جدة|مكة|دبي|الدوحة|إسطنبول)/i)?.[0] ?? "",
      rooms: [{ adults, childrenAges: [] }],
      currency,
      locale,
      needs,
      flexibility: "p3",
      checkIn: "",
      checkOut: "",
      destinationId: "",
      destinationType: "city",
    });
    track("ai_prompt_interpreted", { needs: needs.join(","), adults, nights });
  }

  return (
    <div className="mt-5 max-w-3xl">
      <label htmlFor="ai-prompt" className="text-brand-50 inline-flex items-center gap-1.5 text-sm font-medium">
        <Icon name="sparkle" size={15} />
        {t("home.aiPrompt")}
      </label>
      {/*
        Field and action are one pill rather than two floating controls: over a
        photograph, separate elements read as debris instead of a control.
      */}
      <div className="surface hairline mt-2 flex flex-col gap-2 rounded-[var(--radius-pill)] border p-1.5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
        <input
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("home.aiPlaceholder")}
          className="min-h-10 w-full min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        <Button
          type="button"
          onClick={interpret}
          disabled={!prompt.trim()}
          className="shrink-0 rounded-[var(--radius-pill)]"
        >
          {t("home.aiInterpret")}
        </Button>
      </div>
      {parsed && (
        <Card className="rise mt-3 p-4 text-sm">
          <p className="font-medium">{t("home.aiInterpreted")}</p>
          <ul className="text-muted mt-1 space-y-0.5 text-xs">
            <li>
              {t("common.destination")}: {parsed.destinationDisplay || "—"}
            </li>
            <li>
              {t("common.adults")}: {parsed.rooms?.[0].adults}
            </li>
            <li>
              {t("search.flexible")}: ±3
            </li>
            {parsed.needs.length > 0 && <li>{parsed.needs.join(" · ")}</li>}
          </ul>
          <p className={cx("text-muted mt-2 text-xs")}>{t("home.aiEdit")}</p>
        </Card>
      )}
    </div>
  );
}
