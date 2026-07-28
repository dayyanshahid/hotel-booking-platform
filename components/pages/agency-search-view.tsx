"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, Select, Skeleton, cx } from "@/components/ui";
import { SearchBar } from "@/components/search/search-bar";
import { TripPrompt } from "@/components/search/trip-prompt";
import { Icon } from "@/components/ui/icons";
import { Nothing, PageHeader, TableSkeleton, TradePrices } from "@/components/agency/ui";
import Link from "next/link";
import { addDays, formatDate, nightsBetween, todayIso } from "@/lib/format";
import { href, searchParamsFromIntent } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CurrencyCode, HotelResultCard, Locale, SearchIntent } from "@/lib/types";

/**
 * Searching from inside the portal.
 *
 * An agent could use the consumer site — the trade figures show up there too —
 * but a counter does not work like a traveller browsing. They know the city,
 * they are on the phone, and they need cost and margin on every line without
 * scrolling past photography. So this is a table, not a gallery: the same
 * inventory, ranked the same way, with the three numbers that decide the sale.
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

  const [results, setResults] = useState<HotelResultCard[] | null>(null);
  /**
   * The criteria the visible results were fetched with — not the ones in the
   * form, which the agent may have started editing. A property link built from
   * the form would price a different stay from the one on screen.
   */
  const [applied, setApplied] = useState<SearchIntent | null>(null);
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  /** Offers the agent has set aside for a quote, in the order they picked them. */
  const [basket, setBasket] = useState<string[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  /**
   * Sorting is client-side on purpose. The supplier's own ranking is the
   * default and stays authoritative; margin and price are the two questions an
   * agent asks of a page they already have, and re-searching to answer them
   * would spend supplier quota to reorder rows we are holding.
   */
  const [sort, setSort] = useState<"recommended" | "marginDesc" | "priceAsc">("recommended");
  /**
   * Filters run over the page already fetched, not over a new supplier call.
   * "Only refundable" is a question about results in hand; re-asking the
   * supplier to answer it would spend quota to hide rows we are holding.
   */
  const [refundableOnly, setRefundableOnly] = useState(false);
  const [minStars, setMinStars] = useState(0);
  const [maxPrice, setMaxPrice] = useState("");
  const [board, setBoard] = useState("all");

  async function run(intent: SearchIntent) {
    if (!intent.destinationId) {
      setError(t("agency.pickDestination"));
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    setSeed(intent);

    const res = await fetch("/api/hotels/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ intent }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { results: HotelResultCard[]; partial: boolean };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setResults(body.data.results);
    setApplied(intent);
    setPartial(body.data.partial);

    // One quote call for the whole page rather than one per row.
    const offerIds = body.data.results.map((r) => r.offerSummary.offerId);
    if (offerIds.length) {
      const priced = await fetch("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerIds }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data) {
        setQuotes(Object.fromEntries(pricedBody.data.quotes.map((q) => [q.offerId, q])));
      }
    }
  }

  const nights = nightsBetween(seed.checkIn, seed.checkOut);

  const filtered = (() => {
    if (!results) return results;
    const ceiling = Number(maxPrice);
    return results.filter((card) => {
      if (refundableOnly && !card.offerSummary.refundable) return false;
      if (minStars > 0 && card.category < minStars) return false;
      if (maxPrice.trim() && Number.isFinite(ceiling) && card.price.total > ceiling) return false;
      if (board !== "all") {
        const summary = card.offerSummary.boardSummary.toLowerCase();
        // Matched on the localised summary the card already carries rather than
        // a board code: the code is not in the result contract, and this is the
        // text the agent is reading anyway.
        if (board === "breakfast" && !summary.includes("breakfast") && !summary.includes("إفطار")) return false;
        if (board === "roomOnly" && !(summary.includes("room only") || summary.includes("الغرفة فقط"))) return false;
      }
      return true;
    });
  })();

  const ordered = (() => {
    if (!filtered) return filtered;
    const rows = [...filtered];
    if (sort === "marginDesc") {
      // Rows we have not priced yet sink rather than sorting as zero margin.
      return rows.sort(
        (a, b) => (quotes[b.offerSummary.offerId]?.margin ?? -1) - (quotes[a.offerSummary.offerId]?.margin ?? -1),
      );
    }
    if (sort === "priceAsc") return rows.sort((a, b) => a.price.total - b.price.total);
    return rows;
  })();

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
          onSearch={run}
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
          onRun={(intent, filters) => {
            // Filters the sentence asked for are applied to the results we are
            // about to fetch, so "free cancellation" narrows the page rather
            // than being read aloud and forgotten.
            setRefundableOnly(Boolean(filters.refundableOnly));
            setMinStars(filters.categories?.[0] ?? 0);
            setMaxPrice(filters.maxPrice ? String(filters.maxPrice) : "");
            setBoard(filters.boards?.includes("BB") ? "breakfast" : "all");
            void run(intent);
          }}
        />
      </Card>

      {error && <Alert tone="critical">{error}</Alert>}
      {partial && <Alert tone="warning">{t("results.partial")}</Alert>}

      {/*
        The basket follows the page down. An agent adding a fifth rate should
        not have to scroll back up to find out how many they have, or to act on
        them — that scroll is where a half-built quote gets abandoned.
      */}
      {basket.length > 0 && (
        <div className="sticky top-2 z-20">
          <Card className="border-brand-300 bg-brand-50/90 flex flex-wrap items-center justify-between gap-3 p-3 backdrop-blur">
            <p className="flex items-center gap-2 text-sm">
              <span className="bg-brand-600 grid size-6 place-items-center rounded-full text-xs font-bold text-white">
                {basket.length}
              </span>
              {t("agency.selectedRates")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setQuoteOpen(true)}>
                {t("agency.newQuote")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBasket([])}>
                {t("common.clear")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {busy && <TableSkeleton rows={4} />}

      {/*
        An empty page says "nothing available", never which supplier came back
        empty. Agents are customers of ours, not partners in our supply
        arrangements, and the canonical contract (§9.4) keeps supplier identity
        off every client response — the trade ones included. An operator who
        does need to know sees it on the console's catalogue screen, where an
        unmapped supplier is named outright.
      */}
      {results && !results.length && !busy && (
        <Nothing icon="search" title={t("results.empty")} body={t("agency.noResultsBody")} />
      )}

      {results && results.length > 0 && ordered && !ordered.length && (
        <Nothing
          icon="filter"
          title={t("agency.noneMatchFilters")}
          body={t("agency.noneMatchFiltersBody")}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRefundableOnly(false);
                setMinStars(0);
                setMaxPrice("");
                setBoard("all");
              }}
            >
              {t("common.clear")}
            </Button>
          }
        />
      )}

      {ordered && ordered.length > 0 && (
        <>
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("agency.filterBoard")} htmlFor="f-board">
              <Select id="f-board" value={board} onChange={(e) => setBoard(e.target.value)}>
                <option value="all">{t("agency.filterAnyBoard")}</option>
                <option value="breakfast">{t("agency.filterBreakfast")}</option>
                <option value="roomOnly">{t("agency.filterRoomOnly")}</option>
              </Select>
            </Field>
            <Field label={t("agency.filterStars")} htmlFor="f-stars">
              <Select id="f-stars" value={String(minStars)} onChange={(e) => setMinStars(Number(e.target.value))}>
                <option value="0">{t("agency.filterAnyStars")}</option>
                <option value="3">3★+</option>
                <option value="4">4★+</option>
                <option value="5">5★</option>
              </Select>
            </Field>
            <Field label={t("agency.filterMaxPrice")} htmlFor="f-max">
              <Input
                id="f-max"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t("agency.filterNoCeiling")}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox
                checked={refundableOnly}
                onChange={(e) => setRefundableOnly(e.target.checked)}
                label={t("agency.filterRefundable")}
              />
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">
              {t("agency.resultCount", { n: ordered.length })}
              {results && ordered.length !== results.length && (
                <span className="ms-1">{t("agency.filteredFrom", { total: results.length })}</span>
              )}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">{t("agency.sortBy")}</span>
              <Select
                value={sort}
                aria-label={t("agency.sortBy")}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="w-auto"
              >
                <option value="recommended">{t("agency.sortRecommended")}</option>
                <option value="marginDesc">{t("agency.sortMargin")}</option>
                <option value="priceAsc">{t("agency.sortPrice")}</option>
              </Select>
            </label>
          </div>

          <ul className="space-y-2">
            {ordered.map((card) => {
              const quote = quotes[card.offerSummary.offerId];
              const picked = basket.includes(card.offerSummary.offerId);
              const currency = card.price.currency as CurrencyCode;
              return (
                <li key={card.canonicalHotelId}>
                  <Card
                    className={cx(
                      "p-4 transition-colors",
                      picked && "border-brand-400 bg-brand-50/30",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {/* The name opens every rate; "Book" stays the fast
                              path for the one the row already shows. */}
                          <p className="font-semibold wrap-anywhere">
                            {applied ? (
                              <Link
                                href={`${href(locale, `/agency/hotel/${card.slug}`)}?${propertyQuery(applied)}`}
                                className="hover:underline"
                              >
                                {card.name}
                              </Link>
                            ) : (
                              card.name
                            )}
                          </p>
                          {card.category > 0 && (
                            <span className="text-caution-700 text-xs" aria-label={`${card.category} stars`}>
                              {"★".repeat(Math.round(card.category))}
                            </span>
                          )}
                        </div>
                        <p className="text-muted mt-0.5 flex items-center gap-1 text-xs wrap-anywhere">
                          <Icon name="pin" size={13} />
                          {card.neighborhood}, {card.locality}
                        </p>
                        <p className="mt-1.5 text-sm wrap-anywhere">
                          {card.offerSummary.roomSummary}
                          <span className="text-muted"> · {card.offerSummary.boardSummary}</span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={card.offerSummary.refundable ? "positive" : "neutral"}>
                            {card.offerSummary.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                          </Badge>
                          {card.remainingLabel && <Badge tone="caution">{card.remainingLabel}</Badge>}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2.5">
                        {quote ? (
                          <TradePrices
                            cost={quote.cost}
                            sell={quote.sell}
                            margin={quote.margin}
                            currency={currency}
                            locale={locale}
                            publicPrice={card.price.total}
                          />
                        ) : (
                          <div className="space-y-1.5 text-end">
                            <Skeleton className="ms-auto h-3 w-24" />
                            <Skeleton className="ms-auto h-6 w-28" />
                            <Skeleton className="ms-auto h-3 w-36" />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={picked ? "ghost" : "secondary"}
                            onClick={() =>
                              setBasket((prev) =>
                                picked
                                  ? prev.filter((id) => id !== card.offerSummary.offerId)
                                  : [...prev, card.offerSummary.offerId],
                              )
                            }
                          >
                            {picked && <Icon name="check" size={14} />}
                            {picked ? t("agency.inQuote") : t("agency.addToQuote")}
                          </Button>
                          <Button
                            size="sm"
                            variant="action"
                            onClick={() => router.push(href(locale, `/agency/book/${card.offerSummary.offerId}`))}
                          >
                            {t("agency.book")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <QuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        offerIds={basket}
        onCreated={(id) => {
          setBasket([]);
          router.push(href(locale, `/agency/quotes/${id}`));
        }}
      />
    </div>
  );
}

/** Turning a basket of rates into a document. */
function QuoteModal({
  open,
  onClose,
  offerIds,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  offerIds: string[];
  onCreated: (id: string) => void;
}) {
  const { t } = useApp();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The agency's saved clients, offered rather than imposed: picking one fills
   * the fields, and an agent quoting for someone new just types over them.
   */
  const [saved, setSaved] = useState<{ id: string; name: string; email?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/agency/customers", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { customers: { id: string; name: string; email?: string }[] } };
      if (body.ok && body.data) setSaved(body.data.customers);
    })();
  }, [open]);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/agency/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ customerName, customerEmail: customerEmail || undefined, notes, offerIds }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { quote: { id: string } };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    onCreated(body.data.quote.id);
  }

  return (
    <Modal open={open} onClose={onClose} title={t("agency.newQuote")} size="sm">
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        <p className="text-muted text-sm">
          <Badge tone="neutral">{offerIds.length}</Badge> {t("agency.selectedRates")}
        </p>
        {saved.length > 0 && (
          <Field label={t("agency.pickCustomer")} htmlFor="q-saved">
            <Select
              id="q-saved"
              value=""
              onChange={(e) => {
                const picked = saved.find((customer) => customer.id === e.target.value);
                if (!picked) return;
                setCustomerName(picked.name);
                setCustomerEmail(picked.email ?? "");
              }}
            >
              <option value="">{t("agency.pickCustomerNone")}</option>
              {saved.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("agency.customerName")} htmlFor="q-name">
          <Input id="q-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field label={t("agency.customerEmail")} htmlFor="q-email">
          <Input id="q-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        </Field>
        <Field label={t("agency.quoteNotes")} htmlFor="q-notes">
          <Input id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button onClick={create} loading={busy} disabled={!customerName.trim()}>
          {t("agency.createQuote")}
        </Button>
      </div>
    </Modal>
  );
}
