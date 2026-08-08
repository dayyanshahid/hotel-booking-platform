import { describe, expect, it } from "vitest";
import { humanDestination, intentFromSearchParams, searchParamsFromIntent } from "@/lib/nav";
import type { SearchIntent } from "@/lib/types";

/**
 * A stay carried in a URL, and what it is called when the URL does not say.
 */

const intent: SearchIntent = {
  destinationId: "dest-cairo",
  destinationDisplay: "Cairo",
  destinationType: "city",
  checkIn: "2026-12-01",
  checkOut: "2026-12-03",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [7] }],
  locale: "en",
  currency: "USD",
};

describe("a stay in a URL", () => {
  it("survives the round trip", () => {
    const back = intentFromSearchParams(searchParamsFromIntent(intent), "en");
    expect(back).toMatchObject({
      destinationId: "dest-cairo",
      destinationDisplay: "Cairo",
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
    });
    // The whole party, child ages included: a link that drops them quotes a
    // room for two and surprises the agent at the counter.
    expect(back?.rooms).toEqual([{ adults: 2, childrenAges: [7] }]);
  });

  it("is nothing at all without a destination and dates", () => {
    expect(intentFromSearchParams(new URLSearchParams({ destination: "dest-cairo" }), "en")).toBeNull();
  });
});

describe("naming a destination we only have the id of", () => {
  /*
   * Links this app builds always carry a label. These are the ones that do
   * not: a hand-edited URL, a truncated share, a bookmark from before the
   * parameter existed. The fallback used to be the id itself, and it surfaced —
   * "dest-cairo" sat in the recent-searches list where a city name belongs,
   * which is an internal identifier shown to a customer-facing user.
   */
  it("turns a slug back into words", () => {
    expect(humanDestination("dest-cairo")).toBe("Cairo");
    expect(humanDestination("dest-new-york")).toBe("New York");
  });

  it("leaves a supplier code as the code rather than as a slug", () => {
    // Not the editorial name, and a great deal better than "hbd-PMI".
    expect(humanDestination("hbd-PMI")).toBe("PMI");
  });

  it("has nothing to say about nothing", () => {
    expect(humanDestination("")).toBe("");
  });

  it("prefers a real label whenever the URL carries one", () => {
    const params = new URLSearchParams({
      destination: "dest-cairo",
      label: "القاهرة",
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
    });
    expect(intentFromSearchParams(params, "ar")?.destinationDisplay).toBe("القاهرة");
  });

  it("falls back to the derived name when it does not", () => {
    const params = new URLSearchParams({
      destination: "dest-cairo",
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
    });
    expect(intentFromSearchParams(params, "en")?.destinationDisplay).toBe("Cairo");
  });
});
