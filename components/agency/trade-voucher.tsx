"use client";

import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card } from "@/components/ui";
import { formatDate, formatDeadline, formatMoney, guestCount } from "@/lib/format";
import type { AgencyBooking, AgencyProfile } from "@/lib/agency/types";
import { brandingOf } from "@/lib/agency/branding";
import { DocumentBrand, DocumentFooter } from "@/components/agency/document-brand";

import type { Booking, CurrencyCode, Locale, SupplierConfirmation } from "@/lib/types";

/**
 * The voucher an agency hands its customer.
 *
 * Not the same document as the guest voucher, and the differences are the whole
 * reason it exists. It carries the agency's name and contact details, because
 * the traveller bought from them and will call them if the room is not ready.
 * It shows the agency's selling price, because that is what the traveller paid
 * — our public price is not a figure they should ever see on their own receipt.
 * And it shows nothing about cost or margin: this is printed and handed over.
 *
 * The platform reference stays on it. It is what the property and our support
 * desk can both look up, and hiding it would only mean the agency has to find
 * it again when something goes wrong.
 */
export function TradeVoucher({
  booking,
  trade,
  profile,
  agencyId,
  agencyName,
  locale,
  confirmation,
}: {
  booking: Booking;
  trade: AgencyBooking;
  profile: AgencyProfile;
  agencyId: string;
  agencyName: string;
  locale: Locale;
  /**
   * What the supplier says it holds, when we could ask.
   *
   * Printed alongside our own record rather than instead of it. If a property
   * confirmed a different room or spelled a guest differently, the person at
   * the desk is going by their copy, and the agent needs to see the difference
   * before the customer discovers it at midnight.
   */
  confirmation?: SupplierConfirmation;
}) {
  const { t } = useApp();
  const currency = trade.currency as CurrencyCode;
  const branding = brandingOf({ id: agencyId, name: agencyName, profile });

  return (
    <Card className="p-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-3">
        <h2 className="font-semibold">{t("agency.voucher")}</h2>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          {t("common.print")}
        </Button>
      </div>

      <div className="rounded-[var(--radius-card)] border p-4">
        {/*
          The same letterhead the quotation carries. Shared rather than
          duplicated, because the two documents go to the same customer from the
          same agency and a logo on one and not the other reads as a forgery.
        */}
        <DocumentBrand
          branding={branding}
          title={t("agency.voucher")}
          reference={booking.reference}
          meta={formatDate(booking.checkIn, locale)}
        />
        <div className="flex justify-end pt-3">
          <Badge tone={booking.status === "confirmed" ? "positive" : "caution"}>
            {booking.status === "confirmed" ? t("booking.confirmedTitle") : t("booking.pendingTitle")}
          </Badge>
        </div>

        {/*
          What the property itself confirmed.
          Its own confirmation number is the one identifier a front desk can
          look up, and it is the supplier's only when they give us theirs
          instead — which is why the line is omitted rather than filled with
          something that would send a guest to the wrong record.
        */}
        {confirmation?.hotelConfirmationNumber && (
          <div className="bg-positive-50 mt-3 rounded-[var(--radius-control)] px-3 py-2">
            <p className="text-muted text-xs">{t("agency.hotelConfirmation")}</p>
            <p className="font-mono text-base font-bold wrap-anywhere">
              {confirmation.hotelConfirmationNumber}
            </p>
          </div>
        )}

        {confirmation?.status === "pending" && (
          <p className="text-caution-700 mt-3 text-sm">{t("agency.confirmationPending")}</p>
        )}
        {confirmation?.status === "cancelled" && (
          <p className="text-critical-700 mt-3 text-sm font-medium">{t("agency.confirmationCancelled")}</p>
        )}
        {confirmation?.unavailable && (
          <p className="text-muted no-print mt-3 text-xs">{t("agency.confirmationUnavailable")}</p>
        )}

        <div className="mt-3">
          <p className="text-lg font-bold wrap-anywhere">{booking.hotelName}</p>
          <p className="text-muted text-sm wrap-anywhere">{booking.hotelAddress}</p>
          <p className="text-muted text-sm">{booking.hotelPhone}</p>
        </div>

        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs">{t("search.checkIn")}</dt>
            <dd className="font-medium">
              {formatDate(booking.checkIn, locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("search.checkOut")}</dt>
            <dd className="font-medium">
              {formatDate(booking.checkOut, locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
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
            <dd className="font-medium wrap-anywhere">
              {booking.guests.map((g) => `${g.firstName} ${g.surname}`).join(", ")} ({guestCount(booking.rooms)})
            </dd>
          </div>
          <div>
            {/* The customer's price, not ours. */}
            <dt className="text-muted text-xs">{t("agency.customerPays")}</dt>
            <dd className="font-bold">{formatMoney(trade.sell, currency, locale)}</dd>
          </div>
        </dl>

        <div className="hairline mt-3 border-t pt-3 text-sm">
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
          <div className="hairline mt-3 border-t pt-3 text-sm">
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

        <p className="text-muted hairline mt-3 border-t pt-3 text-xs">{t("agency.voucherFooter")}</p>

        {/* The agency's own conditions, after ours. */}
        <DocumentFooter branding={branding} />
      </div>
    </Card>
  );
}
