import { describe, expect, it } from "vitest";
import { validateIntent } from "@/lib/server/validate";
import { computePrice } from "@/lib/server/pricing";
import { buildCancellation, normalizeHotel, buildResultCard } from "@/lib/server/normalize";
import { fetchFromSources } from "@/lib/server/suppliers";
import { runSearch, suggest } from "@/lib/server/search";
import { HOTEL_SEEDS, getHotelSeed } from "@/lib/data/hotels";
import { destinationFromPrice, hotelFromPrice } from "@/lib/server/from-price";
import { formatMoney, nightsBetween } from "@/lib/format";
import { intentFromSearchParams, searchParamsFromIntent } from "@/lib/nav";
import type { SearchIntent } from "@/lib/types";
import { BOARD_CATALOG, canonicalBoard, localized, titleCaseBoard } from "@/lib/data/catalog";
import { scoreSupply } from "@/lib/server/normalize";

const intent: SearchIntent = {
  destinationId: "dest-riyadh",
  destinationDisplay: "Riyadh",
  destinationType: "city",
  checkIn: "2026-11-10",
  checkOut: "2026-11-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [9] }],
  locale: "en",
  currency: "SAR",
};

/* ------------------------------------------------- §14.2 Search module */

describe("search intent validation", () => {
  it("requires a destination chosen from suggestions", () => {
    const result = validateIntent({ ...intent, destinationId: "" }, "en");
    expect(result.valid).toBe(false);
    expect(result.fields.destinationId).toBeTruthy();
  });

  it("rejects a check-out on or before check-in", () => {
    const result = validateIntent({ ...intent, checkOut: intent.checkIn }, "en");
    expect(result.valid).toBe(false);
    expect(result.fields.dates).toBeTruthy();
  });

  it("rejects past check-in dates", () => {
    const result = validateIntent({ ...intent, checkIn: "2020-01-01", checkOut: "2020-01-04" }, "en");
    expect(result.valid).toBe(false);
  });

  it("requires at least one adult per room", () => {
    const result = validateIntent({ ...intent, rooms: [{ adults: 0, childrenAges: [] }] }, "en");
    expect(result.valid).toBe(false);
    expect(result.fields["rooms.0.adults"]).toBeTruthy();
  });

  it("validates each child age individually", () => {
    const result = validateIntent({ ...intent, rooms: [{ adults: 2, childrenAges: [99] }] }, "en");
    expect(result.valid).toBe(false);
    expect(result.fields["rooms.0.childrenAges.0"]).toBeTruthy();
  });

  it("localizes messages", () => {
    const result = validateIntent({ ...intent, destinationId: "" }, "ar");
    expect(result.fields.destinationId).toMatch(/[؀-ۿ]/);
  });
});

describe("deep links restore search state", () => {
  it("round-trips an intent through URL parameters", () => {
    const params = searchParamsFromIntent(intent);
    const restored = intentFromSearchParams(params, "en");
    expect(restored?.destinationId).toBe(intent.destinationId);
    expect(restored?.checkIn).toBe(intent.checkIn);
    expect(restored?.rooms).toEqual(intent.rooms);
  });

  it("never places member or promo eligibility in the URL", () => {
    const params = searchParamsFromIntent(intent).toString();
    expect(params).not.toMatch(/member|promo|net|margin/i);
  });
});

describe("autocomplete", () => {
  it("labels every suggestion with country context", () => {
    const results = suggest("ri", "en");
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) expect(item.context.length).toBeGreaterThan(0);
  });

  it("returns localized labels in Arabic", () => {
    const results = suggest("الري", "ar");
    expect(results[0]?.label).toMatch(/[؀-ۿ]/);
  });
});

/* -------------------------------------------------- §14.2 Rooms / rates */

