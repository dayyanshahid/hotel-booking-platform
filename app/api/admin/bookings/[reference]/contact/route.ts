import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking, saveBooking } from "@/lib/server/store";
import type { Booking } from "@/lib/types";

/**
 * Correcting the address a booking was made with.
 *
 * The commonest support call there is: the confirmation never arrived because
 * the address has a typo in it. Everything downstream — the voucher, the
 * cancellation code, the reminder — goes to that address, so until it can be
 * fixed the customer is unreachable by any route except this one.
 *
 * The booking is re-indexed under the new address so the guest's own "find my
 * booking" lookup works afterwards; leaving the index alone would fix the
 * emails and quietly break retrieval.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ email?: string; phone?: string }>(req);
  const email = body?.email?.trim();
  const phone = body?.phone?.trim();
  if (!email && !phone) return fail("validation", "error.validation", locale, { status: 422 });
  if (email && !isEmail(email)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  const now = new Date().toISOString();
  const updated: Booking = {
    ...booking,
    updatedAt: now,
    contact: {
      ...booking.contact,
      email: email ? sanitize(email, 120).toLowerCase() : booking.contact.email,
      phone: phone ? sanitize(phone, 30) : booking.contact.phone,
    },
    timeline: [
      ...booking.timeline,
      {
        at: now,
        code: "contact.corrected",
        label: locale === "ar" ? "صُحّحت بيانات التواصل" : "Contact details corrected",
        detail: email ? `${booking.contact.email} → ${email}` : undefined,
        actor: "support" as const,
      },
    ],
  };

  await saveBooking(updated, updated.contact.email);
  await appendAudit({
    actor: session.email,
    action: "booking.contact",
    subject: reference,
    detail: `Corrected contact on ${booking.hotelName}`,
    before: `${booking.contact.email} / ${booking.contact.phone}`,
    after: `${updated.contact.email} / ${updated.contact.phone}`,
  });

  return ok({ booking: updated });
}

export const dynamic = "force-dynamic";
