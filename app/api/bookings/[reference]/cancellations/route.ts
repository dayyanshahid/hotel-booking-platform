import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getBooking, getQuote, peekIdempotency, setIdempotency, verifyOtp } from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { cancelBooking } from "@/lib/server/cancellation";

interface Body {
  quoteId: string;
  idempotencyKey: string;
  otp: string;
}

/**
 * POST /api/bookings/{reference}/cancellations — idempotent cancellation (§6.6).
 *
 * Requires a live, unexpired quote and re-authentication. An uncertain outcome
 * becomes a processing state with a support reference, never a blind resubmit
 * (E-19). Everything past the authorisation check is shared with the agency
 * portal's own cancellation — see `lib/server/cancellation.ts`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<Body>(req);
  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!body?.quoteId || !body.idempotencyKey) return fail("validation", "error.validation", locale, { status: 400 });

  const replayRef = peekIdempotency(`cancel:${body.idempotencyKey}`);
  if (replayRef) {
    const previous = await getBooking(replayRef);
    if (previous) return ok({ booking: previous, replay: true });
  }

  if (!(await verifyOtp(booking.contact.email, "cancel", body.otp ?? ""))) {
    return fail("accountSecurity", "account.codeInvalid", locale, { status: 401, action: "authenticate" });
  }

  const quote = getQuote(body.quoteId);
  if (!quote || quote.bookingReference !== booking.reference) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }

  setIdempotency(`cancel:${body.idempotencyKey}`, booking.reference);

  const outcome = await cancelBooking({ booking, quote, locale, scenario, actor: "customer" });
  if (!outcome.ok) {
    return fail(outcome.error.category, outcome.error.messageKey, locale, {
      status: outcome.error.status,
      action: outcome.error.action,
      retryable: outcome.error.retryable,
      message: outcome.error.message,
    });
  }

  return ok({ booking: outcome.booking, uncertain: outcome.uncertain });
}

export const dynamic = "force-dynamic";
