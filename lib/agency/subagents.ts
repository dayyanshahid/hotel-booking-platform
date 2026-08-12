import { canAtLeast, capabilitiesOf, permissionOf, PERMISSION_RANK } from "./types";
import type { Agent, AgentCapabilities, AgentPermission, LedgerEntry } from "./types";

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
