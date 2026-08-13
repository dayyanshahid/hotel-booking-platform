import { describe, expect, it } from "vitest";
import { orderedTree, teamRollup } from "@/lib/agency/subagents";
import type { Agent, LedgerEntry } from "@/lib/agency/types";
import type { TeamBooking } from "@/lib/agency/subagents";

/**
 * What a parent needs to see beside a limit they set.
 *
 * An allocation on its own does not answer the question the screen exists for
 * — raise it, lower it, or leave it alone. Only the pair does.
 */

const LIMIT = 10_000;

const agent = (id: string, over: Partial<Agent> = {}): Agent => ({
  id,
  agencyId: "agc",
  email: `${id}@example.com`,
  name: id,
  role: "agent",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const spend = (agentId: string, amount: number): LedgerEntry => ({
  id: `l_${agentId}_${amount}`,
  agencyId: "agc",
  at: "2026-02-01T00:00:00.000Z",
  amount: -amount,
  currency: "USD",
  kind: "booking",
  agentId,
  note: "",
});

const sale = (agentId: string, sell: number, cost: number, status = "confirmed"): TeamBooking => ({
  agentId,
  status,
  sell,
  cost,
});

describe("a team's figures, account by account", () => {
  const agents = [
    agent("boss", { role: "admin" }),
    agent("branch", { parentId: "boss", creditLimit: 4000 }),
    agent("desk", { parentId: "branch", creditLimit: 1500 }),
  ];

  it("counts a subtree's spending against the account at its head", () => {
    /*
     * The branch did not spend this; its desk did. A parent is accountable for
     * what happens beneath them, and a figure that stopped at their own
     * bookings would show a branch at zero while its allocation drained.
     */
    const rollup = teamRollup(agents, [spend("desk", 900)], [], LIMIT);
    expect(rollup.desk.spent).toBe(900);
    expect(rollup.branch.spent).toBe(900);
    expect(rollup.boss.spent).toBe(900);
  });

  it("measures what is left against the account's own pool, not the agency's", () => {
    const rollup = teamRollup(agents, [spend("desk", 900)], [], LIMIT);
    expect(rollup.desk.pool).toBe(1500);
    expect(rollup.desk.left).toBe(600);
    expect(rollup.branch.pool).toBe(4000);
    expect(rollup.branch.left).toBe(3100);
  });

  it("gives an account with no cap of its own the agency line", () => {
    // An administrator is bounded by the agency, not by a personal allowance.
    const rollup = teamRollup(agents, [], [], LIMIT);
    expect(rollup.boss.pool).toBe(LIMIT);
  });

  it("separates what is promised from what is gone", () => {
    /*
     * Two different questions. "Can I give somebody else 3,000" reads
     * `allocated`; "has anything been bought" reads `spent`. A screen that
     * showed one number would answer whichever the reader assumed.
     */
    const rollup = teamRollup(agents, [spend("desk", 900)], [], LIMIT);
    expect(rollup.branch.allocated).toBe(1500);
    expect(rollup.branch.spent).toBe(900);
  });

  it("never reports a negative remainder", () => {
    // Overspend is possible through a hold released late; a screen showing
    // "-200 left" invites a support call rather than an action.
    const rollup = teamRollup(agents, [spend("desk", 2000)], [], LIMIT);
    expect(rollup.desk.left).toBe(0);
  });

  it("totals production over the subtree, and keeps the margin", () => {
    const rollup = teamRollup(agents, [], [sale("desk", 1000, 800), sale("branch", 500, 400)], LIMIT);
    expect(rollup.branch.bookings).toBe(2);
    expect(rollup.branch.sell).toBe(1500);
    expect(rollup.branch.margin).toBe(300);
    expect(rollup.desk.bookings).toBe(1);
  });

  it("leaves cancelled and failed bookings out of production", () => {
    /*
     * The same rule the book of business uses. Counting a cancellation would
     * credit a desk for a sale it handed back, on the screen where somebody
     * decides how much credit to trust them with.
     */
    const rollup = teamRollup(
      agents,
      [],
      [sale("desk", 1000, 800), sale("desk", 9000, 8000, "cancelled"), sale("desk", 500, 400, "failed")],
      LIMIT,
    );
    expect(rollup.desk.bookings).toBe(1);
    expect(rollup.desk.sell).toBe(1000);
  });

  it("attributes nothing to anyone for entries that name no agent", () => {
    // Movements an operator made against the whole line, and everything older
    // than sub-agents. Guessing an owner would accuse somebody.
    const orphan: LedgerEntry = { ...spend("desk", 700), agentId: undefined };
    const rollup = teamRollup(agents, [orphan], [], LIMIT);
    expect(rollup.desk.spent).toBe(0);
    expect(rollup.boss.spent).toBe(0);
  });
});

describe("the team as a shape rather than a list", () => {
  const rows = (agents: Agent[]) => orderedTree(agents).map((r) => `${"·".repeat(r.depth)}${r.agent.id}`);

  it("puts every account directly beneath the one it answers to", () => {
    const agents = [
      agent("desk", { parentId: "branch", name: "Desk" }),
      agent("boss", { role: "admin", name: "Boss" }),
      agent("branch", { parentId: "boss", name: "Branch" }),
    ];
    expect(rows(agents)).toEqual(["boss", "·branch", "··desk"]);
  });

  it("sorts administrators first, then by name, so the order does not wander", () => {
    /*
     * The store returns whatever order it happens to hold. A list that
     * reshuffles between reads makes the reader re-find the row they were
     * looking at, on a screen where the next click changes somebody's credit.
     */
    const agents = [
      agent("zoe", { name: "Zoe" }),
      agent("amir", { name: "Amir" }),
      agent("chief", { role: "admin", name: "Chief" }),
    ];
    expect(rows(agents)).toEqual(["chief", "amir", "zoe"]);
  });

  it("treats an account whose parent is not in the list as a root", () => {
    // What a sub-agent sees of their own branch: their parent is not in the
    // payload, and they are the top of everything they can reach.
    const agents = [agent("branch", { parentId: "boss" }), agent("desk", { parentId: "branch" })];
    expect(rows(agents)).toEqual(["branch", "·desk"]);
  });

  it("still lists an account a cycle would otherwise hide", () => {
    /*
     * Unreachable from any root, so the walk never sees it. Dropping it would
     * be the worst outcome: an account that can spend the agency's money and
     * does not appear on the screen that governs it.
     */
    const agents = [agent("a", { parentId: "b" }), agent("b", { parentId: "a" })];
    expect(orderedTree(agents)).toHaveLength(2);
  });
});
