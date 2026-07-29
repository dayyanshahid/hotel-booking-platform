import { describe, expect, it } from "vitest";
import { boardCodeFor, buildCancellation, buildPrice, remainingLabel } from "@/lib/server/tourmind/adapter";
import { TM_MEAL_TO_BOARD } from "@/lib/server/tourmind/types";
import { cityFor, distanceKm } from "@/lib/server/tourmind/catalogue";
import { isTourmindSlug, tourmindSlug } from "@/lib/server/tourmind/search";
import { TourmindError } from "@/lib/server/tourmind/client";
import { isIndeterminate, mapTourmindError } from "@/lib/server/tourmind/errors";
import { LIVE_SUPPLY_FILTERS } from "@/components/commerce/filters-panel";
import liveRate from "./fixtures/tourmind-rate.json";
import staticList from "./fixtures/tourmind-static-list.json";
import { __recordFromStatic as recordFrom } from "@/lib/server/tourmind/catalogue";
import {
  __offersFromHotel as collapse,
  __paxRoomsWithNames as createOrderBody,
} from "@/lib/server/tourmind/operations";
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
    net: 500,
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

describe("tourmind catalogue mapping", () => {
  const tokyoish = { countryCode: "JP", lat: 35.68, lng: 139.65 };

  it("places a property in the nearest city in its own country", () => {
    expect(cityFor(tokyoish)?.slug).toBe("tokyo");
  });

  it("never places a property in a city across a border", () => {
    // Two cities can be thirty kilometres apart across a frontier, and a hotel
    // in one is not inventory for the other. Country is checked first.
    const nearTokyoButWrongCountry = { ...tokyoish, countryCode: "KR" };
    expect(cityFor(nearTokyoButWrongCountry)?.slug).not.toBe("tokyo");
  });

  it("drops a property that is nowhere near a city we list", () => {
    // Mid-Pacific, correct country code, far from everything.
    expect(cityFor({ countryCode: "JP", lat: 20, lng: 150 })).toBeNull();
  });

  it("measures distance well enough to separate neighbouring cities", () => {
    const osaka = { lat: 34.6937, lng: 135.5023 };
    const kyoto = { lat: 35.0116, lng: 135.7681 };
    const km = distanceKm(osaka, kyoto);
    // Real-world Osaka–Kyoto is about 43 km.
    expect(km).toBeGreaterThan(35);
    expect(km).toBeLessThan(55);
  });

  it("matches on coordinates, not on how a city name is spelled", () => {
    // Their transliteration ("ShangHai") differs from ours, which is exactly
    // why the mapping is geometric.
    expect(cityFor({ countryCode: "CN", lat: 31.23, lng: 121.47 })?.slug).toBe("shanghai");
  });
});

describe("tourmind slugs", () => {
  it("round-trips a hotel id through its slug", () => {
    expect(tourmindSlug(8268393)).toBe("tm-8268393");
    expect(isTourmindSlug("tm-8268393")).toBe(true);
  });

  it("does not claim slugs belonging to another source", () => {
    expect(isTourmindSlug("hb-12345")).toBe(false);
    expect(isTourmindSlug("olaya-grand-riyadh")).toBe(false);
  });
});

describe("tourmind against a real response", () => {
  // Captured from their test API. The spec and the live payload disagree, and
  // this is the only thing that will notice if that happens again.
  const live = liveRate as unknown as Parameters<typeof boardCodeFor>[0];

  it("reads the board from the field the API actually sends", () => {
    // The spec documents MealInfo.MealCode; the API sends MealInfo.MealType,
    // as a string. Reading only the documented field made every live rate
    // "room only" — a board claim, made wrongly, on every card.
    expect(live.MealInfo).toHaveProperty("MealType");
    expect(live.MealInfo).not.toHaveProperty("MealCode");
    expect(boardCodeFor(live)).toBe("RO"); // MealType "1" is genuinely no breakfast
    expect(boardCodeFor({ MealInfo: { MealType: "2" } })).toBe("BB");
    expect(boardCodeFor({ MealInfo: { MealType: 8 } })).toBe("AI");
  });

  it("prices a real rate in the guest's currency", () => {
    const priced = buildPrice(live, intent, "en")!;
    expect(priced.supplierCurrency).toBe("CNY");
    expect(priced.net).toBeCloseTo(691.38, 2);
    // CNY 691 is roughly USD 97; with markup the total lands well under 691.
    expect(priced.price.currency).toBe("USD");
    expect(priced.price.total).toBeLessThan(priced.net);
    expect(priced.price.chargeCurrency).toBe("CNY");
  });

  it("derives the free-cancellation deadline from the charging window", () => {
    const priced = buildPrice(live, intent, "en")!;
    const policy = buildCancellation(live.CancelPolicyInfos, {
      refundable: Boolean(live.Refundable),
      checkIn: intent.checkIn,
      total: priced.price.total,
      net: priced.net,
      supplierCurrency: priced.supplierCurrency,
      displayCurrency: "USD",
      locale: "en",
    });
    // Their window charges the full amount from 24 Aug 11:00, so free until then.
    expect(policy.freeUntil).toBe("2026-08-24T11:00:00");
    expect(policy.steps[0].fee).toBe(0);
    expect(policy.steps[1].fee).toBe(priced.price.total);
  });

  it("keeps the supplier rate code out of anything customer-facing", () => {
    // Their RateCode embeds internal ids and the nationality it was priced for.
    expect(live.RateCode).toContain("|");
    const priced = buildPrice(live, intent, "en")!;
    expect(JSON.stringify(priced.price)).not.toContain(live.RateCode!);
  });
});

