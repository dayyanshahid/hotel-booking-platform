import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking, pushNotification, saveBooking } from "@/lib/server/store";
import type { Booking } from "@/lib/types";

/**
 * Marking a refund settled.
 *
 * The platform can promise a refund but cannot observe one landing — that
 * happens in a payment provider, or a bank, on someone else's timetable. So the
 * final state is set by the person who reconciled the statement, with their
 * name against it and the customer told.
 *
 * The amount is not editable here. A refund for a different figure than the one
 * quoted is not a settlement, it is a new decision, and it should leave a
 * different trace than "marked as paid".
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (!booking.refund || booking.refund.amount <= 0) {
    return fail("policyRestriction", "admin.noRefund", locale, { status: 409, action: "contactSupport" });
  }
  if (booking.refund.status === "settled") return ok({ booking, alreadySettled: true });

  const body = await readJson<{ note?: string }>(req);
  const now = new Date().toISOString();

  const updated: Booking = {
    ...booking,
    updatedAt: now,
    refund: { ...booking.refund, status: "settled" },
    timeline: [
      ...booking.timeline,
      {
        at: now,
        code: "refund.settled",
        label: locale === "ar" ? "تم تحويل المبلغ المسترد" : "Refund settled",
        detail: `${booking.refund.amount} ${booking.refund.currency} · ${booking.refund.method}`,
        actor: "support" as const,
      },
    ],
  };

  await saveBooking(updated, updated.contact.email);
  await pushNotification(updated.contact.email, {
    id: `nt_${Math.random().toString(36).slice(2, 9)}`,
    kind: "payment",
    title: locale === "ar" ? "تم تحويل المبلغ المسترد" : "Your refund has been sent",
    body: `${updated.hotelName} · ${updated.reference}`,
    href: `/trips/${updated.reference}`,
    createdAt: now,
    read: false,
  });

  await appendAudit({
    actor: session.email,
    action: "refund.settle",
    subject: reference,
    detail: `Settled ${booking.refund.amount} ${booking.refund.currency}${body?.note ? ` · ${sanitize(body.note, 200)}` : ""}`,
    before: booking.refund.status,
    after: "settled",
  });

  return ok({ booking: updated });
}

export const dynamic = "force-dynamic";
