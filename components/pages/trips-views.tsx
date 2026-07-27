"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { CancellationTimeline, PriceBlock } from "@/components/commerce/price";
import { BookingVoucher } from "@/components/commerce/voucher";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionHeading,
  Skeleton,
  Tabs,
  cx,
} from "@/components/ui";
import { EmptyTripsArt, NotFoundArt } from "@/components/ui/illustrations";
import { formatDate, formatDateTime, formatDeadline, formatMoney, guestCount, todayIso } from "@/lib/format";
import { href } from "@/lib/nav";
import type { ApiError, Booking, CancellationQuote, Locale } from "@/lib/types";

const STATUS_TONE: Record<string, "positive" | "caution" | "critical" | "neutral"> = {
  confirmed: "positive",
  pending: "caution",
  processing: "caution",
  reconciliationRequired: "caution",
  cancelled: "neutral",
  failed: "critical",
};

/* ------------------------------------------------------------ trip list */

/** F-070 — upcoming, pending, past and cancelled, plus guest-booking merge. */
export function TripsView({ locale }: { locale: Locale }) {
  const { t, account } = useApp();
  const api = useApi();
  const [loaded, setLoaded] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState("upcoming");
  // Signed-out visitors have nothing to load, so the empty list is derived
  // rather than written into state.
  const bookings = account ? loaded : [];

  useEffect(() => {
    if (!account) return;
    void (async () => {
      const res = await api<{ bookings: Booking[] }>(`/api/trips?email=${encodeURIComponent(account.email)}`);
      setLoaded(res.ok ? res.data.bookings : []);
    })();
  }, [account, api]);

  if (!account) {
    return (
      <div className="space-y-4">
        <EmptyState
          art={<EmptyTripsArt />}
          title={t("trips.title")}
          body={t("account.signInBody")}
          actions={
            <>
              <Link href={href(locale, "/signin")}>
                <Button>{t("nav.signIn")}</Button>
              </Link>
              <Link href={href(locale, "/trips/lookup")}>
                <Button variant="secondary">{t("trips.findBooking")}</Button>
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const today = todayIso();
  const buckets = {
    upcoming: (bookings ?? []).filter((b) => b.status === "confirmed" && b.checkOut >= today),
    pending: (bookings ?? []).filter((b) => ["pending", "processing", "reconciliationRequired"].includes(b.status)),
    past: (bookings ?? []).filter((b) => b.status === "confirmed" && b.checkOut < today),
    cancelled: (bookings ?? []).filter((b) => b.status === "cancelled" || b.status === "failed"),
  };
  const list = buckets[tab as keyof typeof buckets] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">{t("trips.title")}</h1>
        <Link href={href(locale, "/trips/lookup")}>
          <Button variant="secondary" size="sm">
            {t("trips.findBooking")}
          </Button>
        </Link>
      </div>

      <Tabs
        label={t("trips.title")}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "upcoming", label: `${t("trips.upcoming")} (${buckets.upcoming.length})` },
          { id: "pending", label: `${t("trips.pending")} (${buckets.pending.length})` },
          { id: "past", label: `${t("trips.past")} (${buckets.past.length})` },
          { id: "cancelled", label: `${t("trips.cancelled")} (${buckets.cancelled.length})` },
        ]}
      />

      {!bookings && <Skeleton className="h-32 w-full" />}

      {bookings && !list.length && <EmptyState art={<EmptyTripsArt />} title={t("trips.empty")} />}

      <ul className="space-y-3">
        {list.map((booking) => (
          <li key={booking.reference}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={STATUS_TONE[booking.status] ?? "neutral"}>{booking.status}</Badge>
                  <p className="mt-1 font-semibold wrap-anywhere">{booking.hotelName}</p>
                  <p className="text-muted text-sm">
                    {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)} ·{" "}
                    {booking.rooms.length} × {t("common.room")}
                  </p>
                  <p className="text-muted font-mono text-xs">{booking.reference}</p>
                </div>
                <div className="text-end">
                  <p className="font-bold">{formatMoney(booking.price.total, booking.price.currency, locale)}</p>
                  <Link
                    href={`${href(locale, `/trips/${booking.reference}`)}?email=${encodeURIComponent(booking.contact.email)}`}
                  >
                    <Button size="sm" className="mt-2">
                      {t("trips.viewBooking")}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- guest lookup */

export function BookingLookupView({ locale }: { locale: Locale }) {
  const { t, signIn, toast } = useApp();
  const api = useApi();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | undefined>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="p-5">
        <SectionHeading title={t("trips.lookupTitle")} description={t("trips.lookupBody")} />
        {stage === "request" && (
          <div className="space-y-4">
            <Field label={t("booking.reference")} htmlFor="lookup-ref" required>
              <Input id="lookup-ref" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} />
            </Field>
            <Field label={t("account.emailLabel")} htmlFor="lookup-email" required error={error}>
              <Input id="lookup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await api<{ demoCode?: string }>("/api/bookings/lookup", {
                  method: "POST",
                  body: JSON.stringify({ reference, email }),
                });
                setBusy(false);
                if (!res.ok) {
                  setError(res.error.message);
                  return;
                }
                setDemoCode(res.data.demoCode);
                setStage("verify");
              }}
            >
              {t("account.sendCode")}
            </Button>
          </div>
        )}

        {stage === "verify" && !booking && (
          <div className="space-y-4">
            {/* The response is identical whether or not the pair matched (E-22). */}
            <Alert tone="info">{t("account.codeSent", { email })}</Alert>
            {demoCode && (
              <p className="text-muted text-xs">
                Demo environment — code: <span className="font-mono font-bold">{demoCode}</span>
              </p>
            )}
            <Field label={t("account.codeLabel")} htmlFor="lookup-code" required error={error}>
              <Input id="lookup-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                const res = await api<{ booking: Booking }>("/api/bookings/lookup", {
                  method: "PUT",
                  body: JSON.stringify({ reference, email, code }),
                });
                setBusy(false);
                if (!res.ok) {
                  setError(t("account.codeInvalid"));
                  return;
                }
                setBooking(res.data.booking);
              }}
            >
              {t("account.verify")}
            </Button>
          </div>
        )}

        {booking && (
          <div className="space-y-3">
            <Alert tone="success" title={booking.hotelName}>
              {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)} · {booking.reference}
            </Alert>
            <Link href={`${href(locale, `/trips/${booking.reference}`)}?email=${encodeURIComponent(booking.contact.email)}`}>
              <Button className="w-full">{t("trips.viewBooking")}</Button>
            </Link>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                signIn(booking.contact.email);
                toast(t("trips.mergeDone"), "success");
              }}
            >
              {t("trips.merge")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------- booking detail */

/** F-071 / F-072 / F-073 — booking detail, cancellation quote and refund status. */
export function BookingDetailView({
  locale,
  reference,
  email,
}: {
  locale: Locale;
  reference: string;
  email: string;
}) {
  const { t, track, account, toast } = useApp();
  const api = useApi();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const contact = email || account?.email || "";

  const load = useCallback(async () => {
    const res = await api<{ booking: Booking }>(
      `/api/bookings/${reference}?email=${encodeURIComponent(contact)}`,
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBooking(res.data.booking);
  }, [api, reference, contact]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <EmptyState
        art={<NotFoundArt />}
        title={t(`error.${error.category}`)}
        body={error.message}
        actions={
          <Link href={href(locale, "/trips/lookup")}>
            <Button>{t("trips.findBooking")}</Button>
          </Link>
        }
      />
    );
  }

  if (!booking) return <Skeleton className="h-64 w-full" />;

  const cancellable =
    booking.capabilities.cancelAllowed && booking.status === "confirmed" && booking.checkIn >= todayIso();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone={STATUS_TONE[booking.status] ?? "neutral"}>{booking.status}</Badge>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl wrap-anywhere">{booking.hotelName}</h1>
          <p className="text-muted text-sm">{booking.statusDetail}</p>
        </div>
        <div className="text-end">
          <p className="text-muted text-xs">{t("booking.reference")}</p>
          <p className="font-mono text-lg font-bold">{booking.reference}</p>
        </div>
      </div>

      {booking.status === "reconciliationRequired" && <Alert tone="warning">{t("cancel.uncertain")}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {booking.status !== "failed" && booking.status !== "cancelled" && (
            <BookingVoucher booking={booking} locale={locale} />
          )}

          {booking.refund && booking.refund.status !== "none" && (
            <Card className="p-4">
              <SectionHeading title={t("cancel.refundStatus")} />
              <ol className="flex flex-wrap gap-3 text-sm">
                {[
                  { id: "initiated", label: t("cancel.refundInitiated") },
                  { id: "processing", label: t("cancel.refundProcessing") },
                  { id: "settled", label: t("cancel.refundSettled") },
                ].map((stage, i) => {
                  const order = ["initiated", "processing", "settled"];
                  const current = order.indexOf(booking.refund!.status);
                  return (
                    <li key={stage.id} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cx(
                          "grid size-6 place-items-center rounded-full border text-xs",
                          i <= current ? "bg-positive-500 border-positive-500 text-white" : "surface-sunken",
                        )}
                      >
                        {i <= current ? "✓" : i + 1}
                      </span>
                      {stage.label}
                    </li>
                  );
                })}
              </ol>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("cancel.refund")}</dt>
                  <dd className="font-medium">
                    {formatMoney(booking.refund.amount, booking.refund.currency, locale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("bookingDetail.payment")}</dt>
                  <dd className="wrap-anywhere text-end">{booking.refund.method}</dd>
                </div>
                {booking.refund.reference && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t("cancel.reference")}</dt>
                    <dd className="font-mono">{booking.refund.reference}</dd>
                  </div>
                )}
              </dl>
              <p className="text-muted mt-2 text-xs">
                {t("cancel.refundTiming", { range: booking.refund.expectedRange ?? "" })}
              </p>
            </Card>
          )}

          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.timeline")} />
            <ol className="space-y-3">
              {booking.timeline.map((event, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span aria-hidden className="bg-brand-500 mt-1.5 size-2 shrink-0 rounded-full" />
                  <span>
                    <span className="font-medium">{event.label}</span>
                    {event.detail && <span className="text-muted block text-xs">{event.detail}</span>}
                    <span className="text-muted block text-xs">{formatDateTime(event.at, locale)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.hotelContact")} />
            <p className="text-sm wrap-anywhere">{booking.hotelAddress}</p>
            <p className="text-sm">{booking.hotelPhone}</p>
            <p className="text-muted mt-2 text-sm">{t("bookingDetail.preArrivalBody")}</p>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.stay")} />
            <p className="text-sm">
              {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
            </p>
            <p className="text-muted text-sm">
              {booking.roomName} · {booking.boardLabel} · {guestCount(booking.rooms)} {t("common.guests")}
            </p>
            <div className="mt-3 border-t pt-3">
              <PriceBlock price={booking.price} align="start" />
            </div>
            <div className="mt-3 border-t pt-3">
              <CancellationTimeline policy={booking.cancellation} currency={booking.price.currency} />
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.status")} />
            <div className="flex flex-col gap-2">
              {cancellable && (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  {t("bookingDetail.cancelBooking")}
                </Button>
              )}
              {/* Actions the supplier cannot fulfil are never rendered (E-24). */}
              {booking.capabilities.modifyAllowed ? (
                <Link href={href(locale, "/support")}>
                  <Button variant="secondary" className="w-full">
                    {t("bookingDetail.modify")}
                  </Button>
                </Link>
              ) : (
                <Alert tone="info">{t("bookingDetail.modifyUnavailable")}</Alert>
              )}
              <Link href={`${href(locale, "/support")}?booking=${booking.reference}`}>
                <Button variant="secondary" className="w-full">
                  {t("bookingDetail.contactSupport")}
                </Button>
              </Link>
            </div>
          </Card>
        </aside>
      </div>

      <CancelFlow
        booking={booking}
        locale={locale}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onDone={(updated) => {
          setBooking(updated);
          setCancelOpen(false);
          toast(t("cancel.doneTitle"), "success");
          track("cancellation_result", { status: updated.status, feeBand: updated.refund?.amount ? "partial" : "full" });
        }}
      />
    </div>
  );
}

/** F-072 — live quote, re-authentication, then one idempotent cancellation. */
function CancelFlow({
  booking,
  locale,
  open,
  onClose,
  onDone,
}: {
  booking: Booking;
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onDone: (booking: Booking) => void;
}) {
  const { t, track } = useApp();
  const api = useApi();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [stage, setStage] = useState<"quote" | "otp" | "processing">("quote");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // One cancellation per quote: the quote ID is already unique and stable.
  const idempotencyKey = quote ? `cx_${quote.quoteId}` : "";

  const fetchQuote = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await api<CancellationQuote>(`/api/bookings/${booking.reference}/cancellation-quotes`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setQuote(res.data);
    track("cancellation_quote", { fee: res.data.fee, refund: res.data.refundableAmount });
  }, [api, booking.reference, track]);

  useEffect(() => {
    if (open) void fetchQuote();
  }, [open, fetchQuote]);

  // A ticking clock rather than Date.now() during render keeps the component pure.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = quote ? new Date(quote.expiresAt).getTime() < now : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("cancel.title")}
      size="sm"
      footer={
        stage === "quote" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={!quote || expired}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await api<{ demoCode: string }>("/api/auth/otp", {
                  method: "POST",
                  body: JSON.stringify({ email: booking.contact.email, purpose: "cancel" }),
                });
                setBusy(false);
                if (res.ok) {
                  setDemoCode(res.data.demoCode);
                  setStage("otp");
                }
              }}
            >
              {t("cancel.confirmButton")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.back")}
            </Button>
          </div>
        ) : stage === "otp" ? (
          <Button
            variant="danger"
            className="w-full"
            loading={busy}
            disabled={code.length < 6}
            onClick={async () => {
              setBusy(true);
              setError("");
              setStage("processing");
              const res = await api<{ booking: Booking; uncertain: boolean }>(
                `/api/bookings/${booking.reference}/cancellations`,
                {
                  method: "POST",
                  body: JSON.stringify({ quoteId: quote?.quoteId, idempotencyKey, otp: code }),
                },
              );
              setBusy(false);
              if (!res.ok) {
                setStage("otp");
                setError(res.error.message);
                return;
              }
              onDone(res.data.booking);
            }}
          >
            {t("cancel.confirmButton")}
          </Button>
        ) : undefined
      }
    >
      {stage === "quote" && (
        <div className="space-y-3">
          {!quote && busy && <Skeleton className="h-24 w-full" />}
          {quote && (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("cancel.fee")}</dt>
                  <dd className="font-semibold">{formatMoney(quote.fee, quote.currency, locale)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("cancel.refund")}</dt>
                  <dd className="font-semibold">{formatMoney(quote.refundableAmount, quote.currency, locale)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("bookingDetail.payment")}</dt>
                  <dd className="wrap-anywhere text-end">{quote.method}</dd>
                </div>
              </dl>
              <p className="text-muted text-xs">{t("cancel.deadlineNote", { tz: quote.timezone })}</p>
              <p className="text-muted text-xs">
                {t("cancel.quoteExpires", { time: formatDeadline(quote.expiresAt, quote.timezone, locale) })}
              </p>
              {expired && (
                <Alert
                  tone="warning"
                  action={
                    <Button size="sm" onClick={fetchQuote}>
                      {t("common.retry")}
                    </Button>
                  }
                >
                  {t("cancel.quoteExpired")}
                </Alert>
              )}
              <Alert tone="critical">{t("cancel.irreversible")}</Alert>
            </>
          )}
          {error && <Alert tone="critical">{error}</Alert>}
        </div>
      )}

      {stage === "otp" && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("cancel.otpTitle")}</p>
          <p className="text-muted text-sm">{t("cancel.otpBody", { contact: booking.contact.email })}</p>
          {demoCode && (
            <p className="text-muted text-xs">
              Demo environment — code: <span className="font-mono font-bold">{demoCode}</span>
            </p>
          )}
          <Field label={t("account.codeLabel")} htmlFor="cancel-code" required error={error}>
            <Input id="cancel-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
      )}

      {stage === "processing" && (
        <div className="space-y-3">
          <p className="text-sm">{t("cancel.processing")}</p>
          <Skeleton className="h-2 w-full" />
        </div>
      )}
    </Modal>
  );
}
