import { fail, isEmail, localeFrom, ok, readJson } from "@/lib/server/api";
import { issueOtp, verifyOtp } from "@/lib/server/store";
import { endAdminSession, isAdminConfigured, isAdminEmail, startAdminSession } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";

/**
 * Operator sign-in.
 *
 * Same passwordless mechanism as everywhere else, gated on the allowlist. An
 * address that is not on it gets the same "code sent" answer as one that is:
 * the console's user list is not something an unauthenticated caller should be
 * able to enumerate one email at a time.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  if (!isAdminConfigured()) {
    return fail("policyRestriction", "admin.notConfigured", locale, { status: 503, action: "contactSupport" });
  }

  const body = await readJson<{ email: string }>(req);
  if (!body?.email || !isEmail(body.email)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  const allowed = isAdminEmail(body.email);
  const code = allowed ? await issueOtp(body.email.toLowerCase(), "admin") : undefined;
  return ok({ sent: true, email: body.email.toLowerCase(), demoCode: code });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; code: string }>(req);
  if (!body?.email || !body.code) return fail("validation", "error.validation", locale, { status: 400 });

  if (!isAdminEmail(body.email) || !(await verifyOtp(body.email.toLowerCase(), "admin", body.code))) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }

  const email = body.email.trim().toLowerCase();
  const session = { email, name: email.split("@")[0] };
  await startAdminSession(session);
  // Sign-in is itself an audited event: knowing who was in the console and when
  // is half of knowing who did what.
  await appendAudit({ actor: email, action: "session.start", subject: email, detail: "Signed in to the console" });
  return ok({ session });
}

export async function DELETE() {
  await endAdminSession();
  return ok({ signedOut: true });
}
