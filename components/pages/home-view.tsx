"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { Badge, Button, Card, Input, Photo, SectionHeading, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { HeroSkyline } from "@/components/ui/illustrations";
import { sceneKindForTag, sceneUrl } from "@/lib/illustration/scenes";
import { formatMoney } from "@/lib/format";
import { href, searchHref } from "@/lib/nav";
import type { Locale, SearchIntent } from "@/lib/types";

interface DestinationSummary {
  id: string;
  slug: string;
  name: string;
  country: string;
  blurb: string;
  propertyCount: number;
}

/** F-010 — hero search, collections, personalised recall and value messaging. */
export function HomeView({
  locale,
  destinations,
  collections,
}: {
  locale: Locale;
  destinations: DestinationSummary[];
  collections: { slug: string; title: string; body: string; tag: string; count: number }[];
}) {
  const { t, recent, saved, currency } = useApp();

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[var(--radius-card)] border">
        <div className="from-brand-800 to-brand-600 absolute inset-0 bg-gradient-to-br" aria-hidden />
        <HeroSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full sm:h-32" />
        <div className="relative px-4 py-10 sm:px-8 sm:py-14">
          <h1 className="max-w-2xl text-2xl font-bold text-white sm:text-4xl">{t("home.heroTitle")}</h1>
          <p className="text-brand-50 mt-3 max-w-2xl text-sm sm:text-base">{t("home.heroSubtitle")}</p>
          <div className="mt-6">
            <SearchBar variant="hero" />
          </div>
          <AiPrompt />
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <SectionHeading id="recent-heading" title={t("home.recent")} />
          <ul className="scrollbar-slim flex gap-3 overflow-x-auto pb-2">
            {recent.map((entry) => (
              <li key={entry.id} className="min-w-[240px]">
                <Link href={searchHref(locale, entry.intent)}>
                  <Card className="hover:surface-sunken h-full p-4">
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
                <Card className="hover:surface-sunken h-full overflow-hidden">
                  <Photo
                    src={sceneUrl(`collection-${collection.slug}`, sceneKindForTag(collection.tag))}
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
                <span className="bg-brand-50 text-brand-700 grid size-10 place-items-center rounded-lg">
                  <Icon name={item.icon} size={22} />
                </span>
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="text-muted mt-1 text-sm">{item.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="explore-heading">
        <SectionHeading id="explore-heading" title={t("cms.exploreArea")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.slice(0, 3).map((destination) => (
            <li key={destination.id}>
              <Card className="h-full overflow-hidden">
                <Photo
                  src={sceneUrl(destination.slug, "landmark", destination.slug)}
                  alt={destination.name}
                  ratio="16/9"
                  fallbackLabel={t("hotel.imageFallback")}
                />
                <div className="p-4">
                  <p className="font-semibold">{destination.name}</p>
                  <p className="text-muted mt-1 text-sm">{destination.blurb}</p>
                  <Link href={href(locale, `/destinations/${destination.slug}`)} className="mt-3 inline-block">
                    <Button size="sm" variant="secondary">
                      {t("common.viewDetails")}
                    </Button>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

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
    <div className="mt-4 max-w-3xl">
      <label htmlFor="ai-prompt" className="text-brand-50 text-sm font-medium">
        {t("home.aiPrompt")}
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <Input
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("home.aiPlaceholder")}
        />
        <Button type="button" variant="secondary" onClick={interpret} disabled={!prompt.trim()}>
          {t("home.aiInterpret")}
        </Button>
      </div>
      {parsed && (
        <Card className="mt-2 p-3 text-sm">
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
