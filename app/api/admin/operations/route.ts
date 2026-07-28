import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings } from "@/lib/server/store";
import { listIncidents, incidentRate } from "@/lib/server/incidents";
import type { Booking } from "@/lib/types";

/**
 * The work queue.
 *
 * Two states on this platform end with a person rather than with time: a
 * booking whose outcome we do not know, and a refund we have promised but not
 * settled. Both are invisible on every other screen — a pending booking looks
 * like a booking, and a refund lives inside a record nobody opens unless the
 * customer calls. Neither should be discovered by complaint.
 *
 * Ordered oldest first, deliberately. A queue sorted newest-first buries the
 * one that has been stuck for three days under this morning's arrivals.
 */
const UNRESOLVED = new Set(["pending", "processing", "reconciliationRequired"]);

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const bookings = await listBookings();
  const now = Date.now();

  const age = (booking: Booking) => Math.round((now - new Date(booking.createdAt).getTime()) / 3_600_000);

  const reconciliation = bookings
    .filter((b) => UNRESOLVED.has(b.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((b) => ({
      reference: b.reference,
      status: b.status,
      hotelName: b.hotelName,
      email: b.contact.email,
      total: b.price.total,
      currency: b.price.currency,
      createdAt: b.createdAt,
      ageHours: age(b),
      attempts: b.reconciliation?.attempts ?? 0,
    }));

  const refunds = bookings
    .filter((b) => b.refund && b.refund.amount > 0 && b.refund.status !== "settled" && b.refund.status !== "none")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map((b) => ({
      reference: b.reference,
      hotelName: b.hotelName,
      email: b.contact.email,
      amount: b.refund!.amount,
      currency: b.refund!.currency,
      status: b.refund!.status,
      method: b.refund!.method,
      expectedRange: b.refund!.expectedRange,
      initiatedAt: b.refund!.initiatedAt ?? b.updatedAt,
      ageHours: Math.round((now - new Date(b.refund!.initiatedAt ?? b.updatedAt).getTime()) / 3_600_000),
    }));

  return ok({
    reconciliation,
    refunds,
    incidents: listIncidents(50),
    incidentRate: incidentRate(60),
    // The oldest item in either queue is the number that matters: it is how
    // long the worst-served customer has been waiting.
    oldestHours: Math.max(reconciliation[0]?.ageHours ?? 0, refunds[0]?.ageHours ?? 0),
  });
}