describe("pricing", () => {
  const seed = getHotelSeed("olaya-grand-riyadh")!;
  const base = {
    seed,
    roomKey: "std-king",
    board: "BB" as const,
    rateClass: "flex" as const,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    rooms: intent.rooms,
    currency: "SAR" as const,
    countryCode: "SA",
    sourceCode: "S1",
    locale: "en" as const,
  };

  it("is deterministic for the same inputs", () => {
    expect(computePrice(base).total).toBe(computePrice(base).total);
  });

  it("returns a stay total, not a nightly rate", () => {
    const price = computePrice(base);
    const nights = nightsBetween(base.checkIn, base.checkOut);
    expect(price.nights).toBe(nights);
    expect(price.total).toBeGreaterThan(price.nightlyAverage);
    expect(price.nightlyAverage).toBe(Math.round(price.total / nights));
  });

  it("separates included charges from pay-at-property charges", () => {
    const price = computePrice({ ...base, seed: getHotelSeed("riyadh-metro-inn")! });
    expect(price.includedCharges.every((c) => c.basis === "included")).toBe(true);
    expect(price.payAtProperty.every((c) => c.basis === "payAtProperty")).toBe(true);
    // Pay-at-property is never folded into the total.
    const includedSum = price.includedCharges.reduce((s, c) => s + c.amount, 0);
    expect(price.total).toBe(price.base + includedSum);
  });

  it("prices a non-refundable rate below the flexible rate", () => {
    expect(computePrice({ ...base, rateClass: "nrf" }).total).toBeLessThan(computePrice(base).total);
  });

  it("charges for extra adults and older children", () => {
    const bigger = computePrice({ ...base, rooms: [{ adults: 4, childrenAges: [12] }] });
    expect(bigger.total).toBeGreaterThan(computePrice(base).total);
  });

  it("only shows a strike-through against a comparable basis", () => {
    const flexible = computePrice(base);
    expect(flexible.strikeTotal).toBeUndefined();
    const discounted = computePrice({ ...base, rateClass: "nrf" });
    expect(discounted.strikeTotal).toBeGreaterThan(discounted.total);
  });

  it("labels the charge currency when converting", () => {
    const converted = computePrice({ ...base, currency: "USD" });
    expect(converted.chargeCurrency).toBe("SAR");
    expect(converted.fxBasis).toBeTruthy();
  });
});

describe("cancellation policy", () => {
  it("marks a non-refundable rate clearly with no free window", () => {
    const policy = buildCancellation("nrf", "2026-11-10", 1000, 3, "Asia/Riyadh", "en");
    expect(policy.refundable).toBe(false);
    expect(policy.freeUntil).toBeUndefined();
  });

  it("puts the free-cancellation deadline before check-in in the destination time zone", () => {
    const policy = buildCancellation("flex", "2026-11-10", 1000, 3, "Asia/Riyadh", "en");
    expect(policy.refundable).toBe(true);
    expect(policy.timezone).toBe("Asia/Riyadh");
    expect(policy.freeUntil! < "2026-11-10").toBe(true);
    expect(policy.steps[0].fee).toBe(0);
    expect(policy.steps[policy.steps.length - 1].fee).toBe(1000);
  });
});

/* ---------------------------------------------- §14.2 Results / mapping */

describe("supplier normalization", () => {
  it("merges duplicate listings into one canonical property", async () => {
    const responses = await fetchFromSources(intent, "normal");
    const seed = getHotelSeed("olaya-grand-riyadh")!;
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    // The property is listed by both sources...
    expect(new Set(raw.map((o) => o.sourceCode)).size).toBe(2);
    const normalized = normalizeHotel(seed, raw, intent, "en", "normal", { persistOffers: false })!;
    // ...but resolves to a single canonical hotel.
    expect(normalized.hotel.canonicalHotelId).toBe(`chl-${seed.slug}`);
    const card = buildResultCard(normalized, intent, "en");
    expect(card.canonicalHotelId).toBe(normalized.hotel.canonicalHotelId);
  });

  it("keeps low-confidence room matches separate", async () => {
    const seed = getHotelSeed("riyadh-metro-inn")!;
    const responses = await fetchFromSources(intent, "normal");
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    const normalized = normalizeHotel(seed, raw, intent, "en", "normal", { persistOffers: false })!;
    const ambiguous = normalized.rooms.filter((r) => r.canonicalRoomId.includes("superior-ambiguous"));
    expect(ambiguous.length).toBeGreaterThan(1);
    for (const room of ambiguous) expect(room.mappingConfidence).toBeLessThan(0.8);
  });

  it("never exposes supplier identifiers, rate keys or raw rate types", async () => {
    const responses = await fetchFromSources(intent, "normal");
    const seed = getHotelSeed("olaya-grand-riyadh")!;
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    const normalized = normalizeHotel(seed, raw, intent, "en", "normal", { persistOffers: false })!;
    const serialized = JSON.stringify({ hotel: normalized.hotel, rooms: normalized.rooms, offers: normalized.offers });
    expect(serialized).not.toMatch(/RECHECK|BOOKABLE|rateKey|"S1"|"S2"|TM-\d/);
  });

  it("explains every recommendation badge", async () => {
    const responses = await fetchFromSources(intent, "normal");
    const seed = getHotelSeed("olaya-grand-riyadh")!;
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    const normalized = normalizeHotel(seed, raw, intent, "en", "normal", { persistOffers: false })!;
    for (const offer of normalized.offers) {
      for (const badge of offer.badges) expect(badge.reason.length).toBeGreaterThan(10);
    }
  });

  it("does not lead with an accessible room unless one was requested", async () => {
    const seed = getHotelSeed("northern-ring-residences")!;
    const responses = await fetchFromSources(intent, "normal");
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    const normalized = normalizeHotel(seed, raw, intent, "en", "normal", { persistOffers: false })!;
    const card = buildResultCard(normalized, intent, "en");
    const accessibleIds = normalized.rooms.filter((r) => r.accessible).map((r) => r.canonicalRoomId);
    const chosen = normalized.offers.find((o) => o.offerId === card.offerSummary.offerId)!;
    expect(accessibleIds).not.toContain(chosen.canonicalRoomId);
  });
});

