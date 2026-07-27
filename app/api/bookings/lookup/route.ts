import { fail, isEmail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getBooking, issueOtp, verifyOtp } from "@/lib/server/store";

/**
 * Guest booking retrieval (§5.9, E-22).
 *
 * The response is intentionally identical whether or not the reference exists,
 * so the endpoint cannot be used to enumerate bookings. Ownership is proved with
 * a one-time code sent to the email captured at checkout.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ reference: string; email: string }>(req);
  if (!body?.reference || !isEmail(body.email ?? "")) {
    return fail("validation", "error.validation", locale, { status: 422 });
  }
  const booking = await getBooking(body.reference);
  const matches = booking && booking.contact.email === body.email.trim().toLowerCase();
  const code = matches ? issueOtp(body.email, `lookup:${body.reference.toUpperCase()}`) : undefined;
  return ok({
    sent: true,
    email: body.email.toLowerCase(),
    // Only present when the pair actually matches — never reveals existence.
    demoCode: code,
  });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ reference: string; email: string; code: string }>(req);
  if (!body?.reference || !body.email || !body.code) {
    return fail("validation", "error.validation", locale, { status: 400 });
  }
  const ok1 = verifyOtp(body.email, `lookup:${body.reference.toUpperCase()}`, body.code);
  if (!ok1) return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  const booking = await getBooking(body.reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  return ok({ booking });
}
