import type { CancellationPolicy } from "@/lib/types";

/**
 * The three answers an agent's customer actually wants about cancellation.
 *
 * The panel has only ever offered "free cancellation", a single checkbox, which
 * hides the middle case: a rate that *can* be cancelled but costs a night to do
 * it. That is not the same product as a free one and it is not the same product
 * as a non-refundable one, and an agent quoting a family who may need to change
 * dates has to be able to tell them apart before they quote, not after.
 *
 * - `free`     — cancellable at no cost up to a stated deadline.
 * - `partial`  — cancellable, but a fee applies from the moment it is booked.
 * - `nonRefundable` — cannot be cancelled at all.
 */
export type RateCondition = "free" | "partial" | "nonRefundable";

export const RATE_CONDITIONS: RateCondition[] = ["free", "partial", "nonRefundable"];

/**
 * Which of the three a policy is.
 *
 * Deliberately does not consult the clock. A deadline that has already passed
 * makes a rate effectively non-refundable, but "effectively" is a judgement the
 * booking path makes with the supplier's own answer in hand — a *filter* that
 * silently reclassified rates as the day wore on would give two different
 * answers to the same search an hour apart, and neither would be explained.
 */
export function conditionOf(policy: CancellationPolicy): RateCondition {
  if (!policy.refundable) return "nonRefundable";
  /*
   * A free window is a deadline with nothing to pay before it. Some suppliers
   * state the deadline and then a first step that already carries a fee, which
   * is a partial rate wearing a free rate's shape — so the steps decide when
   * they disagree with `freeUntil`.
   */
  const firstFee = policy.steps.length ? policy.steps[0].fee : 0;
  if (policy.freeUntil && firstFee <= 0) return "free";
  return "partial";
}
