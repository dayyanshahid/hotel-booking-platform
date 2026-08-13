import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import {
  getAgency,
  getAgentByEmail,
  listAgencyBookings,
  listAgents,
  listLedger,
  saveAgent,
} from "@/lib/agency/store";
import { readCapabilities } from "@/lib/agency/types";
import {
  allocatableBy,
  chainOf,
  descendantsOf,
  mayGrantCapabilities,
  mayGrantPermission,
  mayManage,
  teamRollup,
} from "@/lib/agency/subagents";
import type { Agent, AgentCapabilities, AgentPermission, MarkupRule } from "@/lib/agency/types";

/**
 * The people who work on an agency's account, and the people beneath them.
 *
 * An agency is not always one desk. A parent account creates sub-agents and
 * hands each of them part of what it holds — some of the credit line, some of
 * the rights, a margin to sell at — so almost everything here is a question
 * about the grantor rather than about the account being created. Nobody hands
 * down what they do not hold, and nobody allocates credit they were not given.
 */

/** Anything we do not recognise is the least a login can be given. */
function readPermission(value: unknown): AgentPermission {
  return value === "viewOnly" || value === "booking" || value === "issue" ? value : "issue";
}

/**
 * A markup rule, or nothing.
 *
 * Nothing means "sell at the agency's own rates", which is not the same as a
 * rule of zero — that would be an instruction to sell at cost.
 */
function readMarkup(value: unknown): MarkupRule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const mode = input.mode === "fixed" ? "fixed" : input.mode === "percent" ? "percent" : null;
  if (!mode) return undefined;
  const raw = typeof input.value === "number" ? input.value : Number(input.value);
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  // A percent beyond this is a typo — 500% is not a margin, it is a missing
  // decimal point — and it would quote a customer a price nobody could explain.
  if (mode === "percent" && raw > 100) return undefined;
  return { mode, value: Math.round(raw), currency: typeof input.currency === "string" ? input.currency : undefined };
}

/** An allocation in whole currency units, or nothing. Zero is a real answer. */
function readAllocation(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return Math.round(raw);
}

/**
 * The list, scoped to what the reader is entitled to see.
 *
 * An administrator runs the agency and sees all of it. Anyone else sees
 * themselves and the people beneath them — a sub-agent has no business reading
 * a peer's credit allocation, which is a commercial arrangement between that
 * peer and their own manager.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [agents, agency, entries, bookings] = await Promise.all([
    listAgents(session.agencyId),
    getAgency(session.agencyId),
    /*
     * The whole ledger, not the recent page of it.
     *
     * `listLedger` defaults to fifty entries because that is a statement's
     * worth. A sub-limit measured against a truncated ledger under-reports
     * spending, and it does so silently and in the generous direction — a desk
     * that had used its allocation would show headroom it does not have.
     */
    listLedger(session.agencyId, Number.MAX_SAFE_INTEGER),
    listAgencyBookings(session.agencyId),
  ]);
  const agencyLimit = agency?.credit.limit ?? 0;

  /*
   * Figures, computed here, sent as numbers.
   *
   * The alternative is sending the ledger and every booking to the browser so
   * it can add them up — which hands an account the agency's whole commercial
   * history to render the six figures it is allowed to see. It also keeps the
   * arithmetic in one place: the same functions decide what a screen shows and
   * what a POST is allowed to do.
   */
  const summary = teamRollup(agents, entries, bookings, agencyLimit);

  if (session.role === "admin") return ok({ agents, summary, agencyLimit });

  /*
   * A sub-agent sees its own branch and nothing sideways — and the summary is
   * filtered with it, or the payload would carry a peer's production for
   * anybody who opened the network tab.
   */
  const mine = new Set([session.agentId, ...descendantsOf(session.agentId, agents).map((a) => a.id)]);
  return ok({
    agents: agents.filter((a) => mine.has(a.id)),
    summary: Object.fromEntries(Object.entries(summary).filter(([id]) => mine.has(id))),
    agencyLimit,
  });
}

/**
 * Everything a grant has to satisfy, gathered once.
 *
 * Both verbs ask the same questions in the same order, and asking them in two
 * places is how the create path and the edit path drift apart until one of them
 * lets something through.
 */
