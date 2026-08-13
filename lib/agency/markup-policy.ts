import type { MarkupPolicy, MarkupRule } from "./types";

/**
 * What makes a margin rule acceptable, in one place.
 *
 * These rules were enforced only by the settings route, which is the right
 * place for the *decision* and the wrong place for the *knowledge*: the form
 * could not tell an agency their country code was wrong until they had pressed
 * Save, and a single bad override rejected the whole request — including the
 * invoice address they had corrected in the same sitting.
 *
 * So the rules live here and both sides read them. The server still refuses;
 * the form now knows in advance what it is about to be refused for.
 */

/** A markup a customer would notice as an error. Refused rather than clamped. */
export const MAX_MARKUP_PERCENT = 60;
export const MAX_OVERRIDES = 25;

export type MarkupIssue =
  | { kind: "defaultRange" }
  | { kind: "country"; index: number }
  | { kind: "duplicate"; index: number; countryCode: string }
  | { kind: "value"; index: number }
  | { kind: "tooMany" };

export function ruleIsValid(rule: MarkupRule | undefined): boolean {
  if (!rule) return false;
  if (rule.mode !== "percent" && rule.mode !== "fixed") return false;
  if (!Number.isFinite(rule.value) || rule.value < 0) return false;
  return !(rule.mode === "percent" && rule.value > MAX_MARKUP_PERCENT);
}

/**
 * Everything wrong with a policy, rather than the first thing.
 *
 * Returning one issue at a time turns fixing three bad rows into three
 * round trips, each of which looks like a new problem appearing.
 */
export function markupIssues(policy: MarkupPolicy): MarkupIssue[] {
  const issues: MarkupIssue[] = [];
  if (!ruleIsValid(policy.default)) issues.push({ kind: "defaultRange" });
  if (policy.overrides.length > MAX_OVERRIDES) issues.push({ kind: "tooMany" });

  const seen = new Map<string, number>();
  policy.overrides.forEach((override, index) => {
    const code = override.countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      issues.push({ kind: "country", index });
    } else if (seen.has(code)) {
      /*
       * A country listed twice is ambiguous to the person who wrote it, not
       * only to whatever resolves it. Flagged on the later row, because that
       * is the one they just added and the one they will want to change.
       */
      issues.push({ kind: "duplicate", index, countryCode: code });
    } else {
      seen.set(code, index);
    }
    if (!ruleIsValid(override.rule)) issues.push({ kind: "value", index });
  });
  return issues;
}

/** What a cost sells for under a rule — the sanity check before saving. */
export function sellUnder(cost: number, rule: MarkupRule): number {
  return rule.mode === "percent" ? Math.round(cost * (1 + rule.value / 100)) : Math.round(cost + rule.value);
}
