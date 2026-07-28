import type { AgencyOfferView, MarkupPolicy, MarkupRule } from "./types";

/**
 * Agency pricing.
 *
 * One rule, applied in one place, because a margin computed in two places
 * eventually disagrees with itself — and the number an agent quotes a customer
 * has to match the number we invoice them against.
 *
 * Amounts are whole currency units, the same as every price in the app — the
 * catalogue's currencies are all zero-decimal in this build, so a riyal and a
 * yen are both one unit. Every result is rounded rather than left as a float,
 * because a margin carried at eight decimal places is a margin that eventually
 * disagrees with the invoice by a unit.
 */

/** Rounds half away from zero, so a .5 never silently favours one side. */
function round(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function applyAgencyMarkup(cost: number, rule: MarkupRule): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  if (rule.mode === "fixed") {
    return cost + Math.max(0, round(rule.value));
  }
  // A negative percent would sell below cost; a rule that does that is a
  // configuration error, not a discount we should silently honour.
  const percent = Math.max(0, rule.value);
  return round(cost * (1 + percent / 100));
}

/**
 * The rule that applies to a stay in this country.
 *
 * First match wins rather than most-specific, because the overrides are a short
 * list an agency maintains by hand and "the one I put in for Saudi Arabia"
 * should be the one that fires. A duplicate country is a data-entry mistake,
 * not a precedence puzzle to solve at runtime.
 */
export function ruleFor(policy: MarkupPolicy, countryCode?: string): MarkupRule {
  if (!countryCode) return policy.default;
  const needle = countryCode.toUpperCase();
  const override = policy.overrides.find((o) => o.countryCode.toUpperCase() === needle);
  return override?.rule ?? policy.default;
}

export function agencyOfferView(
  offerId: string,
  cost: number,
  currency: string,
  policy: MarkupPolicy,
  countryCode?: string,
): AgencyOfferView {
  const sell = applyAgencyMarkup(cost, ruleFor(policy, countryCode));
  return { offerId, cost, sell, margin: sell - cost, currency };
}

/**
 * Margin as a percentage of the selling price.
 *
 * Of *sell*, not of cost. An agent quoting a customer thinks in "what share of
 * this invoice is mine"; a 20% markup on cost is a 16.7% margin on sell, and
 * showing the larger number next to a price the customer can see would be
 * flattering rather than useful.
 */
export function marginPercent(view: AgencyOfferView): number {
  if (view.sell <= 0) return 0;
  return Math.round((view.margin / view.sell) * 1000) / 10;
}

/** A policy from a bare rule — used when migrating older stored agencies. */
export function policyFrom(rule: MarkupRule): MarkupPolicy {
  return { default: rule, overrides: [] };
}
