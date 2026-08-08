import type { AgencyQuote } from "./types";

/**
 * A quote's status, with expiry applied.
 *
 * Derived on read rather than written by a job: a quote is expired the moment
 * its validity passes, whether or not anything has run since. Kept server-side
 * so the list and the detail agree — and so no screen has to consult the clock
 * during a render to decide what it is looking at.
 */
export function withExpiry(quote: AgencyQuote, now = Date.now()): AgencyQuote {
  if (quote.status === "open" && new Date(quote.validUntil).getTime() < now) {
    return { ...quote, status: "expired" };
  }
  return quote;
}

/**
 * How close a quote is to lapsing.
 *
 * `validUntil` was stored, printed on the document and otherwise ignored, so
 * the first anybody knew about a quote running out was the badge changing to
 * "expired" — after the customer had gone quiet and the moment to chase had
 * passed. A quote worth several thousand is worth a phone call on the day
 * before, not a status change on the day after.
 *
 * One day, against a validity of three: the last day of its life. It has to be
 * a fraction of the validity rather than equal to it, or the flag is on every
 * quote from the moment it is written and tells nobody anything. If the
 * validity ever changes, this moves with it — which is why they sit together.
 */
export const EXPIRING_WITHIN_DAYS = 1;

/**
 * How long a new quote is good for.
 *
 * Lives here beside the expiry window rather than in the endpoint that writes
 * it, because the two numbers only mean anything against each other. Set the
 * window to the validity — which is what happened first — and every quote is
 * "expiring soon" from the moment it is raised: a mark on every row, which is
 * decoration rather than a signal.
 *
 * Long enough to be useful, short enough that the rate has not certainly gone.
 */
export const VALID_DAYS = 3;

export function daysUntilExpiry(quote: AgencyQuote, now = Date.now()): number {
  return Math.ceil((new Date(quote.validUntil).getTime() - now) / 86_400_000);
}

/** An open quote close enough to expiry to be worth chasing today. */
export function isExpiringSoon(quote: AgencyQuote, now = Date.now()): boolean {
  if (withExpiry(quote, now).status !== "open") return false;
  const days = daysUntilExpiry(quote, now);
  return days >= 0 && days <= EXPIRING_WITHIN_DAYS;
}

/**
 * The longest a quote may be pushed out to in one go.
 *
 * An agent extending a quote is holding a price they were given days ago
 * against rates that have moved since. A fortnight is enough for "the customer
 * needs until payday" and short enough that nobody quietly keeps a stale price
 * alive for a season.
 */
export const MAX_EXTENSION_DAYS = 14;

/** A new expiry, bounded, measured from now rather than from the old one. */
export function extendedExpiry(days: number, now = Date.now()): string {
  const capped = Math.min(Math.max(Math.round(days), 1), MAX_EXTENSION_DAYS);
  return new Date(now + capped * 86_400_000).toISOString();
}
