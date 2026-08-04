import type { CancellationPolicy } from "@/lib/types";

/**
 * The three things an agent's customer actually asks about cancellation.
 *
 * The panel used to offer one checkbox, "free cancellation", which hides the
 * case that matters most when a customer is deciding: a rate they can cancel
 * late and lose a night on, rather than lose everything. A family who may have
 * to move their dates is buying that difference.
 *
 * - `free`          — there is a window in which cancelling costs nothing.
 * - `partial`       — cancelling can cost part of the stay rather than all of it.
 * - `nonRefundable` — it cannot be cancelled at all.
 *
 * These deliberately overlap. Nearly every refundable rate has a free window,
 * and the useful second question is what happens after it — so a rate that is
 * free until Thursday and half price afterwards is both `free` and `partial`,
 * and appears under either. Forcing them apart would mean an agent ticking
 * "free cancellation" no longer saw the rate that is free until Thursday,
 * which is plainly not what they asked for. (The facet counts therefore do not
 * sum to the total, which was already true: these are per-property questions,
 * and one property has rates of several kinds.)
 */
export type RateCondition = "free" | "partial" | "nonRefundable";

export const RATE_CONDITIONS: RateCondition[] = ["free", "partial", "nonRefundable"];

/**
 * Anything below this share of the stay is a part-charge rather than the lot.
 *
 * Suppliers round penalties to nights and to their own currency, so a "full"
 * charge lands a rounding error short of the total often enough that an exact
 * comparison would file half the market as partial.
 */
const FULL_CHARGE = 0.95;

/**
 * Which of the three a policy is — one rate can be more than one.
 *
 * Deliberately does not consult the clock. A deadline that has already passed
 * makes a rate effectively non-refundable, but "effectively" is a judgement the
 * booking path makes with the supplier's own answer in hand; a *filter* that
 * silently reclassified rates as the day wore on would give two different
 * answers to the same search an hour apart, and explain neither.
 *
 * `stayTotal` is what the rate costs, and it is what makes `partial` mean
 * anything: a £106 penalty is the whole booking on a £106 stay and a third of
 * it on a £300 one. Reading only the first step — which is what this did at
 * first — classified every one of the 90-in-195 free-then-part-charge rates as
 * plain "free", so the option the client asked for matched nothing at all and
 * "free cancellation" quietly included rates that charge you.
 */
export function conditionsOf(policy: CancellationPolicy, stayTotal: number): RateCondition[] {
  if (!policy.refundable) return ["nonRefundable"];

  const found: RateCondition[] = [];
  const firstFee = policy.steps.length ? policy.steps[0].fee : 0;
  if (policy.freeUntil && firstFee <= 0) found.push("free");

  /*
   * A part-charge is any penalty that is neither nothing nor the whole stay.
   * A rate with no free window at all is partial by construction: it can be
   * cancelled, and it costs something to do it from the moment it is booked.
   */
  const partCharge = policy.steps.some(
    (step) => step.fee > 0 && (stayTotal <= 0 || step.fee < stayTotal * FULL_CHARGE),
  );
  if (partCharge || !found.length) found.push("partial");

  return found;
}
