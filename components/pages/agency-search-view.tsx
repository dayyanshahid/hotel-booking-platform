"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Skeleton, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { Nothing, PageHeader, TableSkeleton, TradePrices } from "@/components/agency/ui";
import Link from "next/link";
import { addDays, formatDate, nightsBetween, todayIso } from "@/lib/format";
import { href, searchParamsFromIntent } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CurrencyCode, HotelResultCard, Locale, SearchIntent, Suggestion } from "@/lib/types";

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

/** The applied criteria as a query string the property page can read back. */
function propertyQuery(criteria: Criteria, locale: Locale): string {
  return searchParamsFromIntent({
    destinationId: criteria.destinationId,
    destinationDisplay: criteria.destinationDisplay,
    destinationType: criteria.destinationType as SearchIntent["destinationType"],
    checkIn: criteria.checkIn,
    checkOut: criteria.checkOut,
    flexibility: "exact",
    rooms: Array.from({ length: criteria.rooms }, () => ({ adults: criteria.adults, childrenAges: [] })),
    locale,
    currency: criteria.currency as SearchIntent["currency"],
  }).toString();
}

interface Criteria {
  destinationId: string;
  destinationDisplay: string;
  destinationType: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  currency: string;
}

function TradeSearch({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [criteria, setCriteria] = useState<Criteria>({
    destinationId: "",
    destinationDisplay: "",
    destinationType: "city",
    checkIn: addDays(todayIso(), 21),
    checkOut: addDays(todayIso(), 24),
    adults: 2,
    rooms: 1,
    currency: context.agency.credit.currency,
  });

  const [results, setResults] = useState<HotelResultCard[] | null>(null);
  /**
   * The criteria the visible results were fetched with — not the ones in the
   * form, which the agent may have started editing. A property link built from
   * the form would price a different stay from the one on screen.
   */
  const [applied, setApplied] = useState<Criteria | null>(null);
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

  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = window.setTimeout(async () => {
      const res = await fetch(
        `/api/search/suggestions?q=${encodeURIComponent(query)}&locale=${locale}`,
        { credentials: "same-origin" },
      );
      const body = (await res.json()) as { ok: boolean; data?: { suggestions: Suggestion[] } };
      if (body.ok && body.data) setSuggestions(body.data.suggestions);
    }, 200);
    return () => window.clearTimeout(id);
  }, [query, locale]);

  async function run(next: Criteria) {
    if (!next.destinationId) {
      setError(t("agency.pickDestination"));
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);

    const intent = {
      destinationId: next.destinationId,
      destinationDisplay: next.destinationDisplay,
      destinationType: next.destinationType,
      checkIn: next.checkIn,
      checkOut: next.checkOut,
      flexibility: "exact",
      rooms: Array.from({ length: next.rooms }, () => ({ adults: next.adults, childrenAges: [] })),
      locale,
      currency: next.currency,
    };

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
    setApplied(next);
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

  const nights = nightsBetween(criteria.checkIn, criteria.checkOut);

  const ordered = (() => {
    if (!results) return results;
    const rows = [...results];
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

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
          <Field label={t("common.destination")} htmlFor="tr-dest">
            <Input
              id="tr-dest"
              list="tr-dest-options"
              value={query}
              placeholder={t("search.placeholder")}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                const match = suggestions.find((s) => `${s.label} — ${s.context}` === value);
                if (match) {
                  setCriteria((c) => ({
                    ...c,
                    destinationId: match.id,
                    destinationDisplay: match.label,
                    destinationType: match.type,
                  }));
                }
              }}
            />
            <datalist id="tr-dest-options">
              {suggestions.map((s) => (
                <option key={s.id} value={`${s.label} — ${s.context}`} />
              ))}
            </datalist>
          </Field>

          <Field label={t("search.checkIn")} htmlFor="tr-in">
            <Input
              id="tr-in"
              type="date"
              value={criteria.checkIn}
              min={todayIso()}
              onChange={(e) => {
                const checkIn = e.target.value;
                setCriteria((c) => ({
                  ...c,
                  checkIn,
                  // Keeping the stay length is what an agent expects when they
                  // move the arrival date; recomputing to a fixed checkout is not.
                  checkOut: checkIn >= c.checkOut ? addDays(checkIn, Math.max(1, nights)) : c.checkOut,
                }));
              }}
            />
          </Field>

          <Field label={t("search.checkOut")} htmlFor="tr-out">
            <Input
              id="tr-out"
              type="date"
              value={criteria.checkOut}
              min={addDays(criteria.checkIn, 1)}
              onChange={(e) => setCriteria((c) => ({ ...c, checkOut: e.target.value }))}
            />
          </Field>

          <Field label={t("common.rooms")} htmlFor="tr-rooms">
            <Select
              id="tr-rooms"
              value={String(criteria.rooms)}
              onChange={(e) => setCriteria((c) => ({ ...c, rooms: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("common.adults")} htmlFor="tr-adults">
            <Select
              id="tr-adults"
              value={String(criteria.adults)}
              onChange={(e) => setCriteria((c) => ({ ...c, adults: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run(criteria)} loading={busy}>
            {t("common.search")}
          </Button>
          <p className="text-muted text-sm">
            {formatDate(criteria.checkIn, locale)} → {formatDate(criteria.checkOut, locale)} · {nights}{" "}
            {nights === 1 ? t("common.night") : t("common.nights")}
          </p>
        </div>
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

      {ordered && ordered.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">{t("agency.resultCount", { n: ordered.length })}</p>
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
                                href={`${href(locale, `/agency/hotel/${card.slug}`)}?${propertyQuery(applied, locale)}`}
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
