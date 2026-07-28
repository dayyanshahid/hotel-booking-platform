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
