import { echoOtp, fail, isEmail, localeFrom, ok, readJson } from "@/lib/server/api";
import { issueOtp, verifyOtp } from "@/lib/server/store";
import { getAgency, getAgentByEmail } from "@/lib/agency/store";
import { permissionOf } from "@/lib/agency/types";
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

  /*
   * A view-only account signs in without a code.
   *
   * The step exists to protect what a session can *do*: spend a credit line,
   * hold stock, issue a voucher. An account that can do none of those is
   * looking at rates a customer could be quoted over the phone, and making
   * someone fetch a code to look at them is friction with nothing behind it.
   *
   * The moment an agency raises that account to Booking or Issue, the code
   * comes back — the permission is what decides, not a remembered preference.
   */
  const permission = agent ? permissionOf(agent) : "issue";
  const skipsOtp = Boolean(agent?.active) && permission === "viewOnly";

  const code = agent?.active && !skipsOtp ? await issueOtp(body.email.toLowerCase(), "agency") : undefined;

  // Echoed only where `mayEchoOtp` allows it — a demo environment with nothing
  // real behind it. Anywhere else this is absent and the code goes to the inbox
  // it was issued for, which is the only thing that makes it worth asking for.
  return ok({ sent: true, email: body.email.toLowerCase(), demoCode: echoOtp(code), codeRequired: !skipsOtp });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; code?: string }>(req);
  if (!body?.email) return fail("validation", "error.validation", locale, { status: 400 });

  const agent = await getAgentByEmail(body.email);
  if (!agent || !agent.active) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }

  // The same rule as above, applied where it is enforced rather than where it
  // is offered: a browsing account needs no code, everyone else does.
  const viewOnly = permissionOf(agent) === "viewOnly";
  if (!viewOnly && !(await verifyOtp(body.email.toLowerCase(), "agency", body.code ?? ""))) {
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
    permission: permissionOf(agent),
    agencyName: agency.name,
  };
  await startSession(session);
  return ok({ session });
}

export async function DELETE() {
  await endSession();
  return ok({ signedOut: true });
}
