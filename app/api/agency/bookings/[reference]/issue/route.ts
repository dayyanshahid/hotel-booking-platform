import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent, agentWithPermission } from "@/lib/agency/session";
import { getAgencyBooking } from "@/lib/agency/store";
import { issueHold } from "@/lib/agency/holds";
import { getBooking, saveBooking } from "@/lib/server/store";

/**
 * Turn a hold into a sale.
 *
 * Nothing is sent to the supplier: the room was really booked when the hold was
 * placed, because neither supplier will hold one any other way. What changes is
 * on our side — the reservation becomes a charge, the sweeper stops watching
 * it, and a voucher can be issued.
 *
 * This is the one action the Issue permission exists for, so it is the one
 * place the distinction earns its keep: a Booking account can create the hold
 * and cannot turn it into money.
 */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const locale = localeFrom(req);
  const guard = await agentWithPermission("issue");
  if ("denied" in guard) {
    const authed = await activeAgent();
    return authed
      ? fail("accountSecurity", "agency.notPermitted", locale, { status: 403 })
      : fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  const session = guard.session;

  const { reference } = await ctx.params;
  const trade = await getAgencyBooking(reference);
  // Scoped to the agency: a reference is guessable and another agency's
  // booking is none of this account's business.
  if (!trade || trade.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }
  if (trade.status !== "held") {
    return fail("policyRestriction", "agency.notHeld", locale, { status: 409 });
  }

  const now = new Date().toISOString();
  const issued = await issueHold(session, trade, now);

  /*
   * The guest-facing record moves with it.
   *
   * A held booking shows as "on hold" to whoever is looking at it, and leaving
   * that behind after issuing would put a voucher and a hold notice on the same
   * reference.
   */
  const booking = await getBooking(reference);
  if (booking) {
    await saveBooking(
      {
        ...booking,
        status: "confirmed",
        updatedAt: now,
        timeline: [
          ...booking.timeline,
          {
            at: now,
            code: "booking.issued",
            label: locale === "ar" ? "تم إصدار الحجز" : "Hold issued",
            actor: "support" as const,
          },
        ],
      },
      booking.contact.email,
    );
  }

  return ok({ booking: issued });
}
