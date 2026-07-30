import { describe, expect, it } from "vitest";
import {
  combineCapabilities,
  mergeComments,
  rollUpLines,
  strictestCancellation,
  sumPrices,
} from "@/lib/server/checkout-lines";
import type { SessionLine } from "@/lib/types";

/**
 * A checkout states one total, one deadline, one countdown and one payment mode
 * however many rooms it holds. Each of those is a rollup, and each can be wrong
 * in one of two directions — these fix the direction.
 *
 * Every one rounds towards the answer that cannot overpromise. Taking the first
 * line's values, or the most generous, is how a customer is told a booking is
 * fully refundable when a third of it is not.
 */
function line(over: Partial<SessionLine> = {}): SessionLine {
  return {
    lineId: `cl_${Math.round(Math.random() * 1e6)}`,
    offerId: "of_1",
    roomIndex: 0,
    roomName: "Deluxe twin",
    boardLabel: "Breakfast",
    occupancy: { adults: 2, childrenAges: [] },
    price: {
      currency: "USD",
      total: 300,
      nightlyAverage: 100,
      base: 300,
      includedCharges: [],
      payAtProperty: [],
      nights: 3,
      guests: 2,
      roomsCovered: 1,
      roomsRequested: 3,
    },
    cancellation: { refundable: true, freeUntil: "2026-08-03T23:59:00Z", timezone: "UTC", steps: [] },
    paymentTiming: "payLater",
    comments: [],
    capabilities: {
      recheckRequired: false,
      cancellationQuote: true,
      modifyAllowed: true,
      guaranteeEligible: true,
      instantConfirmation: true,
    },
    expiresAt: "2026-07-30T12:00:00.000Z",
    ...over,
  };
}

describe("a total across rooms describes the party", () => {
  it("sums the money and the people, and says it covers every room", () => {
    const price = sumPrices([line(), line(), line()]);
    expect(price.total).toBe(900);
    expect(price.guests).toBe(6);
    // Three lines cover three rooms, so this is no longer a per-room figure
    // standing in for a party — which is what `isPerRoomTotal` reads.
    expect(price.roomsCovered).toBe(3);
    expect(price.roomsRequested).toBe(3);
  });

  it("merges a charge that arrives once per room instead of listing it thrice", () => {
    /*
     * Three rooms each carrying "City tax" printed three identical rows in the
     * breakdown, and a customer counted them as three different taxes.
     */
    const withTax = () =>
      line({
        price: {
          ...line().price,
          payAtProperty: [{ code: "city", label: "City tax", amount: 15, basis: "payAtProperty" }],
        },
      });
    const price = sumPrices([withTax(), withTax(), withTax()]);
    expect(price.payAtProperty).toHaveLength(1);
    expect(price.payAtProperty[0].amount).toBe(45);
  });

  it("drops a discount label it cannot honestly apply to a set", () => {
    const discounted = line({ price: { ...line().price, discountLabel: "20% off" } });
    expect(sumPrices([discounted]).discountLabel).toBe("20% off");
    expect(sumPrices([discounted, line()]).discountLabel).toBeUndefined();
  });
});

describe("the set is governed by its least forgiving room", () => {
  it("lets one non-refundable room decide the policy", () => {
    const nrf = line({ cancellation: { refundable: false, timezone: "UTC", steps: [] } });
    expect(strictestCancellation([line(), line(), nrf]).refundable).toBe(false);
  });

  it("takes the earliest free-cancellation deadline of the refundable ones", () => {
    // After the earlier date the set is no longer free to cancel, so the later
    // one is already lost — presenting it would promise a window that is gone.
    const early = line({
      cancellation: { refundable: true, freeUntil: "2026-08-01T00:00:00Z", timezone: "UTC", steps: [] },
    });
    const late = line({
      cancellation: { refundable: true, freeUntil: "2026-08-09T00:00:00Z", timezone: "UTC", steps: [] },
    });
    expect(strictestCancellation([late, early]).freeUntil).toBe("2026-08-01T00:00:00Z");
    expect(strictestCancellation([early, late]).freeUntil).toBe("2026-08-01T00:00:00Z");
  });
});

describe("a capability holds only if every room has it", () => {
  it("needs a recheck if any single room does", () => {
    const recheck = line({ capabilities: { ...line().capabilities, recheckRequired: true } });
    expect(combineCapabilities([line(), recheck]).recheckRequired).toBe(true);
  });

  it("stops claiming instant confirmation for a set that will not confirm", () => {
    // Two of three rates confirming instantly is a set that does not.
    const slow = line({ capabilities: { ...line().capabilities, instantConfirmation: false } });
    expect(combineCapabilities([line(), line(), slow]).instantConfirmation).toBe(false);
    expect(combineCapabilities([line(), line()]).instantConfirmation).toBe(true);
  });
});

describe("the set is held only until its first loss", () => {
  it("expires with the earliest room, whatever order the lines came in", () => {
    const soon = line({ expiresAt: "2026-07-30T11:04:00.000Z" });
    const later = line({ expiresAt: "2026-07-30T12:00:00.000Z" });
    expect(rollUpLines([later, soon]).expiresAt).toBe("2026-07-30T11:04:00.000Z");
    expect(rollUpLines([soon, later]).expiresAt).toBe("2026-07-30T11:04:00.000Z");
  });

  it("settles on the strictest payment terms in the set", () => {
    const now = line({ paymentTiming: "payNow" });
    expect(rollUpLines([line(), now]).paymentTiming).toBe("payNow");
    expect(rollUpLines([line(), line()]).paymentTiming).toBe("payLater");
  });

  it("states each condition once, however many rooms carry it", () => {
    const withComment = () =>
      line({ comments: [{ id: "c1", summary: "Photo ID at check-in", verbatim: "ID REQUIRED", mandatory: true }] });
    // Different ids, one meaning — three rooms should not print it three times.
    const other = line({
      comments: [{ id: "c9", summary: "Photo ID at check-in", verbatim: "ID REQUIRED", mandatory: true }],
    });
    expect(mergeComments([withComment(), withComment(), other])).toHaveLength(1);
  });
});
