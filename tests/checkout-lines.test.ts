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
    roomIndexes: [0],
    roomName: "Deluxe twin",
    boardLabel: "Breakfast",
    occupancies: [{ adults: 2, childrenAges: [] }],
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

describe("rechecking a set of rooms", () => {
  /*
   * CheckRate takes one rateKey per call, so a set is one call per *distinct*
   * rate — three rooms at the same rate is one call, which is the ordinary group
   * booking and the case worth not paying for three times against a fifty-a-day
   * key.
   *
   * Only the lead line used to be rechecked. The other two could have moved,
   * sold out, or changed their cancellation terms, and the agency's credit was
   * committed against prices nobody had confirmed.
   */
  const SEVERITY = { unavailable: 4, higher: 3, policyChanged: 2, lower: 1, unchanged: 0 } as const;

  type Outcome = keyof typeof SEVERITY;
  interface Result {
    outcome: Outcome;
    requiresAcceptance: boolean;
    changeReasons: string[];
  }

  function worst(results: Result[]): Result | null {
    if (!results.length) return null;
    const chosen = results.reduce((a, b) => (SEVERITY[b.outcome] > SEVERITY[a.outcome] ? b : a));
    return {
      ...chosen,
      requiresAcceptance: results.some((result) => result.requiresAcceptance),
      changeReasons: [...new Set(results.flatMap((result) => result.changeReasons))],
    };
  }

  const ok: Result = { outcome: "unchanged", requiresAcceptance: false, changeReasons: [] };

  it("reports the least forgiving answer in the set", () => {
    const gone: Result = { outcome: "unavailable", requiresAcceptance: true, changeReasons: ["sold out"] };
    expect(worst([ok, ok, gone])?.outcome).toBe("unavailable");
    // Order must not matter: the worst is the worst wherever it sits.
    expect(worst([gone, ok, ok])?.outcome).toBe("unavailable");
  });

  it("makes the whole set need a decision if any one room does", () => {
    const dearer: Result = { outcome: "higher", requiresAcceptance: true, changeReasons: ["price rose"] };
    const combined = worst([ok, dearer, ok]);
    expect(combined?.requiresAcceptance).toBe(true);
    // An agent accepting is accepting for every room, so they see why.
    expect(combined?.changeReasons).toEqual(["price rose"]);
  });

  it("does not let a cheaper room hide a dearer one", () => {
    // A drop on one line and a rise on another nets out to nothing on a total,
    // which is exactly how a rise gets committed without anyone agreeing to it.
    const cheaper: Result = { outcome: "lower", requiresAcceptance: false, changeReasons: [] };
    const dearer: Result = { outcome: "higher", requiresAcceptance: true, changeReasons: ["price rose"] };
    expect(worst([cheaper, dearer])?.outcome).toBe("higher");
    expect(worst([cheaper, dearer])?.requiresAcceptance).toBe(true);
  });

  it("states each reason once, however many rooms carry it", () => {
    const dearer: Result = { outcome: "higher", requiresAcceptance: true, changeReasons: ["price rose"] };
    expect(worst([dearer, dearer, dearer])?.changeReasons).toEqual(["price rose"]);
  });

  it("says nothing when nothing answered", () => {
    expect(worst([])).toBeNull();
  });
});

describe("a rate can fill more than one room", () => {
  /*
   * The basket was a toggle, so picking a rate a second time removed it. Three
   * rooms at the same rate — the ordinary group booking — was the one thing it
   * could not express, and an agent had to hunt for three *different* rates to
   * book three rooms.
   */
  function add(basket: string[], id: string, roomsWanted: number): string[] {
    return basket.length >= roomsWanted ? basket : [...basket, id];
  }
  function remove(basket: string[], id: string): string[] {
    const at = basket.lastIndexOf(id);
    return at === -1 ? basket : [...basket.slice(0, at), ...basket.slice(at + 1)];
  }
  function fill(id: string, roomsWanted: number): string[] {
    return Array.from({ length: roomsWanted }, () => id);
  }

  it("counts the same rate up instead of toggling it off", () => {
    let basket: string[] = [];
    basket = add(basket, "of_a", 3);
    basket = add(basket, "of_a", 3);
    expect(basket).toEqual(["of_a", "of_a"]);
  });

  it("stops at the rooms the search asked for", () => {
    // The checkout refuses more rooms than were searched, so a stepper that went
    // further would only teach the agent that the button lies.
    let basket = fill("of_a", 3);
    basket = add(basket, "of_b", 3);
    expect(basket).toHaveLength(3);
  });

  it("removes one room rather than every room at that rate", () => {
    const basket = remove(["of_a", "of_a", "of_b"], "of_a");
    expect(basket).toEqual(["of_a", "of_b"]);
  });

  it("fills every room with one click, replacing whatever was there", () => {
    expect(fill("of_a", 3)).toEqual(["of_a", "of_a", "of_a"]);
    expect(fill("of_a", 1)).toEqual(["of_a"]);
  });
});
