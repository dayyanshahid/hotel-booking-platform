import { localeFrom, notFoundOrDemoState, ok } from "@/lib/server/api";
import { getBooking } from "@/lib/server/store";
import { reconcileBooking } from "@/lib/server/reconcile";

/**
 * GET /api/bookings/{reference}/status — reconciliation-safe polling (§6.5, E-14).
 *
 * The frontend polls this endpoint while a booking is pending. Reconciliation
 * happens server-side and the customer is never asked to pay or book again; the
 * logic is shared with the operator console, which drives the same resolution
 * for customers who have closed the page.
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const booking = await getBooking(reference);
  if (!booking) return notFoundOrDemoState(locale);

  const result = await reconcileBooking(booking, locale);
  return ok({ booking: result.booking, polling: result.polling });
}

export const dynamic = "force-dynamic";
