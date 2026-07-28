import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgentByEmail, listAgents, saveAgent } from "@/lib/agency/store";
import type { Agent } from "@/lib/agency/types";

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

  const body = await readJson<{ email: string; name: string; role?: Agent["role"] }>(req);
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
    active: true,
    createdAt: new Date().toISOString(),
  };
  if (existing) {
    agent.name = sanitize(body.name, 60);
    agent.role = body.role === "admin" ? "admin" : "agent";
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

  const body = await readJson<{ agentId: string; active: boolean }>(req);
  if (!body?.agentId) return fail("validation", "error.validation", locale, { status: 400 });
  const agents = await listAgents(session.agencyId);
  const agent = agents.find((a) => a.id === body.agentId);
  if (!agent) return fail("validation", "error.notFound", locale, { status: 404 });

  // Removing the last admin would lock the agency out of its own settings.
  const admins = agents.filter((a) => a.role === "admin" && a.active);
  if (agent.role === "admin" && !body.active && admins.length <= 1) {
    return fail("policyRestriction", "agency.lastAdmin", locale, { status: 409, action: "contactSupport" });
  }

  await saveAgent({ ...agent, active: Boolean(body.active) });
  return ok({ agent: { ...agent, active: Boolean(body.active) } });
}
