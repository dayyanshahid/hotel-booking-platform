"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { TradeVoucher } from "@/components/agency/trade-voucher";
import { refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Modal, SectionHeading, Skeleton, cx } from "@/components/ui";
import { formatDate, formatDateTime, formatDeadline, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyBooking } from "@/lib/agency/types";
import type { Booking, CancellationQuote, CurrencyCode, Locale } from "@/lib/types";

/**
 * One booking, as the agency that sold it needs to see it.
 *
 * Three audiences meet on this screen and the layout keeps them apart: the
 * commercial figures are for the agent, the voucher is for their customer, and
 * the timeline is for whoever has to explain what happened.
 */
export function AgencyBookingView({ locale, reference }: { locale: Locale; reference: string }) {
  return (
    <PortalShell locale={locale}>
      {(context) => <Detail locale={locale} reference={reference} context={context} />}
    </PortalShell>
  );
}

interface Payload {
  booking: Booking;
  trade: AgencyBooking;
}

function Detail({
  locale,
  reference,
  context,
}: {
  locale: Locale;
  reference: string;
  context: AgencyContext;
}) {
  const { t } = useApp();
  const [data, setData] = useState<Payload | null | "missing">(null);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/agency/bookings/${encodeURIComponent(reference)}`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as { ok: boolean; data?: Payload };
    setData(body.ok && body.data ? body.data : "missing");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  if (data === null) return <Skeleton className="h-64 w-full" />;
  if (data === "missing") {
    return (
      <Alert tone="critical" title={t("error.notFound")}>
        <Link href={href(locale, "/agency/bookings")} className="underline">
          {t("agency.bookings")}
        </Link>
      </Alert>
    );
  }

  const { booking, trade } = data;
  const currency = trade.currency as CurrencyCode;

  /** Step one: ask what it would cost. Nothing is cancelled by this call. */
  async function askQuote() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agency/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { quote: CancellationQuote };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setQuote(body.data.quote);
    setCancelOpen(true);
  }

  /** Step two: cancel against the exact quote the agent just read out. */
  async function confirmCancel() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agency/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ quoteId: quote.quoteId, idempotencyKey: `cx-${quote.quoteId}` }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { uncertain?: boolean };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setCancelOpen(false);
    setNotice(body.data?.uncertain ? t("agency.cancelReconciling") : t("agency.cancelDone"));
    // The credit line just moved, so the header figure must not stay stale.
    refreshAgency();
    await load();
  }

  const cancellable = booking.capabilities.cancelAllowed && booking.status !== "cancelled";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={href(locale, "/agency/bookings")} className="text-muted text-sm underline">
            ← {t("agency.bookings")}
          </Link>
          <h1 className="mt-1 text-xl font-bold wrap-anywhere">{booking.hotelName}</h1>
          <p className="text-muted text-sm">
            {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)} ·{" "}
            <span className="font-mono">{booking.reference}</span>
          </p>
        </div>
        {cancellable && (
          <Button variant="secondary" onClick={askQuote} loading={busy}>
            {t("agency.cancelBooking")}
          </Button>
        )}
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      <Card className="grid gap-4 p-5 sm:grid-cols-4">
        <Figure label={t("agency.statusLabel")} value={<Badge tone={tone(trade.status)}>{status(t, trade.status)}</Badge>} />
        <Figure label={t("agency.cost")} value={formatMoney(trade.cost, currency, locale)} />
        <Figure label={t("agency.sell")} value={formatMoney(trade.sell, currency, locale)} />
        <Figure
          label={t("agency.margin")}
          value={<span className="text-positive-700">{formatMoney(trade.sell - trade.cost, currency, locale)}</span>}
        />
      </Card>

      <Card className="space-y-1 p-5 text-sm">
        <p>
          <span className="text-muted">{t("agency.bookedBy")}: </span>
          {trade.agentName}
        </p>
        <p>
          <span className="text-muted">{t("agency.leadGuest")}: </span>
          {trade.leadGuest}
        </p>
        <p className={booking.cancellation.refundable ? "text-positive-700" : "text-critical-700"}>
          {booking.cancellation.refundable && booking.cancellation.freeUntil
            ? t("rate.freeUntil", {
                date: formatDeadline(booking.cancellation.freeUntil, booking.cancellation.timezone, locale),
                tz: booking.cancellation.timezone,
              })
            : t("rate.nonRefundable")}
        </p>
      </Card>

      <TradeVoucher
        booking={booking}
        trade={trade}
        profile={context.agency.profile}
        agencyName={context.agency.name}
        locale={locale}
      />

      <section className="space-y-2">
        <SectionHeading title={t("bookingDetail.timeline")} />
        <Card className="divide-ink-100 divide-y">
          {booking.timeline.map((event, i) => (
            <div key={`${event.code}-${i}`} className="p-3.5 text-sm">
              <p className="font-medium wrap-anywhere">{event.label}</p>
              {event.detail && <p className="text-muted text-xs wrap-anywhere">{event.detail}</p>}
              <p className="text-muted text-xs">{formatDateTime(event.at, locale)}</p>
            </div>
          ))}
        </Card>
      </section>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t("agency.cancelBooking")} size="sm">
        {quote && (
          <div className="space-y-3 text-sm">
            <p>{t("agency.cancelBody")}</p>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted">{t("cancel.fee")}</dt>
                <dd className="font-semibold">{formatMoney(quote.fee, quote.currency, locale)}</dd>
              </div>
              <div className="flex justify-between">
                {/* What the agency gets back, not what the guest paid the agency. */}
                <dt className="text-muted">{t("agency.creditReturned")}</dt>
                <dd className="font-semibold">
                  {formatMoney(Math.max(0, trade.cost - Math.round(quote.fee)), currency, locale)}
                </dd>
              </div>
            </dl>
            <p className="text-muted text-xs">{t("agency.cancelCustomerNote")}</p>
            <div className="flex gap-2">
              <Button onClick={confirmCancel} loading={busy}>
                {t("agency.cancelConfirm")}
              </Button>
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted text-xs">{label}</p>
      <p className={cx("mt-1 font-bold")}>{value}</p>
    </div>
  );
}

function tone(value: AgencyBooking["status"]): "positive" | "caution" | "neutral" | "critical" {
  return value === "confirmed" ? "positive" : value === "pending" ? "caution" : value === "failed" ? "critical" : "neutral";
}

function status(t: (key: string) => string, value: AgencyBooking["status"]): string {
  return t(
    value === "confirmed"
      ? "agency.statusConfirmed"
      : value === "pending"
        ? "agency.statusPending"
        : value === "cancelled"
          ? "agency.statusCancelled"
          : "agency.statusFailed",
  );
}
