import { describe, expect, it } from "vitest";
import {
  allocatableBy,
  allocatedToChildren,
  chainOf,
  descendantsOf,
  effectiveCapabilities,
  effectivePermission,
  headroomFor,
  mayGrantCapabilities,
  mayGrantPermission,
  mayManage,
  poolOf,
  spentUnder,
} from "@/lib/agency/subagents";
import type { Agent, LedgerEntry } from "@/lib/agency/types";

/**
 * Users beneath users, and a pool that is shared rather than copied.
 *
 * The two ways this goes wrong are both silent. Rights can leak downward — a
 * parent who may not do something creating somebody who may — and credit can be
 * conjured, where allocating to three sub-agents hands out more than the parent
 * ever held. Neither shows up as an error; both show up as an agency spending
 * money it does not have, or an agent doing something they were barred from.
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

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `led_${Math.random().toString(36).slice(2)}`,
  agencyId: "agc",
  at: "2026-02-01T00:00:00.000Z",
  amount: -100,
  currency: "USD",
  kind: "booking",
  note: "A booking",
  ...over,
});

/* The shape used throughout: an owner, a branch under them, a desk under that. */
const owner = agent({ id: "owner", role: "admin", permission: "issue" });
const branch = agent({ id: "branch", parentId: "owner", permission: "booking", creditLimit: 5_000 });
const desk = agent({ id: "desk", parentId: "branch", permission: "booking", creditLimit: 2_000 });
const family = [owner, branch, desk];

