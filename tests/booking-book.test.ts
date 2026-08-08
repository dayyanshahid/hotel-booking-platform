import { describe, expect, it } from "vitest";
import { HOLD_URGENT_HOURS, hoursLeftOnHold, isHoldUrgent } from "@/lib/agency/hold-policy";
import { arrivalBucket, bookingTotals } from "@/lib/agency/book";
import type { AgencyBooking } from "@/lib/agency/types";

/**
 * The book of business, as an agent works it.
 *
 * Two questions run a counter's day — who is arriving, and what is about to be
 * given back — and the list could answer neither. It could be searched by name
 * and filtered by status, which is how you find a booking you already know
 * about; neither is how you find the one you have forgotten.
 */

const NOW = Date.parse("2026-08-08T09:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);
const hours = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

const booking = (over: Partial<AgencyBooking> = {}): AgencyBooking => ({
  reference: "BK1",
  agencyId: "agc",
  agentId: "agt",
  agentName: "Agent",
  hotelName: "A hotel",
  checkIn: day(5),
  checkOut: day(7),
  leadGuest: "A guest",
  publicPrice: 120,
  cost: 90,
  sell: 100,
  currency: "USD",
  status: "confirmed",
  createdAt: hours(-48),
  ...over,
});

describe("a hold running out", () => {
  it("reports the hours left", () => {
    expect(hoursLeftOnHold(booking({ status: "held", holdExpiresAt: hours(6) }), NOW)).toBeCloseTo(6);
  });

  it("has nothing to report on a booking that is not a hold", () => {
    // A confirmed booking has no clock; treating one as expiring would put a
    // countdown on a sale that is already made.
    expect(hoursLeftOnHold(booking({ holdExpiresAt: hours(2) }), NOW)).toBeNull();
  });

  it("is urgent inside a day, and not before", () => {
    expect(isHoldUrgent(booking({ status: "held", holdExpiresAt: hours(HOLD_URGENT_HOURS - 1) }), NOW)).toBe(true);
    expect(isHoldUrgent(booking({ status: "held", holdExpiresAt: hours(72) }), NOW)).toBe(false);
  });

  it("treats an unknown release time as urgent", () => {
    /*
     * The same call the attention list makes. An unknown deadline is not a
     * distant one, and the honest reading of "we do not know when this goes"
     * is "look at it".
     */
    expect(isHoldUrgent(booking({ status: "held", holdExpiresAt: undefined }), NOW)).toBe(true);
  });

  it("stops calling a hold urgent once it has gone", () => {
    // Past its deadline it is the sweeper's problem, not the agent's — and a
    // countdown reading "-3h" is worse than no countdown.
    expect(isHoldUrgent(booking({ status: "held", holdExpiresAt: hours(-3) }), NOW)).toBe(false);
  });
});

describe("when a guest is arriving", () => {
  it("separates today from the week from the rest", () => {
    expect(arrivalBucket(booking({ checkIn: day(0) }), NOW)).toBe("today");
    expect(arrivalBucket(booking({ checkIn: day(3) }), NOW)).toBe("week");
    expect(arrivalBucket(booking({ checkIn: day(30) }), NOW)).toBe("later");
  });

  it("knows a guest who is already in the hotel", () => {
    /*
     * Checked in yesterday, out tomorrow. Neither "arriving" nor "past" — and
     * filed under either one it is invisible on the day a problem with it is
     * most likely to be phoned in.
     */
    expect(arrivalBucket(booking({ checkIn: day(-1), checkOut: day(1) }), NOW)).toBe("staying");
  });

  it("files a finished stay as past", () => {
    expect(arrivalBucket(booking({ checkIn: day(-9), checkOut: day(-7) }), NOW)).toBe("past");
  });

  it("counts the arrival day itself as today, whatever the hour", () => {
    // Dates are local calendar days on a booking, not instants; comparing them
    // as timestamps put a same-day arrival in the past all afternoon.
    const lateInTheDay = Date.parse("2026-08-08T23:30:00Z");
    expect(arrivalBucket(booking({ checkIn: day(0), checkOut: day(2) }), lateInTheDay)).toBe("today");
  });
});

describe("what the book is worth", () => {
  it("totals sell, cost and margin over what is shown", () => {
    const totals = bookingTotals([
      booking({ cost: 90, sell: 100 }),
      booking({ cost: 200, sell: 260 }),
    ]);
    expect(totals).toEqual({ count: 2, cost: 290, sell: 360, margin: 70 });
  });

  it("leaves cancelled and failed bookings out of the money", () => {
    /*
     * A cancelled booking is not production. Counting it would tell an agency
     * they had sold something they had given back, on the screen they check
     * their month against.
     */
    const totals = bookingTotals([
      booking({ cost: 90, sell: 100 }),
      booking({ status: "cancelled", cost: 500, sell: 700 }),
      booking({ status: "failed", cost: 400, sell: 600 }),
    ]);
    expect(totals).toEqual({ count: 1, cost: 90, sell: 100, margin: 10 });
  });

  it("counts a hold, because the room is really reserved", () => {
    // It is not settled, but it is committed against the credit line, and an
    // agent looking at their exposure needs it in the figure.
    const totals = bookingTotals([booking({ status: "held", cost: 90, sell: 100 })]);
    expect(totals.count).toBe(1);
  });
});
