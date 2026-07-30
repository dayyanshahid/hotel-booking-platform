"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { CancellationTimeline, PriceBlock } from "@/components/commerce/price";
import { BookingVoucher } from "@/components/commerce/voucher";
import { Alert, Badge, Button, Card, EmptyState, Input, SectionHeading, Skeleton, cx } from "@/components/ui";
import { BookingConfirmedArt, BookingPendingArt, NotFoundArt } from "@/components/ui/illustrations";
import { formatDate, formatDateTime, formatMoney, guestCount } from "@/lib/format";
import { href } from "@/lib/nav";
import type { ApiError, Booking, Locale } from "@/lib/types";

export function BookingOutcomeView({
  locale,
  reference,
  email,
  emailFailed,
}: {
  locale: Locale;
  reference: string;
  email: string;
  emailFailed: boolean;
}) {
  const { t, track, signIn, account, toast } = useApp();
  const api = useApi();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [polling, setPolling] = useState(false);
  const [hotelConfirmation, setHotelConfirmation] = useState<string | undefined>();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  /**
   * §6.5 — while the outcome is uncertain the client only polls an internal
   * status endpoint. It never resubmits the booking and never asks the customer
   * to pay again.
   */
  const poll = useCallback(async () => {
    const res = await api<{ booking: Booking; polling: boolean; hotelConfirmationNumber?: string }>(
      `/api/bookings/${reference}/status`,
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBooking(res.data.booking);
    setPolling(res.data.polling);
    // Only ever set, never cleared: the supplier can be unreachable on a later
    // poll, and a number that vanished off a printed voucher is worse than one
    // that arrived a few seconds late.
    if (res.data.hotelConfirmationNumber) setHotelConfirmation(res.data.hotelConfirmationNumber);
    if (res.data.polling) {
      timerRef.current = setTimeout(() => void pollRef.current(), res.data.booking.reconciliation?.nextCheckMs ?? 4000);
    } else if (res.data.booking.status === "confirmed") {
      track("booking_reconciled", { status: "confirmed", reference: "internal" });
    }
  }, [api, reference, track]);

  useEffect(() => {
    pollRef.current = poll;
    void poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  if (error) {
    return (
      <EmptyState
        standalone
        art={<NotFoundArt />}
        title={t("error.notFound")}
        body={error.message}
        actions={
          <Link href={href(locale, "/trips/lookup")}>
            <Button>{t("trips.findBooking")}</Button>
          </Link>
        }
      />
    );
  }

  if (!booking) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const pending = booking.status === "pending" || booking.status === "processing";
  const failed = booking.status === "failed";
  const confirmed = booking.status === "confirmed";

  return (
    <div className="space-y-5">
      <Card
        className={cx(
          "p-5",
          confirmed && "border-positive-500",
          pending && "border-caution-500",
          failed && "border-critical-500",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            {(confirmed || pending) && (
              <div className="hidden sm:block">
                {confirmed ? <BookingConfirmedArt className="h-24 w-auto" /> : <BookingPendingArt className="h-24 w-auto" />}
              </div>
            )}
            <div>
            <Badge tone={confirmed ? "positive" : pending ? "caution" : "critical"}>
              {confirmed ? t("booking.confirmedTitle") : pending ? t("booking.pendingTitle") : t("booking.failedTitle")}
            </Badge>
            <h1 className="mt-2 text-xl font-bold sm:text-2xl">
              {confirmed ? t("booking.confirmedTitle") : pending ? t("booking.pendingTitle") : t("booking.failedTitle")}
            </h1>
            <p className="text-muted mt-1 text-sm">{booking.statusDetail}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-muted text-xs">{t("booking.reference")}</p>
            <p className="font-mono text-lg font-bold">{booking.reference}</p>
            <p className="text-muted text-xs">
              {t("booking.lastUpdate")}: {formatDateTime(booking.updatedAt, locale)}
            </p>
          </div>
        </div>

        {pending && (
          <div className="mt-4 space-y-3">
            <Alert tone="warning" title={t("checkout.doNotPayAgain")}>
              {t("booking.pendingBody")}
            </Alert>
            <p className="text-muted text-sm">
              {t("booking.pendingContact")}: <span className="font-medium">{booking.contact.email}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => poll()} loading={polling}>
                {t("booking.checkStatus")}
              </Button>
              {polling && <span className="text-muted text-xs">{t("common.loading")}…</span>}
            </div>
          </div>
        )}

        {failed && (
          <div className="mt-4 space-y-3">
            <Alert tone="critical">{t("booking.failedBody")}</Alert>
            <div className="flex flex-wrap gap-2">
              <Link href={href(locale, `/hotel/${booking.hotelSlug}`)}>
                <Button>{t("hotel.seeRooms")}</Button>
              </Link>
              <Link href={href(locale, "/support")}>
                <Button variant="secondary">{t("support.title")}</Button>
              </Link>
            </div>
          </div>
        )}

        {emailFailed && confirmed && (
          <div className="mt-4">
            {/* E-15: a notification failure never changes booking status. */}
            <Alert tone="warning">{t("booking.emailFailed")}</Alert>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {!failed && (
            <BookingVoucher
              booking={booking}
              locale={locale}
              hotelConfirmationNumber={hotelConfirmation}
            />
          )}

          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.guests")} />
            <ul className="space-y-1 text-sm">
              {booking.guests.map((guest, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="wrap-anywhere">
                    {guest.firstName} {guest.surname}
                    {guest.lead && <Badge tone="brand" className="ms-2">{t("checkout.leadGuest")}</Badge>}
                  </span>
                  <span className="text-muted text-xs">
                    {t("common.room")} {guest.roomIndex + 1}
                    {guest.age != null ? ` · ${guest.age}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {booking.specialRequests.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-sm font-semibold">{t("bookingDetail.requests")}</p>
                <ul className="text-muted mt-1 list-disc space-y-0.5 ps-5 text-sm">
                  {booking.specialRequests.map((request) => (
                    <li key={request}>{request}</li>
                  ))}
                </ul>
                <p className="text-muted mt-1 text-xs">{t("checkout.requestsHint")}</p>
              </div>
            )}
          </Card>

          {!account && confirmed && (
            <Card className="p-4">
              <SectionHeading title={t("booking.createAccount")} description={t("booking.createAccountBody")} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label htmlFor="convert-email" className="text-sm font-medium">
                    {t("account.emailLabel")}
                  </label>
                  <Input id="convert-email" defaultValue={email || booking.contact.email} readOnly className="mt-1.5" />
                </div>
                <Button
                  loading={creatingAccount}
                  onClick={async () => {
                    setCreatingAccount(true);
                    const res = await api<{ demoCode?: string }>("/api/auth/otp", {
                      method: "POST",
                      body: JSON.stringify({ email: booking.contact.email, purpose: "signin" }),
                    });
                    setCreatingAccount(false);
                    if (res.ok) {
                      signIn(booking.contact.email);
                      toast(t("trips.mergeDone"), "success");
                      track("account_created_post_booking", {});
                    }
                  }}
                >
                  {t("common.continue")}
                </Button>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <SectionHeading title={t("bookingDetail.stay")} />
            <p className="text-sm font-medium wrap-anywhere">{booking.hotelName}</p>
            <p className="text-muted text-sm wrap-anywhere">{booking.hotelAddress}</p>
            <p className="text-muted mt-2 text-sm">
              {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
            </p>
            <p className="text-muted text-sm">
              {booking.roomName} · {booking.boardLabel}
            </p>
            <p className="text-muted text-sm">
              {booking.rooms.length} × {t("common.room")} · {guestCount(booking.rooms)} {t("common.guests")}
            </p>

            <div className="mt-4 border-t pt-3">
              <PriceBlock price={booking.price} align="start" />
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t("booking.paid")}</dt>
                  <dd className="font-medium">{formatMoney(booking.paidAmount, booking.price.currency, locale)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t("booking.dueAtProperty")}</dt>
                  <dd className="font-medium">{formatMoney(booking.dueAtProperty, booking.price.currency, locale)}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 border-t pt-3">
              <CancellationTimeline policy={booking.cancellation} currency={booking.price.currency} />
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeading title={t("nav.trips")} />
            <div className="flex flex-col gap-2">
              <Link href={`${href(locale, `/trips/${booking.reference}`)}?email=${encodeURIComponent(booking.contact.email)}`}>
                <Button className="w-full">{t("booking.addToTrips")}</Button>
              </Link>
              <Link href={href(locale, "/support")}>
                <Button variant="secondary" className="w-full">
                  {t("support.title")}
                </Button>
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
