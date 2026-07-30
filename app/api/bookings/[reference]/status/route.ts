import { localeFrom, notFoundOrDemoState, ok } from "@/lib/server/api";
import { getBooking } from "@/lib/server/store";
import { reconcileBooking } from "@/lib/server/reconcile";
import { fetchConfirmation } from "@/lib/server/confirmation";

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

  /*
   * The number the front desk can actually look up.
   *
   * Only asked for once the booking has settled, because while it is still
   * reconciling there is nothing to ask about and the poll runs every few
   * seconds. Only the property's own confirmation number is passed on — the
   * supplier's reference, its net rate and its name stay here (§9.4). Those are
   * ours to reconcile with; this one is the guest's, and without it a traveller
   * standing at reception has only a reference the hotel has never seen.
   */
  const confirmation = result.polling ? undefined : await fetchConfirmation(reference);

  return ok({
    booking: result.booking,
    polling: result.polling,
    hotelConfirmationNumber: confirmation?.hotelConfirmationNumber,
  });
}

export const dynamic = "force-dynamic";
