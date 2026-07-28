import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getBooking, saveBooking } from "@/lib/server/store";
import type { Booking } from "@/lib/types";

/**
 * An internal note on a booking.
 *
 * "Guest called, flight delayed, property told" is the kind of thing that lives
 * in an operator's head and is lost at the end of a shift. It goes on the
 * timeline as a support entry rather than into a separate notes field, because
 * the sequence is the point — a note only means something next to the events
 * either side of it.
 *
 * The timeline is rendered on the console and on the customer's own trip page,
 * so this is written plainly rather than as a private aside. There is no
 * hidden channel here, and pretending otherwise would be worse than having
 * none: an operator would eventually write something they would not say.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ note: string }>(req);
  const note = sanitize(body?.note, 500);
  if (!note) return fail("validation", "error.validation", locale, { status: 422, fields: { note: "required" } });

  const now = new Date().toISOString();
  const updated: Booking = {
    ...booking,
    updatedAt: now,
    timeline: [
      ...booking.timeline,
      {
        at: now,
        code: "support.note",
        label: locale === "ar" ? "ملاحظة من فريق الدعم" : "Support note",
        detail: note,
        actor: "support" as const,
      },
    ],
  };

  await saveBooking(updated, updated.contact.email);
  await appendAudit({
    actor: session.email,
    action: "booking.note",
    subject: reference,
    detail: note.slice(0, 160),
  });

  return ok({ booking: updated });
}

export const dynamic = "force-dynamic";
