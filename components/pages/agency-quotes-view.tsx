"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui";
import { Money, Nothing, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyQuote } from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiUrl } from "@/lib/api-origin";

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
      const res = await fetch(apiUrl("/api/agency/quotes"), { credentials: "same-origin" });
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
    const res = await fetch(apiUrl(`/api/agency/quotes/${encodeURIComponent(id)}`), { credentials: "same-origin" });
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
      credentials: "same-origin",
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    await load();
  }

  const currency = quote.currency as CurrencyCode;
  const total = quote.items.reduce((sum, item) => sum + item.sell, 0);
  const cost = quote.items.reduce((sum, item) => sum + item.cost, 0);
  const profile = context.agency.profile;

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
        <header className="hairline flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-lg font-bold wrap-anywhere">{profile.legalName || context.agency.name}</p>
            {profile.address && <p className="text-muted text-sm wrap-anywhere">{profile.address}</p>}
            {profile.city && <p className="text-muted text-sm">{profile.city}</p>}
            <p className="text-muted text-sm">{[profile.phone, profile.email].filter(Boolean).join(" · ")}</p>
            {profile.taxNumber && (
              <p className="text-muted text-xs">
                {t("agency.taxNumber")}: {profile.taxNumber}
              </p>
            )}
          </div>
          <div className="text-end">
            <p className="text-sm font-semibold uppercase tracking-wide">{t("agency.quotation")}</p>
            <p className="font-mono text-base font-bold">{quote.reference}</p>
            <p className="text-muted text-xs">{formatDateTime(quote.createdAt, locale)}</p>
          </div>
        </header>

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
                <p className="text-muted wrap-anywhere">
                  {item.rooms} × {item.roomName} · {item.boardLabel} · {item.guests} {t("common.guests")}
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
      </Card>
    </div>
  );
}
