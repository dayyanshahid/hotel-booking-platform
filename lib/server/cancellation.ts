import "server-only";
import {
  getSupplierReference,
  linkSupplierReference,
  pushNotification,
  saveBooking,
  saveQuote as storeQuote,
} from "./store";
import { performCancellation, simulateCancellation } from "./hotelbeds/operations";
import { HotelbedsError } from "./hotelbeds/client";
import { logSupplierError, mapSupplierError } from "./hotelbeds/errors";
import { tourmindCancel } from "./tourmind/operations";
import { isIndeterminate, logTourmindError, mapTourmindError } from "./tourmind/errors";
import { releaseBooking } from "../agency/bookings";
import { getAgencyBooking, saveAgencyBooking } from "../agency/store";
import { applyMarkup } from "./markup";
import { convertCurrency, isSupportedCurrency } from "../format";
import type { ApiError, Booking, CancellationQuote, CurrencyCode, ErrorCategory, Locale } from "../types";
import type { ScenarioId } from "./scenarios";

/**
 * Cancelling a booking, once.
 *
 * Two callers now reach this: a guest cancelling their own stay, and an agent
 * cancelling one their agency sold. What differs between them is who is allowed
 * to ask — the guest proves it with a one-time code, the agent with a portal
 * session against the agency that owns the booking. What must not differ is
 * anything after that point: the supplier call, the timeout handling, the
 * refund record and the credit release.
 *
 * So authorisation stays in the routes and everything else lives here. Two
 * copies of this logic would eventually disagree, and the disagreement would be
 * about whether a supplier order was actually cancelled.
 */

export interface CancellationFailure {
  category: ErrorCategory;
  messageKey: string;
  status: number;
  retryable?: boolean;
  action?: ApiError["recommendedAction"];
  message?: string;
}

export type CancellationOutcome =
  | { ok: true; booking: Booking; uncertain: boolean }
  | { ok: false; error: CancellationFailure };

/** Who asked. It appears on the timeline, which is a record of who did what. */
export type CancellationActor = "customer" | "agent";

