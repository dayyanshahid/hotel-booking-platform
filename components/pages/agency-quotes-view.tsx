"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { brandingOf } from "@/lib/agency/branding";
import { roomLabel } from "@/lib/i18n";
import { DocumentBrand, DocumentFooter } from "@/components/agency/document-brand";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui";
import { Money, Nothing, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyQuote } from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

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

function QuoteList({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [quotes, setQuotes] = useState<AgencyQuote[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(apiUrl("/api/agency/quotes"), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: { quotes: AgencyQuote[] } };
      setQuotes(body.ok && body.data ? body.data.quotes : []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("agency.quotes")}
        description={t("agency.quotesBody")}
        actions={
          <Link href={href(locale, "/agency/search")}>
            <Button variant="secondary" size="sm">
              {t("agency.searchStays")}
            </Button>
          </Link>
        }
      />

      {!quotes && <TableSkeleton rows={3} />}
      {quotes && !quotes.length && (
        <Nothing
          icon="receipt"
          title={t("agency.noQuotes")}
          body={t("agency.noQuotesBody")}
          action={
            <Link href={href(locale, "/agency/search")}>
              <Button>{t("agency.searchStays")}</Button>
            </Link>
          }
        />
      )}

      <ul className="space-y-2">
        {(quotes ?? []).map((quote) => {
          const total = quote.items.reduce((sum, item) => sum + item.sell, 0);
          // Expiry is applied by the endpoint, so rendering does not consult
          // the clock — a render that reads Date.now() is a render that can
          // disagree with itself.
          const status = quote.status;
          return (
            <li key={quote.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone={QUOTE_TONE[status]}>{t(`agency.quoteStatus.${status}`)}</Badge>
                    <p className="mt-1 font-semibold wrap-anywhere">
                      <Link href={href(locale, `/agency/quotes/${quote.id}`)} className="hover:underline">
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
    </div>
  );
}

/* ------------------------------------------------------------- detail */

export function AgencyQuoteView({ locale, id }: { locale: Locale; id: string }) {
  return <PortalShell locale={locale}>{(context) => <QuoteDetail locale={locale} id={id} context={context} />}</PortalShell>;
}

function QuoteDetail({ locale, id, context }: { locale: Locale; id: string; context: AgencyContext }) {
  const { t } = useApp();
  const [quote, setQuote] = useState<AgencyQuote | null | "missing">(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(apiUrl(`/api/agency/quotes/${encodeURIComponent(id)}`), { credentials: apiCredentials() });
    const body = (await res.json()) as { ok: boolean; data?: { quote: AgencyQuote } };
    setQuote(body.ok && body.data ? body.data.quote : "missing");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (quote === null) return <Skeleton className="h-64 w-full" />;
  if (quote === "missing") return <Alert tone="critical">{t("error.notFound")}</Alert>;

  async function mark(status: AgencyQuote["status"]) {
    setBusy(true);
    await fetch(apiUrl(`/api/agency/quotes/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    await load();
  }

  const currency = quote.currency as CurrencyCode;
  const total = quote.items.reduce((sum, item) => sum + item.sell, 0);
  const cost = quote.items.reduce((sum, item) => sum + item.cost, 0);
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

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={href(locale, "/agency/quotes")} className="text-muted text-sm underline">
          ← {t("agency.quotes")}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
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
