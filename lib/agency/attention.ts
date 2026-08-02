import type { AgencyBooking } from "./types";

/**
 * What on a trade account will cost something if nobody looks at it today.
 *
 * Three different things to the system and one thing to the person reading:
 * work that does not wait. Kept out of the dashboard component so the ordering
 * — which is the whole value of the list — can be checked against fixed clock
 * values rather than by opening the page on a day when an account happens to
 * have the right shape.
 */

/**
 * `failed` is deliberately not one of these.
 *
 * A booking the supplier refuses never reaches the agency ledger at all — the
 * route commits it only when the order was not rejected, because committing
 * credit against a booking that did not happen is the bug that rule exists to
 * prevent. So a failed trade booking is not something to chase; it is
 * something that was never created. `AgencyBooking["status"]` admits the value
 * and nothing writes it.
 */
export type AttentionKind = "hold" | "unconfirmed" | "stalled";

export interface AttentionItem {
  kind: AttentionKind;
  booking: AgencyBooking;
  /**
   * Milliseconds until this bites, for sorting and for the countdown.
   *
   * Zero for the two that are already biting. Negative on a hold means its
   * release is due and the sweeper has not caught it yet, which sorts it above
   * everything else — correctly, because it is the one about to disappear.
   */
  at: number;
}

/**
 * How near a hold has to be before it is today's problem.
 *
 * Two days. A hold on a stay three weeks out is real and reserves real credit,
 * but it does not need anybody this morning, and a panel called "needs you
 * today" that permanently lists it is a panel people stop reading — which
 * costs exactly the hold that really was about to go. Those live in the "on
 * hold" figure and on the bookings screen instead.
 */
const HOLD_HORIZON_MS = 48 * 60 * 60 * 1000;

/**
 * How long a booking may sit unconfirmed before somebody should look at it.
 *
 * Half an hour. A supplier order that comes back uncertain becomes pending and
 * is reconciled server-side rather than resubmitted, which normally resolves
 * in seconds — so a pending booking is unremarkable when it is fresh and a
 * real problem when it is not. Meanwhile the credit is committed and the
 * customer is holding no confirmation.
 */
const STALLED_AFTER_MS = 30 * 60 * 1000;

/**
 * The list, soonest first.
 *
 * `now` is passed rather than read so this is a pure function of its inputs:
 * a countdown is the one thing on a dashboard that must be tested at chosen
 * moments, including the moment it has already passed.
 */
export function attentionItems(
  bookings: AgencyBooking[],
  now: number,
  { holdHorizonMs = HOLD_HORIZON_MS, stalledAfterMs = STALLED_AFTER_MS } = {},
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const booking of bookings) {
    /*
     * A hold is a real supplier booking on a refundable rate, reserving the
     * agency's credit, that something will cancel unless somebody issues it
     * first. It is the most time-critical thing an agency owns and it was not
     * on the dashboard at all.
     *
     * A hold with no expiry sorts last rather than first: an unknown deadline
     * is not an imminent one, and `Infinity` keeps it visible without letting
     * it outrank a hold that really is about to go.
     */
    if (booking.status === "held") {
      const at = booking.holdExpiresAt ? new Date(booking.holdExpiresAt).getTime() - now : Infinity;
      /*
       * A hold with no stated deadline is listed, not filtered.
       *
       * The horizon is a claim about when something happens, and an unknown
       * deadline supports no such claim — dropping it would hide a hold whose
       * release could be at any moment behind a rule meant for the ones that
       * are demonstrably far off.
       */
      if (!booking.holdExpiresAt || at <= holdHorizonMs) items.push({ kind: "hold", booking, at });
      continue;
    }

    /*
     * A cancellation we asked for and could not confirm.
     *
     * The credit stays committed on purpose — releasing headroom against a
     * cancellation that may not have happened lets the same money be spent
     * twice — so the agency's limit is quietly short until somebody chases it.
     * The sweeper re-asks the supplier; nothing showed it to the people whose
     * credit it is.
     */
    if (booking.cancellationUnconfirmedAt) {
      items.push({ kind: "unconfirmed", booking, at: 0 });
      continue;
    }

    // Ordered, credit committed, and the supplier has still not said yes.
    if (booking.status === "pending" && now - new Date(booking.createdAt).getTime() > stalledAfterMs) {
      items.push({ kind: "stalled", booking, at: 0 });
    }
  }

  return items.sort((a, b) => a.at - b.at);
}
