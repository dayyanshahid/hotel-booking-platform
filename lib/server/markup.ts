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

export function applyMarkup(net: number, options: { percent?: number } = {}): MarkupResult {
  const percent = options.percent ?? getHotelbedsConfig().markupPercent;
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
