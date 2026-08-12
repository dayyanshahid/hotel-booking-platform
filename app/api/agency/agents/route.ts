import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgentByEmail, listAgents, saveAgent } from "@/lib/agency/store";
import { readCapabilities } from "@/lib/agency/types";
import type { Agent, AgentCapabilities, AgentPermission } from "@/lib/agency/types";

/** Anything we do not recognise is the least a login can be given. */
function readPermission(value: unknown): AgentPermission {
  return value === "viewOnly" || value === "booking" || value === "issue" ? value : "issue";
}

/** Staff on the account. Any agent can see the list; only an admin changes it. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  return ok({ agents: await listAgents(session.agencyId) });
}

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const body = await readJson<{
    email: string;
    name: string;
    role?: Agent["role"];
    permission?: AgentPermission;
    capabilities?: Partial<AgentCapabilities>;
  }>(req);
  if (!body?.email || !isEmail(body.email) || !body.name?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  // An email already on another agency cannot be re-used: one address, one
  // agency, or a session could straddle two sets of rates.
  const existing = await getAgentByEmail(body.email);
  if (existing && existing.agencyId !== session.agencyId) {
    return fail("policyRestriction", "agency.emailTaken", locale, { status: 409, action: "contactSupport" });
  }

  const agent: Agent = existing ?? {
    id: `agt_${Math.random().toString(36).slice(2, 10)}`,
    agencyId: session.agencyId,
    email: body.email.trim().toLowerCase(),
    name: sanitize(body.name, 60),
    role: body.role === "admin" ? "admin" : "agent",
    permission: readPermission(body.permission),
    capabilities: readCapabilities(body.capabilities),
    active: true,
    createdAt: new Date().toISOString(),
  };
  if (existing) {
    agent.name = sanitize(body.name, 60);
    agent.role = body.role === "admin" ? "admin" : "agent";
    agent.permission = readPermission(body.permission);
    agent.capabilities = { ...agent.capabilities, ...readCapabilities(body.capabilities) };
    agent.active = true;
  }
  await saveAgent(agent);
  return ok({ agent });
}

/** Suspend or restore an agent. Their bookings stay; their access does not. */
export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const body = await readJson<{
    agentId: string;
    active?: boolean;
    permission?: AgentPermission;
    capabilities?: Partial<AgentCapabilities>;
  }>(req);
  if (!body?.agentId) return fail("validation", "error.validation", locale, { status: 400 });
  const agents = await listAgents(session.agencyId);
  const agent = agents.find((a) => a.id === body.agentId);
  if (!agent) return fail("validation", "error.notFound", locale, { status: 404 });

  /*
   * A permission change on its own, without touching whether they are active.
   *
   * Raising or lowering what someone may do is the everyday action here —
   * suspending them is the rare one — and the two must not be the same request,
   * or demoting an agent would silently reactivate a suspended account.
   */
  const capabilities = readCapabilities(body.capabilities);
  if ((body.permission || capabilities) && body.active === undefined) {
    const updated: Agent = {
      ...agent,
      permission: body.permission ? readPermission(body.permission) : agent.permission,
      // Merged, not replaced: one switch at a time is how the screen sends it.
      capabilities: capabilities ? { ...agent.capabilities, ...capabilities } : agent.capabilities,
    };
    await saveAgent(updated);
    return ok({ agent: updated });
  }

  // Removing the last admin would lock the agency out of its own settings.
  const admins = agents.filter((a) => a.role === "admin" && a.active);
  if (agent.role === "admin" && !body.active && admins.length <= 1) {
    return fail("policyRestriction", "agency.lastAdmin", locale, { status: 409, action: "contactSupport" });
  }

  await saveAgent({ ...agent, active: Boolean(body.active) });
  return ok({ agent: { ...agent, active: Boolean(body.active) } });
}
