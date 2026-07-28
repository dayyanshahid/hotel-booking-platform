"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  SectionHeading,
  Select,
  Skeleton,
  cx,
} from "@/components/ui";
import { addDays, formatDate, formatMoney, nightsBetween, todayIso } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CurrencyCode, HotelResultCard, Locale, Suggestion } from "@/lib/types";

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
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  /** Offers the agent has set aside for a quote, in the order they picked them. */
  const [basket, setBasket] = useState<string[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      <SectionHeading title={t("agency.searchStays")} description={t("agency.searchBody")} />

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

      {basket.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            <strong>{basket.length}</strong> {t("agency.selectedRates")}
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
      )}

      {busy && <Skeleton className="h-40 w-full" />}

      {results && !results.length && !busy && <Alert tone="info">{t("results.empty")}</Alert>}

      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((card) => {
            const quote = quotes[card.offerSummary.offerId];
            const picked = basket.includes(card.offerSummary.offerId);
            const currency = card.price.currency as CurrencyCode;
            return (
              <li key={card.canonicalHotelId}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold wrap-anywhere">{card.name}</p>
                      <p className="text-muted text-sm wrap-anywhere">
                        {"★".repeat(Math.max(0, Math.round(card.category)))} · {card.neighborhood}, {card.locality}
                      </p>
                      <p className="text-muted mt-1 text-sm wrap-anywhere">
                        {card.offerSummary.roomSummary} · {card.offerSummary.boardSummary}
                      </p>
                      <p
                        className={cx(
                          "mt-1 text-xs",
                          card.offerSummary.refundable ? "text-positive-700" : "text-critical-700",
                        )}
                      >
                        {card.offerSummary.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                      </p>
                      {card.remainingLabel && (
                        <p className="text-caution-700 mt-1 text-xs font-medium">{card.remainingLabel}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-end">
                        <p className="text-muted text-xs">{t("agency.public")}</p>
                        <p className="text-sm line-through opacity-70">
                          {formatMoney(card.price.total, currency, locale)}
                        </p>
                      </div>
                      {quote ? (
                        <dl className="bg-brand-50/60 hairline grid grid-cols-3 gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-xs">
                          <div>
                            <dt className="text-muted">{t("agency.cost")}</dt>
                            <dd className="font-semibold">{formatMoney(quote.cost, currency, locale)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">{t("agency.sell")}</dt>
                            <dd className="font-semibold">{formatMoney(quote.sell, currency, locale)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">{t("agency.margin")}</dt>
                            <dd className="text-positive-700 font-semibold">
                              {formatMoney(quote.margin, currency, locale)}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <Skeleton className="h-12 w-56" />
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
                          {picked ? t("agency.inQuote") : t("agency.addToQuote")}
                        </Button>
                        <Button
                          size="sm"
                          variant="action"
                          onClick={() =>
                            router.push(href(locale, `/agency/book/${card.offerSummary.offerId}`))
                          }
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
