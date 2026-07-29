import { fail, localeFrom, ok } from "@/lib/server/api";
import { appendAudit } from "@/lib/admin/store";
import { currentAdmin } from "@/lib/admin/session";
import { sweepExpiredHolds, holdsDueWithin } from "@/lib/server/holds-sweep";
import { notifyHoldsDue, HOLD_WARNING_WINDOW_MS } from "@/lib/server/hold-alerts";

/**
 * The scheduled half of the hold engine.
 *
 * Two jobs on one visit, because they look at the same rows: warn about holds
 * whose deadline is close, and cancel the ones that have reached it. Running
 * them together means a hold can never be cancelled without its warning having
 * been sent first.
 *
 * Called by a scheduler — Vercel Cron in this deployment — rather than a timer
 * inside the process, because a timer in a serverless instance dies with the
 * instance and stops cancelling with no error and no alert. The first anyone
 * would know is the supplier invoice.
 *
 * It is authorised two ways: a shared secret for the scheduler, and an operator
 * session for a human who wants to run it now. Without either it refuses —
 * anyone able to trigger this at will could cancel every outstanding hold on
 * the platform.
 */

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  const locale = localeFrom(req);

  const bySecret = authorised(req);
  const operator = bySecret ? null : await currentAdmin();
  if (!bySecret && !operator) {
    return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });
  }

  // Warn first, then cancel: a hold must never be cancelled without its
  // warning having gone out on an earlier run.
  const due = await holdsDueWithin(HOLD_WARNING_WINDOW_MS);
  const warned = await notifyHoldsDue(due, locale);
  const swept = await sweepExpiredHolds({ locale });

  /*
   * Audited when a person ran it, not when the scheduler did.
   *
   * A cron entry every few minutes would bury the log it shares with
   * cancellations and refunds; a human cancelling holds by hand is exactly the
   * sort of thing that log exists for.
   */
  if (operator && (swept.cancelled.length || swept.failed.length)) {
    await appendAudit({
      actor: operator.email,
      action: "holds.sweep",
      subject: "platform",
      detail: `Ran the hold sweep by hand — ${swept.cancelled.length} cancelled, ${swept.failed.length} could not be`,
    });
  }

  return ok({ warned, ...swept });
}

export const dynamic = "force-dynamic";
