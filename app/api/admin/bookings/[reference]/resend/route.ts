import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking, pushNotification } from "@/lib/server/store";

/**
 * Sending the confirmation again.
 *
 * In this environment "sending" means pushing to the customer's in-app
 * notifications, which is where every other message on this platform goes — the
 * mail transport is not wired. That is stated in the response rather than
 * implied, because an operator who believes they have re-sent an email and has
 * not will tell the customer to check their inbox.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  const now = new Date().toISOString();
  pushNotification(booking.contact.email, {
    id: `nt_${Math.random().toString(36).slice(2, 9)}`,
    kind: "booking",
    title: locale === "ar" ? "تفاصيل حجزك" : "Your booking details",
    body: `${booking.hotelName} · ${booking.reference}`,
    href: `/trips/${booking.reference}`,
    createdAt: now,
    read: false,
  });

  await appendAudit({
    actor: session.email,
    action: "booking.resend",
    subject: reference,
    detail: `Re-sent confirmation to ${booking.contact.email}`,
  });

  return ok({ sentTo: booking.contact.email, channel: "inApp" });
}

export const dynamic = "force-dynamic";
