"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { brandingOf } from "@/lib/agency/branding";
import { roomLabel } from "@/lib/i18n";
import { DocumentBrand, DocumentFooter } from "@/components/agency/document-brand";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Input, Skeleton, cx } from "@/components/ui";
import { LoadFailed, Money, Nothing, PageBody, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { useResource } from "@/components/providers/use-resource";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import { daysUntilExpiry, isExpiringSoon, quoteCost, quoteTotal } from "@/lib/agency/quotes";
import { fold, foldedIncludes } from "@/lib/text";
import type { AgencyQuote } from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

/* --------------------------------------------------------------- list */

export function AgencyQuotesView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{() => <QuoteList locale={locale} />}</PortalShell>;
}

const QUOTE_TONE: Record<AgencyQuote["status"], "positive" | "caution" | "neutral" | "critical"> = {
  open: "caution",
  accepted: "positive",
  declined: "neutral",
  expired: "neutral",
};

/** How a list of quotes can be narrowed. "all" is not a status, it is the absence of one. */
type QuoteFilter = "all" | AgencyQuote["status"] | "expiring";

function QuoteList({ locale }: { locale: Locale }) {
  const { t } = useApp();
  /**
   * Finding one quote among a year of them.
   *
   * The list was every quote the agency had ever raised, newest first, as a
   * wall of identical cards — no search, no filter, nothing to sort by. An
   * agency doing thirty a week has fifteen hundred of them by the same time
   * next year, and the only way to reach the one a customer is ringing about
   * was the browser's own find-in-page against whatever had rendered.
   *
   * Filtered here rather than at the endpoint on purpose: the whole list is
   * already in the browser, an agency's quote count is bounded by how many
   * they can physically write, and a round trip per keystroke would make the
   * search slower than the scrolling it replaces.
   */
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuoteFilter>("all");
  /*
   * Three states, not two.
   *
   * This used to read `body.ok ? body.data.quotes : []`, so an account whose
   * quotes could not be fetched — a lapsed session, a bad gateway — was shown
   * the empty state and told to go and build one. Being confidently wrong
   * about somebody's own pipeline is worse than admitting the read failed.
   */
  const { data, failed, loading, reload } = useResource<{ quotes: AgencyQuote[] }>("/api/agency/quotes");
  const quotes = data?.quotes ?? null;

  /** What each filter would show, so a tab can say so before it is pressed. */
  const counts = useMemo(() => {
    const all = quotes ?? [];
    return {
      all: all.length,
      open: all.filter((q) => q.status === "open").length,
      expiring: all.filter((q) => isExpiringSoon(q)).length,
      accepted: all.filter((q) => q.status === "accepted").length,
      declined: all.filter((q) => q.status === "declined").length,
      expired: all.filter((q) => q.status === "expired").length,
    };
  }, [quotes]);

  /**
   * What is still in play, in money.
   *
   * The question behind a pipeline is not how many quotes are open, it is how
   * much is riding on them — and that number was nowhere on the screen.
   */
  const openValue = useMemo(
    () =>
      (quotes ?? [])
        .filter((q) => q.status === "open")
        .reduce((sum, q) => sum + quoteTotal(q), 0),
    [quotes],
  );
  const currency = (quotes?.[0]?.currency ?? "USD") as CurrencyCode;

  const shown = useMemo(() => {
    const needle = fold(query.trim());
    return (quotes ?? []).filter((quote) => {
      if (filter === "expiring" ? !isExpiringSoon(quote) : filter !== "all" && quote.status !== filter) {
        return false;
      }
      if (!needle) return true;
      /*
       * Customer, reference and the properties on it. An agent looking for a
       * quote has one of those three in front of them — a name on a caller ID,
       * a reference read off an email, or "the Cairo one".
       */
      const haystack = [quote.customerName, quote.reference, quote.customerEmail ?? "", ...quote.items.map((i) => i.hotelName)];
      return haystack.some((value) => foldedIncludes(value, needle));
    });
  }, [quotes, query, filter]);

  return (
    <PageBody measure="data" className="space-y-4">
      <PageHeader
        title={t("agency.quotes")}
        description={t("agency.quotesBody")}
        actions={
          <Link href={href(locale, "/agency")}>
            <Button variant="secondary" size="sm">
              {t("agency.searchStays")}
            </Button>
          </Link>
        }
      />

      {/*
        The pipeline in one line, and the way into it.

        Kept out of the way when there is nothing to say: an agency with no
        quotes gets the empty state below rather than a row of zeroes.
      */}
      {quotes && quotes.length > 0 && (
        <div className="space-y-3">
          <Card className="surface-sunken flex flex-wrap items-center gap-x-6 gap-y-2 border-0 p-3 shadow-none">
            <span className="text-sm">
              <span className="text-muted">{t("agency.quotesOpenValue")} </span>
              <Money amount={openValue} currency={currency} locale={locale} />
            </span>
            {counts.expiring > 0 && (
              <span className="text-caution-700 text-sm font-medium">
                {t("agency.quotesExpiringCount", { count: counts.expiring })}
              </span>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("agency.quotesSearchPlaceholder")}
              aria-label={t("agency.quotesSearch")}
              className="min-w-0 flex-1 sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {(["all", "open", "expiring", "accepted", "declined", "expired"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={cx(
                    // The pipeline is navigated from these, and on a phone
                    // they were twenty-four pixels of target.
                    "inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-3 text-xs font-medium transition-colors",
                    filter === key
                      ? "bg-brand-600 text-white"
                      : "surface-sunken text-muted hover:text-ink-900",
                  )}
                >
                  {t(`agency.quoteFilter.${key}` as never)} {counts[key]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && <TableSkeleton rows={3} />}
      {failed && (
        <LoadFailed title={t("agency.quotesUnavailable")} body={t("agency.quotesUnavailableBody")} onRetry={reload} />
      )}
      {quotes && !quotes.length && (
        <Nothing
          icon="receipt"
          title={t("agency.noQuotes")}
          body={t("agency.noQuotesBody")}
          action={
            <Link href={href(locale, "/agency")}>
              <Button>{t("agency.searchStays")}</Button>
            </Link>
          }
        />
      )}

      {quotes && quotes.length > 0 && shown.length === 0 && (
        /*
          A filter that matched nothing is not an empty pipeline, and the
          full-page empty state above would tell the agent to go and build a
          quote they may well already have.
        */
        <p className="text-muted py-6 text-center text-sm">{t("agency.quotesNoMatch")}</p>
      )}

      <ul className="space-y-2">
        {shown.map((quote) => {
          const total = quoteTotal(quote);
          // Expiry is applied by the endpoint, so rendering does not consult
          // the clock — a render that reads Date.now() is a render that can
          // disagree with itself.
          const status = quote.status;
          return (
            <li key={quote.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={QUOTE_TONE[status]}>{t(`agency.quoteStatus.${status}`)}</Badge>
                      {/* Said on the row, because chasing is decided while scanning. */}
                      {isExpiringSoon(quote) && (
                        <Badge tone="caution">
                          {t("agency.quoteExpiresIn", { days: Math.max(0, daysUntilExpiry(quote)) })}
                        </Badge>
                      )}
                    </span>
                    <p className="mt-1 font-semibold wrap-anywhere">
                      <Link
                        href={href(locale, `/agency/quotes/${quote.id}`)}
                        // The only way into a quote from this list, and a bare
                        // text link is a twenty-pixel target on a phone.
                        className="inline-flex min-h-11 items-center hover:underline"
                      >
                        {quote.customerName}
                      </Link>
                    </p>
                    <p className="text-muted text-sm wrap-anywhere">
                      {quote.items.map((i) => i.hotelName).join(" · ")}
                    </p>
                    <p className="text-muted font-mono text-xs">{quote.reference}</p>
                  </div>
                  <div className="text-end">
                    <Money amount={total} currency={quote.currency} locale={locale} size="lg" />
                    <p className="text-muted text-xs">
                      {t("agency.validUntil")} {formatDate(quote.validUntil.slice(0, 10), locale)}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageBody>
  );
}

/* ------------------------------------------------------------- detail */

export function AgencyQuoteView({ locale, id }: { locale: Locale; id: string }) {
  return <PortalShell locale={locale}>{(context) => <QuoteDetail locale={locale} id={id} context={context} />}</PortalShell>;
}

function QuoteDetail({ locale, id, context }: { locale: Locale; id: string; context: AgencyContext }) {
  const { t } = useApp();
  const [quote, setQuote] = useState<AgencyQuote | null | "missing" | "unreachable">(null);
  const [busy, setBusy] = useState(false);
  /** A status change that did not take. Shown, because the badge will not say. */
  const [markError, setMarkError] = useState<string | null>(null);

  async function load() {
    const body = await apiFetch<{ quote: AgencyQuote }>(`/api/agency/quotes/${encodeURIComponent(id)}`);
    /*
     * "missing" is a claim that the quote is not there, and a failed read is
     * not entitled to make it. An agent told a customer's quotation does not
     * exist will rebuild it; the original is still sitting on the account.
     */
    if (body.ok && body.data) setQuote(body.data.quote);
    else setQuote(body.error?.correlationId === "cid_offline" ? "unreachable" : "missing");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (quote === null) return <Skeleton className="h-64 w-full" />;
  if (quote === "unreachable") return <Alert tone="warning">{t("agency.quoteUnreachable")}</Alert>;
  if (quote === "missing") return <Alert tone="critical">{t("error.notFound")}</Alert>;

  async function mark(status: AgencyQuote["status"]) {
    setBusy(true);
    setMarkError(null);
    /*
     * This is the button that records a customer's answer, and its result was
     * discarded — so a refused or unreachable write left the quote on its old
     * status while the screen reloaded and showed exactly that, with no
     * suggestion anything had gone wrong. An agent reads the unchanged badge
     * as a misclick and presses it again; if the write is failing rather than
     * flaking, they press it all afternoon.
     */
    const body = await apiFetch<unknown>(`/api/agency/quotes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!body.ok) {
      setMarkError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    await load();
  }

  const currency = quote.currency as CurrencyCode;
  const total = quoteTotal(quote);
  const cost = quoteCost(quote);
  const branding = brandingOf(context.agency);

  /*
   * Whether this quote actually houses the party it was built for.
   *
   * Each line buys `roomsCovered` rooms and the search wanted `rooms`, so a
   * three-room enquiry quoted from a single per-room rate covers one third of it
   * — and the document totals correctly, which is what made it convincing. The
   * agent is told before they send it; the customer's copy is not marked up with
   * our supply mechanics.
   *
   * Older stored quotes have no `roomsCovered`. They fall back to one rather
   * than to `rooms`, because assuming full coverage is the bug itself.
   */
  const roomsWanted = Math.max(...quote.items.map((item) => item.rooms ?? 1), 1);
  const roomsQuoted = quote.items.reduce((sum, item) => sum + (item.roomsCovered ?? 1), 0);
  const shortRooms = quote.items.length > 0 && roomsQuoted < roomsWanted;

  /*
   * Whether this can be put on the account as it stands.
   *
   * Rates live about forty-five minutes; a quote is valid for days. So on any
   * quote older than lunchtime the answer is no, and the screen says so
   * *before* offering a button rather than after an agent presses one and gets
   * "this option changed or sold out" in front of a customer who has just said
   * yes. The prices on the document are still the quotation — what has gone is
   * the specific rate behind them, which has to be found again.
   */
  const bookable = quote.items.length > 0 && quote.items.every((item) => item.live);
  const bookHref = href(
    locale,
    `/agency/book/${quote.items.map((item) => encodeURIComponent(item.offerId ?? "")).join(",")}`,
  );
  /** Back to a search for the first line's stay, when the rates have to be found again. */
  const research = quote.items[0]
    ? `${href(locale, "/agency")}?${new URLSearchParams({
        destinationDisplay: quote.items[0].city,
        checkIn: quote.items[0].checkIn,
        checkOut: quote.items[0].checkOut,
      }).toString()}`
    : href(locale, "/agency");

  async function extend(days: number) {
    setBusy(true);
    setMarkError(null);
    const body = await apiFetch<unknown>(`/api/agency/quotes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extendDays: days }),
    });
    setBusy(false);
    if (!body.ok) {
      setMarkError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Never on the customer's printed copy — this is an operational
          message about our own write, not part of the quotation. */}
      {markError && (
        <div className="no-print">
          <Alert tone="critical">{markError}</Alert>
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={href(locale, "/agency/quotes")} className="text-muted text-sm underline">
          ← {t("agency.quotes")}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
          {/*
            Extending is offered where it is needed: on a quote that has run
            out, or is about to. Everywhere else it is a button asking a
            question nobody has.
          */}
          {(quote.status === "expired" || isExpiringSoon(quote)) && (
            <Button size="sm" variant="secondary" onClick={() => void extend(7)} loading={busy}>
              {t("agency.quoteExtend")}
            </Button>
          )}
          {quote.status !== "accepted" && (
            <Button size="sm" onClick={() => mark("accepted")} loading={busy}>
              {t("agency.markAccepted")}
            </Button>
          )}
          {quote.status !== "declined" && (
            <Button size="sm" variant="ghost" onClick={() => mark("declined")} loading={busy}>
              {t("agency.markDeclined")}
            </Button>
          )}
        </div>
      </div>

      {/*
        Where an accepted quote goes.

        Accepting used to change a badge and stop. The customer has said yes
        and the agent is holding a document with prices on it; the next thing
        they need is the booking, or an honest account of why they cannot have
        it in one press.
      */}
      {quote.status === "accepted" && (
        <div className="no-print">
          {bookable ? (
            <Alert tone="info" title={t("agency.quoteReadyToBook")}>
              <div className="flex flex-wrap items-center gap-3">
                <span>{t("agency.quoteReadyToBookBody")}</span>
                <Link href={bookHref}>
                  <Button size="sm">{t("agency.quoteBookNow")}</Button>
                </Link>
              </div>
            </Alert>
          ) : (
            <Alert tone="warning" title={t("agency.quoteRatesStale")}>
              <div className="flex flex-wrap items-center gap-3">
                <span>{t("agency.quoteRatesStaleBody")}</span>
                <Link href={research}>
                  <Button size="sm" variant="secondary">
                    {t("agency.quoteFindRates")}
                  </Button>
                </Link>
              </div>
            </Alert>
          )}
        </div>
      )}

      {/* For the agent, before they send it — never on the printed copy. */}
      {shortRooms && (
        <div className="no-print">
          <Alert tone="warning" title={t("agency.quoteShortRooms")}>
            {t("agency.quoteShortRoomsBody", {
              quoted: roomsQuoted,
              wanted: roomsWanted,
              unit: roomLabel(t, roomsWanted, locale),
            })}
          </Alert>
        </div>
      )}

      {/*
        The agent's own numbers, above the document rather than inside it. The
        block below gets printed and handed over; margin has no business on it.
      */}
      <Card className="no-print grid gap-4 p-4 sm:grid-cols-3">
        <div>
          <p className="text-muted text-xs">{t("agency.cost")}</p>
          <p className="font-bold">{formatMoney(cost, currency, locale)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">{t("agency.sell")}</p>
          <p className="font-bold">{formatMoney(total, currency, locale)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">{t("agency.margin")}</p>
          <p className="text-positive-700 font-bold">{formatMoney(total - cost, currency, locale)}</p>
        </div>
      </Card>

      <Card className="p-5">
        {/*
          The agency's letterhead, identical to the one on the voucher. Until
          now this document carried their name and address but not their logo
          or their colour, so a customer got a plain quotation and then a
          branded voucher from what should look like the same company.
        */}
        <DocumentBrand
          branding={branding}
          title={t("agency.quotation")}
          reference={quote.reference}
          meta={formatDateTime(quote.createdAt, locale)}
        />

        <div className="hairline flex flex-wrap justify-between gap-4 border-b py-4 text-sm">
          <div>
            <p className="text-muted text-xs">{t("agency.preparedFor")}</p>
            <p className="font-semibold wrap-anywhere">{quote.customerName}</p>
            {quote.customerEmail && <p className="text-muted wrap-anywhere">{quote.customerEmail}</p>}
          </div>
          <div className="text-end">
            <p className="text-muted text-xs">{t("agency.validUntil")}</p>
            <p className="font-semibold">{formatDate(quote.validUntil.slice(0, 10), locale)}</p>
          </div>
        </div>

        <ul className="hairline divide-ink-100 divide-y border-b">
          {quote.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold wrap-anywhere">{item.hotelName}</p>
                <p className="text-muted wrap-anywhere">
                  {item.city} · {formatDate(item.checkIn, locale)} → {formatDate(item.checkOut, locale)} ·{" "}
                  {item.nights} {item.nights === 1 ? t("common.night") : t("common.nights")}
                </p>
                {/*
                  The rooms this line buys, not the rooms the search wanted.
                  It printed the latter over the former's price, so a customer
                  agreed "3 × Deluxe twin" at the cost of one.
                */}
                <p className="text-muted wrap-anywhere">
                  {item.roomsCovered ?? 1} × {item.roomName} · {item.boardLabel} · {item.guests}{" "}
                  {t("common.guests")}
                </p>
                <p className="text-muted text-xs">{item.cancellation}</p>
              </div>
              <p className="font-semibold">{formatMoney(item.sell, currency, locale)}</p>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between py-4">
          <p className="font-semibold">{t("common.total")}</p>
          <p className="text-xl font-bold">{formatMoney(total, currency, locale)}</p>
        </div>

        {quote.notes && <p className="text-muted hairline border-t pt-3 text-sm wrap-anywhere">{quote.notes}</p>}
        <p className="text-muted hairline mt-3 border-t pt-3 text-xs">{t("agency.quoteFooter")}</p>

        {/* The agency's own booking conditions, after ours. */}
        <DocumentFooter branding={branding} />
      </Card>
    </div>
  );
}
