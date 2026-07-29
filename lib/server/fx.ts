import "server-only";
import { CURRENCY_CODES, CURRENCY_TABLE } from "@/lib/currencies";
import { __setRateResolver } from "@/lib/format";
import type { CurrencyCode } from "@/lib/types";

/**
 * The rates of exchange the platform actually charges on.
 *
 * The built-in table in `lib/currencies.ts` describes itself as indicative and
 * not a quote, which was honest while every price was simulated. It is not
 * honest now: Hotelbeds quotes in the destination's currency and TourMind in
 * yuan, so that table is what decides the number on an agency's invoice. An
 * operator has to be able to set it, and to be held to it.
 *
 * So rates are stored, audited on every change, and effective on the next
 * request. Nothing here fetches a market feed — the client asked for rates they
 * control, and a margin that moves because a third party moved is a margin
 * nobody chose.
 *
 * Rates are expressed the same way the built-in table is: units of the currency
 * per one SAR. Keeping one basis means a conversion is two multiplications and
 * never a chain of pair lookups that can disagree with itself.
 */

export interface FxRate {
  currency: CurrencyCode;
  /** Units of this currency per 1 SAR. */
  perSar: number;
  /** Who set it and when, so a margin question has an answer. */
  setBy?: string;
  setAt?: string;
}

/**
 * A rate a typo cannot escape.
 *
 * The bounds are deliberately wide — currencies genuinely range from pennies to
 * thousands per riyal — but zero, negatives and infinities are always a mistake
 * and would silently produce free or unpayable bookings.
 */
export const FX_RANGE = { min: 0.000001, max: 100000 } as const;

export function isSaneRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= FX_RANGE.min && value <= FX_RANGE.max;
}

/**
 * The operator's overrides, cached for synchronous use.
 *
 * `convertCurrency` runs inside supplier adapters, in loops, per rate, and
 * cannot become async without rewriting every adapter. The same approach the
 * markup override already uses: primed at the top of anything that prices.
 */
let overrides: Partial<Record<CurrencyCode, number>> = {};

export function setFxOverrides(next: Partial<Record<CurrencyCode, number>>): void {
  const clean: Partial<Record<CurrencyCode, number>> = {};
  for (const [code, value] of Object.entries(next)) {
    if (CURRENCY_CODES.includes(code as CurrencyCode) && isSaneRate(value)) {
      clean[code as CurrencyCode] = value;
    }
  }
  overrides = clean;
  // Everything that converts money goes through `lib/format`, including the
  // supplier adapters. Pointing it here is what makes an operator's rate the
  // rate an agency is actually charged, rather than a number on a screen.
  __setRateResolver(rateFor);
}

/** What one SAR buys today — an operator's rate if set, otherwise the built-in. */
export function rateFor(currency: CurrencyCode): number {
  return overrides[currency] ?? CURRENCY_TABLE[currency].rateFromSar;
}

/** Every rate with its provenance, for the console and for an audit trail. */
export function currentRates(): (FxRate & { overridden: boolean })[] {
  return CURRENCY_CODES.map((currency) => ({
    currency,
    perSar: rateFor(currency),
    overridden: overrides[currency] !== undefined,
  }));
}

export function overriddenRates(): Partial<Record<CurrencyCode, number>> {
  return { ...overrides };
}