async function guard(
  session: NonNullable<Awaited<ReturnType<typeof activeAgent>>>,
): Promise<{ actor: Agent; agents: Agent[]; agencyLimit: number } | null> {
  const [actor, agents, agency] = await Promise.all([
    getAgentByEmail(session.email),
    listAgents(session.agencyId),
    getAgency(session.agencyId),
  ]);
  if (!actor || !agency) return null;
  return { actor, agents, agencyLimit: agency.credit.limit };
}

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const context = await guard(session);
  if (!context) return fail("validation", "error.notFound", locale, { status: 404 });
  const { actor, agents, agencyLimit } = context;

  const body = await readJson<{
    email: string;
    name: string;
    role?: Agent["role"];
    permission?: AgentPermission;
    capabilities?: Partial<AgentCapabilities>;
    parentId?: string;
    creditLimit?: number;
    markup?: MarkupRule;
  }>(req);
  if (!body?.email || !isEmail(body.email) || !body.name?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  /*
   * Who this account will answer to.
   *
   * An administrator may place somebody at the top of the agency or beneath a
   * named parent. Anybody else is creating a sub-agent of their own, and saying
   * so is not optional — an agent who could nominate someone else's parent
   * could spend someone else's allocation.
   */
  const parentId = actor.role === "admin" ? (body.parentId ?? actor.id) : actor.id;
  const parent = agents.find((a) => a.id === parentId);
  if (!parent) return fail("validation", "error.notFound", locale, { status: 404 });
  /*
   * You cannot share a pool you were never given.
   *
   * An account with no allocation of its own is bounded by the agency line, so
   * "from their pool" would quietly mean "from the agency's" — and a counter
   * agent could create a sub-agent holding the whole credit line, which is the
   * exact thing the administrator-only rule existed to prevent. An agency
   * grants somebody an allocation first; that is what makes them a parent.
   */
  if (actor.role !== "admin" && actor.creditLimit === undefined) {
    return fail("policyRestriction", "agency.noPoolToShare", locale, { status: 403, action: "contactSupport" });
  }

  const byId = new Map(agents.map((a) => [a.id, a]));
  const grantor = chainOf(parent ?? actor, byId);
  const permission = readPermission(body.permission);
  const capabilities = readCapabilities(body.capabilities);

  if (!mayGrantPermission(grantor, permission)) {
    return fail("policyRestriction", "agency.grantAboveSelf", locale, { status: 403, action: "contactSupport" });
  }
  if (capabilities && !mayGrantCapabilities(grantor, capabilities)) {
    return fail("policyRestriction", "agency.grantAboveSelf", locale, { status: 403, action: "contactSupport" });
  }

  /*
   * A capped parent cannot have an uncapped child.
   *
   * That is the precise invariant, and it is narrower than "every sub-agent
   * needs a number". An administrator adding a colleague to the agency's own
   * line is not allocating anything — the colleague is bounded by the agency
   * balance exactly as everybody was before this existed, and demanding a
   * figure would turn "add a colleague" into a budgeting exercise. But a branch
   * on 4,000 creating somebody with no cap would hand them the whole line, and
   * the branch's own cap would be worth nothing.
   */
  const creditLimit = readAllocation(body.creditLimit);
  if (creditLimit === undefined && parent.creditLimit !== undefined) {
    return fail("validation", "agency.allocationRequired", locale, { status: 422, fields: { creditLimit: "required" } });
  }
  if (creditLimit !== undefined) {
    const ceiling = allocatableBy(parent, agents, agencyLimit);
    if (creditLimit > ceiling) {
      return fail("policyRestriction", "agency.allocationTooLarge", locale, {
        status: 422,
        fields: { creditLimit: String(ceiling) },
      });
    }
  }

  // An email already on another agency cannot be re-used: one address, one
  // agency, or a session could straddle two sets of rates.
  const existing = await getAgentByEmail(body.email);
  if (existing && existing.agencyId !== session.agencyId) {
    return fail("policyRestriction", "agency.emailTaken", locale, { status: 409, action: "contactSupport" });
  }
  if (existing && !mayManage(actor, existing, agents)) {
    return fail("policyRestriction", "agency.notYourSubAgent", locale, { status: 403, action: "contactSupport" });
  }

  const agent: Agent = existing ?? {
    id: `agt_${Math.random().toString(36).slice(2, 10)}`,
    agencyId: session.agencyId,
    email: body.email.trim().toLowerCase(),
    name: sanitize(body.name, 60),
    role: body.role === "admin" ? "admin" : "agent",
    permission,
    capabilities,
    parentId: parent.id,
    creditLimit,
    markup: readMarkup(body.markup),
    active: true,
    createdAt: new Date().toISOString(),
  };
  if (existing) {
    agent.name = sanitize(body.name, 60);
    agent.role = body.role === "admin" ? "admin" : "agent";
    agent.permission = permission;
    agent.capabilities = { ...agent.capabilities, ...capabilities };
    agent.parentId = parent.id;
    if (creditLimit !== undefined) agent.creditLimit = creditLimit;
    const markup = readMarkup(body.markup);
    if (markup) agent.markup = markup;
    agent.active = true;
  }
  await saveAgent(agent);
  return ok({ agent });
}