export async function cancelBooking({
  booking,
  quote,
  locale,
  scenario,
  actor,
  actorName,
}: {
  booking: Booking;
  quote: CancellationQuote;
  locale: Locale;
  scenario?: ScenarioId | null;
  actor: CancellationActor;
  /** Shown on the timeline for an agent-led cancellation. */
  actorName?: string;
}): Promise<CancellationOutcome> {
  const now = new Date().toISOString();
  let uncertain = scenario === "cancelUncertain";

  /**
   * One idempotent cancellation against the supplier. A timeout leaves the
   * outcome unknown, which becomes a reconciliation state rather than a second
   * submission (E-19).
   */
  const linked = getSupplierReference(booking.reference);
  if (linked?.source === "hotelbeds" && !uncertain) {
    try {
      const outcome = await performCancellation(linked.reference);
      if (outcome.cancellationReference) {
        await linkSupplierReference(booking.reference, outcome.cancellationReference, "hotelbeds-cancellation");
      }
      if (outcome.status !== "CANCELLED") uncertain = true;
    } catch (error) {
      logSupplierError("bookings.cancel", error, booking.reference);
      const transient =
        error instanceof HotelbedsError && (error.kind === "timeout" || error.kind === "network");
      if (transient) {
        uncertain = true;
      } else {
        const mapped = mapSupplierError(error, locale);
        return { ok: false, error: mapped };
      }
    }
  }

  /*
   * TourMind cancels on the AgentRefID we supplied, not on their reservation
   * id — that is the only key we can be certain we hold, since a create that
   * timed out may have succeeded without us ever seeing their id.
   */
  if (linked?.source === "tourmind" && !uncertain) {
    try {
      const cancelled = await tourmindCancel(linked.reference);
      if (!cancelled) uncertain = true;
    } catch (error) {
      logTourmindError("bookings.cancel", error, booking.reference);
      if (isIndeterminate(error)) {
        uncertain = true;
      } else {
        const mapped = mapTourmindError(error, locale);
        return {
          ok: false,
          // TourMind's mapper types its action loosely; the envelope's default
          // for the category is the right fallback rather than a cast.
          error: {
            category: mapped.category,
            messageKey: mapped.messageKey,
            status: mapped.status,
            retryable: mapped.retryable,
            message: mapped.message,
          },
        };
      }
    }
  }

  const requestedBy =
    actor === "agent"
      ? locale === "ar"
        ? `طلب الوكيل الإلغاء${actorName ? ` — ${actorName}` : ""}`
        : `Cancellation requested by the agency${actorName ? ` — ${actorName}` : ""}`
      : locale === "ar"
        ? "طلب العميل الإلغاء"
        : "Cancellation requested by customer";

  const updated: Booking = {
    ...booking,
    status: uncertain ? "reconciliationRequired" : "cancelled",
    statusDetail: uncertain
      ? locale === "ar"
        ? "طلب الإلغاء قيد التأكيد مع العقار."
        : "The cancellation request is being confirmed with the property."
      : locale === "ar"
        ? "أُلغي الحجز وأُرسل تأكيد الإلغاء."
        : "The booking is cancelled and the confirmation has been issued.",
    updatedAt: now,
    // The customer always gets the platform reference; the supplier's own
    // cancellation number is linked server-side for support only.
    cancellationReference: uncertain ? undefined : `CX-${booking.reference.replace("NZ-", "")}`,
    capabilities: { ...booking.capabilities, cancelAllowed: false, modifyAllowed: false },
    refund: {
      status: uncertain ? "none" : quote.refundableAmount > 0 ? "initiated" : "none",
      amount: quote.refundableAmount,
      currency: quote.currency,
      method: quote.method,
      initiatedAt: uncertain ? undefined : now,
      expectedRange: quote.expectedRange,
      reference: uncertain ? undefined : `RF-${booking.reference.replace("NZ-", "")}`,
    },
    timeline: [
      ...booking.timeline,
      {
        at: now,
        code: "cancellation.requested",
        label: requestedBy,
        detail: locale === "ar" ? `رسوم ${quote.fee} ${quote.currency}` : `Fee ${quote.fee} ${quote.currency}`,
        actor: actor === "agent" ? ("support" as const) : ("customer" as const),
      },
      uncertain
        ? {
            at: now,
            code: "cancellation.reconciling",
            label: locale === "ar" ? "جارٍ المطابقة مع العقار" : "Reconciling the cancellation with the property",
            actor: "platform" as const,
          }
        : {
            at: now,
            code: "cancellation.confirmed",
            label: locale === "ar" ? "تم تأكيد الإلغاء" : "Cancellation confirmed",
            actor: "platform" as const,
          },
    ],
  };

  /*
   * Give the agency its credit back.
   *
   * Only the part actually recovered: the cancellation fee is money the
   * supplier keeps, so releasing the full cost would hand back headroom the
   * agency has not got. Skipped while the outcome is uncertain — releasing
   * credit against a cancellation that may not have happened would let the same
   * money be spent twice.
   */
  const trade = await getAgencyBooking(updated.reference);
  if (trade) {
    if (uncertain) {
      /*
       * Marked, not released, and above all not forgotten.
       *
       * The credit has to stay committed — we do not know whether the room is
       * still ours. What used to happen is that nothing was written down at
       * all: the booking looked untouched, the agency was quietly short of the
       * cost of that stay, and there was no job or screen whose business it was
       * to find out. The sweeper picks this up and asks the supplier again.
       */
      await saveAgencyBooking({ ...trade, cancellationUnconfirmedAt: now });
    } else {
      const retained = Math.round(trade.cost * (quote.fee / Math.max(1, booking.price.total)));
      await releaseBooking(trade.agencyId, trade.reference, trade.cost, retained, trade.currency, now);
      await saveAgencyBooking({
        ...trade,
        status: "cancelled",
        cancellationUnconfirmedAt: undefined,
      });
    }
  }

  await saveBooking(updated, updated.contact.email);
  await pushNotification(updated.contact.email, {
    id: `nt_${Math.random().toString(36).slice(2, 9)}`,
    kind: "cancellation",
    title: uncertain
      ? locale === "ar"
        ? "جارٍ تأكيد الإلغاء"
        : "Cancellation is being confirmed"
      : locale === "ar"
        ? "تم إلغاء الحجز"
        : "Booking cancelled",
    body: `${updated.hotelName} · ${updated.reference}`,
    href: `/trips/${updated.reference}`,
    createdAt: now,
    read: false,
  });

  return { ok: true, booking: updated, uncertain };
}

