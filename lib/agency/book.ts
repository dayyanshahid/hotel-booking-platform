import type { AgencyBooking } from "./types";

/**
 * The book of business, as a counter actually works it.
 *
 * The list could be searched by name and filtered by status, which is how you
 * find a booking you already know about. Neither is how you find the one you
 * have forgotten — and the two questions that run an agent's day are *who is
 * arriving* and *what is about to be given back*. The first had no answer here
 * at all: check-in dates were printed in a column and could not be sorted,
 * filtered or counted.
 */

/** Where a stay sits relative to today. */
export type ArrivalBucket = "today" | "week" | "later" | "staying" | "past";

/**
 * Calendar days, not instants.
 *
 * A booking's `checkIn` is a local date — "2026-08-08" — and the guest arrives
 * on that day whatever the hour. Comparing it as a timestamp against `now`
 * files a same-day arrival under "past" from one minute after midnight, which
 * is precisely the row an agent is looking for when they open this screen.
 */
function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

function todayNumber(now: number): number {
  const at = new Date(now);
  return Math.floor(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / 86_400_000,
  );
}

export function arrivalBucket(booking: AgencyBooking, now = Date.now()): ArrivalBucket {
  const today = todayNumber(now);
  const arrives = dayNumber(booking.checkIn);
  const leaves = dayNumber(booking.checkOut);

  if (arrives === today) return "today";
  if (arrives > today) return arrives - today <= 7 ? "week" : "later";
  /*
   * Arrived already. In the hotel until the checkout day, and "staying" rather
   * than "past" until then — a guest currently in residence is the one whose
   * problem gets phoned in, and filing them under past makes them invisible on
   * exactly that day.
   */
  return leaves > today ? "staying" : "past";
}

/**
 * What a set of bookings is worth.
 *
 * Cancelled and failed bookings are counted by neither money nor number: a
 * cancelled booking is not production, and including it would tell an agency
 * they had sold something they gave back — on the screen they check the month
 * against. A hold *is* included, because the room is really reserved and it is
 * really committed against the credit line.
 */
export function bookingTotals(bookings: AgencyBooking[]): {
  count: number;
  cost: number;
  sell: number;
  margin: number;
} {
  const live = bookings.filter((b) => b.status !== "cancelled" && b.status !== "failed");
  const cost = live.reduce((sum, b) => sum + b.cost, 0);
  const sell = live.reduce((sum, b) => sum + b.sell, 0);
  return { count: live.length, cost, sell, margin: sell - cost };
}