/** Suspend, restore, or change what somebody may do and spend. */
export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const context = await guard(session);
  if (!context) return fail("validation", "error.notFound", locale, { status: 404 });
  const { actor, agents, agencyLimit } = context;

  const body = await readJson<{
    agentId: string;
    active?: boolean;
    permission?: AgentPermission;
    capabilities?: Partial<AgentCapabilities>;
    creditLimit?: number;
    markup?: MarkupRule;
  }>(req);
  if (!body?.agentId) return fail("validation", "error.validation", locale, { status: 400 });
  const agent = agents.find((a) => a.id === body.agentId);
  if (!agent) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!mayManage(actor, agent, agents)) {
    return fail("policyRestriction", "agency.notYourSubAgent", locale, { status: 403, action: "contactSupport" });
  }

  const byId = new Map(agents.map((a) => [a.id, a]));
  const grantor = chainOf(actor, byId);
  const capabilities = readCapabilities(body.capabilities);
  const markup = readMarkup(body.markup);
  const creditLimit = readAllocation(body.creditLimit);

  if (body.permission && !mayGrantPermission(grantor, readPermission(body.permission))) {
    return fail("policyRestriction", "agency.grantAboveSelf", locale, { status: 403, action: "contactSupport" });
  }
  if (capabilities && !mayGrantCapabilities(grantor, capabilities)) {
    return fail("policyRestriction", "agency.grantAboveSelf", locale, { status: 403, action: "contactSupport" });
  }

  if (creditLimit !== undefined && agent.parentId) {
    /*
     * Measured against the parent's pool with this account's own share taken
     * out. Raising somebody from 1,000 to 2,000 is a 1,000 increase; measured
     * against a pool that still counts their old 1,000 as promised, every
     * increase would be refused as though it were being asked for twice.
     */
    const parent = agents.find((a) => a.id === agent.parentId);
    const ceiling = parent ? allocatableBy(parent, agents, agencyLimit, agent.id) : agencyLimit;
    if (creditLimit > ceiling) {
      return fail("policyRestriction", "agency.allocationTooLarge", locale, {
        status: 422,
        fields: { creditLimit: String(ceiling) },
      });
    }
  }

  /*
   * Suspension and adjustment are independent, and a missing field means
   * "leave it alone" for both.
   *
   * This used to be an either/or: a body carrying any adjustment took one
   * branch, and everything else fell through to `active: Boolean(body.active)`.
   * That made an absent `active` mean *suspended*, so any request the first
   * branch did not recognise silently locked the account out. It is the bug
   * that made an older deployment suspend an agent when a newer screen sent it
   * a capability change it had never heard of.
   *
   * Read separately, the two cannot collide, and a client may send both — which
   * is what lets a screen say "change this right, leave their access as it is"
   * in one request that no version of this route can misread.
   */
  const suspending = typeof body.active === "boolean" ? body.active : agent.active;

  // Removing the last admin would lock the agency out of its own settings.
  if (agent.role === "admin" && agent.active && !suspending) {
    const admins = agents.filter((a) => a.role === "admin" && a.active);
    if (admins.length <= 1) {
      return fail("policyRestriction", "agency.lastAdmin", locale, { status: 409, action: "contactSupport" });
    }
  }

  const updated: Agent = {
    ...agent,
    permission: body.permission ? readPermission(body.permission) : agent.permission,
    // Merged, not replaced: one switch at a time is how the screen sends it.
    capabilities: capabilities ? { ...agent.capabilities, ...capabilities } : agent.capabilities,
    creditLimit: creditLimit === undefined ? agent.creditLimit : creditLimit,
    markup: markup ?? agent.markup,
    active: suspending,
  };
  await saveAgent(updated);
  return ok({ agent: updated });
}