/* ---------------------------------------------------- §10 edge cases */

describe("edge-case behaviour", () => {
  it("E-02: one failing source still returns partial results", async () => {
    const response = await runSearch(intent, { scenario: "supplierTimeout", locale: "en" });
    expect(response.completeness).toBe("partial");
    expect(response.completenessMessage).toBeTruthy();
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("E-03: all sources failing is reported, never as an empty inventory claim", async () => {
    const response = await runSearch(intent, { scenario: "allSuppliersFail", locale: "en" });
    expect(response.completeness).toBe("empty");
    expect(response.results.length).toBe(0);
  });

  it("E-01: zero results returns concrete recovery options", async () => {
    const response = await runSearch(intent, { scenario: "zeroResults", locale: "en" });
    expect(response.totalCount).toBe(0);
    expect(response.recovery?.nearbyDates.length).toBeGreaterThan(0);
    expect(response.recovery?.nearbyDestinations.length).toBeGreaterThan(0);
  });

  it("E-06: missing content still renders a usable card", async () => {
    const seed = getHotelSeed("olaya-grand-riyadh")!;
    const responses = await fetchFromSources(intent, "missingContent");
    const raw = responses.flatMap((r) => r.offers).filter((o) => o.hotelSlug === seed.slug);
    const normalized = normalizeHotel(seed, raw, intent, "en", "missingContent", { persistOffers: false })!;
    expect(normalized.hotel.images.length).toBe(0);
    const card = buildResultCard(normalized, intent, "en");
    expect(card.name).toBeTruthy();
    expect(card.price.total).toBeGreaterThan(0);
  });

  it("only returns rooms that fit the exact occupancy", async () => {
    const bigParty: SearchIntent = { ...intent, rooms: [{ adults: 4, childrenAges: [3, 6] }] };
    const response = await runSearch(bigParty, { scenario: "normal", locale: "en" });
    for (const card of response.results) expect(card.price.guests).toBe(6);
  });
});

/* ----------------------------------------------------- §11.3 formatting */

describe("presentation", () => {
  it("formats currency per locale without losing the code", () => {
    expect(formatMoney(1234, "SAR", "en")).toMatch(/1,234/);
    expect(formatMoney(1234, "SAR", "ar")).toMatch(/[٠-٩\d]/);
  });
});

/* ------------------------------------------------ §8.2 indicative prices */

describe("browse 'from' prices", () => {
  it("never quotes above what the property can actually be booked for", async () => {
    // A "from" price that a real search cannot match is the one direction that
    // misleads. It may be lower than a given search — dates and occupancy move
    // it — but never higher than the cheapest room's own nightly rate.
    for (const seed of HOTEL_SEEDS.slice(0, 6)) {
      const from = hotelFromPrice(seed, "SAR", "en");
      const response = await runSearch(
        {
          ...intent,
          destinationId: seed.destinationId,
          rooms: [{ adults: 2, childrenAges: [] }],
        },
        { scenario: "normal", locale: "en" },
      );
      const card = response.results.find((c) => c.slug === seed.slug);
      if (!card) continue;
      expect(from.amount).toBeLessThanOrEqual(card.price.nightlyAverage);
    }
  });

  it("a destination quotes the cheapest of its properties", () => {
    const destinationId = "dest-riyadh";
    const cheapest = Math.min(
      ...HOTEL_SEEDS.filter((h) => h.destinationId === destinationId).map(
        (seed) => hotelFromPrice(seed, "SAR", "en").amount,
      ),
    );
    expect(destinationFromPrice(destinationId, "SAR", "en")?.amount).toBe(cheapest);
  });

  it("has no price for a destination with no properties", () => {
    expect(destinationFromPrice("dest-nowhere", "SAR", "en")).toBeNull();
  });
});

describe("filters describe the property, not its cheapest rate", () => {
  /**
   * The bug these replace: refundable, pay-later and board were answered from
   * the single lead offer on the card. The lead offer is the cheapest, which is
   * almost always non-refundable and prepaid — so "pay later" matched nothing
   * and "refundable" matched a tenth of the properties that had a refundable
   * rate. Guests were told hotels did not exist because their cheapest room did
   * not qualify.
   */
  const offers = [
    { paymentTiming: "payNow", cancellation: { refundable: false }, board: { code: "RO" } },
    { paymentTiming: "payLater", cancellation: { refundable: true }, board: { code: "BB" } },
  ];

  const propertyHas = {
    refundable: (list: typeof offers) => list.some((o) => o.cancellation.refundable),
    payLater: (list: typeof offers) => list.some((o) => o.paymentTiming !== "payNow"),
    board: (list: typeof offers, code: string) => list.some((o) => o.board.code === code),
  };

  it("qualifies on any rate, not the first", () => {
    expect(propertyHas.refundable(offers)).toBe(true);
    expect(propertyHas.payLater(offers)).toBe(true);
    expect(propertyHas.board(offers, "BB")).toBe(true);
  });

  it("still excludes a property with no qualifying rate", () => {
    const prepaidOnly = [offers[0]];
    expect(propertyHas.refundable(prepaidOnly)).toBe(false);
    expect(propertyHas.payLater(prepaidOnly)).toBe(false);
    expect(propertyHas.board(prepaidOnly, "BB")).toBe(false);
  });

  it("matches a board by code so one board is not two filter values", () => {
    // Our "Breakfast included" and a supplier's "BED AND BREAKFAST" are the
    // same board; only the code is stable across suppliers and languages.
    expect(propertyHas.board(offers, "BB")).toBe(true);
    expect(propertyHas.board(offers, "Breakfast included")).toBe(false);
  });
});

describe("one board vocabulary, whichever supplier is selling", () => {
  /*
   * Found by reading the board facet of three live searches.
   *
   * Hotelbeds sends GB for English breakfast and CB for Continental, and both
   * were arriving as facet values in their own right — so London offered
   * "Breakfast included", "ENGLISH BREAKFAST" and "CONTINENTAL BREAKFAST" as
   * three unrelated filters, in the supplier's block capitals, while TourMind's
   * breakfast rates sat under the first of them. Someone filtering for
   * breakfast was shown one supplier's breakfast and a third of the other's.
   */
  it("folds a supplier's breakfast spellings into one board", () => {
    expect(canonicalBoard("GB")).toBe("BB");
    expect(canonicalBoard("CB")).toBe("BB");
    expect(canonicalBoard("bb")).toBe("BB");
  });

  it("does not fold boards that are genuinely different meals", () => {
    /*
     * The tempting shortcut is to call dinner "half board" and be done. Half
     * board includes breakfast; a dinner-only rate does not, and the guest
     * discovers the difference at breakfast. Each keeps its own entry.
     */
    expect(canonicalBoard("CE")).toBe("DI");
    expect(canonicalBoard("CO")).toBe("LU");
    expect(canonicalBoard("SC")).toBe("SC");

    for (const code of ["DI", "LU", "SC", "RO", "BB", "HB", "FB", "AI"]) {
      expect(BOARD_CATALOG[code], `${code} needs a name of our own`).toBeDefined();
      expect(localized(BOARD_CATALOG[code].label, "ar")).toBeTruthy();
    }
    expect(canonicalBoard("HB")).not.toBe(canonicalBoard("DI"));
  });

  it("leaves an unknown board alone rather than misfiling it", () => {
    // Guessing is worse than not knowing: a board mapped to the wrong meal is
    // a promise to a guest that the property never made.
    expect(canonicalBoard("ZZ")).toBe("ZZ");
    expect(canonicalBoard(undefined)).toBe("RO");
  });

  it("stops a supplier's label from shouting on our filter list", () => {
    expect(titleCaseBoard("DINNER INCLUDED")).toBe("Dinner included");
    expect(titleCaseBoard("SELF CATERING")).toBe("Self catering");
    // Already-quiet text is left as it is.
    expect(titleCaseBoard("Room only")).toBe("Room only");
  });
});

describe("ranking is blind to which supplier sold the room", () => {
  /*
   * Measured across five live cities before this existed: TourMind held the
   * last eighteen positions of every result set and never once appeared in the
   * first twelve — including in Istanbul, where it was the cheaper supplier.
   * The cause was that each adapter filled in its own scores. Hotelbeds set
   * quality and flexibility; TourMind set a row of zeroes; and both left price
   * at zero, so the thirty per cent of "recommended" we publish as being about
   * price was about nothing.
   *
   * An agent works the first page. A supplier that cannot reach it is a
   * supplier we are not selling.
   */
  function hotel(name: string, total: number, opts: { category?: number; refundable?: boolean } = {}) {
    const offer = {
      offerId: `of-${name}`,
      canonicalRoomId: `${name}::room`,
      board: { code: "RO", label: "Room only", detail: "" },
      paymentTiming: "payLater" as const,
      cancellation: { refundable: opts.refundable ?? true, timezone: "UTC", steps: [] },
      price: { total, currency: "USD" },
      comments: [],
      badges: [],
      capabilities: {
        recheckRequired: false, cancellationQuote: true, modifyAllowed: false,
        guaranteeEligible: false, instantConfirmation: true,
      },
      expiresAt: new Date(0).toISOString(),
      roomsCovered: 1,
      scores: { price: 0, flexibility: 0, quality: 0, location: 0, fit: 0 },
    };
    return {
      hotel: { name, category: opts.category ?? 4, review: undefined },
      rooms: [],
      offers: [offer],
      sourceCount: 1,
    };
  }

  const intent = { rooms: [{ adults: 2, childrenAges: [] }] };

  it("gives two identical rooms identical scores, whoever supplied them", () => {
    const supply = [hotel("from-tourmind", 200), hotel("from-hotelbeds", 200)];
    scoreSupply(supply as never, intent as never);
    expect(supply[0].offers[0].scores).toEqual(supply[1].offers[0].scores);
  });

  it("scores the cheaper room higher on price", () => {
    const supply = [hotel("cheap", 100), hotel("dear", 900)];
    scoreSupply(supply as never, intent as never);
    expect(supply[0].offers[0].scores.price).toBeGreaterThan(supply[1].offers[0].scores.price);
  });

  it("stops one outlier from flattening everything below it", () => {
    /*
     * The reason this is a percentile and not a min-max stretch. On a linear
     * scale a single five-thousand-dollar suite squashes a hundred-dollar room
     * and a three-hundred-dollar room to within a rounding error of each other,
     * and price stops separating anything.
     */
    const supply = [hotel("a", 100), hotel("b", 300), hotel("c", 5000)];
    scoreSupply(supply as never, intent as never);
    const [a, b] = [supply[0].offers[0].scores.price, supply[1].offers[0].scores.price];
    expect(a - b).toBeGreaterThan(0.3);
  });

  it("no longer leaves price out of a ranking that claims to weigh it", () => {
    /*
     * The defect was that every price score was zero, so the published "30% of
     * recommended is your stay total" was decoration. The invariant is that
     * price separates the list — not that every entry is above zero, since the
     * dearest option is cheaper than nothing else and a percentile says so.
     */
    const supply = [hotel("a", 100), hotel("b", 300), hotel("c", 500)];
    scoreSupply(supply as never, intent as never);
    const scores = supply.map((h) => h.offers[0].scores.price);
    expect(new Set(scores).size).toBe(scores.length);
    expect(Math.max(...scores)).toBeGreaterThan(0);
  });

  it("rewards flexibility and quality on their own terms", () => {
    const supply = [hotel("flex", 200), hotel("nrf", 200, { refundable: false })];
    scoreSupply(supply as never, intent as never);
    expect(supply[0].offers[0].scores.flexibility).toBeGreaterThan(supply[1].offers[0].scores.flexibility);

    const stars = [hotel("five", 200, { category: 5 }), hotel("two", 200, { category: 2 })];
    scoreSupply(stars as never, intent as never);
    expect(stars[0].offers[0].scores.quality).toBeGreaterThan(stars[1].offers[0].scores.quality);
  });
});
