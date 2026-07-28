import { fail, localeFrom, notFoundOrDemoState, ok } from "@/lib/server/api";
import { getBooking } from "@/lib/server/store";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { buildCancellationQuote } from "@/lib/server/cancellation";

/**
 * POST /api/bookings/{reference}/cancellation-quotes — live simulation (§6.6).
 *
 * The quote is always fetched fresh, carries its own expiry, and is never
 * silently reused once expired (E-18). The quoting itself is shared with the
 * agency portal so an agent and a guest are never told different fees.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const booking = await getBooking(reference);
  if (!booking) return notFoundOrDemoState(locale);

  if (!booking.capabilities.cancelAllowed || booking.status === "cancelled") {
    return fail("policyRestriction", "error.policyRestriction", locale, { status: 409, action: "contactSupport" });
  }

  const outcome = await buildCancellationQuote(booking, { locale, scenario });
  if (!outcome.ok) {
    return fail(outcome.error.category, outcome.error.messageKey, locale, {
      status: outcome.error.status,
      action: outcome.error.action,
      retryable: outcome.error.retryable,
      message: outcome.error.message,
    });
  }

  return ok(outcome.quote);
}

export const dynamic = "force-dynamic";
