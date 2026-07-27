import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import {
  getBooking,
  getQuote,
  getSupplierReference,
  linkSupplierReference,
  peekIdempotency,
  pushNotification,
  saveBooking,
  setIdempotency,
  verifyOtp,
} from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { performCancellation } from "@/lib/server/hotelbeds/operations";
import { HotelbedsError } from "@/lib/server/hotelbeds/client";
import { logSupplierError, mapSupplierError } from "@/lib/server/hotelbeds/errors";
import type { Booking } from "@/lib/types";

interface Body {
  quoteId: string;
  idempotencyKey: string;
  otp: string;
}

/**
 * POST /api/bookings/{reference}/cancellations — idempotent cancellation (§6.6).
 *
 * Requires a live, unexpired quote and re-authentication. An uncertain outcome
 * becomes a processing state with a support reference, never a blind resubmit
 * (E-19).
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<Body>(req);
  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!body?.quoteId || !body.idempotencyKey) return fail("validation", "error.validation", locale, { status: 400 });

  const replayRef = peekIdempotency(`cancel:${body.idempotencyKey}`);
  if (replayRef) {
    const previous = await getBooking(replayRef);
    if (previous) return ok({ booking: previous, replay: true });
  }

  if (!verifyOtp(booking.contact.email, "cancel", body.otp ?? "")) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }

  const quote = getQuote(body.quoteId);
  if (!quote || quote.bookingReference !== booking.reference) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }

  setIdempotency(`cancel:${body.idempotencyKey}`, booking.reference);
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
        linkSupplierReference(booking.reference, outcome.cancellationReference, "hotelbeds-cancellation");
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
        return fail(mapped.category, mapped.messageKey, locale, {
          status: mapped.status,
          action: mapped.action,
          retryable: mapped.retryable,
          message: mapped.message,
        });
      }
    }
  }

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
        label: locale === "ar" ? "طلب العميل الإلغاء" : "Cancellation requested by customer",
        detail:
          locale === "ar"
            ? `رسوم ${quote.fee} ${quote.currency}`
            : `Fee ${quote.fee} ${quote.currency}`,
        actor: "customer" as const,
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

  await saveBooking(updated, updated.contact.email);
  pushNotification(updated.contact.email, {
    id: `nt_${Math.random().toString(36).slice(2, 9)}`,
    kind: "cancellation",
    title: uncertain
      ? locale === "ar" ? "جارٍ تأكيد الإلغاء" : "Cancellation is being confirmed"
      : locale === "ar" ? "تم إلغاء الحجز" : "Booking cancelled",
    body: `${updated.hotelName} · ${updated.reference}`,
    href: `/trips/${updated.reference}`,
    createdAt: now,
    read: false,
  });

  return ok({ booking: updated, uncertain });
}

export const dynamic = "force-dynamic";
