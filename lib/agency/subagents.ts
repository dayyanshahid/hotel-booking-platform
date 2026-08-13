import { canAtLeast, capabilitiesOf, permissionOf, PERMISSION_RANK } from "./types";
import type { Agent, AgentCapabilities, AgentPermission, LedgerEntry, MarkupRule } from "./types";

/**
 * Sub-agents: users beneath a user, inside one agency.
 *
 * An agency is not always one desk. A parent account creates the people who
 * work under it and hands each of them a share of what it holds — some of the
 * credit line, some of the rights, a margin to sell at. The word for the
 * relationship is "from their pool", and this module is what makes that
 * literal rather than decorative.
 *
 * Two rules run through all of it:
 *
 *   Nobody hands down what they do not hold. A parent barred from selling
 *   non-refundable stock cannot create a child who may, or the bar is a
 *   formality anyone can route around by making an account.
 *
 *   A pool is shared, not copied. Allocating 5,000 to a child does not create
 *   5,000 — it earmarks part of the parent's own allocation, and the child
 *   spending it leaves the parent with less.
 *
 * Both are enforced live rather than only at the moment of granting. Withdrawing
 * a right from a parent has to reach the people beneath them on the next
 * request, for the same reason a demotion does: a restriction that waits for
 * somebody to remember the children is not a restriction.
 */

/**
 * An account and everyone it answers to, nearest first.
 *
 * The chain is what every rule here reads, because a sub-agent's real authority
 * is the narrowest link in it and not the record on their own row.
 */
