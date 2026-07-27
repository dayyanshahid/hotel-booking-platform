import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import { signature, HotelbedsError } from "@/lib/server/hotelbeds/client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import {
  adaptAvailability,
  buildCancellationFromPolicies,
  buildRateComments,
} from "@/lib/server/hotelbeds/adapter";
import { mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { applyMarkup } from "@/lib/server/markup";
import { timezoneForCountry } from "@/lib/server/timezones";
import { convertCurrency } from "@/lib/format";
import type { HbAvailabilityResponse, HbHotel } from "@/lib/server/hotelbeds/types";
import type { SearchIntent } from "@/lib/types";

/**
 * The integration is tested against a recorded payload rather than the live API:
 * evaluation keys allow 50 requests a day, so a test suite must never spend
 * them. `npm run hotelbeds:smoke` is the live check.
 */

const fixture = availabilityFixture as HbAvailabilityResponse;
const hotel = fixture.hotels!.hotels![0] as HbHotel;
const emptyHotel = fixture.hotels!.hotels![1] as HbHotel;

const intent: SearchIntent = {
  destinationId: "hbd-PMI",
  destinationDisplay: "Mallorca",
  destinationType: "city",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "EUR",
};

/* ------------------------------------------------------------------- auth */

describe("authentication", () => {
  it("signs with SHA256 of key + secret + unix seconds, in hex", () => {
    const expected = createHash("sha256").update("mykeymysecret1700000000").digest("hex");
    expect(signature("mykey", "mysecret", 1_700_000_000)).toBe(expected);
    expect(signature("mykey", "mysecret", 1_700_000_000)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different signature for each timestamp", () => {
    expect(signature("k", "s", 1)).not.toBe(signature("k", "s", 2));
  });

  it("stays disabled until both credentials are present", () => {
    // The suite runs without credentials, which is exactly the fallback case.
    expect(isHotelbedsEnabled()).toBe(Boolean(process.env.HOTELBEDS_API_KEY && process.env.HOTELBEDS_SECRET));
  });

  it("defaults to the test environment, never live", () => {
    expect(getHotelbedsConfig().baseUrl).toContain("api.test.hotelbeds.com");
  });

  it("never times a booking out below the documented 60 seconds", () => {
    expect(getHotelbedsConfig().timeouts.booking).toBeGreaterThanOrEqual(60000);
  });
});

/* --------------------------------------------------------------- adapter */

describe("availability adaptation", () => {
  let adapted: NonNullable<Awaited<ReturnType<typeof adaptAvailability>>>;

  beforeAll(async () => {
    adapted = (await adaptAvailability(hotel, intent, "en"))!;
  });

  it("produces a canonical hotel with a stable slug", () => {
    expect(adapted.hotel.slug).toBe("hb-100234-hotel-playa-de-palma");
    expect(adapted.hotel.canonicalHotelId).toBe("chl-hb-100234-hotel-playa-de-palma");
    expect(adapted.hotel.category).toBe(4);
  });

  it("adapts every priced rate into an offer", () => {
    expect(adapted.offers).toHaveLength(2);
    expect(adapted.rooms).toHaveLength(1);
  });

  it("applies the configured markup to the supplier net rate", () => {
    const offer = adapted.offers[0];
    const expected = applyMarkup(420).total;
    expect(offer.price.total).toBe(expected);
    expect(offer.price.total).toBeGreaterThan(420);
  });

  it("keeps non-included taxes out of the total and labels them pay-at-property", () => {
    const offer = adapted.offers[0];
    expect(offer.price.payAtProperty.map((line) => line.amount)).toContain(12);
    expect(offer.price.includedCharges.some((line) => line.amount === 38)).toBe(true);
    const payAtPropertySum = offer.price.payAtProperty.reduce((sum, line) => sum + line.amount, 0);
    expect(offer.price.total).toBeLessThan(applyMarkup(420).total + payAtPropertySum);
  });

  it("surfaces a mandatory hotel charge even when the amount is unknown", () => {
    const mandatory = adapted.offers[1];
    const line = mandatory.price.payAtProperty[0];
    expect(line).toBeDefined();
    expect(line.estimated).toBe(true);
  });

  it("marks a rate the supplier flags for revalidation as needing live confirmation", () => {
    const recheck = adapted.offers.find((offer) => offer.capabilities.recheckRequired);
    expect(recheck).toBeDefined();
    expect(recheck!.capabilities.instantConfirmation).toBe(false);
  });

  it("never leaks the rate key, supplier rate types or supplier identifiers", () => {
    const serialized = JSON.stringify({
      hotel: adapted.hotel,
      rooms: adapted.rooms,
      offers: adapted.offers,
    });

    // The opaque rate key must not appear anywhere in the customer payload.
    const rateKeys = hotel.rooms!.flatMap((room) => room.rates!.map((rate) => rate.rateKey!));
    for (const rateKey of rateKeys) expect(serialized).not.toContain(rateKey);

    // Nor the supplier's own rate-type vocabulary as a value, its field names,
    // its comment identifiers, or its brand.
    expect(serialized).not.toMatch(/"(RECHECK|BOOKABLE)"/);
    expect(serialized).not.toMatch(/rateKey|rateCommentsId|hotelSellingRate/);
    expect(serialized).not.toContain("123|20260101|20261231");
    expect(serialized.toLowerCase()).not.toContain("hotelbeds");

    // The offer IDs the client receives carry no supplier data.
    for (const offer of adapted.offers) expect(offer.offerId).toMatch(/^of_hb_[a-z0-9]+$/);
  });

  it("binds each offer to its supplier rate key server-side only", () => {
    expect(adapted.contexts.size).toBe(2);
    for (const context of adapted.contexts.values()) {
      expect(context.rateKey).toContain("|");
      expect(context.hotelCode).toBe(100234);
    }
  });

  it("drops a hotel whose rates carry no usable price rather than showing zero", async () => {
    expect(await adaptAvailability(emptyHotel, intent, "en")).toBeNull();
  });

  it("converts into the customer's display currency and names the charge currency", async () => {
    const inSar = (await adaptAvailability(hotel, { ...intent, currency: "SAR" }, "en"))!;
    const offer = inSar.offers[0];
    expect(offer.price.currency).toBe("SAR");
    expect(offer.price.chargeCurrency).toBe("EUR");
    expect(offer.price.fxBasis).toBeTruthy();
    expect(offer.price.total).toBe(convertCurrency(applyMarkup(420).total, "EUR", "SAR"));
  });

  it("localizes the adapted output", async () => {
    const arabic = (await adaptAvailability(hotel, { ...intent, locale: "ar" }, "ar"))!;
    const line = arabic.offers[1].price.payAtProperty[0];
    expect(line.label).toMatch(/[؀-ۿ]/);
  });
});

/* ----------------------------------------------------------- cancellation */

describe("cancellation policy mapping", () => {
  const options = {
    checkIn: "2026-09-10",
    total: 470,
    supplierCurrency: "EUR" as const,
    displayCurrency: "EUR" as const,
    countryCode: "ES",
    locale: "en" as const,
  };

  it("builds a free window before the first fee applies", () => {
    const policy = buildCancellationFromPolicies(
      [
        { amount: "140.00", from: "2099-09-08T23:59:00+02:00" },
        { amount: "420.00", from: "2099-09-10T00:00:00+02:00" },
      ],
      { ...options, checkIn: "2099-09-10" },
    );
    expect(policy.refundable).toBe(true);
    expect(policy.freeUntil).toBe("2099-09-08T23:59:00+02:00");
    expect(policy.steps[0].fee).toBe(0);
    expect(policy.timezone).toBe("Europe/Madrid");
  });

  it("treats an absent policy block as non-refundable rather than unknown", () => {
    const policy = buildCancellationFromPolicies(undefined, options);
    expect(policy.refundable).toBe(false);
    expect(policy.freeUntil).toBeUndefined();
    expect(policy.steps[0].fee).toBe(options.total);
  });

  it("treats a deadline already in the past as non-refundable", () => {
    const policy = buildCancellationFromPolicies([{ amount: "420.00", from: "2020-01-01T00:00:00+02:00" }], options);
    expect(policy.refundable).toBe(false);
  });

  it("never quotes a fee above the total the customer paid", () => {
    const policy = buildCancellationFromPolicies([{ amount: "99999.00", from: "2099-01-01T00:00:00+02:00" }], options);
    for (const step of policy.steps) expect(step.fee).toBeLessThanOrEqual(options.total);
  });

  it("falls back to UTC for a country with no known zone rather than guessing", () => {
    expect(timezoneForCountry("ZZ")).toBe("UTC");
    expect(timezoneForCountry("SA")).toBe("Asia/Riyadh");
  });
});

/* -------------------------------------------------------------- comments */

describe("rate comments", () => {
  it("structures the supplier's wording and preserves it verbatim", () => {
    const comments = buildRateComments(hotel.rooms![0].rates![0], "en");
    const supplierComment = comments[0];
    expect(supplierComment.summary.length).toBeGreaterThan(0);
    expect(supplierComment.verbatim).toContain("Check-in is from 15:00");
    expect(comments.some((comment) => comment.mandatory)).toBe(true);
  });

  it("states a mandatory charge explicitly when the supplier sends no wording", () => {
    const comments = buildRateComments({ hotelMandatory: true }, "en");
    expect(comments[0].mandatory).toBe(true);
    expect(comments[0].summary).toMatch(/mandatory charge/i);
  });
});

/* ---------------------------------------------------------------- errors */

describe("supplier error mapping (§10.1)", () => {
  const cases: [HotelbedsError, string, boolean][] = [
    [new HotelbedsError("auth", "Invalid signature"), "temporaryService", true],
    [new HotelbedsError("quotaExceeded", "Quota exceeded"), "temporaryService", true],
    [new HotelbedsError("timeout", "timed out"), "temporaryService", true],
    [new HotelbedsError("invalidRequest", "bad rateKey"), "availabilityChanged", false],
    [new HotelbedsError("supplierError", "no availability"), "availabilityChanged", false],
  ];

  it.each(cases)("maps %s to a customer-safe category", (error, category, retryable) => {
    const mapped = mapSupplierError(error, "en");
    expect(mapped.category).toBe(category);
    expect(mapped.retryable).toBe(retryable);
  });

  it("never puts the supplier name, code or wording in the customer message", () => {
    const mapped = mapSupplierError(
      new HotelbedsError("auth", "APIKEY INVALID", { supplierCode: "AUTH_001", status: 403 }),
      "en",
    );
    expect(mapped.message).not.toMatch(/hotelbeds|apikey|AUTH_001|quota|signature/i);
    // The supplier detail survives only for the server log.
    expect(mapped.logDetail).toContain("AUTH_001");
  });

  it("localizes the customer message", () => {
    expect(mapSupplierError(new HotelbedsError("timeout", "x"), "ar").message).toMatch(/[؀-ۿ]/);
  });
});

/* ---------------------------------------------------------------- markup */

describe("commercial policy", () => {
  it("never returns a customer price below the supplier net", () => {
    for (const net of [1, 99.5, 420, 10000]) {
      expect(applyMarkup(net).total).toBeGreaterThanOrEqual(net);
    }
  });

  it("keeps the net out of the customer-facing figure", () => {
    const result = applyMarkup(100, { percent: 12 });
    expect(result.total).toBe(112);
    expect(result.net).toBe(100);
  });
});
