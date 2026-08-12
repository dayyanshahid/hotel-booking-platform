import "server-only";
import { appendLedger, getAgencyBooking, listLedger, saveAgencyBooking } from "./store";
import type { AgencyBooking, AgencySession, LedgerEntry } from "./types";

export { canHold, holdDeadline, hoursLeftOnHold, isHoldUrgent, HOLD_SAFETY_MARGIN_MS, HOLD_URGENT_HOURS } from "./hold-policy";

/**
 * Holding a room when no supplier will hold a room.
 *
 * The client asked for a temporary reservation that does not draw credit.
 * Neither supplier offers one: TourMind's documentation has no hold, option or
 * provisional concept at all, and Hotelbeds' hotel booking flow is availability
 * → CheckRate → book with no intermediate state. Their Activities product has a
 * two-step confirmation; the hotel product does not.
 *
 * So the only honest hold is the one the trade has always used: book a
 * *refundable* rate for real, and cancel it inside the free-cancellation window
 * if nobody issues it. The room is genuinely held, the agency owes nothing
 * while it is held, and walking away costs nothing — provided something
 * actually cancels it in time, which is what the sweeper is for.
 *
 * Two consequences worth stating plainly, because they are properties of the
 * suppliers and not of this code. A non-refundable rate cannot be held at all;
 * offering to would be offering something we cannot deliver. And a hold is
 * visible to the hotel as a booking, so it is not a private reservation an
 * agency can place a hundred of without anyone noticing.
 */

function entryId(reference: string, kind: string): string {
  // Derived, so a retried request cannot reserve the same money twice.
  return `led_${kind}_${reference}`;
}

/**
 * Reserve the cost against the line without charging for it.
 *
 * The client's wording is "without deducting credit", and this does not: no
 * charge is raised and nothing appears on a statement. What it does do is take
 * the exposure off available headroom, because the room really is held in the
 * agency's name and a line that ignored that could be spent twice.
 */
export async function reserveForHold(
  session: AgencySession,
  reference: string,
  cost: number,
  currency: string,
  hotelName: string,
  at: string,
): Promise<void> {
  const id = entryId(reference, "hold");
  const existing = await listLedger(session.agencyId, 500);
  if (existing.some((entry) => entry.id === id)) return;

  const entry: LedgerEntry = {
    id,
    agencyId: session.agencyId,
    at,
    amount: -cost,
    currency,
    kind: "hold",
    reference,
    agentId: session.agentId,
    note: `Held · ${hotelName} · ${session.name}`,
  };
  await appendLedger(entry);
}

/** Give the reserved headroom back — on issue, on cancellation, on expiry. */
export async function releaseHold(
  agencyId: string,
  /**
   * Whose pool the reservation came out of, so the same pool gets it back.
   *
   * Crediting the agency but not the sub-agent would leave a cancelled hold
   * counted against their allocation forever, and the ledger would still add up
   * — the shortfall would only ever show as a sub-agent who cannot book.
   */
  agentId: string | undefined,
  reference: string,
  cost: number,
  currency: string,
  at: string,
  note: string,
): Promise<void> {
  const id = entryId(reference, "holdRelease");
  const existing = await listLedger(agencyId, 500);
  if (existing.some((entry) => entry.id === id)) return;

  await appendLedger({
    id,
    agencyId,
    at,
    amount: cost,
    currency,
    kind: "holdRelease",
    reference,
    agentId,
    note,
  });
}

/**
 * Turn a hold into a sale.
 *
 * The reservation is released and the real charge raised in its place, so the
 * agency's headroom never moves — the same money simply changes from held to
 * owed. Doing it in that order matters: raising the charge first would briefly
 * double-count the booking and could refuse an issue for want of credit the
 * agency already has.
 */
export async function issueHold(
  session: AgencySession,
  booking: AgencyBooking,
  at: string,
): Promise<AgencyBooking> {
  /*
   * Both movements are attributed to whoever made the booking, not to whoever
   * is issuing it. The hold came out of their pool; releasing it to one account
   * and charging another would hand the first free headroom and bill the second
   * for a room they did not choose.
   */
  await releaseHold(
    booking.agencyId,
    booking.agentId,
    booking.reference,
    booking.cost,
    booking.currency,
    at,
    "Issued",
  );

  const chargeId = entryId(booking.reference, "booking");
  const existing = await listLedger(booking.agencyId, 500);
  if (!existing.some((entry) => entry.id === chargeId)) {
    await appendLedger({
      id: chargeId,
      agencyId: booking.agencyId,
      at,
      amount: -booking.cost,
      currency: booking.currency,
      kind: "booking",
      reference: booking.reference,
      agentId: booking.agentId,
      note: `${booking.hotelName} · ${session.name}`,
    });
  }

  const issued: AgencyBooking = {
    ...booking,
    status: "confirmed",
    issuedAt: at,
    issuedBy: session.name,
    holdExpiresAt: undefined,
  };
  await saveAgencyBooking(issued);
  return issued;
}

/** Holds that have reached their deadline and must be cancelled now. */
export function isExpired(booking: AgencyBooking, now = Date.now()): boolean {
  return (
    booking.status === "held" &&
    Boolean(booking.holdExpiresAt) &&
    new Date(booking.holdExpiresAt!).getTime() <= now
  );
}

/** The trade record for a reference, when it is a hold. */
export async function heldBooking(reference: string): Promise<AgencyBooking | null> {
  const record = await getAgencyBooking(reference);
  return record?.status === "held" ? record : null;
}
