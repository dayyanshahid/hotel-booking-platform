import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgencyBooking } from "@/lib/agency/store";
import { getBooking, getQuote, peekIdempotency, setIdempotency } from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { buildCancellationQuote, cancelBooking } from "@/lib/server/cancellation";

/**
 * Cancelling from the counter.
 *
 * The guest flow proves it is really you with a code sent to the email on the
 * booking. An agent cannot do that — the email is often the traveller's, and
 * the person asking to cancel is standing in the agency's office. Their proof
 * is the portal session plus the booking belonging to their agency, checked
 * here on every call rather than assumed from the URL.
 *
 * POST with no quote returns one, so an agent can read the fee to the customer
 * before committing. POST with `quoteId` performs the cancellation against that
 * exact quote — never against a fee nobody has seen.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const trade = await getAgencyBooking(reference);
  if (!trade || trade.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!booking.capabilities.cancelAllowed || booking.status === "cancelled") {
    return fail("policyRestriction", "error.policyRestriction", locale, { status: 409, action: "contactSupport" });
  }

  const body = await readJson<{ quoteId?: string; idempotencyKey?: string }>(req);

  // Step one: quote only.
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
    actorName: `${session.name}, ${session.agencyName}`,
  });
  if (!outcome.ok) {
    return fail(outcome.error.category, outcome.error.messageKey, locale, {
      status: outcome.error.status,
      action: outcome.error.action,
      retryable: outcome.error.retryable,
      message: outcome.error.message,
    });
  }

  return ok({ booking: outcome.booking, cancelled: true, uncertain: outcome.uncertain });
}

export const dynamic = "force-dynamic";
