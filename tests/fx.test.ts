import { afterEach, describe, expect, it } from "vitest";
import { convertCurrency, __setRateResolver } from "@/lib/format";
import { isSaneRate, rateFor, setFxOverrides, currentRates } from "@/lib/server/fx";
import { CURRENCY_TABLE } from "@/lib/currencies";

/**
 * The rates the platform charges on.
 *
 * The built-in table calls itself indicative and not a quote, which was honest
 * while every price was simulated. It is not any more: Hotelbeds quotes in the
 * destination's currency and TourMind in yuan, so whatever sits here is what
 * turns a supplier's number into the one on an agency's invoice.
 */
afterEach(() => {
  setFxOverrides({});
  __setRateResolver(null);
});

describe("operator rates", () => {
  it("falls back to the built-in table when nothing is set", () => {
    setFxOverrides({});
    expect(rateFor("USD")).toBe(CURRENCY_TABLE.USD.rateFromSar);
  });

  it("uses the operator's rate where one exists", () => {
    setFxOverrides({ USD: 0.3 });
    expect(rateFor("USD")).toBe(0.3);
    // Untouched currencies keep the built-in rate rather than being zeroed.
    expect(rateFor("EUR")).toBe(CURRENCY_TABLE.EUR.rateFromSar);
  });

  it("actually changes what a conversion produces", () => {
    // The point of the whole feature: a number on a console screen that no
    // pricing path reads would be worse than no feature at all.
    setFxOverrides({ USD: 0.25 });
    const at25 = convertCurrency(400, "SAR", "USD");
    setFxOverrides({ USD: 0.5 });
    const at50 = convertCurrency(400, "SAR", "USD");
    expect(at25).toBe(100);
    expect(at50).toBe(200);
  });

  it("reports which rates an operator set", () => {
    setFxOverrides({ AED: 1 });
    const rows = currentRates();
    expect(rows.find((r) => r.currency === "AED")?.overridden).toBe(true);
    expect(rows.find((r) => r.currency === "GBP")?.overridden).toBe(false);
  });
});

describe("a rate a typo cannot escape", () => {
  it("refuses zero, negatives and nonsense", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0.3", null, undefined]) {
      expect(isSaneRate(value)).toBe(false);
    }
  });

  it("accepts the range real currencies occupy", () => {
    // From pennies to thousands per riyal — wide on purpose, but bounded.
    for (const value of [0.0001, 0.27, 1, 40.5, 9999]) {
      expect(isSaneRate(value)).toBe(true);
    }
  });

  it("ignores an unsafe rate rather than applying it", () => {
    setFxOverrides({ USD: 0 as number });
    expect(rateFor("USD")).toBe(CURRENCY_TABLE.USD.rateFromSar);
  });
});
