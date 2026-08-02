"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { TripPrompt } from "@/components/search/trip-prompt";
import { Accordion, Badge, Button, Card, Photo, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { destinationPhoto, heroPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { sceneUrl } from "@/lib/illustration/scenes";
import { formatMoney } from "@/lib/format";
import { cityLabel, countLabel } from "@/lib/i18n";
import { href, searchHref, searchParamsFromIntent, typedSearchHref } from "@/lib/nav";
import type { CurrencyCode, Locale, SearchFilters, SearchIntent } from "@/lib/types";

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
  citySlug: string;
  cities: number;
  countries: number;
}

/**
 * F-010 — Explore.
 *
 * Rebuilt around two ideas the previous version did not have.
 *
 * The page has a rhythm. Bands of different ground — ink, plain, raised —
 * alternate, so a section is legible as a section before a word of it is read.
 * Everything used to be a white card on a grey page, which meant every part of
 * the page carried the same weight and none of it carried any.
 *
 * Photographs carry their own captions. Destination and stay tiles set their
 * text on the image under a gradient scrim rather than in a white box beneath
 * it. That is not decoration: it halves the vertical space a tile needs, which
 * is what makes a mosaic and a scroll rail possible instead of another
 * four-across grid.
 *
 * The content order is unchanged and deliberate — search, then the receipt that
 * justifies the product, then real stock, then browsing.
 */
export function HomeView({
  locale,
  destinations,
  collections,
  featured,
  propertyTypes,
  regions,
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
  /** The disclosure that must accompany every indicative price on the page. */
  fromPriceBasis: string;
  totalProperties: number;
  totalCities: number;
  totalCountries: number;
}) {
  const { t, recent, saved, currency } = useApp();
  const router = useRouter();

  /**
   * What "run this" means on the consumer site: open the results page already
   * narrowed to what the sentence asked for, rather than showing everything and
   * making the guest re-apply it.
   */
  function runInterpreted(intent: SearchIntent, filters: SearchFilters) {
    const params = searchParamsFromIntent(intent);
    for (const [key, value] of Object.entries(filters)) {
      params.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    router.push(`${href(locale, "/search")}?${params.toString()}`);
  }

  /*
   * A property-type pill needs somewhere to search. It uses the leading
   * headline destination: a type filter with no destination has nothing to run
   * against, and an empty results page is a worse landing than a real one.
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

  /*
   * Cities without photography of their own hash into a small shared set, so
   * two tiles side by side can land on the same frame — New York and Sydney did.
   * Walking the ordinal until the frame is new costs nothing and guarantees five
   * distinct images in a mosaic of five.
   */
  const usedFrames = new Set<string>();
  const withDistinctPhoto = (destination: DestinationSummary, large: boolean) => {
    const shape = large ? PHOTO_SHAPE.card : PHOTO_SHAPE.frame;
    for (let ordinal = 0; ordinal < 8; ordinal += 1) {
      const photo = destinationPhoto(destination.slug, ordinal, { shape });
      if (!usedFrames.has(photo.src)) {
        usedFrames.add(photo.src);
        return photo;
      }
    }
    return destinationPhoto(destination.slug, 0, { shape });
  };

  const [lead, ...restDestinations] = destinations;
  const mosaic = restDestinations.slice(0, 4);
  const quickPicks = destinations.slice(0, 7);

  return (
    <div>
      {/* ---------------------------------------------------------- hero */}
      {/*
        A photograph under a navy wash, not a flat rectangle.

        Every large travel site opens on somewhere you could go, because the
        page's job before anyone types is to make going somewhere feel like a
        real option. The wash is heavy enough that the type never depends on
        which frame loaded, and the drawn skyline behind it means an unreachable
        image host degrades to artwork rather than to a plain colour.
      */}
      <section className="chrome full-bleed relative -mt-6 overflow-hidden pb-24 pt-12 sm:-mt-8 sm:pb-28 sm:pt-16">
        <div className="absolute inset-0" aria-hidden>
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
          <div className="from-navy-900/95 via-navy-800/88 to-navy-700/72 absolute inset-0 bg-gradient-to-br" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4">
          <p className="text-brand-300 text-[11px] font-bold uppercase tracking-[0.14em]">
            {t("home.heroEyebrow")}
          </p>
          <h1 className="mt-3 max-w-4xl text-[34px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-white/80 sm:text-lg">
            {t("home.heroSubtitle", {
              properties: totalProperties,
              cities: totalCities,
              cityUnit: cityLabel(t, totalCities, locale),
            })}
          </p>

          {/*
            Somewhere to go, inside the band and above the fold. A search box on
            an empty page asks the visitor to already know the answer; seven
            destinations one tap away is the cheapest possible way to not.
          */}
          <div className="mt-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-white/60">
              {t("home.quickPicks")}
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {quickPicks.map((destination) => (
                <li key={destination.id}>
                  <Link
                    href={searchHref(locale, { ...typeIntent, destinationId: destination.id, destinationDisplay: destination.name })}
                    className="inline-flex min-h-9 items-center rounded-[var(--radius-pill)] border border-white/25 px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-white/15"
                  >
                    {destination.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/*
        The form straddles the band's lower edge. The yellow outline is the only
        element on the page in that colour, so the eye finds it before reading.
      */}
      <div className="relative z-10 -mt-16 sm:-mt-20">
        <div className="rounded-[var(--radius-card)] border-[3px] border-action-400 shadow-[var(--shadow-raised)]">
          <SearchBar variant="hero" />
        </div>
        <TripPrompt tone="onMedia" onRun={runInterpreted} />
      </div>

      {/* --------------------------------------------------- personalised */}
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-10">
          <SectionTitle id="recent-heading" title={t("home.recent")} />
          <ul className="rail">
            {recent.map((entry) => (
              <li key={entry.id}>
                <Link href={searchHref(locale, entry.intent)} className="block h-full">
                  <Card className="card-interactive h-full p-4">
                    <p className="font-semibold">{entry.intent.destinationDisplay}</p>
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
        <section aria-labelledby="saved-heading" className="mt-10">
          <SectionTitle
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
          <ul className="rail">
            {saved.slice(0, 8).map((hotel) => (
              <li key={hotel.slug}>
                <Link href={href(locale, `/hotel/${hotel.slug}`)} className="block h-full">
                  <Card className="card-interactive h-full overflow-hidden">
                    <Photo src={hotel.image} alt={hotel.name} ratio="16/10" fallbackLabel={t("hotel.imageFallback")} />
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold">{hotel.name}</p>
                      <p className="text-muted text-xs">{hotel.city}</p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Their own numbers, from spatay.com. Four figures rather than four
        paragraphs: a travel agency's credibility is its years and its
        certification, and both are read faster as digits.
      */}
      <section aria-labelledby="track-heading" className="band band-raised mt-10">
        <h2 id="track-heading" className="sr-only">
          {t("home.trackRecord")}
        </h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { value: t("stat.yearsValue"), label: t("stat.years") },
            { value: t("stat.travellersValue"), label: t("stat.travellers") },
            { value: t("stat.iataValue"), label: t("stat.iata") },
            { value: t("stat.supportValue"), label: t("stat.support") },
          ].map((stat) => (
            <div key={stat.label}>
              <dd className="stat-figure text-brand-500 text-[32px] font-extrabold sm:text-[44px]">
                {stat.value}
              </dd>
              <dt className="text-muted mt-1.5 text-sm">{stat.label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-center">
          <div>
            <h3 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
              {t("home.networkTitle")}
            </h3>
            <p className="text-muted mt-3 max-w-xl leading-relaxed">{t("home.networkBody")}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              { title: t("value.total.title"), body: t("value.total.body"), icon: "receipt" as IconName },
              { title: t("value.room.title"), body: t("value.room.body"), icon: "bed" as IconName },
              { title: t("value.care.title"), body: t("value.care.body"), icon: "lifebuoy" as IconName },
              { title: t("value.local.title"), body: t("value.local.body"), icon: "globe" as IconName },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="bg-brand-50 text-brand-500 mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)]">
                  <Icon name={item.icon} size={17} />
                </span>
                <span>
                  <span className="block text-sm font-bold">{item.title}</span>
                  <span className="text-muted block text-sm leading-relaxed">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------- destinations */}
      {/*
        A mosaic, not a grid. One destination is twice the size of the others,
        which gives the section a focal point and lets the eye enter it — five
        identical tiles have no way in.
      */}
      <section aria-labelledby="destinations-heading" className="band band-plain">
        <SectionTitle
          id="destinations-heading"
          title={t("home.destinations")}
          description={t("home.destinationsBody")}
          action={
            <Link href={href(locale, "/destinations")}>
              <Button variant="secondary" size="sm">
                {t("home.browseAll")}
              </Button>
            </Link>
          }
        />
        {lead && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
            <li className="sm:col-span-2 sm:row-span-2">
              <DestinationTile
                locale={locale}
                destination={lead}
                photo={withDistinctPhoto(lead, true)}
                large
              />
            </li>
            {mosaic.map((destination) => (
              <li key={destination.id}>
                <DestinationTile
                  locale={locale}
                  destination={destination}
                  photo={withDistinctPhoto(destination, false)}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted mt-4 text-xs">{fromPriceBasis}</p>
      </section>

      {/* -------------------------------------------------------- stays */}
      <section aria-labelledby="stays-heading" className="band band-raised">
        <SectionTitle
          id="stays-heading"
          title={t("home.featuredTitle")}
          description={t("home.featuredBody")}
        />
        <ul className="rail">
          {featured.map((stay) => (
            <li key={stay.slug}>
              <Link href={href(locale, `/hotel/${stay.slug}`)} className="block h-full">
                <Card className="card-interactive h-full overflow-hidden">
                  <div className="overlay-tile aspect-[4/3]">
                    <Photo
                      src={stay.image}
                      srcSet={stay.imageSrcSet}
                      sizes="(min-width: 1024px) 25vw, 78vw"
                      fallbackSrc={stay.imageFallback}
                      alt=""
                      fill
                      fallbackLabel={t("hotel.imageFallback")}
                    />
                    {stay.score && (
                      <span className="score-badge absolute end-2 top-2 z-2 grid min-h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-1.5 text-sm font-bold">
                        {stay.score.toFixed(1)}
                      </span>
                    )}
                    <div className="overlay-content p-3">
                      <p className="text-xs text-white/80">{stay.city}</p>
                      <p className="text-[15px] font-bold leading-tight wrap-anywhere">{stay.name}</p>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 p-3">
                    <span className="text-muted text-xs">{stay.neighborhood}</span>
                    <span className="tabular text-sm font-bold">
                      {t("home.fromPerNight", {
                        amount: formatMoney(stay.fromPrice.amount, stay.fromPrice.currency, locale),
                      })}
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------- browse */}
      {/*
        Property type, region and travel style are three answers to one
        question, so they are one block of labelled rows rather than three
        grids of identical cards.
      */}
      <section aria-labelledby="browse-heading" className="band band-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="browse-heading" className="text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">
              {t("home.browseTitle")}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/75">{t("home.browseBody")}</p>
          </div>
          <Link href={href(locale, "/destinations")}>
            <Button variant="chrome" size="sm">
              {t("home.browseAll")}
            </Button>
          </Link>
        </div>

        <div className="mt-8 space-y-6">
          <PillRow
            label={t("home.byType")}
            items={propertyTypes.map((type) => ({
              key: type.key,
              label: type.label,
              count: type.count,
              href: typedSearchHref(locale, typeIntent, type.label),
            }))}
          />
          <PillRow
            label={t("home.byRegion")}
            items={regions.map((region) => ({
              key: region.key,
              label: region.label,
              count: region.cities,
              href: href(locale, "/destinations"),
            }))}
          />
          <PillRow
            label={t("home.byStyle")}
            items={collections.map((collection) => ({
              key: collection.slug,
              label: collection.title,
              count: collection.count,
              href: href(locale, `/deals/${collection.slug}`),
            }))}
          />
        </div>

        {/* The catalogue's size, stated once, as three figures rather than a
            sentence nobody reads. */}
        <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/20 pt-6">
          {[
            { value: totalProperties, label: t("home.statProperties") },
            { value: totalCities, label: t("home.statCities") },
            { value: totalCountries, label: t("home.statCountries") },
          ].map((stat) => (
            <div key={stat.label}>
              <dd className="stat-figure text-[26px] font-bold sm:text-[36px]">
                {stat.value.toLocaleString()}
              </dd>
              <dt className="mt-1 text-xs text-white/70 sm:text-sm">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------- FAQ */}
      <section aria-labelledby="faq-heading" className="band band-plain">
        <div className="mx-auto max-w-3xl">
          <SectionTitle id="faq-heading" title={t("home.faqTitle")} />
          <Accordion
            items={([1, 2, 3, 4, 5] as const).map((n) => ({
              id: `faq-${n}`,
              title: t(`home.faqQ${n}` as never),
              content: <p className="wrap-anywhere">{t(`home.faqA${n}` as never)}</p>,
              defaultOpen: n === 1,
            }))}
          />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- pieces */

/**
 * Section titles here rather than the shared `SectionHeading`, because these
 * sit on three different grounds — including the ink band — and need to inherit
 * their colour rather than assert one.
 */
function SectionTitle({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">
          {title}
        </h2>
        {description && <p className="text-muted mt-1.5 max-w-2xl text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A destination as a photograph that carries its own caption. */
function DestinationTile({
  locale,
  destination,
  photo,
  large = false,
}: {
  locale: Locale;
  destination: DestinationSummary;
  /** Resolved by the caller so a mosaic can guarantee distinct frames. */
  photo: { src: string; srcSet: string };
  large?: boolean;
}) {
  const { t } = useApp();
  return (
    <Link href={href(locale, `/destinations/${destination.slug}`)} className="block h-full">
      <div
        className={cx(
          "overlay-tile h-full rounded-[var(--radius-card)] border",
          large ? "min-h-[260px] sm:min-h-[420px]" : "min-h-[190px]",
        )}
      >
        <Photo
          src={photo.src}
          srcSet={photo.srcSet}
          sizes={large ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
          fallbackSrc={sceneUrl(destination.slug, "landmark", destination.slug)}
          alt=""
          fill
          fallbackLabel=""
        />
        <div className={cx("overlay-content", large ? "p-5" : "p-4")}>
          <p className="text-xs text-white/75">{destination.country}</p>
          <p className={cx("font-bold tracking-[-0.02em]", large ? "text-[26px]" : "text-lg")}>
            {destination.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/85">
            <span>
              {destination.propertyCount} {countLabel(t, destination.propertyCount)}
            </span>
            {destination.fromPrice && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular font-bold">
                  {t("home.fromPerNight", {
                    amount: formatMoney(
                      destination.fromPrice.amount,
                      destination.fromPrice.currency,
                      locale,
                    ),
                  })}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}

/** One labelled row of the browse block. */
function PillRow({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; count: number; href: string }[];
}) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-white/60">{label}</h3>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-white/25 px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-white/15"
            >
              {item.label}
              <Badge tone="neutral" className="!border-white/20 !bg-white/15 !text-white/80">
                {item.count}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}


