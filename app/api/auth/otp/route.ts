import { echoOtp, fail, isEmail, localeFrom, ok, readJson } from "@/lib/server/api";
import { issueOtp, verifyOtp } from "@/lib/server/store";

/**
 * Passwordless authentication (§5.10). No password is ever collected.
 *
 * In this demo environment the issued code is returned so the flow can be
 * completed end-to-end; a real deployment delivers it out-of-band only.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; purpose?: string }>(req);
  if (!body?.email || !isEmail(body.email)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }
  const purpose = body.purpose ?? "signin";
  const code = await issueOtp(body.email, purpose);
  return ok({ sent: true, email: body.email.toLowerCase(), purpose, demoCode: echoOtp(code) });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; code: string; purpose?: string }>(req);
  if (!body?.email || !body.code) return fail("validation", "error.validation", locale, { status: 400 });
  const purpose = body.purpose ?? "signin";
  if (!(await verifyOtp(body.email, purpose, body.code))) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }
  return ok({ verified: true, email: body.email.toLowerCase() });
}
