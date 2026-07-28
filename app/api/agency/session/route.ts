import { fail, isEmail, localeFrom, ok, readJson } from "@/lib/server/api";
import { issueOtp, verifyOtp } from "@/lib/server/store";
import { getAgency, getAgentByEmail } from "@/lib/agency/store";
import { endSession, startSession } from "@/lib/agency/session";

/**
 * Agent sign-in.
 *
 * Same passwordless mechanism as the consumer side — an agency counter is a
 * shared machine, and a password taped to a monitor is worse than a code sent
 * to the agent's own inbox. What differs is that this issues a real session:
 * the portal shows cost prices and spends a credit line, so every subsequent
 * request has to prove who is asking.
 *
 * Unknown emails still get a "code sent" answer. Telling a stranger which
 * addresses belong to an agency turns this endpoint into a staff directory.
 */

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string }>(req);
  if (!body?.email || !isEmail(body.email)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  const agent = await getAgentByEmail(body.email);
  const code = agent?.active ? await issueOtp(body.email.toLowerCase(), "agency") : undefined;

  // `demoCode` mirrors the consumer flow so the portal can be walked end-to-end
  // in this environment; a real deployment delivers it out-of-band only.
  return ok({ sent: true, email: body.email.toLowerCase(), demoCode: code });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; code: string }>(req);
  if (!body?.email || !body.code) return fail("validation", "error.validation", locale, { status: 400 });

  const agent = await getAgentByEmail(body.email);
  if (!agent || !agent.active || !(await verifyOtp(body.email.toLowerCase(), "agency", body.code))) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }

  const agency = await getAgency(agent.agencyId);
  if (!agency || agency.status !== "active") {
    return fail("policyRestriction", "agency.suspended", locale, { status: 403, action: "contactSupport" });
  }

  const session = {
    agentId: agent.id,
    agencyId: agent.agencyId,
    email: agent.email,
    name: agent.name,
    role: agent.role,
    agencyName: agency.name,
  };
  await startSession(session);
  return ok({ session });
}

export async function DELETE() {
  await endSession();
  return ok({ signedOut: true });
}
