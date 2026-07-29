import "server-only";
import {
  getSupplierReference,
  linkSupplierReference,
  pushNotification,
  saveBooking,
} from "./store";
import { findSupplierBookingByClientReference, getSupplierBooking } from "./hotelbeds/operations";
import { isHotelbedsEnabled } from "./hotelbeds/config";
import { isTourmindEnabled } from "./tourmind/config";
import { tourmindRetrieve } from "./tourmind/operations";
import type { Booking, Locale } from "../types";

/**
 * Resolving a booking whose outcome we do not know.
 *
 * Two callers reach this. The customer's browser polls it while a pending
 * booking is on screen, and an operator drives it from the console for a
 * customer who closed the tab an hour ago — which is precisely when a stuck
 * booking stays stuck.
 *
 * The rule that must never fork is here rather than in either caller: the
 * booking is *looked up*, never resubmitted. A second copy of this logic is the
 * copy that eventually double-books someone (§6.5, E-14).
 */

export interface ReconcileResult {
  booking: Booking;
  /** True while the outcome is still unknown and another attempt is worthwhile. */
  polling: boolean;
  changed: boolean;
}

export async function reconcileBooking(booking: Booking, locale: Locale): Promise<ReconcileResult> {
  if (booking.status !== "pending" || !booking.reconciliation) {
    return { booking, polling: false, changed: false };
  }

  const attempts = booking.reconciliation.attempts + 1;
  const now = new Date().toISOString();

  /**
   * Live reconciliation: ask the supplier whether the order exists, either by
   * its own reference or by the client reference we sent.
   */
  const linked = getSupplierReference(booking.reference);

  /*
   * TourMind resolves against our own AgentRefID, which is the reference we
   * chose and therefore the one thing a timed-out create cannot take from us.
   *
   * Their documentation names this the way out of a PENDING create, and until
   * now nothing called it: a TourMind booking that came back pending had no
   * path to an answer at all, which is worse than a failure because nobody
   * knows whether a room is held.
   */
  if (isTourmindEnabled() && booking.hotelSlug.startsWith("tm-")) {
    const agentRef = linked?.source === "tourmind" ? linked.reference : null;
    const outcome = agentRef ? await tourmindRetrieve(agentRef).catch(() => null) : null;

    if (outcome && outcome.status !== "pending") {
      const failed = outcome.status === "failed" || outcome.status === "cancelled";
      const resolved: Booking = {
        ...booking,
        status: failed ? "failed" : "confirmed",
        statusDetail: failed
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
            code: failed ? "booking.rejected" : "booking.reconciled",
            label: failed
              ? locale === "ar"
                ? "رُفض الحجز"
                : "Booking rejected by property"
              : locale === "ar"
                ? "اكتملت المطابقة — الحجز مؤكد"
                : "Reconciliation complete — booking confirmed",
            actor: "platform" as const,
          },
        ],
      };
      await saveBooking(resolved, resolved.contact.email);
      return { booking: resolved, polling: false, changed: true };
    }

    // Still pending, or we could not ask: keep the same attempt budget the
    // other supplier gets before this becomes a person's problem.
    if (attempts >= 5) return escalate(booking, locale, now);
    const stillPending: Booking = {
      ...booking,
      updatedAt: now,
      reconciliation: { ...booking.reconciliation, attempts, nextCheckMs: 5000 },
    };
    await saveBooking(stillPending, stillPending.contact.email);
    return { booking: stillPending, polling: true, changed: false };
  }

  if (isHotelbedsEnabled() && (linked || booking.hotelSlug.startsWith("hb-"))) {
    const supplierBooking = linked
      ? await getSupplierBooking(linked.reference)
      : await findSupplierBookingByClientReference(booking.reference);

    if (supplierBooking?.reference) {
      if (!linked) await linkSupplierReference(booking.reference, supplierBooking.reference, "hotelbeds");
      const cancelled = supplierBooking.status === "CANCELLED";
      const resolved: Booking = {
        ...booking,
        status: cancelled ? "failed" : "confirmed",
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
              ? locale === "ar"
                ? "رُفض الحجز"
                : "Booking rejected by property"
              : locale === "ar"
                ? "اكتملت المطابقة — الحجز مؤكد"
                : "Reconciliation complete — booking confirmed",
            actor: "platform" as const,
          },
        ],
      };
      await saveBooking(resolved, resolved.contact.email);
      return { booking: resolved, polling: false, changed: true };
    }

    // Not found yet: keep going until the attempt budget is spent, then hand
    // the case to support rather than guessing.
    if (attempts >= 5) return escalate(booking, locale, now);

    const stillPending: Booking = {
      ...booking,
      updatedAt: now,
      reconciliation: { ...booking.reconciliation, attempts, nextCheckMs: 5000 },
    };
    await saveBooking(stillPending, stillPending.contact.email);
    return { booking: stillPending, polling: true, changed: false };
  }

  // Three verifications, then a definite outcome.
  if (attempts >= 3) {
    const confirmed: Booking = {
      ...booking,
      status: "confirmed",
      statusDetail:
        locale === "ar" ? "تم التأكيد بعد المطابقة مع العقار." : "Confirmed after reconciliation with the property.",
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
    await pushNotification(confirmed.contact.email, {
      id: `nt_${Math.random().toString(36).slice(2, 9)}`,
      kind: "booking",
      title: locale === "ar" ? "تم تأكيد حجزك" : "Your booking is confirmed",
      body: `${confirmed.hotelName} · ${confirmed.reference}`,
      href: `/trips/${confirmed.reference}`,
      createdAt: now,
      read: false,
    });
    return { booking: confirmed, polling: false, changed: true };
  }

  const updated: Booking = {
    ...booking,
    updatedAt: now,
    reconciliation: { ...booking.reconciliation, attempts, nextCheckMs: 4000 },
  };
  await saveBooking(updated, updated.contact.email);
  return { booking: updated, polling: true, changed: false };
}

/**
 * Hand the booking to a person.
 *
 * Shared by both suppliers: after the attempt budget is spent the honest answer
 * is that we do not know, and a support queue is a better place for that than a
 * poll that never ends.
 */
async function escalate(booking: Booking, locale: Locale, now: string): Promise<ReconcileResult> {
  const escalated: Booking = {
    ...booking,
    status: "reconciliationRequired",
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
  return { booking: escalated, polling: false, changed: true };
}
