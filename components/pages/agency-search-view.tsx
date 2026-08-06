"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { DeskPrelude } from "@/components/pages/agency-dashboard-view";
import { RateShelf } from "@/components/agency/rate-shelf";
import { useCart } from "@/components/agency/cart";
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
import { href, intentFromSearchParams, searchParamsFromIntent } from "@/lib/nav";
import { appendResults } from "@/lib/search-append";
import { isFrameStream, readFrames, type StreamProgress } from "@/lib/search-stream";
import { forgetWarmedShelves, prefetchShelf } from "@/lib/agency/shelf-prefetch";
import { CompareBar, TradeCompare } from "@/components/agency/trade-compare";
import { ShortcutsCard, useShortcuts, type Shortcut } from "@/components/agency/shortcuts";
import { rememberSearch } from "@/lib/agency/recent-searches";
import { readSortPreference, rememberSortPreference } from "@/lib/agency/sort-preference";
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

/**
 * Every ordering this screen offers, for checking a remembered one against.
 *
 * `rating` and `bestValue` are absent on purpose and are omitted from the
 * control for the same reason: neither supplier publishes a review or quality
 * score, so both would sort the page by zero and look as though they had
 * worked.
 */
const TRADE_SORTS: TradeSort[] = [
  "recommended",
  "priceAsc",
  "priceDesc",
  "distance",
  "flexible",
  "marginDesc",
];

/**
 * What the wait is doing, while it does it.
 *
 * A trade search against both live suppliers was measured at 11.6 seconds, and
 * for all 11.6 the screen showed fifteen shimmering rectangles and no words at
 * all. An agent on the phone cannot tell a slow search from a broken one, and
 * the difference matters: one is worth waiting out and the other is worth
 * starting again. The elapsed count is there for exactly that judgement — a
 * number climbing is a system working, and it lets someone say "bear with me,
 * it's still going" instead of guessing.
 *
 * `role="status"` rather than an alert: this is progress, not a problem, and it
 * should not interrupt whatever a screen reader is currently saying.
 */
function SearchProgressLine({
  startedAt,
  progress,
  hasResults,
}: {
  startedAt: number;
  progress: StreamProgress | null;
  hasResults: boolean;
}) {
  const { t } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div
      role="status"
      className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm"
    >
      {/*
        The shared `Spinner` is its own `role="status"` with its own
        `aria-live` and an untranslated "Loading" inside it. Nested inside this
        one it would be a second live region announcing a second, less useful
        thing over the top of the first. Here the disc is decoration and the
        sentence beside it is the message.
      */}
      <span
        aria-hidden
        className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="text-[var(--text)]">
        {hasResults ? t("agency.searchMore") : t("agency.searchAsking")}
      </span>
      {/* Only once a source has actually landed; "0 of 2" is noise. */}
      {progress && progress.answered > 0 && (
        <span>{t("agency.searchAnswered", { answered: progress.answered, asked: progress.asked })}</span>
      )}
      {/*
        From one second, not from zero. A counter that appears reading "0s" the
        instant the button is pressed looks like a stopwatch someone forgot to
        start.
      */}
      {seconds >= 1 && (
        <span aria-hidden className="tabular-nums">
          {t("agency.searchElapsed", { seconds })}
        </span>
      )}
    </div>
  );
}

/**
 * The filter rail's shape, before there are facets to put in it.
 *
 * The rail only renders once results exist, so during a search its 280px
 * column stood empty and the result skeletons sat alone in the right-hand
 * two-thirds with a blank gutter beside them — then everything shifted left
 * when the rail appeared. A page that rearranges itself on arrival reads as a
 * page that has gone wrong, and it is the one moment the agent is watching
 * closely.
 */
function FilterRailSkeleton() {
  return (
    <Card aria-hidden className="sticky top-4 space-y-4 p-4">
      <div className="surface-sunken shimmer h-5 w-20 rounded" />
      {[64, 96, 72, 88].map((height, i) => (
        <div key={i} className="space-y-2">
          <div className="surface-sunken shimmer h-4 w-2/3 rounded" />
          <div className="surface-sunken shimmer rounded" style={{ height }} />
        </div>
      ))}
    </Card>
  );
}

