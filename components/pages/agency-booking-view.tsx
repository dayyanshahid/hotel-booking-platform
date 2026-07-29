"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { TradeVoucher } from "@/components/agency/trade-voucher";
import { may, refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Field, Input, Modal, SectionHeading, Select, Skeleton, cx } from "@/components/ui";
import { formatDate, formatDateTime, formatDeadline, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyBooking } from "@/lib/agency/types";
import type { Booking, CancellationQuote, CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

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
  /*
   * How close the stay is, measured when the booking arrives rather than during
   * render — reading the clock while rendering is impure, and this is a value
   * that only changes meaningfully once a day.
   *
   * The client asked for travel within seven days to stand out, and the reason
   * is operational: inside a week a cancellation is usually chargeable and an
   * amendment usually is not possible. It marks the bookings an agent should
   * look at today.
   */
  const [daysToTravel, setDaysToTravel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeKind, setChangeKind] = useState("dates");
  const [changeDetail, setChangeDetail] = useState("");

  async function load() {
    const res = await fetch(apiUrl(`/api/agency/bookings/${encodeURIComponent(reference)}`), {
      credentials: apiCredentials(),
    });
    const body = (await res.json()) as { ok: boolean; data?: Payload };
    setData(body.ok && body.data ? body.data : "missing");
    if (body.ok && body.data) {
      const checkIn = new Date(`${body.data.booking.checkIn}T00:00:00Z`).getTime();
      setDaysToTravel(Math.ceil((checkIn - Date.now()) / 86400000));
    }
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
    const res = await fetch(apiUrl(`/api/agency/bookings/${encodeURIComponent(reference)}/cancel`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
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
    const res = await fetch(apiUrl(`/api/agency/bookings/${encodeURIComponent(reference)}/cancel`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
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
  const held = trade.status === "held";
  const canIssue = may(context, "issue");


  async function issue() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl(`/api/agency/bookings/${encodeURIComponent(reference)}/issue`), {
      method: "POST",
      credentials: apiCredentials(),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setNotice(t("agency.issued"));
    refreshAgency();
    await load();
  }

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
        <div className="flex flex-wrap gap-2">
          {/* A hold is not a sale until someone with the permission says so. */}
          {held && canIssue && (
            <Button onClick={issue} loading={busy}>
              {t("agency.issue")}
            </Button>
          )}
          {cancellable && (
            <>
              <Button variant="secondary" onClick={() => setChangeOpen(true)}>
                {t("agency.requestChange")}
              </Button>
              <Button variant="ghost" onClick={askQuote} loading={busy}>
                {t("agency.cancelBooking")}
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      {/*
        A hold says when it disappears, in the same place an agent looks for
        the reference. Everything else about it reads like a booking, which is
        exactly why the deadline has to be impossible to miss.
      */}
      {held && trade.holdExpiresAt && (
        <Alert tone="warning" title={t("agency.holdReleasedSoon")}>
          {t("agency.holdUntil", { when: formatDateTime(trade.holdExpiresAt, locale) })} ·{" "}
          {t("agency.heldNotCharged")}
        </Alert>
      )}

      {daysToTravel !== null && daysToTravel >= 0 && daysToTravel <= 7 && (
        <Alert tone="warning">{t("agency.travellingSoon", { days: daysToTravel })}</Alert>
      )}

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

      <Modal open={changeOpen} onClose={() => setChangeOpen(false)} title={t("agency.requestChange")} size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-muted">{t("agency.requestChangeBody")}</p>
          {!booking.capabilities.modifyAllowed && (
            <Alert tone="warning">{t("agency.notModifiable")}</Alert>
          )}
          <Field label={t("agency.changeKind")} htmlFor="ch-kind">
            <Select id="ch-kind" value={changeKind} onChange={(e) => setChangeKind(e.target.value)}>
              <option value="dates">{t("agency.changeDates")}</option>
              <option value="names">{t("agency.changeNames")}</option>
              <option value="occupancy">{t("agency.changeOccupancy")}</option>
              <option value="requests">{t("agency.changeRequests")}</option>
              <option value="other">{t("agency.changeOther")}</option>
            </Select>
          </Field>
          <Field label={t("agency.changeDetail")} htmlFor="ch-detail">
            <Input id="ch-detail" value={changeDetail} onChange={(e) => setChangeDetail(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              setBusy(true);
              const res = await fetch(apiUrl(`/api/agency/bookings/${encodeURIComponent(reference)}/change`), {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: apiCredentials(),
                body: JSON.stringify({ kind: changeKind, detail: changeDetail }),
              });
              const result = (await res.json()) as { ok: boolean; data?: { alreadyOpen: boolean } };
              setBusy(false);
              if (!result.ok) {
                setError(t("error.validation"));
                return;
              }
              setChangeOpen(false);
              setChangeDetail("");
              setNotice(result.data?.alreadyOpen ? t("agency.changeAlreadyOpen") : t("agency.changeSent"));
            }}
            loading={busy}
            disabled={!changeDetail.trim()}
          >
            {t("agency.sendRequest")}
          </Button>
        </div>
      </Modal>

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
