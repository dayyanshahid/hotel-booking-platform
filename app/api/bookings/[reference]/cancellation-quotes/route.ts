import { notFoundOrDemoState } from "@/lib/server/api";
import { fail, localeFrom, ok } from "@/lib/server/api";
import { getBooking, getSupplierReference, saveQuote } from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { simulateCancellation } from "@/lib/server/hotelbeds/operations";
import { logSupplierError, mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { applyMarkup } from "@/lib/server/markup";
import { convertCurrency, isSupportedCurrency } from "@/lib/format";
import type { CancellationQuote, CurrencyCode } from "@/lib/types";

/**
 * POST /api/bookings/{reference}/cancellation-quotes — live simulation (§6.6).
 *
 * The quote is always fetched fresh, carries its own expiry, and is never
 * silently reused once expired (E-18).
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const booking = await getBooking(reference);
  if (!booking) return notFoundOrDemoState(locale);

  if (!booking.capabilities.cancelAllowed || booking.status === "cancelled") {
    return fail("policyRestriction", "error.policyRestriction", locale, { status: 409, action: "contactSupport" });
  }

  const now = Date.now();
  const policy = booking.cancellation;
  const applicable = policy.steps.find((s) => new Date(s.until).getTime() > now) ?? policy.steps[policy.steps.length - 1];
  // E-18: the harness makes the quote move between the first and second request.
  const drift = scenario === "cancelQuoteChanged" ? Math.round(booking.price.total * 0.15) : 0;

  /**
   * A live booking gets a real cancellation simulation, which is what the
   * supplier's own guidance recommends before any real cancellation. The fee it
   * returns is authoritative and replaces the policy-derived estimate (§6.6).
   */
  const linked = getSupplierReference(booking.reference);
  let fee = Math.min(booking.price.total, (applicable?.fee ?? booking.price.total) + drift);

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
      const mapped = mapSupplierError(error, locale);
      // Without a live quote the customer must not be shown an estimate as if
      // it were final (§6.6): the action stops here instead.
      return fail(mapped.category, mapped.messageKey, locale, {
        status: mapped.status,
        action: mapped.action,
        retryable: mapped.retryable,
        message: mapped.message,
      });
    }
  }

  const refundable = Math.max(0, booking.paidAmount - fee);

  const quote: CancellationQuote = {
    quoteId: `cq_${Math.random().toString(36).slice(2, 12)}`,
    bookingReference: booking.reference,
    fee,
    refundableAmount: refundable,
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

  saveQuote(quote);
  return ok(quote);
}

export const dynamic = "force-dynamic";