function TradeSearch({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t, announce, compare, toggleCompare, clearCompare, toast } = useApp();
  // The comparison can put a rate straight into the selection, so this screen
  // needs the basket the rate sheet already had.
  const cart = useCart();
  const router = useRouter();

  /**
   * What the bar is pre-filled with. It is not the applied search: the bar owns
   * its own working copy from here, and `applied` below is what the visible
   * results were actually fetched with.
   */
  /*
   * A search can arrive in the URL, and until now it could not.
   *
   * Every other route into this screen builds one — the home page's search bar
   * pushes `/agency/search?destination=…`, a recent search replays one, an
   * agent shares a link with a colleague — and this component threw the lot
   * away and started blank. Searching from the home page therefore dropped the
   * agent on an empty search form holding the parameters it had just ignored.
   */
  const fromUrl = useSearchParams();
  const [seed, setSeed] = useState<SearchIntent>(() => {
    const parsed = intentFromSearchParams(new URLSearchParams(fromUrl.toString()), locale);
    if (parsed?.destinationId) {
      // The agency's currency still wins: trade prices settle against credit,
      // not against whatever the link was built in.
      return { ...parsed, currency: context.agency.credit.currency as SearchIntent["currency"] };
    }
    return {
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
    };
  });

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
   * How much of the supply is still outstanding, while it is outstanding.
   *
   * Null once the search finishes, which is what tells the page to stop
   * narrating. Counts only — which supplier is slow today is not something an
   * agent can act on, and naming one in a client response is the thing §9.4
   * exists to prevent.
   */
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  /** When the search in flight began, so the wait can be counted out loud. */
  const [startedAt, setStartedAt] = useState(0);
  /**
   * Offers already sent for pricing in this search.
   *
   * Streaming means the first supplier's rows are priced when they land and the
   * rest when the search finishes, and without this the second call would
   * re-price everything the first one already did — twice the quote requests
   * for one page of results. Cleared whenever a new search starts, because
   * offer ids belong to the batch that produced them.
   */
  const priced = useRef<Set<string>>(new Set());

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
  /**
   * How this agent last asked for their results to be ordered.
   *
   * Not a changed default — whether a trade screen should open on best margin
   * is the client's decision — but a decision this agent has already made
   * being kept rather than thrown away on every search. An unknown or retired
   * value falls back to the product's own ranking rather than putting the page
   * into a state the sort control cannot show.
   */
  const [sort, setSort] = useState<TradeSort>(() => {
    const held = readSortPreference(context.session.agentId);
    return held && TRADE_SORTS.includes(held as TradeSort) ? (held as TradeSort) : "recommended";
  });
  const [page, setPage] = useState(1);
  /*
   * Which search this screen is waiting for. Live supply takes seconds, and
   * nothing cancelled the previous call when an agent adjusted a filter — so
   * the slower of the two won, and the rows on screen belonged to a filter
   * the sidebar no longer showed.
   */
  const latest = useRef(0);
  /*
   * Guest rating, offered only when there is a guest rating.
   *
   * The client asked for a review-score filter and it is a fair thing to want,
   * but neither Hotelbeds nor TourMind returns a guest score on our contracts —
   * every card comes back without one. A control that silently matches nothing
   * is worse than an absent one, because an agent reads the empty result as
   * "no availability". So it is derived from the data: the moment a supplier
   * does send scores, the filter appears on its own.
   */
  const supportedFilters = useMemo(() => {
    const hasReviews = (data?.results ?? []).some((card) => card.review?.score != null);
    return hasReviews ? [...LIVE_SUPPLY_FILTERS, "rating" as const] : LIVE_SUPPLY_FILTERS;
  }, [data]);
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

  /** Whether the side-by-side comparison is on screen. */
  const [compareOpen, setCompareOpen] = useState(false);
  /** Whether the list of keyboard shortcuts is on screen. */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
  /**
   * A search that arrived in the URL runs itself.
   *
   * Landing on a filled-in form the agent then has to press Search on is a
   * step that buys nothing — they asked for these results on the previous
   * screen. Guarded by a ref rather than by `applied`, so it fires once on
   * arrival and never fights a search the agent has since changed.
   */
  const ranFromUrl = useRef(false);
  useEffect(() => {
    if (ranFromUrl.current || !seed.destinationId) return;
    ranFromUrl.current = true;
    void run({ intent: seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const ticket = ++latest.current;
    setBusy(true);
    setError(null);
    setProgress(null);
    setStartedAt(Date.now());
    if (nextPage === 1) {
      setData(null);
      priced.current = new Set();
      // Rates warmed for the previous result set belong to a stay nobody is
      // looking at any more.
      forgetWarmedShelves();
    }

    /*
     * A new stay starts a new shortlist.
     *
     * The comparison is held in the browser and outlives a search, and the cap
     * is four. Search Lisbon, tick four, search Cairo: the four Lisbon slugs
     * are still selected, none of them is in the new result set so nothing
     * appears selected on screen — and every tick is refused with "you can
     * compare up to four" against a comparison the agent can see is empty.
     *
     * Only when the stay itself changes. A filter or a sort narrows the same
     * enquiry, and dropping a property the agent deliberately shortlisted
     * because they then filtered by board would be worse than the bug.
     */
    const stayChanged =
      next.intent !== undefined &&
      (applied === null ||
        next.intent.destinationId !== applied.destinationId ||
        next.intent.checkIn !== applied.checkIn ||
        next.intent.checkOut !== applied.checkOut);
    if (stayChanged) clearCompare();
    if (next.intent) setSeed(next.intent);
    setFilters(nextFilters);
    setSort(nextSort);
    setPage(nextPage);
    rememberSortPreference(context.session.agentId, nextSort);

    /**
     * Put a page on screen, from a frame or from a whole response.
     *
     * `announce` rather than a toast, because the one person who cannot see
     * fifteen shimmering rectangles turn into rooms is the one who most needs
     * telling that they did.
     */
    const show = (response: SearchResponse, isFinal: boolean) => {
      /*
       * "Show 12 more" adds rows; it does not re-lay the page. The server ranks
       * by a price percentile taken across the whole result set, so any supply
       * change between the two calls re-scores every row — and an agent who was
       * reading row nine would find something else there.
       */
      const merged =
        nextPage > 1 && data ? appendResults(data.results, response.results) : response.results;
      setData({ ...response, results: merged });
      setApplied(intent);

      /*
       * Recorded on the finished search only, so the "recent searches" list
       * never holds a count taken while a supplier was still answering.
       */
      if (isFinal && nextPage === 1) {
        rememberSearch(context.session.agentId, intent, Date.now(), response.totalCount);
      }
      return merged;
    };

    /*
     * The first page streams; later pages do not.
     *
     * A partial is a smaller slice of the same ranking, and merging one into a
     * page the agent has already read would take rows away from underneath
     * them — `appendResults` drops what is no longer in supply, which is right
     * for a finished search and wrong for a half-arrived one. There is nothing
     * to gain either way: "show 12 more" is served from the two-minute supply
     * cache and comes back in about a third of a second.
     */
    const streaming = nextPage === 1;

    try {
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
          stream: streaming,
        }),
      });
      // Superseded by a newer search; this answer is stale.
      if (ticket !== latest.current) return;

      if (isFrameStream(res)) {
        let arrived = false;
        await readFrames(res, async (frame) => {
          // Stop reading rather than race the search that replaced this one.
          if (ticket !== latest.current) return false;
          if (frame.type === "error") {
            setBusy(false);
            setProgress(null);
            setError(frame.error?.message ?? t("error.temporaryService"));
            return false;
          }
          arrived = true;
          const isFinal = frame.type === "final";
          const rows = show(frame.data, isFinal);
          setProgress(isFinal ? null : frame.progress);
          if (isFinal) setBusy(false);
          announce(
            isFinal
              ? t("a11y.resultsAnnounce", { count: frame.data.totalCount })
              : t("agency.searchPartialAnnounce"),
          );
          // One quote call per frame, and never for a row already priced.
          await priceRows(rows.map((r) => r.offerSummary.offerId));
          return true;
        });
        if (ticket !== latest.current) return;
        setBusy(false);
        setProgress(null);
        // A stream that closed without a single frame is a failure that had no
        // status code to carry it — the headers were sent before anything went
        // wrong. Silence would leave the page shimmering for ever.
        if (!arrived) setError(t("error.temporaryService"));
        return;
      }

      const body = (await res.json()) as {
        ok: boolean;
        data?: SearchResponse;
        error?: { message: string };
      };
      if (ticket !== latest.current) return;
      setBusy(false);
      if (!body.ok || !body.data) {
        setError(body.error?.message ?? t("error.temporaryService"));
        return;
      }
      const rows = show(body.data, true);
      announce(t("a11y.resultsAnnounce", { count: body.data.totalCount }));
      // One quote call for the whole page rather than one per row.
      await priceRows(rows.map((r) => r.offerSummary.offerId));
    } catch {
      /*
       * A dropped connection used to throw out of here unhandled, which left
       * `busy` true and the page shimmering with no message at all — the same
       * failure shape as a search that simply never returned.
       */
      if (ticket !== latest.current) return;
      setBusy(false);
      setProgress(null);
      setError(t("error.temporaryService"));
    }
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
  async function priceRows(offerIds: string[], retry = false): Promise<void> {
    /*
     * Each row priced once per search.
     *
     * A streamed search calls this twice — when the first supplier's rows land
     * and again when the page is complete — and without this the second call
     * would re-price every row the first one already did. The retry button is
     * the exception: it exists precisely to ask again for rows we have already
     * asked about.
     */
    if (retry) for (const id of offerIds) priced.current.delete(id);
    const wanted = offerIds.filter((id) => !priced.current.has(id));
    if (!wanted.length) return;
    for (const id of wanted) priced.current.add(id);
    /** Anything we could not price is forgotten, so the retry can ask again. */
    const forget = (ids: string[]) => {
      for (const id of ids) priced.current.delete(id);
    };
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
    for (let i = 0; i < wanted.length; i += QUOTE_BATCH) {
      batches.push(wanted.slice(i, i + QUOTE_BATCH));
    }

    try {
      const responses = await Promise.all(
        batches.map(async (batch) => {
          const res = await fetch(apiUrl("/api/agency/quote"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: apiCredentials(),
            body: JSON.stringify({ offerIds: batch }),
          });
          return (await res.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
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
      const answered = new Set(quoted.map((q) => q.offerId));
      const missing = wanted.filter((id) => !answered.has(id));
      if (missing.length) {
        forget(missing);
        setPricingFailed(true);
      }
    } catch {
      forget(wanted);
      setPricingFailed(true);
    }
  }

  const nights = nightsBetween(seed.checkIn, seed.checkOut);
  const cards = data?.results ?? [];

  /**
   * What is actually comparable right now.
   *
   * The selection is shared with the public site and outlives a search, which
   * is right there and wrong here: a property ticked during yesterday's Dubai
   * enquiry is not a column in today's Lisbon comparison, and showing it with
   * no price would be worse than not showing it. Intersected with the visible
   * result set, in the order they appear on the page rather than the order
   * they were ticked — the agent is reading down the list and the columns
   * should match it.
   */
  const comparing = useMemo(
    () => cards.filter((card) => compare.includes(card.slug)),
    [cards, compare],
  );

  /**
   * Four keys, and a fifth that says what the four are.
   *
   * Every one of them replaces a hunt across a dense screen. `/` is the
   * convention for a search field and it is the field this whole page hangs
   * off; `f` reaches the filters, which on a laptop are a rail an agent has to
   * aim at and on anything narrower are behind a button; `c` opens the
   * comparison they have just been ticking, which otherwise means finding a
   * bar at the bottom of the viewport.
   *
   * Escape clears the comparison rather than closing something, because the
   * drawers already close themselves on Escape and a selection with nothing
   * open is the state that has no other way out.
   */
  const shortcuts: Shortcut[] = useMemo(
    () => [
      {
        key: "/",
        labelKey: "agency.shortcutSearch",
        run: () =>
          document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(),
      },
      {
        key: "f",
        labelKey: "agency.shortcutFilters",
        run: () => {
          /*
           * The rail on a wide screen, the drawer on a narrow one — the same
           * key for the same intention. `matchMedia` rather than a breakpoint
           * guess, because the rail is hidden by a container query and the
           * only honest question is whether it is on screen.
           */
          const railField = document.querySelector<HTMLInputElement>(
            'aside input[type="search"], aside input[type="text"]',
          );
          if (railField?.getClientRects().length) railField.focus();
          else setFiltersOpen(true);
        },
      },
      { key: "c", labelKey: "agency.shortcutCompare", run: () => setCompareOpen(true) },
      { key: "?", labelKey: "agency.shortcutHelp", run: () => setShortcutsOpen(true) },
      {
        key: "Escape",
        labelKey: "agency.shortcutClose",
        run: () => {
          /*
           * Only when nothing is open.
           *
           * Every drawer closes itself on Escape, and without this guard the
           * same keystroke would close the comparison and empty it on the way
           * out — the agent presses Escape to put the panel away and loses the
           * shortlist they spent the last minute building.
           */
          if (compareOpen || shortcutsOpen || filtersOpen) return;
          clearCompare();
        },
      },
    ],
    [clearCompare, compareOpen, shortcutsOpen, filtersOpen],
  );
  useShortcuts(shortcuts);

  const ordered =
    sort === "marginDesc"
      ? // Rows we have not priced yet sink rather than sorting as zero margin.
        [...cards].sort(
          (a, b) => (quotes[b.offerSummary.offerId]?.margin ?? -1) - (quotes[a.offerSummary.offerId]?.margin ?? -1),
        )
      : cards;

  return (
    /*
     * One measuring stick for the whole screen.
     *
     * The toolbar's Filters button and the filter rail below it are two halves
     * of the same decision — show the rail, or offer the button — so both have
     * to read the same width. Declared on the root because a container cannot
     * measure itself.
     */
    <div className="@container space-y-5">
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
          // A cold landing only. Arriving from a recent search or a shared link
          // means the results are the point, and the cursor belongs elsewhere.
          autoFocus={!seed.destinationId && !data}
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
        Before a search: what the agent was already doing.
        This screen used to be blank below the bar until somebody searched, and
        the work in flight — a stay looked at an hour ago, a quote waiting on a
        customer, a hold about to release — lived on a separate Home page that
        led with the same bar. One screen, and the panels give way to the
        results the moment there are results to give way to.
      */}
      {!data && !busy && <DeskPrelude locale={locale} context={context} />}

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
              onClick={() => void priceRows(cards.map((c) => c.offerSummary.offerId), true)}
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
              <Button variant="secondary" size="sm" className="@min-[900px]:hidden" onClick={() => setFiltersOpen(true)}>
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
      {data?.completeness === "partial" && data.totalCount > 0 && !busy && (
        <Alert tone="warning" title={t("results.partial")}>
          {data.completenessMessage}
        </Alert>
      )}

      {/*
        Said while the search is running, above whatever the search has so far.
        Suppressed on "show 12 more", which is served from the supply cache in
        about a third of a second — narrating that would be a flicker.
      */}
      {busy && page === 1 && (
        <SearchProgressLine
          startedAt={startedAt}
          progress={progress}
          hasResults={(data?.results.length ?? 0) > 0}
        />
      )}


      <div
        className={cx(
          "grid gap-6",
          /*
           * The filter rail and the results share the content column, and a
           * 280px rail beside a card needs about 900px of it to leave the card
           * room to breathe. Keyed to the viewport this split happened at
           * 1024px of *window*, which inside the portal is roughly 710px of
           * column — a 400px results card with the price rail crushed against
           * the photograph.
           */
          "@min-[900px]:grid-cols-[280px_1fr]",
        )}
      >
        <aside className="hidden @min-[900px]:block">
          {busy && !data && <FilterRailSkeleton />}
          {data && (
            /*
              The rail fills the screen rather than stopping part-way down it.
              Capped at `100vh-8rem` it ended mid-section — a heading sliced in
              half above a scrollbar, which reads as a broken card rather than
              as more filters below. The panel scrolls inside itself now, with
              the count and Clear pinned at the top.
            */
            <Card className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden p-4">
              <FiltersPanel
                facets={data.facets}
                filters={filters}
                onChange={(next) => void run({ filters: next })}
                currency={(applied?.currency ?? seed.currency) as CurrencyCode}
                // Only what the two suppliers actually publish.
                supported={supportedFilters}
                fullHeight
              />
            </Card>
          )}
        </aside>

        <div>
          {busy && !data && (
            <ul className="@container space-y-3">
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
                      density="compact"
                      priceRail={
                        quote ? (
                          <TradePrices
                            cost={quote.cost}
                            sell={quote.sell}
                            margin={quote.margin}
                            currency={currency}
                            locale={locale}
                            compact
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
                        /*
                          One button and a link, not two stacked buttons.
                          Both were full width and equally loud, which cost
                          about a hundred pixels a row and made the page ask
                          twice. Opening the rates is the work — comparing
                          boards and cancellation across properties — so it
                          keeps the button; the property page is a detour and
                          reads as one.
                        */
                        <div className="mt-1.5 flex items-center justify-end gap-3">
                          {/*
                            Ticking, not a button.

                            Shortlisting two or three for a caller is the most
                            common thing an agent does on this screen, and the
                            portal had no way to do it — the shared card offers
                            one, but the trade actions replace the whole block
                            it lives in, so it had been quietly dropped. A
                            checkbox rather than a toggle button because
                            selecting several down a list is what checkboxes
                            are, and because the state has to be readable at a
                            glance from eleven rows away.
                          */}
                          <label className="text-muted hover:text-ink-900 inline-flex cursor-pointer items-center gap-1.5 text-xs transition-colors">
                            <input
                              type="checkbox"
                              className="accent-[var(--brand-600)]"
                              checked={compare.includes(card.slug)}
                              onChange={() => {
                                const room = toggleCompare(card.slug);
                                if (!room) toast(t("results.compareFull"), "critical");
                              }}
                            />
                            {t("agency.compareAdd")}
                          </label>
                          <Link
                            href={property}
                            className="text-muted hover:text-ink-900 text-xs underline underline-offset-2 transition-colors"
                          >
                            {t("agency.seePropertyDetails")}
                          </Link>
                          <Button
                            variant="action"
                            size="sm"
                            aria-expanded={openShelf === card.slug}
                            /*
                              Start the supplier request while the agent is
                              still reaching for the button. The rate sheet is
                              two round-trips deep and neither of them begins
                              until the click; the few hundred milliseconds
                              between a pointer arriving and a finger landing
                              are free, and this spends them. Warmed on the
                              button rather than for the whole page, because
                              availability is a real supplier request against a
                              real allowance — twelve per search, to answer a
                              question nobody asked, is not a trade worth making.
                            */
                            onPointerEnter={() => prefetchShelf(card.slug, applied ?? seed)}
                            onFocus={() => prefetchShelf(card.slug, applied ?? seed)}
                            onClick={() => setOpenShelf((prev) => (prev === card.slug ? null : card.slug))}
                          >
                            {openShelf === card.slug ? t("agency.hideRooms") : t("agency.viewRooms")}
                            <Icon
                              name="chevronDown"
                              size={16}
                              className={cx("transition-transform", openShelf === card.slug && "rotate-180")}
                            />
                          </Button>
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

              {/*
                A shortcut nobody knows about is dead weight, and a permanent
                legend is clutter on a screen this dense. Said once, quietly,
                at the foot of the results — where an agent who has read the
                whole page is the one most likely to want a faster way round it.
              */}
              <p className="text-muted mt-6 text-center text-xs">
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  className="hover:text-[var(--text)] underline underline-offset-2"
                >
                  {t("agency.shortcutsHint")}
                </button>
              </p>
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
            supported={supportedFilters}
          />
        )}
        <div className="mt-4">
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            {t("filters.showResults", { count: data?.totalCount ?? 0 })}
          </Button>
        </div>
      </Drawer>

      <ShortcutsCard
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        shortcuts={shortcuts}
      />
      <CompareBar
        count={comparing.length}
        onOpen={() => setCompareOpen(true)}
        onClear={clearCompare}
      />
      <TradeCompare
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        cards={comparing}
        quotes={quotes}
        intent={applied ?? seed}
        locale={locale}
        currency={(applied?.currency ?? seed.currency) as CurrencyCode}
        onRemove={(slug) => toggleCompare(slug)}
        onClear={() => {
          clearCompare();
          setCompareOpen(false);
        }}
        /*
          Straight from a column to that property's rates, in the list behind.
          The comparison narrows the choice; the rate sheet is where the choice
          gets made, and making the agent close this and find the row again
          would undo the point of comparing in place.
        */
        canIssue={canIssue}
        /*
          The lead rate, from the comparison, into the selection.

          The same line the rate sheet builds — one property, one rate, the
          agency's own price on it. Anything beyond the lead rate is a choice
          between rates rather than between properties, and that is what the
          sheet is for.
        */
        onAdd={(card) => {
          const quote = quotes[card.offerSummary.offerId];
          if (!quote) return;
          cart.add({
            offerId: card.offerSummary.offerId,
            hotelSlug: card.slug,
            hotelName: card.name,
            roomName: card.offerSummary.roomSummary,
            boardLabel: card.offerSummary.boardSummary,
            refundable: card.offerSummary.refundable,
            sell: quote.sell,
            cost: quote.cost,
            margin: quote.margin,
            currency: quote.currency as CurrencyCode,
            nights,
            roomsCovered: isPerRoomTotal(card.price) ? card.price.roomsRequested : 1,
            allotment: 0,
            expiresAt: undefined,
          });
        }}
        onViewRooms={(slug) => {
          setCompareOpen(false);
          setOpenShelf(slug);
          /*
           * Found by its own property link rather than by an id.
           *
           * The card is a shared component and does not take one, and widening
           * its API so this view can scroll to a row is the wrong direction —
           * the link is already there, already unique to the slug, and already
           * inside the row we want.
           */
          document
            .querySelector(`a[href*="/agency/hotel/${CSS.escape(slug)}?"]`)
            ?.closest("li")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
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
