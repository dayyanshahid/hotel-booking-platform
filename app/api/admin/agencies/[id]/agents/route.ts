import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getAgency, getAgentByEmail, listAgents, saveAgent } from "@/lib/agency/store";
import type { Agent } from "@/lib/agency/types";

/**
 * Agent management from the operator side.
 *
 * The agency portal lets an agency's own administrator add and suspend staff,
 * which is right until the administrator is the person who left. Then nobody
 * can add another — the agency is locked out of its own account and the only
 * fix was editing a file on the server. That is not a support process.
 *
 * So operators can do it too, and every change is audited: adding someone to an
 * agency grants them sight of that agency's cost prices and the ability to
 * spend its credit, which is not a quiet administrative act.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });
  return ok({ agents: await listAgents(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ email: string; name: string; role?: Agent["role"] }>(req);
  if (!body?.email || !isEmail(body.email) || !body.name?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  // One address belongs to one agency. Moving it silently would hand another
  // agency's rates to whoever holds the mailbox.
  const existing = await getAgentByEmail(body.email);
  if (existing && existing.agencyId !== id) {
    return fail("policyRestriction", "agency.emailTaken", locale, { status: 409, action: "contactSupport" });
  }

  const now = new Date().toISOString();
  const agent: Agent = existing
    ? { ...existing, name: sanitize(body.name, 60), role: body.role === "admin" ? "admin" : "agent", active: true }
    : {
        id: `agt_${Math.random().toString(36).slice(2, 10)}`,
        agencyId: id,
        email: sanitize(body.email, 120).toLowerCase(),
        name: sanitize(body.name, 60),
        role: body.role === "admin" ? "admin" : "agent",
        active: true,
        createdAt: now,
      };

  await saveAgent(agent);
  await appendAudit({
    actor: session.email,
    action: existing ? "agent.update" : "agent.create",
    subject: `${agency.name}:${agent.email}`,
    detail: `${existing ? "Updated" : "Added"} ${agent.name} as ${agent.role} on ${agency.name}`,
    before: existing ? `${existing.role} / ${existing.active ? "active" : "suspended"}` : undefined,
    after: `${agent.role} / active`,
  });

  return ok({ agent });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ agentId: string; active?: boolean; role?: Agent["role"] }>(req);
  if (!body?.agentId) return fail("validation", "error.validation", locale, { status: 400 });

  const agents = await listAgents(id);
  const agent = agents.find((candidate) => candidate.id === body.agentId);
  if (!agent) return fail("validation", "error.notFound", locale, { status: 404 });

  const next: Agent = {
    ...agent,
    active: body.active === undefined ? agent.active : body.active,
    role: body.role ?? agent.role,
  };

  /*
   * The lockout guard, from the other side.
   *
   * The agency's own portal refuses to remove its last administrator. An
   * operator may — that is the whole point of this endpoint — but they are told
   * plainly, because an agency with no administrator cannot manage its own
   * staff again without coming back here.
   */
  const remainingAdmins = agents.filter(
    (candidate) => candidate.role === "admin" && candidate.active && candidate.id !== agent.id,
  ).length;
  const leavesNoAdmin = next.role !== "admin" || !next.active ? remainingAdmins === 0 : false;

  await saveAgent(next);
  await appendAudit({
    actor: session.email,
    action: "agent.update",
    subject: `${agency.name}:${agent.email}`,
    detail: `${agent.name} on ${agency.name}${leavesNoAdmin ? " — agency now has no active administrator" : ""}`,
    before: `${agent.role} / ${agent.active ? "active" : "suspended"}`,
    after: `${next.role} / ${next.active ? "active" : "suspended"}`,
  });

  return ok({ agent: next, leavesNoAdmin });
}
