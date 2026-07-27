import { notFoundOrDemoState } from "@/lib/server/api";
import { localeFrom, ok } from "@/lib/server/api";
import {
  getBooking,
  getSupplierReference,
  linkSupplierReference,
  pushNotification,
  saveBooking,
} from "@/lib/server/store";
import { findSupplierBookingByClientReference, getSupplierBooking } from "@/lib/server/hotelbeds/operations";
import { isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";

/**
 * GET /api/bookings/{reference}/status — reconciliation-safe polling (§6.5, E-14).
 *
 * The frontend polls this endpoint while a booking is pending. Reconciliation
 * happens here, server-side: the customer is never asked to pay or book again.
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const booking = await getBooking(reference);
  if (!booking) return notFoundOrDemoState(locale);

  if (booking.status === "pending" && booking.reconciliation) {
    const attempts = booking.reconciliation.attempts + 1;
    const now = new Date().toISOString();

    /**
     * Live reconciliation: ask the supplier whether the order exists, either by
     * its own reference or by the client reference we sent. The booking is
     * never resubmitted here.
     */
    const linked = getSupplierReference(booking.reference);
    if (isHotelbedsEnabled() && (linked || booking.hotelSlug.startsWith("hb-"))) {
      const supplierBooking = linked
        ? await getSupplierBooking(linked.reference)
        : await findSupplierBookingByClientReference(booking.reference);

      if (supplierBooking?.reference) {
        if (!linked) linkSupplierReference(booking.reference, supplierBooking.reference, "hotelbeds");
        const cancelled = supplierBooking.status === "CANCELLED";
        const resolved = {
          ...booking,
          status: cancelled ? ("failed" as const) : ("confirmed" as const),
          statusDetail: cancelled
            ? locale === "ar"
              ? "لم يتمكن العقار من قبول الحجز. تم الإفراج عن مبلغ التفويض."
              : "The property could not accept the booking. The authorisation has been released."
            : locale === "ar"
              ? "تم التأكيد بعد المطابقة مع العقار."
              : "Confirmed after reconciliation with the property.",
          updatedAt: now,
          reconciliation: undefined,
          timeline: [
            ...booking.timeline,
            {
              at: now,
              code: cancelled ? "booking.rejected" : "booking.reconciled",
              label: cancelled
                ? locale === "ar" ? "رُفض الحجز" : "Booking rejected by property"
                : locale === "ar" ? "اكتملت المطابقة — الحجز مؤكد" : "Reconciliation complete — booking confirmed",
              actor: "platform" as const,
            },
          ],
        };
        await saveBooking(resolved, resolved.contact.email);
        return ok({ booking: resolved, polling: false });
      }

      // Not found yet: keep polling until the attempt budget is spent, then
      // hand the case to support rather than guessing.
      if (attempts >= 5) {
        const escalated = {
          ...booking,
          status: "reconciliationRequired" as const,
          statusDetail:
            locale === "ar"
              ? "لم نتمكن من تأكيد النتيجة تلقائيًا. فريق الدعم يتابع الحجز ولا حاجة لأي إجراء منك."
              : "We could not confirm the outcome automatically. Support is following it up — no action is needed from you.",
          updatedAt: now,
          reconciliation: undefined,
          timeline: [
            ...booking.timeline,
            {
              at: now,
              code: "booking.escalated",
              label: locale === "ar" ? "أُحيل إلى فريق الدعم" : "Escalated to the support team",
              actor: "platform" as const,
            },
          ],
        };
        await saveBooking(escalated, escalated.contact.email);
        return ok({ booking: escalated, polling: false });
      }

      const stillPending = {
        ...booking,
        updatedAt: now,
        reconciliation: { ...booking.reconciliation, attempts, nextCheckMs: 5000 },
      };
      await saveBooking(stillPending, stillPending.contact.email);
      return ok({ booking: stillPending, polling: true });
    }

    // Three polls of verification, then a definite outcome.
    if (attempts >= 3) {
      const confirmed = {
        ...booking,
        status: "confirmed" as const,
        statusDetail:
          locale === "ar"
            ? "تم التأكيد بعد المطابقة مع العقار."
            : "Confirmed after reconciliation with the property.",
        updatedAt: now,
        reconciliation: undefined,
        timeline: [
          ...booking.timeline,
          {
            at: now,
            code: "booking.reconciled",
            label: locale === "ar" ? "اكتملت المطابقة — الحجز مؤكد" : "Reconciliation complete — booking confirmed",
            actor: "platform" as const,
          },
        ],
      };
      await saveBooking(confirmed, confirmed.contact.email);
      pushNotification(confirmed.contact.email, {
        id: `nt_${Math.random().toString(36).slice(2, 9)}`,
        kind: "booking",
        title: locale === "ar" ? "تم تأكيد حجزك" : "Your booking is confirmed",
        body: `${confirmed.hotelName} · ${confirmed.reference}`,
        href: `/trips/${confirmed.reference}`,
        createdAt: now,
        read: false,
      });
      return ok({ booking: confirmed, polling: false });
    }

    const updated = {
      ...booking,
      updatedAt: now,
      reconciliation: { ...booking.reconciliation, attempts, nextCheckMs: 4000 },
    };
    await saveBooking(updated, updated.contact.email);
    return ok({ booking: updated, polling: true });
  }

  return ok({ booking, polling: false });
}

export const dynamic = "force-dynamic";
