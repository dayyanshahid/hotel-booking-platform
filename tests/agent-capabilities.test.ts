import { describe, expect, it } from "vitest";
import { capabilitiesOf, permissionOf, readCapabilities } from "@/lib/agency/types";
import type { Agent } from "@/lib/agency/types";

/**
 * The two rights that are not rungs.
 *
 * `viewOnly < booking < issue` answers how far up the chain an account sits,
 * and every rung implies the ones below it. That cannot express "may reserve a
 * room but may not commit money we cannot recover", which is exactly the
 * distinction an agency wants between a counter agent and the person who signs
 * things off.
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

describe("what an account may do beside the ladder", () => {
  it("gives an account created before capabilities existed everything it already had", () => {
    /*
     * The migration rule, and the one that matters most. An agent who could
     * book yesterday could book a non-refundable rate yesterday and could hold
     * one yesterday; resolving silence to "no" would quietly remove something
     * an agency is relying on this morning.
     */
    const old = agent({ permission: undefined, capabilities: undefined });
    expect(permissionOf(old)).toBe("issue");
    expect(capabilitiesOf(old)).toEqual({ hold: true, nonRefundable: true });
  });

  it("grants a view-only account neither, whatever is stored on it", () => {
    /*
     * It cannot book at all, so a booking right on it is a contradiction the
     * screen would then have to explain. Explicit `true` does not override
     * this — the ladder is still the outer bound.
     */
    const browser = agent({ permission: "viewOnly", capabilities: { hold: true, nonRefundable: true } });
    expect(capabilitiesOf(browser)).toEqual({ hold: false, nonRefundable: false });
  });

  it("lets an agency withhold one right without withholding the other", () => {
    // The whole point. A ladder cannot say this: every rung implies the rest.
    const counter = agent({ permission: "booking", capabilities: { hold: true, nonRefundable: false } });
    expect(capabilitiesOf(counter)).toEqual({ hold: true, nonRefundable: false });

    const senior = agent({ permission: "issue", capabilities: { hold: false, nonRefundable: true } });
    expect(capabilitiesOf(senior)).toEqual({ hold: false, nonRefundable: true });
  });

  it("fills in only the half that is missing", () => {
    // A partial record is what a screen that toggles one switch will write.
    const partial = agent({ permission: "issue", capabilities: { nonRefundable: false } });
    expect(capabilitiesOf(partial)).toEqual({ hold: true, nonRefundable: false });
  });

  it("does not let issuing imply non-refundable issuing", () => {
    /*
     * The distinction the client asked for. Being trusted to commit the
     * agency's credit is not the same as being trusted to commit it to
     * something nobody can hand back.
     */
    const issuer = agent({ permission: "issue", capabilities: { nonRefundable: false } });
    expect(permissionOf(issuer)).toBe("issue");
    expect(capabilitiesOf(issuer).nonRefundable).toBe(false);
  });
});

describe("a capability change arriving from a screen", () => {
  it("keeps only the switches that were actually sent", () => {
    expect(readCapabilities({ hold: false })).toEqual({ hold: false });
    expect(readCapabilities({ hold: true, nonRefundable: false })).toEqual({ hold: true, nonRefundable: false });
  });

  it("does not treat a missing switch as a withdrawn one", () => {
    /*
     * The bug this exists to prevent. Coercing absence to `false` would have
     * one administrator withdrawing a right by changing an unrelated setting,
     * and the merge in the route would write it as though they had meant to.
     */
    const stored = { hold: false, nonRefundable: true };
    const merged = { ...stored, ...readCapabilities({ nonRefundable: false }) };
    expect(merged).toEqual({ hold: false, nonRefundable: false });
  });

  it("ignores anything that is not a boolean, whatever it looks like", () => {
    // "false", 0 and null all arrive from somewhere, and none of them is a
    // decision an administrator made on a switch.
    expect(readCapabilities({ hold: "false", nonRefundable: 0 })).toBeUndefined();
    expect(readCapabilities({ nonRefundable: null, hold: true })).toEqual({ hold: true });
  });

  it("has nothing to say about a body that carried no capabilities at all", () => {
    // The route reads `undefined` as "this request was not about rights", and
    // leaves the stored record untouched.
    expect(readCapabilities(undefined)).toBeUndefined();
    expect(readCapabilities({})).toBeUndefined();
    expect(readCapabilities("hold")).toBeUndefined();
  });
});
