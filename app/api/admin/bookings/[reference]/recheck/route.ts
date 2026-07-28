import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking } from "@/lib/server/store";
import { reconcileBooking } from "@/lib/server/reconcile";

/**
 * Ask the supplier again, on an operator's say-so.
 *
 * Reconciliation already runs on its own when the customer's browser polls a
 * pending booking. That works while someone is watching the page and stops the
 * moment they close it — which is exactly when a stuck booking gets stuck. This
 * lets an operator drive the same reconciliation for a customer who left an
 * hour ago.
 *
 * It calls the same reconciliation function the polling endpoint does, in
 * process. An earlier version fetched that endpoint over HTTP, which was wrong
 * twice over: it hard-coded an origin that is not the port the app is actually
 * serving on outside production, and it made a server issue a network request
 * to itself for logic it already has loaded.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const before = await getBooking(reference);
  if (!before) return fail("validation", "error.notFound", locale, { status: 404 });

  const result = await reconcileBooking(before, locale);
  const after = result.booking;

  await appendAudit({
    actor: session.email,
    action: "booking.recheck",
    subject: reference,
    detail: `Re-checked ${before.hotelName} with the supplier`,
    before: before.status,
    after: after.status,
  });

  return ok({ booking: after, changed: after.status !== before.status, polling: result.polling });
}

export const dynamic = "force-dynamic";
