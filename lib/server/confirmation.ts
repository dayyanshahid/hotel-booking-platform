import "server-only";
import { getSupplierReference } from "./store";
import { getSupplierBooking } from "./hotelbeds/operations";
import type { HbBookingRoom } from "./hotelbeds/types";
import { isHotelbedsEnabled } from "./hotelbeds/config";
import { tourmindRetrieve } from "./tourmind/operations";
import { isTourmindEnabled } from "./tourmind/config";
import type { SupplierConfirmation } from "@/lib/types";

/**
 * Fetching what the supplier says it confirmed.
 *
 * A voucher printed from our own record says what we asked for. This says what
 * was actually granted, which is not always the same thing: a property can
 * confirm a different room, a name can be transcribed differently, and only the
 * supplier holds the number the front desk will recognise. When a guest is
 * turned away at midnight, the difference between those two documents is the
 * whole argument.
 *
 * Both suppliers expose it. Hotelbeds returns the booking on
 * `GET /bookings/{reference}`; TourMind returns it from `SearchOrder`, keyed on
 * the AgentRefID we chose — which is the reference a timed-out create cannot
 * take away from us.
 *
 * What comes back here is deliberately narrow. The supplier's own name, its net
 * rate, its rate codes and its internal reference are all in those responses and
 * none of them belong on a document handed to a traveller (§9.4). This shape
 * carries only what a guest or a hotel needs, so a screen cannot leak what it
 * was never given.
 */


/** Nothing to report — used when there is no live supplier behind a booking. */
const NONE: SupplierConfirmation = { status: "unknown" };

/**
 * Confirmation for one of our references, from whichever supplier holds it.
 *
 * A failure is never thrown. A voucher must still print when a supplier is
 * unreachable — the booking exists either way — so the caller gets
 * `unavailable` and the document says the property's details could not be
 * refreshed, rather than the page failing in an agent's hands.
 */
export async function fetchConfirmation(reference: string): Promise<SupplierConfirmation> {
  const linked = getSupplierReference(reference);
  if (!linked) return NONE;

  try {
    if (linked.source === "tourmind" && isTourmindEnabled()) {
      const order = await tourmindRetrieve(linked.reference);
      if (!order) return { status: "unknown", unavailable: true };
      return {
        status: order.status,
        /*
         * Empty means they have not got one from the property yet, which their
         * test environment returns routinely. Normalised away so a caller can
         * ask "is there one" rather than "is there one and is it non-empty" —
         * and so the voucher omits the line instead of printing a blank label
         * a guest would read out as nothing.
         */
        hotelConfirmationNumber: order.hotelConfirmationNo?.trim() || undefined,
        guests: order.guests,
        checkIn: order.checkIn,
        checkOut: order.checkOut,
        bookedAt: order.bookedAt,
      };
    }

    if (linked.source === "hotelbeds" && isHotelbedsEnabled()) {
      const booking = await getSupplierBooking(linked.reference);
      if (!booking) return { status: "unknown", unavailable: true };

      /*
       * `hotel` is an intersection of the search shape and the booking shape,
       * and both declare `rooms`. The booking one is what a confirmation
       * carries — it is the only one with the guests on it.
       */
      const confirmed = (booking.hotel?.rooms ?? []) as HbBookingRoom[];

      const rooms = confirmed.map((room) => ({
        name: room.name,
        board: room.rates?.[0]?.boardName,
        guests: (room.paxes ?? [])
          .map((pax) => [pax.name, pax.surname].filter(Boolean).join(" ").trim())
          .filter(Boolean),
      }));

      const guests = confirmed.flatMap((room) =>
        (room.paxes ?? []).map((pax) => ({
          firstName: pax.name ?? "",
          lastName: pax.surname ?? "",
          child: pax.type === "CH",
        })),
      );

      return {
        status:
          booking.status === "CONFIRMED"
            ? "confirmed"
            : booking.status === "CANCELLED"
              ? "cancelled"
              : booking.status === "PENDING"
                ? "pending"
                : "unknown",
        // Hotelbeds' `reference` is their own, not the hotel's, so it is not
        // put on a guest's voucher.
        guests: guests.length ? guests : undefined,
        rooms: rooms.length ? rooms : undefined,
        checkIn: booking.hotel?.checkIn,
        checkOut: booking.hotel?.checkOut,
        bookedAt: booking.creationDate,
      };
    }
  } catch {
    // Unreachable is a state the voucher can render; an exception is not.
    return { status: "unknown", unavailable: true };
  }

  return NONE;
}

export type { SupplierConfirmation };
