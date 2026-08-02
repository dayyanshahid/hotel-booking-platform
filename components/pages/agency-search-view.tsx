"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { may, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Button, Card, Drawer, EmptyState, SectionHeading, cx } from "@/components/ui";
import { NoResultsArt } from "@/components/ui/illustrations";
import { SearchBar } from "@/components/search/search-bar";
import { TripPrompt } from "@/components/search/trip-prompt";
import { Icon } from "@/components/ui/icons";
import { HotelCard, HotelCardSkeleton } from "@/components/commerce/hotel-card";
import { ResultsMap } from "@/components/commerce/results-map";
import {
  ActiveFilterChips,
  FiltersPanel,
  LIVE_SUPPLY_FILTERS,
  SortControl,
} from "@/components/commerce/filters-panel";
import { PageHeader, TradePrices } from "@/components/agency/ui";
import { RateShelf } from "@/components/agency/rate-shelf";
import Link from "next/link";
import {
  addDays,
  formatDate,
  formatMoney,
  guestCount,
  isPerRoomTotal,
  nightsBetween,
  todayIso,
} from "@/lib/format";
import { countLabel, guestLabel, roomLabel } from "@/lib/i18n";
import { href, searchParamsFromIntent } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import { QUOTE_BATCH } from "@/lib/agency/rates";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import type {
  CurrencyCode,
  Locale,
  SearchFilters,
  SearchIntent,
  SearchResponse,
  SortKey,
} from "@/lib/types";

/**
 * Searching from inside the portal.
 *
 * It is the same inventory, ranked the same way, so it is the same page — the
 * consumer card, the consumer facets, the same map and the same recovery when
 * nothing comes back. This used to be a text-only table on the theory that a
 * counter wants density rather than photography. In practice the agent is on
 * the phone to someone who is looking at our public site, describing a property
 * from a worse picture of our own stock than the caller has.
 *
 * What differs is the money and what you can do with it: the price rail carries
 * cost, sell and margin against the struck public price, and every row can go
 * into a quote or straight onto the agency's credit line.
 */
export function AgencySearchView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{(context) => <TradeSearch locale={locale} context={context} />}</PortalShell>;
}

/**
 * The applied search as a query string the property page can read back.
 *
 * It carries the whole allocation, child ages included, because the property
 * page re-prices from it. A link that dropped the children would quote an
 * agent a room for two and surprise them at the counter.
 */
function propertyQuery(intent: SearchIntent): string {
  return searchParamsFromIntent(intent).toString();
}

/** Server sorts, plus the one only a trade screen can offer. */
type TradeSort = SortKey | "marginDesc";

