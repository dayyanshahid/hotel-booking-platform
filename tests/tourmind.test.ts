import { describe, expect, it } from "vitest";
import { boardCodeFor, buildCancellation, buildPrice, remainingLabel } from "@/lib/server/tourmind/adapter";
import { TM_MEAL_TO_BOARD } from "@/lib/server/tourmind/types";
import type { SearchIntent } from "@/lib/types";

/**
 * The adapter is the whole point of a second supplier: TourMind's wire format
 * shares almost nothing with Hotelbeds', and these assert that the differences
 * are translated rather than copied through.
 */

const intent: SearchIntent = {
  destinationId: "dest-tokyo",
  destinationDisplay: "Tokyo",
  destinationType: "city",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "USD",
};

describe("tourmind pricing", () => {
  it("treats TotalPrice as the whole stay, not a nightly rate", () => {
    // Their TotalPrice already covers every night. Dividing it by the stay
    // length — as a per-night supplier would need — would quote a third of the
    // real price on a three-night booking.
    const priced = buildPrice({ RateCode: "r", TotalPrice: 300, CurrencyCode: "USD" }, intent, "en")!;
    expect(priced.net).toBe(300);
    expect(priced.price.nights).toBe(3);
    expect(priced.price.nightlyAverage).toBe(Math.round(priced.price.total / 3));
    expect(priced.price.total).toBeGreaterThan(300); // markup applied once
  });

  it("rejects a rate with no usable price", () => {
    expect(buildPrice({ RateCode: "r", TotalPrice: 0 }, intent, "en")).toBeNull();
    expect(buildPrice({ RateCode: "r" }, intent, "en")).toBeNull();
  });

  it("falls back to USD when the supplier currency is not one we hold a rate for", () => {
    const priced = buildPrice({ RateCode: "r", TotalPrice: 100, CurrencyCode: "XYZ" }, intent, "en")!;
    expect(priced.supplierCurrency).toBe("USD");
  });

  it("discloses the charge currency only when it differs from the display one", () => {
    const same = buildPrice({ RateCode: "r", TotalPrice: 100, CurrencyCode: "USD" }, intent, "en")!;
    expect(same.price.chargeCurrency).toBeUndefined();
    const differs = buildPrice({ RateCode: "r", TotalPrice: 100, CurrencyCode: "CNY" }, intent, "en")!;
    expect(differs.price.chargeCurrency).toBe("CNY");
    expect(differs.price.fxBasis).toBeTruthy();
  });

  it("claims no tax breakdown it was not given", () => {
    // TMS quotes one all-in figure. Inventing line items to fill our own price
    // stack would be fabricating a breakdown.
    const priced = buildPrice({ RateCode: "r", TotalPrice: 200, CurrencyCode: "USD" }, intent, "en")!;
    expect(priced.price.payAtProperty).toEqual([]);
    expect(priced.price.includedCharges.every((line) => line.amount === 0)).toBe(true);
  });
});

describe("tourmind cancellation", () => {
  const base = {
    checkIn: "2026-09-10",
    total: 500,
    supplierCurrency: "USD" as const,
    displayCurrency: "USD" as const,
    locale: "en" as const,
  };

  it("reads a charging window's start as the free-cancellation deadline", () => {
    // Their window says "from this moment a charge applies". Ours says "until
    // this moment it is free". Reading one as the other inverts the policy.
    const policy = buildCancellation(
      [{ From: "2099-09-01 18:00:00", Amount: 500, CurrencyCode: "USD" }],
      { ...base, refundable: true },
    );
    expect(policy.refundable).toBe(true);
    expect(policy.freeUntil).toBe("2099-09-01T18:00:00");
    expect(policy.steps[0].fee).toBe(0);
  });

  it("is non-refundable when the rate says so, whatever windows came back", () => {
    const policy = buildCancellation(
      [{ From: "2099-09-01 18:00:00", Amount: 0 }],
      { ...base, refundable: false },
    );
    expect(policy.refundable).toBe(false);
    expect(policy.steps[0].fee).toBe(base.total);
  });

  it("is non-refundable when no policy was returned at all", () => {
    const policy = buildCancellation(undefined, { ...base, refundable: true });
    expect(policy.refundable).toBe(false);
  });

  it("treats an elapsed deadline as no longer refundable", () => {
    const policy = buildCancellation(
      [{ From: "2020-01-01 12:00:00", Amount: 500 }],
      { ...base, refundable: true },
    );
    expect(policy.refundable).toBe(false);
    expect(policy.freeUntil).toBeUndefined();
  });

  it("never charges more to cancel than the stay costs", () => {
    const policy = buildCancellation(
      [{ From: "2099-09-01 18:00:00", Amount: 99999, CurrencyCode: "USD" }],
      { ...base, refundable: true },
    );
    for (const step of policy.steps) expect(step.fee).toBeLessThanOrEqual(base.total);
  });

  it("accepts a bare date as well as a date-time", () => {
    const policy = buildCancellation(
      [{ StartDateTime: "2099-09-01", Amount: 100 }],
      { ...base, refundable: true },
    );
    expect(policy.freeUntil).toBe("2099-09-01T00:00:00");
  });
});

describe("tourmind vocabulary", () => {
  it("maps every meal code they document", () => {
    for (let code = 1; code <= 9; code += 1) {
      expect(TM_MEAL_TO_BOARD[code], `meal ${code}`).toBeTruthy();
    }
  });

  it("defaults an unknown or absent meal code to room only", () => {
    expect(boardCodeFor({})).toBe("RO");
    expect(boardCodeFor({ MealInfo: { MealCode: 99 } })).toBe("RO");
    expect(boardCodeFor({ MealInfo: { MealCode: 2 } })).toBe("BB");
  });

  it("only calls inventory scarce when it actually is", () => {
    // Dressing a large allotment as urgency is the pressure tactic §8.2 rules
    // out, so the label appears only for genuinely low counts.
    expect(remainingLabel({ Allotment: 2 }, "en")).toContain("2");
    expect(remainingLabel({ Allotment: 40 }, "en")).toBeUndefined();
    expect(remainingLabel({ Allotment: 0 }, "en")).toBeUndefined();
    expect(remainingLabel({}, "en")).toBeUndefined();
  });
});