export function chainOf(agent: Agent, byId: Map<string, Agent>): Agent[] {
  const chain: Agent[] = [agent];
  const seen = new Set([agent.id]);
  let current = agent;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    /*
     * A cycle would hang the request rather than deny it, so it ends the walk.
     * Nothing in the API can create one — a parent is chosen from accounts that
     * already exist — but this reads stored data, and stored data has a longer
     * history than the code that writes it.
     */
    if (!parent || seen.has(parent.id)) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

/** Everyone beneath this account, at any depth. */
export function descendantsOf(agentId: string, agents: Agent[]): Agent[] {
  const children = agents.filter((a) => a.parentId === agentId);
  return children.flatMap((child) => [child, ...descendantsOf(child.id, agents)]);
}

/**
 * What an account may actually do, once its parents are taken into account.
 *
 * The narrowest link wins. A branch manager demoted to booking cannot leave a
 * sub-agent beneath them still issuing, however that sub-agent's own row reads.
 */
export function effectivePermission(chain: Agent[]): AgentPermission {
  return chain.reduce<AgentPermission>((lowest, agent) => {
    const held = permissionOf(agent);
    return PERMISSION_RANK[held] < PERMISSION_RANK[lowest] ? held : lowest;
  }, "issue");
}

/** The same reading for the rights that are not rungs: every link must allow it. */
export function effectiveCapabilities(chain: Agent[]): AgentCapabilities {
  return chain.reduce<AgentCapabilities>(
    (allowed, agent) => {
      const own = capabilitiesOf(agent);
      return {
        hold: allowed.hold && own.hold,
        nonRefundable: allowed.nonRefundable && own.nonRefundable,
      };
    },
    { hold: true, nonRefundable: true },
  );
}

/**
 * Whether a grantor may hand this permission down.
 *
 * Equal is allowed: an administrator can create another administrator, and a
 * branch manager can create a deputy who does the same job. Above is not.
 */
export function mayGrantPermission(grantor: Agent[], requested: AgentPermission): boolean {
  return canAtLeast(effectivePermission(grantor), requested);
}

/** The same question for the capability switches, one at a time. */
export function mayGrantCapabilities(
  grantor: Agent[],
  requested: Partial<AgentCapabilities>,
): boolean {
  const held = effectiveCapabilities(grantor);
  if (requested.hold && !held.hold) return false;
  if (requested.nonRefundable && !held.nonRefundable) return false;
  return true;
}

/**
 * The credit this account may commit before anyone beneath it is considered.
 *
 * An account with no allocation of its own is bounded by the agency line, which
 * is how every agent behaved before sub-agents existed and how a top-level
 * administrator should still behave.
 */
export function poolOf(agent: Agent, agencyLimit: number): number {
  return agent.creditLimit ?? agencyLimit;
}

/**
 * What this account and everyone beneath it have already committed.
 *
 * Entries carry the agent who spent them; older ones do not, and those stay
 * attributed to the agency as a whole rather than being guessed at. That is the
 * honest reading — nobody recorded who spent them — and it means a sub-limit
 * introduced today does not retroactively accuse anyone of using it up.
 */
export function spentUnder(agentId: string, agents: Agent[], entries: LedgerEntry[]): number {
  const mine = new Set([agentId, ...descendantsOf(agentId, agents).map((a) => a.id)]);
  const net = entries
    .filter((e) => e.agentId && mine.has(e.agentId))
    .reduce((sum, e) => sum + e.amount, 0);
  return Math.max(0, -net);
}

/**
 * How much of an account's pool is already promised to the people beneath it.
 *
 * Promised, not spent. A parent needs both figures and they answer different
 * questions: this one is "can I give somebody else 3,000", the other is "has
 * anything actually been bought".
 */
export function allocatedToChildren(agentId: string, agents: Agent[]): number {
  return agents
    .filter((a) => a.parentId === agentId && a.active)
    .reduce((sum, a) => sum + (a.creditLimit ?? 0), 0);
}

/**
 * The most this account could still allocate to a new sub-agent.
 *
 * `excludeId` is the account being edited: raising an existing sub-agent's
 * allocation from 1,000 to 2,000 must not be measured against a pool that still
 * counts their old 1,000 as spoken for, or every edit would look like an
 * increase on top of itself.
 */
export function allocatableBy(
  parent: Agent,
  agents: Agent[],
  agencyLimit: number,
  excludeId?: string,
): number {
  const promised = allocatedToChildren(parent.id, agents) - (excludeId
    ? (agents.find((a) => a.id === excludeId)?.creditLimit ?? 0)
    : 0);
  return Math.max(0, poolOf(parent, agencyLimit) - Math.max(0, promised));
}

/**
 * What an account can actually spend right now.
 *
 * The narrowest link again, and for the same reason: a sub-agent with 5,000
 * allocated cannot spend it if the branch above them has 200 left. Returns the
 * binding figure rather than the agent's own, because that is the number that
 * decides whether a booking goes through — and the number worth showing them.
 */
export function headroomFor(
  chain: Agent[],
  agents: Agent[],
  entries: LedgerEntry[],
  agencyLimit: number,
): number {
  return chain.reduce((tightest, agent) => {
    /*
     * A top-level account with no allocation is not a constraint of its own —
     * the agency balance already governs it, and treating the whole line as
     * this agent's personal pool would double-count spending by their peers.
     */
    if (agent.creditLimit === undefined) return tightest;
    const left = Math.max(0, poolOf(agent, agencyLimit) - spentUnder(agent.id, agents, entries));
    return Math.min(tightest, left);
  }, Number.POSITIVE_INFINITY);
}

/**
 * Whether one account may administer another.
 *
 * An administrator runs the whole agency, as before. Beyond that, a parent runs
 * the people they created and nobody else — which is the concept in a sentence,
 * and it means a sub-agent cannot reach sideways to a peer's credit limit.
 */
export function mayManage(actor: Agent, subject: Agent, agents: Agent[]): boolean {
  if (actor.agencyId !== subject.agencyId) return false;
  if (actor.id === subject.id) return false;
  if (actor.role === "admin") return true;
  return descendantsOf(actor.id, agents).some((a) => a.id === subject.id);
}

/* ------------------------------------------------------------------ rollup */

/**
 * One account's line in the team screen, as figures rather than records.
 *
 * An allocation on its own is half a fact. "This desk has 4,000" does not tell
 * a branch manager whether to raise it, lower it or leave it — only "4,000, of
 * which 2,600 is gone" does. The same is true of the people beneath them: a
 * parent is accountable for a subtree, so every figure here counts the account
 * and its descendants together.
 *
 * Computed on the server and sent as numbers. The alternative is shipping the
 * ledger and the whole booking list to the browser so it can add them up, which
 * hands every agent the agency's entire commercial history to render six
 * figures they are allowed to see.
 */
export interface AgentRollup {
  /** The pool this account draws on: its own cap, or the agency line. */
  pool: number;
  /** Promised to the accounts directly beneath it. */
  allocated: number;
  /** Committed by this account and everyone under it. */
  spent: number;
  /** What is left of the pool after spending. Never negative. */
  left: number;
  /** Bookings this account and its descendants have made, excluding cancelled. */
  bookings: number;
  /** What those bookings sold for, and what the agency kept. */
  sell: number;
  margin: number;
}

/**
 * Every account's line, keyed by id.
 *
 * Built in one pass over the team so a screen showing thirty rows does not do
 * thirty walks of the ledger. `descendantsOf` is the expensive part and it is
 * done once per account either way; what this avoids is re-filtering the
 * ledger and the bookings for each of them.
 */
export function teamRollup(
  agents: Agent[],
  entries: LedgerEntry[],
  bookings: TeamBooking[],
  agencyLimit: number,
): Record<string, AgentRollup> {
  const out: Record<string, AgentRollup> = {};
  for (const agent of agents) {
    const family = new Set([agent.id, ...descendantsOf(agent.id, agents).map((a) => a.id)]);
    const pool = poolOf(agent, agencyLimit);
    const spent = spentUnder(agent.id, agents, entries);
    /*
     * Cancelled and failed bookings are not production.
     *
     * They are still in the list and still have this agent's name on them, and
     * counting them would tell a branch manager their desk had sold something
     * it had given back — on the screen where they decide whether to raise that
     * desk's limit.
     */
    const sold = bookings.filter(
      (b) => family.has(b.agentId) && b.status !== "cancelled" && b.status !== "failed",
    );
    out[agent.id] = {
      pool,
      allocated: allocatedToChildren(agent.id, agents),
      spent,
      left: Math.max(0, pool - spent),
      bookings: sold.length,
      sell: sold.reduce((sum, b) => sum + b.sell, 0),
      margin: sold.reduce((sum, b) => sum + (b.sell - b.cost), 0),
    };
  }
  return out;
}

/** Only the parts of a booking this rollup reads. */
export interface TeamBooking {
  agentId: string;
  status: string;
  sell: number;
  cost: number;
}

/* -------------------------------------------------------------------- tree */

/** An account and how deep it sits, for a list that has to read as a shape. */
export interface TreeRow {
  agent: Agent;
  depth: number;
}

/**
 * The team in reading order: every account directly beneath the one above it.
 *
 * A flat list with "reports to Layla" on each line makes the reader hold the
 * hierarchy in their head and rebuild it by scanning. Once an agency has a
 * dozen desks under three branches that is no longer possible, and the screen
 * where somebody decides who may spend what is the wrong place to be guessing
 * at who answers to whom.
 *
 * Roots are anything whose parent is not in the list — which covers the top of
 * the agency and, for a sub-agent looking at their own branch, themselves. A
 * cycle cannot be created through the API, but a corrupted record must not hang
 * the screen, so anything not reached from a root is appended at the end rather
 * than dropped: an account you cannot place is still an account that can spend.
 */
export function orderedTree(agents: Agent[]): TreeRow[] {
  const byParent = new Map<string | undefined, Agent[]>();
  const ids = new Set(agents.map((a) => a.id));
  for (const agent of agents) {
    const key = agent.parentId && ids.has(agent.parentId) ? agent.parentId : undefined;
    const siblings = byParent.get(key) ?? [];
    siblings.push(agent);
    byParent.set(key, siblings);
  }
  // Administrators first, then by name, so the order is stable between reads
  // rather than following whatever the store happened to return.
  const sorted = (list: Agent[] = []) =>
    [...list].sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1,
    );

  const rows: TreeRow[] = [];
  const placed = new Set<string>();
  const walk = (parentId: string | undefined, depth: number) => {
    for (const agent of sorted(byParent.get(parentId))) {
      if (placed.has(agent.id)) continue;
      placed.add(agent.id);
      rows.push({ agent, depth });
      walk(agent.id, depth + 1);
    }
  };
  walk(undefined, 0);
  for (const agent of agents) if (!placed.has(agent.id)) rows.push({ agent, depth: 0 });
  return rows;
}

