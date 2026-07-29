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
 * A sweeper that fires at the deadline itself will one day fire a minute late,
 * and a minute late is the difference between free and a night's charge. Six
 * hours is enough to survive a missed run without shortening a hold to the
 * point of uselessness.
 */
export const HOLD_SAFETY_MARGIN_MS = 6 * 60 * 60 * 1000;

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

