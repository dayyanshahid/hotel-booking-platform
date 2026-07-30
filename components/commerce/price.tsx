"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Modal, cx } from "@/components/ui";
import { formatDeadline, formatMoney, isPerRoomTotal, partyEstimate } from "@/lib/format";
import type { CancellationPolicy, PriceStack as PriceStackType } from "@/lib/types";

/**
 * Says so when a total buys one room and the search asked for several.
 *
 * Hotelbeds prices a rate per room; a three-room search of the same property
 * returned the same figure as a one-room search, and every surface printed it as
 * the price. An agent quoting a group under-quoted it by two thirds and found
 * out at the counter.
 *
 * The per-room figure stays primary because it is the one the supplier stands
 * behind and the one a rate can actually be bought at. The party number sits
 * underneath as an estimate with its condition stated — a rate with two left
 * cannot fill three rooms, so presenting the multiple as firm would swap one
 * wrong number for another.
 *
 * Renders nothing at all on a single-room search, which is most of them.
 */
export function PerRoomNote({
  price,
  className,
  showEstimate = true,
}: {
  price: PriceStackType;
  className?: string;
  showEstimate?: boolean;
}) {
  const { t, locale } = useApp();
  if (!isPerRoomTotal(price)) return null;

  const rooms = price.roomsRequested;
  return (
    <span className={cx("block", className)}>
      <span className="text-caution-700 block text-xs font-medium">{t("rate.perRoomOf", { rooms })}</span>
      {showEstimate && (
        <span className="text-muted block text-xs">
          {t("rate.partyEstimate", {
            amount: formatMoney(partyEstimate(price), price.currency, locale),
            rooms,
          })}
        </span>
      )}
    </span>
  );
}

/**
 * Total price is the default (§3.1). The complete stay total is primary, the
 * nightly average is secondary, and included vs pay-at-property charges are
 * always separated. The frontend never recomputes a commercial total.
 */
export function PriceBlock({
  price,
  size = "md",
  align = "end",
  showBreakdownLink = true,
}: {
  price: PriceStackType;
  size?: "sm" | "md" | "lg";
  align?: "start" | "end";
  showBreakdownLink?: boolean;
}) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const payAtProperty = price.payAtProperty.reduce((s, c) => s + c.amount, 0);

  const totalClass = { sm: "text-base", md: "text-[22px]", lg: "text-3xl" }[size];

  return (
    <div className={cx("flex flex-col", align === "end" ? "sm:items-end sm:text-end" : "items-start")}>
      {price.strikeTotal && (
        <span className="text-muted text-xs">
          <s>{formatMoney(price.strikeTotal, price.currency, locale)}</s>{" "}
          {price.discountLabel && <Badge tone="sand">{price.discountLabel}</Badge>}
        </span>
      )}
      {/* Tabular so totals line up down a results list and inside the breakdown. */}
      <p className={cx("tabular font-bold tracking-[-0.02em] wrap-anywhere", totalClass)}>
        <span className="sr-only">{t("a11y.priceLabel")}: </span>
        {formatMoney(price.total, price.currency, locale)}
      </p>
      <p className="text-muted text-xs">
        {t("rate.totalFor", { nights: price.nights, guests: price.guests })}
      </p>
      <p className="text-muted text-xs">
        {t("rate.nightlyAverage", { amount: formatMoney(price.nightlyAverage, price.currency, locale) })}
      </p>
      {/* Directly under the total it qualifies — a caveat further down the card
          is one an agent reads after they have already said the number. */}
      <PerRoomNote price={price} className="mt-1" />
      {payAtProperty > 0 && (
        <p className="text-caution-700 mt-1 text-xs font-medium">
          + {formatMoney(payAtProperty, price.currency, locale)} {t("rate.payAtProperty")}
        </p>
      )}
      {price.chargeCurrency && price.chargeCurrency !== price.currency && (
        <p className="text-muted mt-1 text-xs">{t("rate.fxNote", { currency: price.chargeCurrency })}</p>
      )}
      {showBreakdownLink && (
        <>
          <Button variant="quiet" size="sm" className="!min-h-9 !px-0" onClick={() => setOpen(true)}>
            {t("rate.priceBreakdown")}
          </Button>
          <PriceBreakdownModal price={price} open={open} onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}

export function PriceBreakdownModal({
  price,
  open,
  onClose,
}: {
  price: PriceStackType;
  open: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useApp();
  return (
    <Modal open={open} onClose={onClose} title={t("rate.priceBreakdown")} size="sm">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("rate.priceBreakdown")}</caption>
        <tbody className="divide-y">
          <tr>
            <th scope="row" className="py-2 text-start font-normal">
              {t("common.total")} — {t("rate.included")}
            </th>
            <td className="py-2 text-end">{formatMoney(price.base, price.currency, locale)}</td>
          </tr>
          {price.includedCharges.map((charge) => (
            <tr key={charge.code}>
              <th scope="row" className="text-muted py-2 text-start font-normal">
                {charge.label}
              </th>
              <td className="py-2 text-end">{formatMoney(charge.amount, price.currency, locale)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <th scope="row" className="py-2 text-start">
              {t("common.total")}
            </th>
            <td className="py-2 text-end">{formatMoney(price.total, price.currency, locale)}</td>
          </tr>
        </tbody>
      </table>

      {price.payAtProperty.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t("rate.payAtPropertyCharges")}</p>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y">
              {price.payAtProperty.map((charge) => (
                <tr key={charge.code}>
                  <th scope="row" className="text-muted py-2 text-start font-normal">
                    {charge.label}
                    {charge.estimated && <span className="ms-1 text-xs">({t("rate.estimated")})</span>}
                  </th>
                  <td className="py-2 text-end">{formatMoney(charge.amount, price.currency, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {price.fxBasis && <p className="text-muted mt-4 text-xs">{price.fxBasis}</p>}
    </Modal>
  );
}

/**
 * Cancellation is shown as a dated timeline with a textual equivalent, in the
 * property's own time zone (§11.2, §12.5).
 */
export function CancellationTimeline({
  policy,
  currency,
  compact = false,
}: {
  policy: CancellationPolicy;
  currency: PriceStackType["currency"];
  compact?: boolean;
}) {
  const { t, locale } = useApp();

  if (!policy.refundable) {
    return (
      <p className="text-critical-700 text-sm font-medium">
        {t("rate.nonRefundable")}
      </p>
    );
  }

  if (compact) {
    return (
      <p className="text-positive-700 text-sm font-medium wrap-anywhere">
        {policy.freeUntil
          ? t("rate.freeUntil", {
              date: formatDeadline(policy.freeUntil, policy.timezone, locale),
              tz: policy.timezone,
            })
          : t("rate.refundable")}
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">{t("rate.timeline")}</p>
      <ol className="mt-2 space-y-2">
        {policy.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={cx(
                "mt-1.5 size-2.5 shrink-0 rounded-full",
                step.fee === 0 ? "bg-positive-500" : i === policy.steps.length - 1 ? "bg-critical-500" : "bg-caution-500",
              )}
            />
            <span className="wrap-anywhere">
              <span className="font-medium">
                {step.fee === 0
                  ? t("rate.timelineFree")
                  : step.fee >= 0
                    ? t("rate.timelineFee", { amount: formatMoney(step.fee, currency, locale) })
                    : t("rate.timelineNoRefund")}
              </span>
              <span className="text-muted block text-xs">
                {locale === "ar" ? "حتى" : "until"} {formatDeadline(step.until, policy.timezone, locale)} ({policy.timezone})
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