/* ----------------------------------------------------------------- presets */

/**
 * The three shapes an agency actually hires into.
 *
 * Setting a permission and two switches per person is fine for three staff and
 * tedious for thirty — and tedium on this screen is not a comfort problem, it
 * is how somebody ends up with the rights of whoever was configured just
 * before them. A preset is a named starting point, not a lock: every control
 * stays editable afterwards, and an account edited away from its preset simply
 * stops matching one.
 *
 * Deliberately no `role`. An administrator runs the whole agency, and a branch
 * manager is not that — folding it into a preset called "Senior" would hand
 * agency settings to anyone promoted at a desk.
 */
export type PresetId = "trainee" | "counter" | "senior";

export interface AgentPreset {
  id: PresetId;
  permission: AgentPermission;
  capabilities: AgentCapabilities;
}

export const AGENT_PRESETS: AgentPreset[] = [
  /** Looks, quotes, commits nothing. A first week. */
  { id: "trainee", permission: "viewOnly", capabilities: { hold: false, nonRefundable: false } },
  /**
   * Sells, and can reserve a room while a customer decides — but not commit
   * the agency to something nobody can hand back. The common counter job.
   */
  { id: "counter", permission: "booking", capabilities: { hold: true, nonRefundable: false } },
  /** Trusted with the credit line and with rates that cannot be undone. */
  { id: "senior", permission: "issue", capabilities: { hold: true, nonRefundable: true } },
];