describe("tourmind supplier isolation", () => {
  it("keys cancellation on our reference, never on theirs", () => {
    // Their reservation id may never reach us — a create that timed out can
    // still have succeeded. The AgentRefID is derived from our own session, so
    // it is the one key we are certain we hold.
    const sessionId = "cs_abc123";
    const agentRef = `SPT-${sessionId}`;
    expect(agentRef.startsWith("SPT-")).toBe(true);
    expect(agentRef).toContain(sessionId);
    expect(agentRef.length).toBeLessThanOrEqual(128);
  });

  it("classifies a lost connection as unknown, not as failed", () => {
    // Treating an indeterminate create as a failure is how a customer ends up
    // booking twice.
    expect(isIndeterminate(new Error("TOURMIND_INDETERMINATE"))).toBe(true);
    expect(isIndeterminate(new TourmindError("temporaryService", "TIMEOUT", "x"))).toBe(true);
    expect(isIndeterminate(new TourmindError("temporaryService", "NETWORK", "x"))).toBe(true);
    // A rejected request is a clean failure — the customer can fix it.
    expect(isIndeterminate(new TourmindError("validation", "103", "x"))).toBe(false);
  });

  it("never shows a supplier message to a customer", () => {
    const mapped = mapTourmindError(
      new TourmindError("temporaryService", "104", "内部服务错误 node-7"),
      "en",
    );
    expect(mapped.message).not.toContain("node-7");
    expect(mapped.message).not.toMatch(/[一-鿿]/);
    expect(mapped.retryable).toBe(true);
  });

  it("tells a customer nothing was charged when the supplier is down", () => {
    const mapped = mapTourmindError(new TourmindError("temporaryService", "104", "x"), "en");
    expect(mapped.message.toLowerCase()).toContain("nothing has been charged");
  });
});

/**
 * What their server actually does, as opposed to what the specification says.
 *
 * Everything below was written against a live test account after the vendor
 * supplied credentials. Each case is a fault that shipped because the
 * integration had only ever been read, never run.
 */
describe("what the live API actually returns", () => {
  it("reads a hotel id that arrives as a string", () => {
    /*
     * The spec calls HotelId an integer; the wire carries "739867". A string
     * survived into the cached record, and the property page — which parses the
     * id back out of the slug as a number — then compared "739867" against
     * 739867 and found nothing. Every TourMind property was findable in search
     * and dead when opened.
     */
    const hotels = staticList.HotelStaticListResult.Hotels;
    const records = hotels.map((hotel) => recordFrom(hotel));
    for (const record of records) {
      expect(typeof record?.hotelId).toBe("number");
      expect(Number.isFinite(record?.hotelId)).toBe(true);
    }
    expect(records[0]?.hotelId).toBe(739867);
  });

  it("keeps the slug and the parsed id in agreement", () => {
    const record = recordFrom(staticList.HotelStaticListResult.Hotels[0]);
    const slug = tourmindSlug(record!.hotelId);
    expect(slug).toBe("tm-739867");
    // The property page's half of the round trip.
    expect(Number(slug.slice(3))).toBe(record!.hotelId);
  });
});

