"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { Accordion, Badge, Button, Card, Photo, SectionHeading, Stars, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { sceneUrl } from "@/lib/illustration/scenes";
import { formatMoney } from "@/lib/format";
import { countLabel } from "@/lib/i18n";
import { href, searchHref, typedSearchHref } from "@/lib/nav";
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
  scale?: number;
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

export interface PropertyTypeTile {
  key: string;
  label: string;
  count: number;
}

export interface RegionTile {
  key: string;
  label: string;
  /** A headline city in the region, used for the tile's photograph. */
  citySlug: string;
  cities: number;
  countries: number;
}


/**
 * F-010 — the home page.
 *
 * The order is an argument about what this product is for.
 *
 * Search first, because someone who knows where they are going needs nothing
 * else. Then the receipt — the total price with every line in it — because that
 * is the only reason to use this instead of a site with more inventory, and
 * burying it below five rows of image cards wasted it.
 *
 * Then real stock: destinations and stays, with facts on the cards rather than
 * prose. The generated blurbs read identically across a hundred and seventy
 * cities, so a homepage that showed ten of them showed the same sentence ten
 * times; a property count and a from-price say more and are true.
 *
 * Browsing is one block, not four. Property type, region and travel style are
 * three answers to the same question and were three consecutive grids of the
 * same shape, which is how a page ends up long without saying more.
 */
export function HomeView({
  locale,
  destinations,
  collections,
  featured,
  propertyTypes,
  regions,
  proof,
  fromPriceBasis,
  totalProperties,
  totalCities,
  totalCountries,
}: {
  locale: Locale;
  destinations: DestinationSummary[];
  collections: { slug: string; title: string; body: string; tag: string; count: number }[];
  featured: FeaturedStay[];
  propertyTypes: PropertyTypeTile[];
  regions: RegionTile[];
  proof: PriceProof;
  /** The disclosure that must accompany every indicative price on the page. */
  fromPriceBasis: string;
  totalProperties: number;
  totalCities: number;
  totalCountries: number;
}) {
  const { t, recent, saved, currency } = useApp();

  /*
   * A property-type tile needs somewhere to search. It uses the first headline
   * destination — a type filter with no destination has nothing to run against,
   * and sending someone to an empty results page is worse than sending them to
   * a real one they can re-search from.
   */
  const typeIntent: SearchIntent = {
    destinationId: destinations[0]?.id ?? "",
    destinationDisplay: destinations[0]?.name ?? "",
    destinationType: "city",
    checkIn: "",
    checkOut: "",
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale,
    currency,
  };

  return (
    <div className="space-y-10">
      {/*
        A flat navy band, not a photograph under a wash. The search form is the
        only thing on this screen that matters, and a photograph behind it is
        competition for the one control the page exists to present.
      */}
      <section className="chrome full-bleed -mt-6 pb-16 pt-10 sm:-mt-8 sm:pb-20 sm:pt-14">
        <div className="mx-auto max-w-7xl px-4">
          <h1 className="max-w-3xl text-[30px] font-bold leading-[1.1] sm:text-[44px]">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">
            {/* Real counts, not a slogan: the size of the catalogue is the most
                useful thing we can say before somebody has typed anything. */}
            {t("home.heroSubtitle", { properties: totalProperties, cities: totalCities })}
          </p>

        </div>
      </section>

      {/*
        The search form straddles the band's lower edge. The yellow outline is
        doing real work: it is the only element on the page with that colour, so
        the eye lands on the form before it reads a word.
      */}
      <div className="relative z-10 -mt-12 sm:-mt-14">
        <div className="rounded-[var(--radius-card)] border-[3px] border-action-400">
          <SearchBar variant="hero" />
        </div>
        <AiPrompt />
      </div>

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

      {/*
        Headline destinations, dealt across regions — the catalogue is far too
        large to list here, and a home page that tried would be a directory. The
        heading links through to the full index. The whole card is the link, so
        the caption does not need a button competing with it.
      */}
      <section aria-labelledby="explore-heading">
        <SectionHeading
          id="explore-heading"
          title={t("home.destinations")}
          description={t("home.destinationsBody")}
        />
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
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {destination.propertyCount} {countLabel(t, destination.propertyCount)}
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

      <section aria-labelledby="featured-heading">
        <SectionHeading
          id="featured-heading"
          title={t("home.featuredTitle")}
          description={t("home.featuredBody")}
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

      {/*
        One browse block, not three.

        Property type, region and travel style were three consecutive grids of
        image cards, which read as one undifferentiated scroll — the same shape
        repeated, so none of it registered. They are three answers to the same
        question, so they sit under one heading as three labelled rows.
      */}
      <section aria-labelledby="browse-heading">
        <SectionHeading
          id="browse-heading"
          title={t("home.browseTitle")}
          description={t("home.browseBody")}
          action={
            <Link href={href(locale, "/destinations")}>
              <Button variant="secondary" size="sm">
                {t("home.browseAll")}
              </Button>
            </Link>
          }
        />

        <div className="space-y-5">
          <div>
            <h3 className="text-muted mb-2 text-[11px] font-bold uppercase tracking-[0.09em]">
              {t("home.byType")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {propertyTypes.map((type) => (
                <li key={type.key}>
                  <Link href={typedSearchHref(locale, typeIntent, type.label)}>
                    <span className="surface hover:border-brand-500 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-sm font-medium transition-colors duration-150">
                      {type.label}
                      <span className="text-muted tabular text-xs">{type.count}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-muted mb-2 text-[11px] font-bold uppercase tracking-[0.09em]">
              {t("home.byRegion")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {regions.map((region) => (
                <li key={region.key}>
                  <Link href={href(locale, "/destinations")}>
                    <span className="surface hover:border-brand-500 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-sm font-medium transition-colors duration-150">
                      {region.label}
                      <span className="text-muted tabular text-xs">{region.cities}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-muted mb-2 text-[11px] font-bold uppercase tracking-[0.09em]">
              {t("home.byStyle")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {collections.map((collection) => (
                <li key={collection.slug}>
                  <Link href={href(locale, `/deals/${collection.slug}`)}>
                    <span className="surface hover:border-brand-500 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-sm font-medium transition-colors duration-150">
                      {collection.title}
                      <span className="text-muted tabular text-xs">{collection.count}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The catalogue's size, stated once, as context under the browse
            block rather than as a claim in the hero. */}
        <p className="text-muted mt-6 text-xs">
          {t("home.catalogueSize", {
            properties: totalProperties,
            cities: totalCities,
            countries: totalCountries,
          })}
        </p>
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
    <div className="mt-6 max-w-3xl">
      <label htmlFor="ai-prompt" className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Icon name="sparkle" size={15} />
        {t("home.aiPrompt")}
      </label>
      {/*
        Field and action are one pill rather than two floating controls: over a
        photograph, separate elements read as debris instead of a control.
      */}
      <div className="surface mt-2 flex flex-col gap-2 rounded-[var(--radius-card)] border p-1.5 sm:flex-row sm:items-center">
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
          className="shrink-0"
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
