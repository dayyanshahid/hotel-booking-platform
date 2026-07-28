/**
 * Commercial policy applied to supplier net rates.
 *
 * Scope D-03 (customer-facing price policy for taxes, fees, FX, markup and
 * promotions) is an open discovery decision. It is isolated here so changing it
 * is a config change, not a hunt through the codebase — and so no screen ever
 * performs commercial arithmetic of its own (§9.4).
 */
import { getHotelbedsConfig } from "./hotelbeds/config";

export interface MarkupResult {
  /** Customer-facing total for the stay. */
  total: number;
  /** What the platform pays the supplier — server-side only, never serialised. */
  net: number;
  markupPercent: number;
}

/**
 * The operator's override, when one has been set in the console.
 *
 * `applyMarkup` is called deep inside supplier adapters, in loops, per rate — it
 * has to stay synchronous, so the stored value is cached here and refreshed by
 * {@link primeMarkup} at the top of the request paths that price anything.
 * Undefined means nobody has overridden the deployed default.
 */
let override: number | undefined;

/** Bounds a typo can't escape: a 0% or a 900% markup are both incidents. */
export const MARKUP_RANGE = { min: 0, max: 60 } as const;

export function setMarkupOverride(percent: number | undefined): void {
  override =
    percent === undefined
      ? undefined
      : Math.min(MARKUP_RANGE.max, Math.max(MARKUP_RANGE.min, percent));
}

/** What the platform is currently adding to net. */
export function currentMarkupPercent(): number {
  return override ?? getHotelbedsConfig().markupPercent;
}

export function applyMarkup(net: number, options: { percent?: number } = {}): MarkupResult {
  const percent = options.percent ?? currentMarkupPercent();
  const total = Math.round(net * (1 + percent / 100));
  return { total, net, markupPercent: percent };
}

/**
 * Rounds a customer-facing amount to a tidy figure without ever rounding down
 * below the amount the supplier requires.
 */
export function roundUpToUnit(amount: number, unit = 1): number {
  if (unit <= 1) return Math.ceil(amount);
  return Math.ceil(amount / unit) * unit;
}