function TradeSearch({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const router = useRouter();

  /**
   * What the bar is pre-filled with. It is not the applied search: the bar owns
   * its own working copy from here, and `applied` below is what the visible
   * results were actually fetched with.
   */
  const [seed, setSeed] = useState<SearchIntent>(() => ({
    destinationId: "",
    destinationDisplay: "",
    destinationType: "city",
    checkIn: addDays(todayIso(), 21),
    checkOut: addDays(todayIso(), 24),
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale,
    // Trade prices settle in the agency's currency, not whatever the agent
    // happens to be browsing the consumer site in.
    currency: context.agency.credit.currency as SearchIntent["currency"],
  }));

  const [data, setData] = useState<SearchResponse | null>(null);
  /**
   * The intent the visible results were fetched with — not the one in the bar,
   * which the agent may have started editing. A property link built from the
   * bar would price a different stay from the one on screen.
   */
  const [applied, setApplied] = useState<SearchIntent | null>(null);
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  /** Set when a row's cost and sell could not be fetched, so it can be said. */
  const [pricingFailed, setPricingFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Filters and sorting go to the server, as they do on the public site.
   *
   * They used to run over whichever page had already been fetched, which made
   * the count on screen a count of one page rather than of the search — "3
   * properties" when there were forty, because the other thirty-seven had not
   * been asked for. Facet counts come back with the results, so the number
   * beside a filter is the number the filter will actually give.
   */
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sort, setSort] = useState<TradeSort>("recommended");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /*
   * What this account may do.
   *
   * The server refuses either way; this is so a view-only agent is not offered
   * a button whose only outcome is a refusal. Browsing rates with cost and
   * margin on them is exactly what the permission is for.
   */
  const canIssue = may(context, "issue");

  /**
   * Which property has its rate sheet open. One at a time.
   *
   * Two open sheets is four hundred pixels of rates above the row an agent is
   * reading, and every one of them costs a supplier request. Comparing two
   * properties is done by opening one, reading it, and opening the next — the
   * results themselves stay in place either way, which is the thing the old
   * page could not do.
   */
  const [openShelf, setOpenShelf] = useState<string | null>(null);

  /**
   * The map shows the whole result set, not the page the list happens to be on.
   *
   * A list that has loaded twelve of sixty-eight is honest — it says so on the
   * button. A map is not: it is read as "here is the supply", and pins for a
   * fifth of it look like a thin city rather than a partly loaded page. Paging
   * is cumulative server-side, so the rest arrives in one request for the last
   * page rather than five trips through "show more".
   *
   * Guarded by the token so it happens once per result set: `run` replaces the
   * data this reads, and without that this would ask again on every render.
   */
  const expandedFor = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "map" || busy || !data || !applied) return;
    if (data.results.length >= data.totalCount) return;
    if (expandedFor.current === data.searchToken) return;
    expandedFor.current = data.searchToken;
    void run({ page: Math.ceil(data.totalCount / 12) });
    // `run` is redefined every render and is not a dependency worth chasing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, busy, data, applied]);

  /**
   * One entry point for every way the page can change.
   *
   * Filters, sort, paging and a new search all go through here with the state
   * they are changing passed in, rather than each setting state and an effect
   * chasing it. An effect per control is how a filter change and a page change
   * end up racing, and the loser wins the screen.
   */
  async function run(
    next: {
      intent?: SearchIntent;
      filters?: SearchFilters;
      sort?: TradeSort;
      page?: number;
    } = {},
  ) {
    const intent = next.intent ?? applied ?? seed;
    if (!intent.destinationId) {
      setError(t("agency.pickDestination"));
      return;
    }
    const nextFilters = next.filters ?? filters;
    const nextSort = next.sort ?? sort;
    // A new search, filter or sort starts at the first page; only "load more"
    // asks for a later one.
    const nextPage = next.page ?? 1;

    setBusy(true);
    setError(null);
    if (nextPage === 1) setData(null);
    if (next.intent) setSeed(next.intent);
    setFilters(nextFilters);
    setSort(nextSort);
    setPage(nextPage);

    const res = await fetch(apiUrl("/api/hotels/search"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({
        intent,
        /*
         * Contracted supply only.
         *
         * The portal used to search the same catalogue the public site does,
         * demonstration inventory included, and an agent quoting one of those
         * to a customer had a property nobody could book. Everything on this
         * page now comes from Hotelbeds or TourMind.
         */
        supply: "live",
        filters: nextFilters,
        // Margin is ours, not the supplier's: the server has no concept of it,
        // so it ranks by its own default and we reorder what comes back.
        sort: nextSort === "marginDesc" ? "recommended" : nextSort,
        page: nextPage,
        pageSize: 12,
      }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: SearchResponse;
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setData(body.data);
    setApplied(intent);

    // One quote call for the whole page rather than one per row.
    await priceRows(body.data.results.map((r) => r.offerSummary.offerId));
  }

  /**
   * What the agency pays and charges for each row on the page.
   *
   * Kept apart from the search so it can be retried on its own: the rates are
   * already on screen and correct, and re-running the whole search to recover a
   * pricing call would throw away good supply and spend a supplier request.
   *
   * A failure here used to do nothing whatsoever — no state, no message — and
   * the price rail, which shows a shimmer until a quote arrives, shimmered for
   * ever. An agent was left looking at a page of real rooms with no cost, no
   * sell and nothing to say why, on the one screen whose entire purpose is
   * those numbers.
   */
  async function priceRows(offerIds: string[]): Promise<void> {
    if (!offerIds.length) return;
    setPricingFailed(false);

    /*
     * In batches, because the endpoint prices sixty at a time.
     *
     * It takes the first sixty and says nothing about the rest, which was
     * invisible while the list only ever asked for a page of twelve. Opening
     * the map now loads the whole result set, and a sixty-eight property city
     * lost its last eight rates to a silent truncation — rooms on screen with
     * a shimmer where the cost should be. Batching keeps the server's bound
     * where it is rather than raising a limit to whatever today's city needs.
     */
    const batches: string[][] = [];
    for (let i = 0; i < offerIds.length; i += QUOTE_BATCH) {
      batches.push(offerIds.slice(i, i + QUOTE_BATCH));
    }

    try {
      const responses = await Promise.all(
        batches.map(async (batch) => {
          const priced = await fetch(apiUrl("/api/agency/quote"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: apiCredentials(),
            body: JSON.stringify({ offerIds: batch }),
          });
          return (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
        }),
      );

      const quoted = responses.flatMap((body) => body.data?.quotes ?? []);
      if (quoted.length) {
        setQuotes((held) => ({
          ...held,
          ...Object.fromEntries(quoted.map((q) => [q.offerId, q])),
        }));
      }
      // A partial answer is still a failure for the rows it left out, and those
      // are the ones that would otherwise shimmer.
      if (quoted.length < offerIds.length) setPricingFailed(true);
    } catch {
      setPricingFailed(true);
    }
  }

  const nights = nightsBetween(seed.checkIn, seed.checkOut);
  const cards = data?.results ?? [];

  const ordered =
    sort === "marginDesc"
      ? // Rows we have not priced yet sink rather than sorting as zero margin.
        [...cards].sort(
          (a, b) => (quotes[b.offerSummary.offerId]?.margin ?? -1) - (quotes[a.offerSummary.offerId]?.margin ?? -1),
        )
      : cards;

  return (
    <div className="space-y-5">
      <PageHeader title={t("agency.searchStays")} description={t("agency.searchBody")} />

      {/*
        The same bar the consumer site uses, running the search here instead of
        navigating. The portal used to have its own — a datalist, two date
        fields and two selects — which meant an agent could not search for a
        family with children at all, on a platform that prices them fine for a
        traveller booking direct. The counter needs *more* of the search, not
        less of it.
      */}
      <Card className="space-y-3 p-4">
        <SearchBar
          /*
           * Keyed on the search itself so a sentence rewrites the controls.
           * The bar keeps its own working copy of the intent — that is what
           * makes it editable — which meant interpreting "2 rooms in Dubai in
           * October" ran the right search while the bar above it still read
           * 1 room in August. The next thing the agent does is edit that bar,
           * and they would have been editing the wrong stay.
           */
          key={searchParamsFromIntent(seed).toString()}
          variant="panel"
          initial={seed}
          currency={seed.currency}
          busy={busy}
          onSearch={(intent) => void run({ intent, filters: {} })}
        />
        <div className="hairline flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-muted text-sm">
            {formatDate(seed.checkIn, locale)} → {formatDate(seed.checkOut, locale)} · {nights}{" "}
            {nights === 1 ? t("common.night") : t("common.nights")} ·{" "}
            {t("agency.pricedIn", { currency: seed.currency })}
          </p>
        </div>

        {/*
          An agent is usually repeating a sentence a caller just said. Typing it
          is faster than filling four controls, and it is the same interpreter
          the consumer site runs — so a trade search cannot understand less of a
          request than a traveller's would.
        */}
        <TripPrompt
          className="max-w-none"
          currency={seed.currency as CurrencyCode}
          label={t("agency.describeTrip")}
          placeholder={t("agency.describeTripPlaceholder")}
          // Filters the sentence asked for go with the search, so "free
          // cancellation" narrows the page rather than being read aloud and
          // forgotten.
          onRun={(intent, asked) => void run({ intent, filters: asked })}
        />
      </Card>

      {error && <Alert tone="critical">{error}</Alert>}

      {/*
        The rates are fine; our own pricing call is not. Said once at the top
        with a way out, rather than only as a dash on every row — an agent
        needs to know it is worth retrying before they start reading prices
        that are not there.
      */}
      {pricingFailed && cards.length > 0 && (
        <Alert tone="warning" title={t("agency.priceUnavailable")}>
          <div className="flex flex-wrap items-center gap-3">
            <span>{t("agency.pricingFailed")}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void priceRows(cards.map((c) => c.offerSummary.offerId))}
            >
              {t("agency.retryPricing")}
            </Button>
          </div>
        </Alert>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold wrap-anywhere">
                {data.totalCount} {countLabel(t, data.totalCount)}
                {applied?.destinationDisplay && ` · ${applied.destinationDisplay}`}
              </h2>
              <p className="text-muted text-sm">
                {applied && (
                  <>
                    {formatDate(applied.checkIn, locale)} → {formatDate(applied.checkOut, locale)} ·{" "}
                    {applied.rooms.length} {roomLabel(t, applied.rooms.length, locale)} ·{" "}
                    {guestCount(applied.rooms)} {guestLabel(t, guestCount(applied.rooms), locale)}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                {t("common.filters")}
              </Button>
              <SortControl<TradeSort>
                value={sort}
                onChange={(next) => void run({ sort: next })}
                // The one question only this side of the platform can ask.
                extra={[{ id: "marginDesc", label: t("agency.sortMargin") }]}
                /*
                 * Guest rating needs a review score and best value needs a
                 * quality score; neither supplier publishes either, so both
                 * would sort a page by zero and look as though they had worked.
                 */
                omit={["rating", "bestValue"]}
              />
              <div
                className="surface-sunken inline-flex gap-1 rounded-[var(--radius-pill)] p-1"
                role="group"
                aria-label={`${t("common.list")} / ${t("common.map")}`}
              >
                {[
                  { id: "list" as const, label: t("common.list") },
                  { id: "map" as const, label: t("common.map") },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setView(option.id)}
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

          <ActiveFilterChips filters={filters} onChange={(next) => void run({ filters: next })} />
        </>
      )}

      {/*
        Only worth saying when there is a page to qualify. With nothing on the
        screen the empty state below says the same thing at full length, and two
        notices carrying one fact reads as two faults.
      */}
      {data?.completeness === "partial" && data.totalCount > 0 && (
        <Alert tone="warning" title={t("results.partial")}>
          {data.completenessMessage}
        </Alert>
      )}


      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          {data && (
            <Card className="sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
              <FiltersPanel
                facets={data.facets}
                filters={filters}
                onChange={(next) => void run({ filters: next })}
                currency={(applied?.currency ?? seed.currency) as CurrencyCode}
                // Only what the two suppliers actually publish.
                supported={LIVE_SUPPLY_FILTERS}
              />
            </Card>
          )}
        </aside>

        <div>
          {busy && !data && (
            <ul className="@container space-y-4">
              {Array.from({ length: 3 }, (_, i) => (
                <HotelCardSkeleton key={i} />
              ))}
            </ul>
          )}

          {data && data.totalCount === 0 && !busy && (
            <TradeZeroResults
              data={data}
              intent={applied ?? seed}
              onClearFilters={() => void run({ filters: {} })}
              onDates={(checkIn, checkOut) => void run({ intent: { ...(applied ?? seed), checkIn, checkOut }, filters: {} })}
              onDestination={(destinationId, destinationDisplay) =>
                void run({ intent: { ...(applied ?? seed), destinationId, destinationDisplay }, filters: {} })
              }
            />
          )}

          {data && data.totalCount > 0 && view === "list" && applied && (
            <>
              <ul className="@container space-y-4">
                {ordered.map((card, index) => {
                  const quote = quotes[card.offerSummary.offerId];
                  const currency = card.price.currency as CurrencyCode;
                  const property = `${href(locale, `/agency/hotel/${card.slug}`)}?${propertyQuery(applied)}`;
                  return (
                    <HotelCard
                      key={card.canonicalHotelId}
                      card={card}
                      intent={applied}
                      rank={index + 1}
                      href={property}
                      priceRail={
                        quote ? (
                          <TradePrices
                            cost={quote.cost}
                            sell={quote.sell}
                            margin={quote.margin}
                            currency={currency}
                            locale={locale}
                            publicPrice={card.price.total}
                            perRoomOf={
                              isPerRoomTotal(card.price) ? card.price.roomsRequested : undefined
                            }
                          />
                        ) : pricingFailed ? (
                          // Said plainly rather than shimmered at. The rate is
                          // real and still bookable; it is our own pricing call
                          // that did not answer, and an agent needs to know
                          // that rather than watch a placeholder pulse.
                          <p className="text-muted text-end text-xs">{t("agency.priceUnavailable")}</p>
                        ) : (
                          // Priced a moment behind the card: the rate is real,
                          // the agency's cost is a second call. Showing the
                          // public price as if it were theirs would be worse.
                          <div className="space-y-1.5 text-end">
                            <div className="surface-sunken shimmer ms-auto h-3 w-24 rounded" />
                            <div className="surface-sunken shimmer ms-auto h-6 w-28 rounded" />
                            <div className="surface-sunken shimmer ms-auto h-3 w-36 rounded" />
                          </div>
                        )
                      }
                      actions={
                        /*
                          Two things, and they are different questions.
                          "View rooms" opens every rate here, because comparing
                          boards and cancellation terms across two properties is
                          the work and it cannot be done a page at a time.
                          "See property details" is for the things a page is
                          for — the photographs, the facilities, the address.
                        */
                        <div className="mt-2 flex flex-col gap-2 lg:items-end">
                          <Button
                            variant="action"
                            size="md"
                            className="w-full"
                            aria-expanded={openShelf === card.slug}
                            onClick={() => setOpenShelf((prev) => (prev === card.slug ? null : card.slug))}
                          >
                            {openShelf === card.slug ? t("agency.hideRooms") : t("agency.viewRooms")}
                            <Icon
                              name="chevronDown"
                              size={16}
                              className={cx("transition-transform", openShelf === card.slug && "rotate-180")}
                            />
                          </Button>
                          <Link href={property} className="block w-full">
                            <Button variant="secondary" size="sm" className="w-full">
                              {t("agency.seePropertyDetails")}
                            </Button>
                          </Link>
                        </div>
                      }
                      below={
                        openShelf === card.slug ? (
                          <RateShelf
                            slug={card.slug}
                            hotelName={card.name}
                            intent={applied}
                            locale={locale}
                            canIssue={canIssue}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>

              {busy && (
                <ul className="mt-4 space-y-4">
                  <HotelCardSkeleton />
                </ul>
              )}

              {cards.length < data.totalCount && (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" loading={busy} onClick={() => void run({ page: page + 1 })}>
                    {t("results.loadMore")} ({cards.length}/{data.totalCount})
                  </Button>
                </div>
              )}
            </>
          )}

          {data && data.totalCount > 0 && view === "map" && applied && (
            <ResultsMap
              cards={ordered}
              intent={applied}
              selected={selected}
              onSelect={setSelected}
              onSearchArea={(bounds) => void run({ filters: { ...filters, bounds } })}
              // A pin must not walk an agent out of the portal and onto the
              // public price.
              hrefFor={(slug) => `${href(locale, `/agency/hotel/${slug}`)}?${propertyQuery(applied)}`}
              /*
               * And the callout must not show it either. The rail on the list
               * carries cost, sell and margin; the bubble was still showing the
               * struck public total, so the same room had two prices on one
               * screen depending on which half the agent was reading.
               */
              priceFor={(card) => {
                const quote = quotes[card.offerSummary.offerId];
                if (!quote) return <p className="text-muted text-xs">{t("agency.priceUnavailable")}</p>;
                return (
                  <TradePrices
                    cost={quote.cost}
                    sell={quote.sell}
                    margin={quote.margin}
                    currency={card.price.currency as CurrencyCode}
                    locale={locale}
                    publicPrice={card.price.total}
                    compact
                    perRoomOf={isPerRoomTotal(card.price) ? card.price.roomsRequested : undefined}
                  />
                );
              }}
            />
          )}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t("common.filters")}>
        {data && (
          <FiltersPanel
            facets={data.facets}
            filters={filters}
            onChange={(next) => void run({ filters: next })}
            currency={(applied?.currency ?? seed.currency) as CurrencyCode}
            supported={LIVE_SUPPLY_FILTERS}
          />
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

/**
 * Nothing came back.
 *
 * The same recovery the public site offers, because the agent has the customer
 * on the phone and "no availability" is the moment the call is either saved or
 * lost. Dates and nearby places re-run the search here rather than linking out.
 */
function TradeZeroResults({
  data,
  intent,
  onClearFilters,
  onDates,
  onDestination,
}: {
  data: SearchResponse;
  intent: SearchIntent;
  onClearFilters: () => void;
  onDates: (checkIn: string, checkOut: string) => void;
  onDestination: (id: string, label: string) => void;
}) {
  const { t, locale } = useApp();
  const recovery = data.recovery;

  /*
   * An empty page has three very different causes and the advice for them is
   * opposite. Usually there is genuinely nothing for these dates, and the way
   * out is to relax the search. When no supplier is connected, relaxing anything
   * is wasted effort — the agent could widen the occupancy and shift the dates
   * all afternoon and still see this screen. And when a source was asked but
   * could not answer, the search itself was fine and the only useful thing to do
   * is run it again; every date suggestion below would have been priced off
   * supply that never arrived.
   *
   * So only the first case gets the suggestions, because it is the only one they
   * can help. Telling an agent with a customer on the phone to try different
   * dates, when the dates were never the problem, costs them the call.
   */
  const unconfigured = data.completeness === "unconfigured";
  const sourcesDown = !unconfigured && (data.sourcesUnavailable ?? 0) > 0;
  const searchable = !unconfigured && !sourcesDown;

  return (
    <div className="space-y-4">
      <EmptyState
        art={<NoResultsArt />}
        title={
          unconfigured
            ? t("results.noSupplier")
            : sourcesDown
              ? t("results.sourcesDown")
              : t("results.empty")
        }
        body={
          unconfigured
            ? (data.completenessMessage ?? t("results.noSupplierBody"))
            : sourcesDown
              ? (data.completenessMessage ?? t("results.sourcesDownBody"))
              : t("agency.noResultsBody")
        }
        actions={
          searchable ? <Button onClick={onClearFilters}>{t("results.relaxFilters")}</Button> : undefined
        }
      />

      {searchable && recovery && recovery.nearbyDates.length > 0 && (
        <section>
          <SectionHeading title={t("results.nearbyDates")} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recovery.nearbyDates.map((option) => (
              <li key={option.checkIn}>
                <button type="button" className="w-full text-start" onClick={() => onDates(option.checkIn, option.checkOut)}>
                  <Card className="hover:surface-sunken p-3">
                    <p className="text-sm font-medium">
                      {formatDate(option.checkIn, locale, { day: "numeric", month: "short" })} →{" "}
                      {formatDate(option.checkOut, locale, { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {t("common.from")} {formatMoney(option.fromTotal, intent.currency, locale)}
                    </p>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {searchable && recovery && recovery.nearbyDestinations.length > 0 && (
        <section>
          <SectionHeading title={t("results.nearbyAreas")} />
          <ul className="grid gap-3 sm:grid-cols-3">
            {recovery.nearbyDestinations.map((destination) => (
              <li key={destination.id}>
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() => onDestination(destination.id, destination.label)}
                >
                  <Card className="hover:surface-sunken p-3">
                    <p className="text-sm font-medium">{destination.label}</p>
                    <p className="text-muted text-xs">
                      {destination.propertyCount} {countLabel(t, destination.propertyCount ?? 0)}
                    </p>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
