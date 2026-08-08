/**
 * When a hold is possible, and how long it lasts.
 *
 * Deliberately free of server-only imports: the portal decides whether to offer
 * a Hold button with exactly the rule the server applies when it receives one.
 * Two implementations of "can this be held" would eventually disagree, and the
 * disagreement would surface as a button that produces an error.
 */

/**
 * How long before the supplier's deadline a hold is released.
 *
 * This is not a taste decision — it follows from how often the sweeper runs. A
 * hold can only be released on a sweep, so the margin has to exceed the gap
 * between sweeps, or a deadline will fall in the space between two runs and be
 * missed. Missed means the cancellation is no longer free and the agency is
 * charged for a room nobody sold.
 *
 * The default assumes a daily sweep, because that is all Vercel's Hobby plan
 * will schedule: twenty-six hours covers a full day with room for a late or
 * skipped run. A deployment that can sweep every fifteen minutes should set
 * this far lower — six hours is ample — and gets materially longer holds for
 * it. Longer is always safe and always costs the agency selling time, which is
 * why it is configurable rather than simply generous.
 */
import type { AgencyBooking } from "./types";

export const HOLD_SAFETY_MARGIN_MS =
  Number(process.env.NEXT_PUBLIC_HOLD_SAFETY_MARGIN_HOURS || 26) * 60 * 60 * 1000;

/** The moment an unissued hold must be cancelled by. */
export function holdDeadline(freeCancellationUntil: string): string {
  return new Date(new Date(freeCancellationUntil).getTime() - HOLD_SAFETY_MARGIN_MS).toISOString();
}

/**
 * Whether this rate can be held at all.
 *
 * Refundable is necessary but not sufficient: a rate whose free window has
 * already closed, or closes within the safety margin, is one we could not
 * release for free — so holding it would quietly commit the agency to paying
 * for it.
 */
export function canHold(
  offer: { refundable: boolean; freeCancellationUntil?: string },
  now = Date.now(),
): { ok: true; deadline: string } | { ok: false; reason: "nonRefundable" | "tooLate" } {
  if (!offer.refundable || !offer.freeCancellationUntil) return { ok: false, reason: "nonRefundable" };
  const deadline = holdDeadline(offer.freeCancellationUntil);
  if (new Date(deadline).getTime() <= now) return { ok: false, reason: "tooLate" };
  return { ok: true, deadline };
}

/**
 * Hours left on a hold, or null when it does not have a deadline.
 *
 * A hold is a real supplier booking that cancels itself unless somebody issues
 * it, so the clock on it is the difference between a sale and a room given
 * back. It was on the type, on the detail screen and in the dashboard's
 * attention list, and nowhere in the book of business — where an agent scans
 * thirty rows and a held one looked exactly as settled as a confirmed one.
 */
export function hoursLeftOnHold(booking: AgencyBooking, now = Date.now()): number | null {
  if (booking.status !== "held" || !booking.holdExpiresAt) return null;
  return (new Date(booking.holdExpiresAt).getTime() - now) / 3_600_000;
}

/**
 * A hold close enough to release to be worth a decision today.
 *
 * Twenty-four hours because that is the span in which an agent can still reach
 * a customer, get an answer and issue it. Beyond that it is a diary note; below
 * it, it is a phone call.
 */
export const HOLD_URGENT_HOURS = 24;

export function isHoldUrgent(booking: AgencyBooking, now = Date.now()): boolean {
  const left = hoursLeftOnHold(booking, now);
  /*
   * A hold with no stated deadline counts as urgent, for the same reason the
   * attention list keeps it: an unknown release time is not a distant one, and
   * the honest reading of "we do not know when this goes" is "look at it".
   */
  if (booking.status === "held" && left === null) return true;
  return left !== null && left <= HOLD_URGENT_HOURS && left > 0;
}