/**
 * Which preset an account currently matches, if any.
 *
 * `null` is a real answer and the screen says so: an account deliberately
 * tuned away from every preset must not be shown as though it were one of
 * them, or the next person to read the row will trust the label over the
 * switches.
 */
export function presetOf(agent: Pick<Agent, "role" | "permission" | "capabilities">): PresetId | null {
  const permission = permissionOf(agent);
  const rights = capabilitiesOf(agent);
  const match = AGENT_PRESETS.find(
    (p) =>
      p.permission === permission &&
      p.capabilities.hold === rights.hold &&
      p.capabilities.nonRefundable === rights.nonRefundable,
  );
  return match?.id ?? null;
}

/* ------------------------------------------------------------------- audit */

/** One field that changed, in terms a person can read. */
export interface AgentChange {
  field: "permission" | "hold" | "nonRefundable" | "creditLimit" | "markup" | "active" | "role";
  before?: string;
  after?: string;
}

const markupText = (rule?: MarkupRule): string | undefined =>
  rule ? (rule.mode === "percent" ? `+${rule.value}%` : `+${rule.value} ${rule.currency ?? ""}`.trim()) : undefined;

/**
 * What actually changed between two versions of an account.
 *
 * One entry per field rather than one blob per request. "Raised to issue and
 * given the right to hold" is two decisions, and a log that records them as a
 * single lump cannot answer which of them somebody is disputing.
 *
 * Capabilities are compared through {@link capabilitiesOf} rather than on the
 * raw record, so an account that had no capabilities field and now has one
 * explicitly set to its previous effective value does not read as a change
 * nobody made.
 */
export function diffAgent(before: Agent, after: Agent): AgentChange[] {
  const changes: AgentChange[] = [];
  const push = (field: AgentChange["field"], a?: string, b?: string) => {
    if (a !== b) changes.push({ field, before: a, after: b });
  };

  push("permission", permissionOf(before), permissionOf(after));
  const rightsBefore = capabilitiesOf(before);
  const rightsAfter = capabilitiesOf(after);
  push("hold", String(rightsBefore.hold), String(rightsAfter.hold));
  push("nonRefundable", String(rightsBefore.nonRefundable), String(rightsAfter.nonRefundable));
  push("creditLimit", before.creditLimit?.toString(), after.creditLimit?.toString());
  push("markup", markupText(before.markup), markupText(after.markup));
  push("active", String(before.active), String(after.active));
  push("role", before.role, after.role);
  return changes;
}
