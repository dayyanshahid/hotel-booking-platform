import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking, getQuote, peekIdempotency, setIdempotency } from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { buildCancellationQuote, cancelBooking } from "@/lib/server/cancellation";

/**
 * Cancelling on the customer's behalf.
 *
 * Support does this when a guest cannot — the code went to a dead mailbox, the
 * property called us directly, the traveller is mid-flight. The same two steps
 * as everywhere else: quote first so the operator sees the fee, then cancel
 * against that exact quote.
 *
 * Audited without exception. An operator cancelling a stranger's booking is the
 * single most consequential thing this console can do, and "who cancelled it"
 * must have an answer that does not depend on anyone's memory.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!booking.capabilities.cancelAllowed || booking.status === "cancelled") {
    return fail("policyRestriction", "error.policyRestriction", locale, { status: 409, action: "contactSupport" });
  }

  const body = await readJson<{ quoteId?: string; idempotencyKey?: string; reason?: string }>(req);

  if (!body?.quoteId) {
    const quoted = await buildCancellationQuote(booking, { locale, scenario });
    if (!quoted.ok) {
      return fail(quoted.error.category, quoted.error.messageKey, locale, {
        status: quoted.error.status,
        action: quoted.error.action,
        retryable: quoted.error.retryable,
        message: quoted.error.message,
      });
    }
    return ok({ quote: quoted.quote, cancelled: false });
  }

  if (!body.idempotencyKey) return fail("validation", "error.validation", locale, { status: 400 });

  const replayRef = peekIdempotency(`cancel:${body.idempotencyKey}`);
  if (replayRef) {
    const previous = await getBooking(replayRef);
    if (previous) return ok({ booking: previous, cancelled: true, replay: true });
  }

  const quote = getQuote(body.quoteId);
  if (!quote || quote.bookingReference !== booking.reference) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "cancel.quoteExpired", locale, { status: 409, action: "retry" });
  }

  setIdempotency(`cancel:${body.idempotencyKey}`, booking.reference);

  const outcome = await cancelBooking({
    booking,
    quote,
    locale,
    scenario,
    actor: "agent",
    actorName: `${session.email} (platform support)`,
  });
  if (!outcome.ok) {
    return fail(outcome.error.category, outcome.error.messageKey, locale, {
      status: outcome.error.status,
      action: outcome.error.action,
      retryable: outcome.error.retryable,
      message: outcome.error.message,
    });
  }

  await appendAudit({
    actor: session.email,
    action: "booking.cancel",
    subject: booking.reference,
    detail: `Cancelled ${booking.hotelName} — fee ${quote.fee} ${quote.currency}${body.reason ? ` · ${body.reason}` : ""}`,
    before: booking.status,
    after: outcome.booking.status,
  });

  return ok({ booking: outcome.booking, cancelled: true, uncertain: outcome.uncertain });
}

export const dynamic = "force-dynamic";
