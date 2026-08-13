import { describe, expect, it } from "vitest";
import { MAX_MARKUP_PERCENT, markupIssues, ruleIsValid, sellUnder } from "@/lib/agency/markup-policy";
import type { MarkupPolicy } from "@/lib/agency/types";

/**
 * The rules the settings form and the settings route must agree on.
 *
 * They disagreed by construction before this: the route knew them and the form
 * did not, so an agency learned their country code was wrong by pressing Save
 * and having the whole request refused — including the invoice address they had
 * corrected in the same sitting.
 */

const policy = (over: Partial<MarkupPolicy> = {}): MarkupPolicy => ({
  default: { mode: "percent", value: 10 },
  overrides: [],
  ...over,
});

describe("a rule on its own", () => {
  it("accepts an ordinary percentage and an ordinary fixed amount", () => {
    expect(ruleIsValid({ mode: "percent", value: 12.5 })).toBe(true);
    expect(ruleIsValid({ mode: "fixed", value: 40 })).toBe(true);
  });

  it("refuses a percentage a customer would notice as an error", () => {
    expect(ruleIsValid({ mode: "percent", value: MAX_MARKUP_PERCENT })).toBe(true);
    expect(ruleIsValid({ mode: "percent", value: MAX_MARKUP_PERCENT + 0.5 })).toBe(false);
  });

  it("does not cap a fixed amount by the percentage ceiling", () => {
    // 60 is a ceiling on a *rate*. A flat 200 on a long stay is ordinary, and
    // clamping it with the percentage rule would silently reprice a policy.
    expect(ruleIsValid({ mode: "fixed", value: 200 })).toBe(true);
  });

  it("refuses a negative margin and anything that is not a number", () => {
    expect(ruleIsValid({ mode: "percent", value: -1 })).toBe(false);
    expect(ruleIsValid({ mode: "percent", value: Number.NaN })).toBe(false);
  });
});

describe("everything wrong with a policy, not the first thing", () => {
  it("says nothing about a policy that is fine", () => {
    expect(markupIssues(policy())).toEqual([]);
  });

  it("reports every bad row, so fixing three is not three round trips", () => {
    const issues = markupIssues(
      policy({
        overrides: [
          { countryCode: "", rule: { mode: "percent", value: 10 } },
          { countryCode: "SAU", rule: { mode: "percent", value: 10 } },
          { countryCode: "AE", rule: { mode: "percent", value: 90 } },
        ],
      }),
    );
    expect(issues.filter((i) => i.kind === "country")).toHaveLength(2);
    expect(issues.filter((i) => i.kind === "value")).toHaveLength(1);
  });

  it("flags a country listed twice on the row that was added last", () => {
    /*
     * The later row is the one somebody just typed and the one they will want
     * to change; blaming the first would send them to edit a rule that was
     * right when they wrote it.
     */
    const issues = markupIssues(
      policy({
        overrides: [
          { countryCode: "SA", rule: { mode: "percent", value: 10 } },
          { countryCode: "sa", rule: { mode: "percent", value: 15 } },
        ],
      }),
    );
    expect(issues).toContainEqual({ kind: "duplicate", index: 1, countryCode: "SA" });
  });

  it("catches a broken default even when every override is fine", () => {
    const issues = markupIssues(policy({ default: { mode: "percent", value: 500 } }));
    expect(issues).toEqual([{ kind: "defaultRange" }]);
  });
});

describe("what a cost sells for", () => {
  it("adds a percentage, and adds a flat amount", () => {
    expect(sellUnder(1000, { mode: "percent", value: 10 })).toBe(1100);
    expect(sellUnder(1000, { mode: "fixed", value: 150 })).toBe(1150);
  });

  it("rounds to whole units, because a quote is not shown in fractions", () => {
    expect(sellUnder(999, { mode: "percent", value: 12.5 })).toBe(1124);
  });
});
