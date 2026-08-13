import { describe, expect, it } from "vitest";
import { AGENT_PRESETS, diffAgent, presetOf } from "@/lib/agency/subagents";
import type { Agent } from "@/lib/agency/types";

/**
 * Naming the common shapes, and recording who changed them.
 */

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: "agt",
  agencyId: "agc",
  email: "a@example.com",
  name: "An agent",
  role: "agent",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("the shapes an agency hires into", () => {
  it("gives every preset a distinct combination", () => {
    /*
     * Two presets that resolve the same way are a menu with a duplicate on it:
     * whichever is listed first wins every lookup, and the other can be chosen
     * and never seen again.
     */
    const shapes = AGENT_PRESETS.map((p) => `${p.permission}/${p.capabilities.hold}/${p.capabilities.nonRefundable}`);
    expect(new Set(shapes).size).toBe(AGENT_PRESETS.length);
  });

  it("recognises an account configured to a preset", () => {
    for (const preset of AGENT_PRESETS) {
      expect(presetOf(agent({ permission: preset.permission, capabilities: preset.capabilities }))).toBe(preset.id);
    }
  });

  it("calls a bespoke combination nothing at all", () => {
    /*
     * The point of the null. An account trusted to issue but not to sell
     * non-refundable stock is a real arrangement and matches no preset;
     * labelling it "Senior" would have the row contradict its own switches.
     */
    const bespoke = agent({ permission: "issue", capabilities: { hold: true, nonRefundable: false } });
    expect(presetOf(bespoke)).toBeNull();
  });

  it("reads an account that predates presets as the senior shape", () => {
    // No permission and no capabilities resolves to issue with both rights,
    // which is exactly what "senior" means — so the row can label it.
    expect(presetOf(agent())).toBe("senior");
  });

  it("never promotes anyone to administrator", () => {
    // A preset describes what somebody may do with money, not whether they run
    // the agency. Folding the two together hands settings to a counter agent.
    expect(AGENT_PRESETS.every((p) => !("role" in p))).toBe(true);
  });
});

describe("what changed, for the record", () => {
  it("notices nothing when nothing moved", () => {
    const before = agent({ permission: "issue" });
    expect(diffAgent(before, { ...before })).toEqual([]);
  });

  it("records each field separately", () => {
    /*
     * "Raised to issue and given the right to hold" is two decisions. A log
     * that records them as one lump cannot answer which of them is disputed.
     */
    const before = agent({ permission: "booking", capabilities: { hold: false, nonRefundable: false } });
    const after = agent({ permission: "issue", capabilities: { hold: true, nonRefundable: false } });
    const fields = diffAgent(before, after).map((c) => c.field);
    expect(fields).toEqual(["permission", "hold"]);
  });

  it("carries both sides, so a reversal needs no guess", () => {
    const change = diffAgent(agent({ creditLimit: 1000 }), agent({ creditLimit: 2500 }))[0];
    expect(change).toEqual({ field: "creditLimit", before: "1000", after: "2500" });
  });

  it("does not invent a change when a right is written down for the first time", () => {
    /*
     * An older account carries no capabilities and resolves to both rights.
     * Saving it with those same rights made explicit is not a change anybody
     * made, and logging one would accuse an administrator of a decision.
     */
    const before = agent({ permission: "issue", capabilities: undefined });
    const after = agent({ permission: "issue", capabilities: { hold: true, nonRefundable: true } });
    expect(diffAgent(before, after)).toEqual([]);
  });

  it("records a suspension and a markup in terms a person can read", () => {
    const changes = diffAgent(
      agent({ active: true, markup: { mode: "percent", value: 10 } }),
      agent({ active: false, markup: { mode: "fixed", value: 25, currency: "USD" } }),
    );
    expect(changes).toContainEqual({ field: "markup", before: "+10%", after: "+25 USD" });
    expect(changes).toContainEqual({ field: "active", before: "true", after: "false" });
  });
});