describe("who answers for whom", () => {
  it("walks from an account up to the top", () => {
    expect(chainOf(desk, new Map(family.map((a) => [a.id, a]))).map((a) => a.id)).toEqual([
      "desk",
      "branch",
      "owner",
    ]);
  });

  it("finds everyone beneath an account, however deep", () => {
    // Not just direct children: a limit on the branch has to account for the
    // desk beneath it, or the second level is free money.
    expect(descendantsOf("owner", family).map((a) => a.id)).toEqual(["branch", "desk"]);
    expect(descendantsOf("desk", family)).toEqual([]);
  });

  it("stops rather than hangs if stored data points in a circle", () => {
    /*
     * Nothing in the API can write this — a parent is picked from accounts that
     * already exist — but this reads stored data, which outlives the code that
     * wrote it, and the failure mode of a naive walk is a hung request rather
     * than a refused one.
     */
    const a = agent({ id: "a", parentId: "b" });
    const b = agent({ id: "b", parentId: "a" });
    const byId = new Map([a, b].map((x) => [x.id, x]));
    expect(chainOf(a, byId).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("rights only ever narrow going down", () => {
  it("takes the tightest permission in the chain, not the one on the row", () => {
    /*
     * The desk's own record says booking, and so does the branch's. Demote the
     * branch to view-only and the desk cannot book either — otherwise a
     * demotion is undone by anybody who was already underneath.
     */
    const demoted = { ...branch, permission: "viewOnly" as const };
    expect(effectivePermission([desk, demoted, owner])).toBe("viewOnly");
    expect(effectivePermission([desk, branch, owner])).toBe("booking");
  });

  it("withdraws a capability from everyone below the account that lost it", () => {
    const barred = { ...branch, capabilities: { nonRefundable: false } };
    const rights = effectiveCapabilities([desk, barred, owner]);
    expect(rights.nonRefundable).toBe(false);
    // The right the branch kept is untouched: this narrows, it does not blanket.
    expect(rights.hold).toBe(true);
  });

  it("lets a parent grant what they hold, including all of it", () => {
    // Equal is fine — an administrator may create another administrator, and a
    // branch manager may create a deputy who does the same job.
    expect(mayGrantPermission([branch, owner], "booking")).toBe(true);
    expect(mayGrantPermission([branch, owner], "viewOnly")).toBe(true);
  });

  it("refuses a grant above the grantor", () => {
    // The hole this closes: a booking-only manager creating an issuer and
    // signing in as them.
    expect(mayGrantPermission([branch, owner], "issue")).toBe(false);
  });

  it("refuses a capability the grantor does not have", () => {
    const barred = [{ ...branch, capabilities: { hold: false } }, owner];
    expect(mayGrantCapabilities(barred, { hold: true })).toBe(false);
    expect(mayGrantCapabilities(barred, { nonRefundable: true })).toBe(true);
    // Handing down a *withheld* right is always allowed: it is a restriction.
    expect(mayGrantCapabilities(barred, { hold: false })).toBe(true);
  });
});

describe("a pool that is shared, not copied", () => {
  it("bounds an account with no allocation by the agency line", () => {
    // Every agent that existed before sub-agents did. Nothing about them
    // changes, which is the whole reason absence does not mean zero.
    expect(poolOf(owner, 25_000)).toBe(25_000);
    expect(poolOf(branch, 25_000)).toBe(5_000);
  });

  it("counts what is promised to children separately from what is spent", () => {
    expect(allocatedToChildren("owner", family)).toBe(5_000);
    expect(allocatedToChildren("branch", family)).toBe(2_000);
  });

  it("leaves a suspended sub-agent's allocation out of the reckoning", () => {
    /*
     * They cannot spend it, and counting it would keep a parent locked out of
     * their own headroom because of somebody who left the company.
     */
    const gone = [owner, { ...branch, active: false }, desk];
    expect(allocatedToChildren("owner", gone)).toBe(0);
  });

  it("will not let a parent hand out more than they hold", () => {
    // The branch holds 5,000 and has already promised 2,000 to the desk.
    expect(allocatableBy(branch, family, 25_000)).toBe(3_000);
  });

  it("measures an edit against the pool without that account's own share", () => {
    /*
     * Raising the desk from 2,000 to 3,000 is a 1,000 increase. Measured
     * against a pool that still counts the old 2,000 as promised, the desk
     * would appear to be asking for 3,000 on top of the 2,000 it already has,
     * and every edit upward would be refused.
     */
    expect(allocatableBy(branch, family, 25_000, "desk")).toBe(5_000);
  });

  it("never reports a negative pool, however the stored figures got there", () => {
    // An operator lowering a parent's allocation below what is already promised
    // is a real sequence. It means "allocate nothing more", not "allocate a
    // negative amount to claw it back".
    const squeezed = [{ ...branch, creditLimit: 1_000 }, desk];
    expect(allocatableBy(squeezed[0], squeezed, 25_000)).toBe(0);
  });
});

describe("what an account can actually spend", () => {
  const entries = [
    entry({ agentId: "desk", amount: -400 }),
    entry({ agentId: "branch", amount: -600 }),
  ];

  it("counts a child's spending against the parent", () => {
    // 400 by the desk and 600 by the branch itself. If the child's spend did
    // not reach the parent, the pool would not be a pool.
    expect(spentUnder("branch", family, entries)).toBe(1_000);
    expect(spentUnder("desk", family, entries)).toBe(400);
  });

  it("ignores entries nobody was attributed for", () => {
    /*
     * Everything written before this existed, and every adjustment an operator
     * makes against the whole line. Guessing at them would charge a sub-agent
     * for spending that was never theirs.
     */
    const historic = [...entries, entry({ amount: -9_000 })];
    expect(spentUnder("branch", family, historic)).toBe(1_000);
  });

  it("gives back headroom when a booking is cancelled", () => {
    const withRefund = [...entries, entry({ agentId: "desk", amount: 400, kind: "cancellation" })];
    expect(spentUnder("desk", family, withRefund)).toBe(0);
  });

  it("binds a sub-agent to the tightest allocation above them", () => {
    /*
     * The desk has 2,000 allocated and has spent 400, so on its own reading it
     * has 1,600. But the branch above it holds 5,000 and 1,000 has gone from
     * that — 4,000 left — so the desk's 1,600 is the binding figure.
     */
    expect(headroomFor([desk, branch, owner], family, entries, 25_000)).toBe(1_600);
  });

  it("lets the parent's exhaustion stop a child with room to spare", () => {
    // The point of a shared pool: a sub-agent's own allocation is a ceiling,
    // never a guarantee.
    const heavy = [entry({ agentId: "branch", amount: -4_900 })];
    expect(headroomFor([desk, branch, owner], family, heavy, 25_000)).toBe(100);
  });

  it("does not constrain an account that was never given an allocation", () => {
    /*
     * A top-level administrator. Treating the agency line as their personal
     * pool would double-count their colleagues' bookings against them, and the
     * agency balance already governs the real limit.
     */
    expect(headroomFor([owner], family, entries, 25_000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("who may administer whom", () => {
  it("lets an administrator run the whole agency", () => {
    expect(mayManage(owner, branch, family)).toBe(true);
    expect(mayManage(owner, desk, family)).toBe(true);
  });

  it("lets a parent run the people beneath them, at any depth", () => {
    expect(mayManage(branch, desk, family)).toBe(true);
  });

  it("stops an account reaching sideways or upward", () => {
    /*
     * A sub-agent editing a peer's credit limit, or their own parent's, is the
     * hierarchy defeating itself.
     */
    expect(mayManage(desk, branch, family)).toBe(false);
    const peer = agent({ id: "peer", parentId: "owner" });
    expect(mayManage(desk, peer, [...family, peer])).toBe(false);
  });

  it("stops an account editing itself", () => {
    // Otherwise the cap is advisory: raise your own limit, then spend it.
    expect(mayManage(branch, branch, family)).toBe(false);
  });

  it("stops an administrator reaching into another agency", () => {
    const outsider = agent({ id: "other", agencyId: "agc2" });
    expect(mayManage(owner, outsider, [...family, outsider])).toBe(false);
  });
});