/* ------------------------------------------------------------- quoting */

export type QuoteOutcome =
  | { ok: true; quote: CancellationQuote }
  | { ok: false; error: CancellationFailure };

/**
 * A live cancellation quote.
 *
 * Shared with the guest flow for the same reason the cancellation itself is:
 * the fee an agent reads to their customer and the fee we charge have to be the
 * same number, produced the same way. It is always fetched fresh and always
 * carries its own expiry — a stale quote presented as current is how a refund
 * conversation goes wrong (E-18).
 */
export async function buildCancellationQuote(
  booking: Booking,
  { locale, scenario }: { locale: Locale; scenario?: ScenarioId | null },
): Promise<QuoteOutcome> {
  const now = Date.now();
  const policy = booking.cancellation;
  const applicable =
    policy.steps.find((s) => new Date(s.until).getTime() > now) ?? policy.steps[policy.steps.length - 1];
  // E-18: the harness makes the quote move between the first and second request.
  const drift = scenario === "cancelQuoteChanged" ? Math.round(booking.price.total * 0.15) : 0;

  const linked = getSupplierReference(booking.reference);
  let fee = Math.min(booking.price.total, (applicable?.fee ?? booking.price.total) + drift);

  /**
   * A live booking gets a real cancellation simulation, which is what the
   * supplier's own guidance recommends before any real cancellation. The fee it
   * returns is authoritative and replaces the policy-derived estimate (§6.6).
   */
  if (linked?.source === "hotelbeds") {
    try {
      const outcome = await simulateCancellation(linked.reference);
      const supplierCurrency: CurrencyCode = isSupportedCurrency(outcome.supplierCurrency)
        ? (outcome.supplierCurrency as CurrencyCode)
        : "EUR";
      fee = Math.min(
        booking.price.total,
        convertCurrency(applyMarkup(outcome.feeNet).total, supplierCurrency, booking.price.currency) + drift,
      );
    } catch (error) {
      logSupplierError("bookings.cancellationSimulation", error, booking.reference);
      // Without a live quote nobody may be shown an estimate as if it were
      // final (§6.6): the action stops here instead.
      return { ok: false, error: mapSupplierError(error, locale) };
    }
  }

  const quote: CancellationQuote = {
    quoteId: `cq_${Math.random().toString(36).slice(2, 12)}`,
    bookingReference: booking.reference,
    fee,
    refundableAmount: Math.max(0, booking.paidAmount - fee),
    currency: booking.price.currency,
    deadline: policy.freeUntil ?? `${booking.checkIn}T15:00:00`,
    timezone: policy.timezone,
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    method:
      booking.paidAmount > 0
        ? locale === "ar"
          ? `إلى ${booking.paymentMethodLabel} المستخدمة في الدفع`
          : `To the ${booking.paymentMethodLabel} used for payment`
        : fee > 0
          ? locale === "ar"
            ? "لم يُدفع أي مبلغ مقدمًا. ستُحصَّل رسوم الإلغاء من البطاقة الضامنة."
            : "No prepayment was taken. The cancellation fee will be charged to the guarantee card."
          : locale === "ar"
            ? "لم يُدفع أي مبلغ مقدمًا ولا توجد رسوم."
            : "No prepayment was taken and no fee applies.",
    expectedRange: locale === "ar" ? "٥ إلى ١٠ أيام عمل" : "5–10 business days",
    scope: "wholeBooking",
  };

  storeQuote(quote);
  return { ok: true, quote };
}
