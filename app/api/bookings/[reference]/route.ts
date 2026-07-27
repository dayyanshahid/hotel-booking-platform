import { fail, localeFrom, ok } from "@/lib/server/api";
import { getBooking } from "@/lib/server/store";

/**
 * GET /api/bookings/{reference} — full normalized booking record.
 *
 * §12.3: booking retrieval is protected against enumeration. A reference alone
 * is not enough; the caller must present the email used at checkout (or an
 * account session, which the demo represents with the same email header).
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? req.headers.get("x-account-email") ?? "").trim().toLowerCase();

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  if (!email || booking.contact.email !== email) {
    return fail("accountSecurity", "error.accountSecurity", locale, {
      status: 403,
      action: "authenticate",
      message:
        locale === "ar"
          ? "تحقق من هويتك باستخدام البريد المستخدم في الحجز لعرض هذه التفاصيل."
          : "Verify the email used at checkout to view these details.",
    });
  }

  return ok({ booking });
}
