"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { HotelCard, HotelCardSkeleton } from "@/components/commerce/hotel-card";
import { ResultsMap } from "@/components/commerce/results-map";
import { ActiveFilterChips, FiltersPanel, SortControl } from "@/components/commerce/filters-panel";
import { Alert, Badge, Button, Card, Drawer, EmptyState, SectionHeading, cx } from "@/components/ui";
import { NoResultsArt } from "@/components/ui/illustrations";
import { formatDate, formatMoney, guestCount } from "@/lib/format";
import { href, searchHref } from "@/lib/nav";
import type { ApiError, Locale, SearchFilters, SearchIntent, SearchResponse, SortKey } from "@/lib/types";

/**
 * F-030 to F-033 — results loading, list, map and no/low results recovery.
 *
 * Behaviour required by §5.4: partial supplier state is stated honestly, late
 * results merge into canonical cards, filters persist and every empty state
 * offers the highest-value recovery instead of a blank page.
 */
export function SearchResultsView({
  locale,
  initialIntent,
  recommendationCriteria,
}: {
  locale: Locale;
  initialIntent: SearchIntent;
  recommendationCriteria: string[];
}) {
  const { t, currency, track, announce, compare, toast } = useApp();
  const api = useApi();

  const [intent, setIntent] = useState<SearchIntent>({ ...initialIntent, currency });
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sort, setSort] = useState<SortKey>("recommended");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const firstLoad = useRef(true);

  const run = useCallback(
    async (nextPage = page) => {
      setLoading(true);
      setError(null);
      const started = performance.now();
      const res = await api<SearchResponse>("/api/hotels/search", {
        method: "POST",
        body: JSON.stringify({ intent, filters, sort, page: nextPage, pageSize: 12 }),
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        track("search_results_failed", { category: res.error.category, correlationId: res.error.correlationId });
        return;
      }
      setData(res.data);
      setPage(nextPage);
      track("search_results_loaded", {
        count: res.data.totalCount,
        completeness: res.data.completeness,
        latencyBand: performance.now() - started > 800 ? "slow" : "fast",
        zeroResult: res.data.totalCount === 0,
        searchToken: res.data.searchToken,
      });
      announce(t("a11y.resultsAnnounce", { count: res.data.totalCount }));
    },
    [api, intent, filters, sort, page, track, announce, t],
  );

  useEffect(() => {
    // A new intent, filter set or sort always restarts at the first page; the
    // page counter is updated inside run() once the response arrives.
    void run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, filters, sort]);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void run(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const cards = data?.results ?? [];

  /** Single entry point so every filter surface emits the same event (§13.1). */
  const applyFilters = useCallback(
    (next: SearchFilters) => {
      setFilters(next);
      track("filter_applied", {
        codes: Object.keys(next).filter((k) => next[k as keyof SearchFilters] != null).join(","),
        countBefore: data?.totalCount ?? 0,
      });
    },
    [track, data?.totalCount],
  );
  const nights = useMemo(
    () => Math.round((Date.parse(intent.checkOut) - Date.parse(intent.checkIn)) / 86400000),
    [intent],
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-[57px] z-20 -mx-4 px-4 pb-2 pt-2 backdrop-blur" style={{ background: "var(--surface-muted)" }}>
        <SearchBar variant="compact" initial={intent} onSubmitted={(next) => setIntent(next)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl wrap-anywhere">
            {data ? `${data.totalCount} ${t("results.count")}` : t("results.loading")}{" "}
            {intent.destinationDisplay && `· ${intent.destinationDisplay}`}
          </h1>
          <p className="text-muted text-sm">
            {formatDate(intent.checkIn, locale)} → {formatDate(intent.checkOut, locale)} · {nights}{" "}
            {nights === 1 ? t("common.night") : t("common.nights")} · {intent.rooms.length} {t("common.rooms")} ·{" "}
            {guestCount(intent.rooms)} {t("common.guests")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
            {t("common.filters")}
          </Button>
          <SortControl
            value={sort}
            onChange={(next) => {
              setSort(next);
              track("sort_changed", { sort: next });
            }}
          />
          {/* Same segmented shape as Tabs, so every "pick one of these" control
              in the product looks like the same control. */}
          <div
            className="surface-sunken inline-flex gap-1 rounded-[var(--radius-pill)] p-1"
            role="group"
            aria-label={`${t("common.list")} / ${t("common.map")}`}
          >
            {(
              [
                { id: "list" as const, label: t("common.list") },
                { id: "map" as const, label: t("common.map") },
              ]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setView(option.id);
                  if (option.id === "map") track("map_opened", { count: cards.length });
                }}
                aria-pressed={view === option.id}
                className={cx(
                  "min-h-9 rounded-[var(--radius-pill)] px-4 text-sm font-medium",
                  "transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out)]",
                  view === option.id
                    ? "surface text-[var(--text)] shadow-[var(--shadow-card)]"
                    : "text-muted hover:text-[var(--text)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ActiveFilterChips filters={filters} onChange={applyFilters} />

      {data?.completeness === "partial" && (
        <Alert tone="warning" title={t("results.partial")}>
          {data.completenessMessage}
        </Alert>
      )}

      {error && (
        <Alert
          tone="critical"
          title={t(`error.${error.category}`)}
          correlationId={`${t("error.correlation")}: ${error.correlationId}`}
          action={
            <>
              {error.retryable && (
                <Button size="sm" onClick={() => run(1)}>
                  {t("common.retry")}
                </Button>
              )}
              <Link href={href(locale, "/support")}>
                <Button size="sm" variant="secondary">
                  {t("support.title")}
                </Button>
              </Link>
            </>
          }
        >
          {error.message}
        </Alert>
      )}

      <div className={cx("grid gap-6", view === "list" ? "lg:grid-cols-[280px_1fr]" : "lg:grid-cols-[280px_1fr]")}>
        <aside className="hidden lg:block">
          <Card className="sticky top-40 max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
            {data && (
              <FiltersPanel facets={data.facets} filters={filters} onChange={applyFilters} currency={intent.currency} />
            )}
          </Card>
        </aside>

        <div>
          {loading && !data && (
            <ul className="space-y-4">
              {Array.from({ length: 4 }, (_, i) => (
                <HotelCardSkeleton key={i} />
              ))}
            </ul>
          )}

          {data && data.totalCount === 0 && !loading && (
            <ZeroResults data={data} intent={intent} locale={locale} onClearFilters={() => setFilters({})} />
          )}

          {data && data.totalCount > 0 && view === "list" && (
            <>
              <ul className="space-y-4">
                {cards.map((card, i) => (
                  <HotelCard
                    key={card.canonicalHotelId}
                    card={card}
                    intent={intent}
                    rank={i + 1}
                    recommendationCriteria={recommendationCriteria}
                  />
                ))}
              </ul>
              {loading && (
                <ul className="mt-4 space-y-4">
                  <HotelCardSkeleton />
                </ul>
              )}
              {cards.length < data.totalCount && (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" onClick={() => setPage((p) => p + 1)} loading={loading}>
                    {t("results.loadMore")} ({cards.length}/{data.totalCount})
                  </Button>
                </div>
              )}
            </>
          )}

          {data && data.totalCount > 0 && view === "map" && (
            <ResultsMap
              cards={cards}
              intent={intent}
              selected={selected}
              onSelect={setSelected}
              onSearchArea={(bounds) => {
                setFilters((f) => ({ ...f, bounds }));
                toast(t("results.searchArea"), "info");
              }}
            />
          )}
        </div>
      </div>

      {compare.length > 1 && (
        <div className="no-print fixed inset-x-0 bottom-16 z-30 px-4 lg:bottom-4">
          <Card className="mx-auto flex max-w-3xl items-center justify-between gap-3 p-3">
            <p className="text-sm">
              <Badge tone="brand">{compare.length}</Badge> {t("nav.compare")}
            </p>
            <Link href={`${href(locale, "/compare")}?${new URLSearchParams({ slugs: compare.join(","), ...Object.fromEntries(new URLSearchParams(searchHref(locale, intent).split("?")[1])) }).toString()}`}>
              <Button size="sm">{t("compare.title")}</Button>
            </Link>
          </Card>
        </div>
      )}

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t("common.filters")}>
        {data && (
          <FiltersPanel facets={data.facets} filters={filters} onChange={applyFilters} currency={intent.currency} />
        )}
        <div className="mt-4">
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            {t("filters.showResults", { count: data?.totalCount ?? 0 })}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

/** F-033 — no or low results: explain, then offer the strongest recovery paths. */
function ZeroResults({
  data,
  intent,
  locale,
  onClearFilters,
}: {
  data: SearchResponse;
  intent: SearchIntent;
  locale: Locale;
  onClearFilters: () => void;
}) {
  const { t } = useApp();
  const recovery = data.recovery;

  return (
    <div className="space-y-4">
      <EmptyState
        art={<NoResultsArt />}
        title={t("results.empty")}
        body={t("results.emptyBody")}
        actions={
          <>
            <Button onClick={onClearFilters}>{t("results.relaxFilters")}</Button>
            <Link href={href(locale, "/alerts/new")}>
              <Button variant="secondary">{t("results.createAlert")}</Button>
            </Link>
          </>
        }
      />

      {recovery && recovery.nearbyDates.length > 0 && (
        <section>
          <SectionHeading title={t("results.nearbyDates")} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recovery.nearbyDates.map((option) => (
              <li key={option.checkIn}>
                <Link
                  href={searchHref(locale, { ...intent, checkIn: option.checkIn, checkOut: option.checkOut })}
                >
                  <Card className="hover:surface-sunken p-3">
                    <p className="text-sm font-medium">
                      {formatDate(option.checkIn, locale, { day: "numeric", month: "short" })} →{" "}
                      {formatDate(option.checkOut, locale, { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {t("common.from")} {formatMoney(option.fromTotal, intent.currency, locale)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recovery && recovery.nearbyDestinations.length > 0 && (
        <section>
          <SectionHeading title={t("results.nearbyAreas")} />
          <ul className="grid gap-3 sm:grid-cols-3">
            {recovery.nearbyDestinations.map((destination) => (
              <li key={destination.id}>
                <Link href={searchHref(locale, { ...intent, destinationId: destination.id, destinationDisplay: destination.label })}>
                  <Card className="hover:surface-sunken p-3">
                    <p className="text-sm font-medium">{destination.label}</p>
                    <p className="text-muted text-xs">
                      {destination.propertyCount} {t("results.count")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
