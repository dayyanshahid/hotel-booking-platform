"use client";

import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card, SectionHeading } from "@/components/ui";
import { formatDate, formatDeadline, formatMoney, guestCount } from "@/lib/format";
import type { Booking, Locale } from "@/lib/types";

/**
 * Mobile-friendly web voucher with a printable layout (§5.9).
 *
 * Supplier identifiers stay internal: their reference, their net rate and their
 * name are ours to reconcile with and none of a traveller's business (§9.4).
 *
 * The property's own confirmation number is a different thing and it belongs
 * here. It used to be withheld under the same rule, which read as caution and
 * was in fact the opposite: the trade voucher carried it, so an agent could
 * quote it down the phone, while the guest actually standing at the desk at
 * midnight had only a reference the hotel had never seen. It is printed
 * whenever the supplier gives us one, and simply omitted when they do not,
 * rather than shown as an empty label a guest would read out as nothing.
 */
export function BookingVoucher({
  booking,
  locale,
  hotelConfirmationNumber,
}: {
  booking: Booking;
  locale: Locale;
  hotelConfirmationNumber?: string;
}) {
  const { t } = useApp();

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title={t("booking.voucher")} />
        <div className="no-print flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-xs uppercase tracking-wide">{t("brand.name")}</p>
            <p className="text-lg font-bold wrap-anywhere">{booking.hotelName}</p>
            <p className="text-muted text-sm wrap-anywhere">{booking.hotelAddress}</p>
            <p className="text-muted text-sm">{booking.hotelPhone}</p>
          </div>
          <div className="text-end">
            <p className="text-muted text-xs">{t("booking.reference")}</p>
            <p className="font-mono text-base font-bold">{booking.reference}</p>
            <Badge tone={booking.status === "confirmed" ? "positive" : "caution"}>
              {booking.status === "confirmed" ? t("booking.confirmedTitle") : t("booking.pendingTitle")}
            </Badge>
          </div>
        </div>

        {hotelConfirmationNumber && (
          <div className="bg-positive-50 mt-3 rounded-[var(--radius-control)] px-3 py-2">
            <p className="text-muted text-xs">{t("agency.hotelConfirmation")}</p>
            <p className="wrap-anywhere font-mono text-base font-bold">{hotelConfirmationNumber}</p>
          </div>
        )}

        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs">{t("search.checkIn")}</dt>
            <dd className="font-medium">{formatDate(booking.checkIn, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("search.checkOut")}</dt>
            <dd className="font-medium">{formatDate(booking.checkOut, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("hotel.rooms")}</dt>
            <dd className="font-medium wrap-anywhere">
              {booking.rooms.length} × {booking.roomName}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("rate.board")}</dt>
            <dd className="font-medium">{booking.boardLabel}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("common.guests")}</dt>
            <dd className="font-medium">
              {booking.guests.map((g) => `${g.firstName} ${g.surname}`).join(", ")} ({guestCount(booking.rooms)})
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("booking.paid")}</dt>
            <dd className="font-medium">
              {formatMoney(booking.paidAmount, booking.price.currency, locale)}
              {booking.dueAtProperty > 0 && (
                <span className="text-muted">
                  {" "}
                  · {t("booking.dueAtProperty")} {formatMoney(booking.dueAtProperty, booking.price.currency, locale)}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-3 border-t pt-3 text-sm">
          <p className="font-semibold">{t("rate.timeline")}</p>
          <p className={booking.cancellation.refundable ? "text-positive-700" : "text-critical-700"}>
            {booking.cancellation.refundable && booking.cancellation.freeUntil
              ? t("rate.freeUntil", {
                  date: formatDeadline(booking.cancellation.freeUntil, booking.cancellation.timezone, locale),
                  tz: booking.cancellation.timezone,
                })
              : t("rate.nonRefundable")}
          </p>
        </div>

        {booking.comments.filter((c) => c.mandatory).length > 0 && (
          <div className="mt-3 border-t pt-3 text-sm">
            <p className="font-semibold">{t("rate.conditions")}</p>
            <ul className="text-muted mt-1 list-disc space-y-1 ps-5 text-xs">
              {booking.comments
                .filter((c) => c.mandatory)
                .map((comment) => (
                  <li key={comment.id} className="wrap-anywhere">
                    {comment.summary}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <p className="text-muted mt-3 border-t pt-3 text-xs">{t("bookingDetail.preArrivalBody")}</p>
      </div>
    </Card>
  );
}
