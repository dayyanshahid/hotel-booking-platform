import "server-only";
import { listAgencies, listAgencyBookings, saveAgencyBooking } from "@/lib/agency/store";
import { isExpired, releaseHold } from "@/lib/agency/holds";
import { cancelBooking, buildCancellationQuote } from "./cancellation";
import { getBooking } from "./store";
import type { AgencyBooking } from "@/lib/agency/types";
import type { Locale } from "@/lib/types";

/**
 * Cancel the holds nobody issued.
 *
 * This is the half of the hold feature that makes the other half safe. A hold
 * is a real supplier booking; if it is never cancelled it becomes a real
 * supplier charge on the night the free window closes. The agency did not sell
 * it, so the charge lands on us.
 *
 * It runs from a scheduled request rather than a timer in the process. A timer
 * inside a serverless instance dies with the instance and would quietly stop
 * cancelling, which is the worst possible failure here: no error, no alert, and
 * an invoice at the end of the month.
 *
 * Every cancellation goes through the same `cancelBooking` an agent's own
 * cancellation does, so the supplier call, the credit release and the timeline
 * entry cannot drift from the manual path.
 */

export interface SweepResult {
  examined: number;
  expired: number;
  cancelled: string[];
  failed: { reference: string; reason: string }[];
}

/**
 * Cancel one expired hold.
 *
 * Failures are collected rather than thrown: one supplier refusing must not
 * stop the sweep, because every hold left uncancelled is money.
 */
async function releaseOne(
  trade: AgencyBooking,
  locale: Locale,
  result: SweepResult,
  now: string,
): Promise<void> {
  const booking = await getBooking(trade.reference);
  if (!booking) {
    // No guest record: nothing to cancel with the supplier, but the reserved
    // headroom must still go back or it is held for ever.
    await releaseHold(trade.agencyId, trade.reference, trade.cost, trade.currency, now, "Hold expired");
    await saveAgencyBooking({ ...trade, status: "cancelled", holdExpiresAt: undefined });
    result.cancelled.push(trade.reference);
    return;
  }

  try {
    const outcome = await buildCancellationQuote(booking, { locale });
    if (!outcome.ok) {
      result.failed.push({ reference: trade.reference, reason: outcome.error.messageKey });
      return;
    }
    /*
     * A hold that would cost something to cancel is a hold that was never
     * released in time, and cancelling it anyway would spend the agency's money
     * without asking. It goes to the failure list so a person looks at it.
     */
    if (outcome.quote.fee > 0) {
      result.failed.push({ reference: trade.reference, reason: "feeWouldApply" });
      return;
    }
    await cancelBooking({
      booking,
      quote: outcome.quote,
      locale,
      // The agent did not do this; the platform did, on their behalf.
      actor: "agent",
      actorName: "Auto-cancellation",
    });
    /*
     * The credit side is settled here rather than inside `cancelBooking`.
     *
     * That path releases a *charge*, and a hold was never charged — releasing
     * both would hand the agency back money it never committed. What has to go
     * back is the reservation.
     */
    await releaseHold(trade.agencyId, trade.reference, trade.cost, trade.currency, now, "Hold expired — released");
    await saveAgencyBooking({ ...trade, status: "cancelled", holdExpiresAt: undefined });
    result.cancelled.push(trade.reference);
  } catch (error) {
    result.failed.push({
      reference: trade.reference,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Sweep every agency for holds past their deadline.
 *
 * `now` is injectable so the behaviour can be tested without waiting a day for
 * a deadline to pass.
 */
export async function sweepExpiredHolds(
  options: { locale?: Locale; now?: number } = {},
): Promise<SweepResult> {
  const locale = options.locale ?? "en";
  const now = options.now ?? Date.now();
  const stamp = new Date(now).toISOString();
  const result: SweepResult = { examined: 0, expired: 0, cancelled: [], failed: [] };

  for (const agency of await listAgencies()) {
    for (const trade of await listAgencyBookings(agency.id)) {
      if (trade.status !== "held") continue;
      result.examined += 1;
      if (!isExpired(trade, now)) continue;
      result.expired += 1;
      await releaseOne(trade, locale, result, stamp);
    }
  }

  return result;
}

/**
 * Holds approaching their deadline, for the warning that goes out first.
 *
 * Separate from the sweep because the two answer different questions: this one
 * is "who needs telling", the sweep is "what must be cancelled now".
 */
export async function holdsDueWithin(
  windowMs: number,
  now = Date.now(),
): Promise<{ agencyId: string; booking: AgencyBooking }[]> {
  const due: { agencyId: string; booking: AgencyBooking }[] = [];
  for (const agency of await listAgencies()) {
    for (const trade of await listAgencyBookings(agency.id)) {
      if (trade.status !== "held" || !trade.holdExpiresAt) continue;
      const at = new Date(trade.holdExpiresAt).getTime();
      if (at > now && at - now <= windowMs) due.push({ agencyId: agency.id, booking: trade });
    }
  }
  return due;
}