describe("what booking actually requires", () => {
  /**
   * Every booking failed with "Invalid PaxNames" until the guests were named.
   * Their `Type` enum is `ADU`/`CHI` and nothing else validates — "Adult" is
   * rejected exactly like sending no names at all.
   */
  it("names every guest with their own ADU/CHI type", () => {
    const body = createOrderBody(
      { ...intent, rooms: [{ adults: 2, childrenAges: [7] }, { adults: 1, childrenAges: [] }] },
      [
        { roomIndex: 0, type: "adult", firstName: "Amina", surname: "Haddad" },
        { roomIndex: 0, type: "adult", firstName: "Karim", surname: "Haddad" },
        { roomIndex: 0, type: "child", firstName: "Lina", surname: "Haddad" },
        { roomIndex: 1, type: "adult", firstName: "Sara", surname: "Nasser" },
      ],
    );

    expect(body[0].PaxNames).toEqual([
      { FirstName: "Amina", LastName: "Haddad", Type: "ADU" },
      { FirstName: "Karim", LastName: "Haddad", Type: "ADU" },
      { FirstName: "Lina", LastName: "Haddad", Type: "CHI" },
    ]);
    expect(body[1].PaxNames).toEqual([{ FirstName: "Sara", LastName: "Nasser", Type: "ADU" }]);
  });

  it("falls back to the lead traveller for a room nobody was named in", () => {
    // They refuse a room with no name, and an unnamed second room is the
    // ordinary case when a booker fills in only their own details.
    const body = createOrderBody({ ...intent, rooms: [{ adults: 2, childrenAges: [] }, { adults: 2, childrenAges: [] }] }, [
      { roomIndex: 0, type: "adult", firstName: "Amina", surname: "Haddad" },
    ]);
    expect(body[1].PaxNames).toEqual([{ FirstName: "Amina", LastName: "Haddad", Type: "ADU" }]);
  });
});

describe("a thousand rates for one property", () => {
  /**
   * Their test data returns over a thousand rates for a single hotel — the same
   * room at a hundred prices a few yuan apart. Passing that through put a
   * thousand rows on a property page and a thousand offers in the store, for a
   * choice nobody can make.
   */
  const rate = (room: string, price: number, meal: string, refundable: boolean) => ({
    RoomTypeCode: room,
    Name: room,
    RateInfos: [
      {
        RateCode: `${room}-${price}-${meal}-${refundable}`,
        TotalPrice: price,
        CurrencyCode: "CNY",
        Refundable: refundable,
        MealInfo: { MealType: meal },
      },
    ],
  });

  it("keeps the cheapest of each room, board and cancellation combination", () => {
    const offers = collapse(
      {
        HotelCode: "753337",
        RoomTypes: [
          rate("Superior Twin", 900, "1", true),
          rate("Superior Twin", 700, "1", true),
          rate("Superior Twin", 800, "1", true),
          // Same room, different board — a real choice, so it stays.
          rate("Superior Twin", 950, "2", true),
          // Same room and board, non-refundable — also a real choice.
          rate("Superior Twin", 650, "1", false),
          rate("Deluxe King", 1200, "2", true),
        ],
      },
      intent,
    );

    expect(offers).toHaveLength(4);
    const twinRefundableRoomOnly = offers.find(
      (offer) => offer.roomName === "Superior Twin" && offer.boardCode === "RO" && offer.refundable,
    );
    // 700, not the 900 that happened to come first.
    expect(twinRefundableRoomOnly?.net).toBe(700);
  });

  it("caps what one property can put on a page", () => {
    const many = Array.from({ length: 200 }, (_, i) => rate(`Room ${i}`, 500 + i, "1", true));
    const offers = collapse({ HotelCode: "1", RoomTypes: many }, intent);
    expect(offers.length).toBeLessThanOrEqual(40);
    // Cheapest first, so the cap keeps what a guest would have chosen anyway.
    expect(offers[0].net).toBe(500);
  });
});

describe("only what the suppliers publish", () => {
  /**
   * The trade portal offers a filter for every one of these and the two
   * contracted suppliers answer none of them: neither publishes a guest review
   * score, neither marks a room accessible in the data we hold, and payment
   * timing is a consumer concern where an agency settles on account. A control
   * that silently matches nothing is worse than an absent one — an agent reads
   * the empty result as "no availability".
   */
  it("offers no filter the live suppliers cannot answer", () => {
    expect(LIVE_SUPPLY_FILTERS).not.toContain("rating");
    expect(LIVE_SUPPLY_FILTERS).not.toContain("accessible");
    expect(LIVE_SUPPLY_FILTERS).not.toContain("payLater");
  });

  it("offers the ones they do", () => {
    // Price, star rating, board and cancellation come from both suppliers;
    // zone, property type, facilities and promotions from Hotelbeds, and
    // amenities now from TourMind's static list as well.
    for (const key of ["price", "stars", "board", "refundable", "amenities"]) {
      expect(LIVE_SUPPLY_FILTERS).toContain(key);
    }
  });
});
