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

