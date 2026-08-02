import { describe, expect, it } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { adaptAvailability } from "@/lib/server/hotelbeds/adapter";
import { searchHotelbedsDestination } from "@/lib/server/hotelbeds/search";
import { resetQuota } from "@/lib/server/hotelbeds/client";
import { getOffer } from "@/lib/server/store";
import type { HbAvailabilityResponse, HbHotel } from "@/lib/server/hotelbeds/types";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import type { SearchIntent } from "@/lib/types";

/**
 * The number the supplier gave us, kept.
 *
 * Both suppliers report how many rooms a rate still holds — Hotelbeds as
 * `allotment`, TourMind as `Allotment` — and both adapters read it only to
 * decide whether to print "2 left at this price", then dropped it.
 *
 * The checkout has a guard against selling more rooms than a rate holds. It
 * was being handed a hard-coded zero by every writer, which it correctly reads
 * as "the source did not say" and lets through. So the guard existed, was
 * well-written, and had never once refused anything: an agent could put three
 * lines on a rate with one room left and find out at the counter.
 *
 * This is the join, asserted at the adapter, because that is where the number
 * was being thrown away.
 */

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

async function adaptFirst(mutate?: (rate: Record<string, unknown>) => void) {
  // Deep-cloned so a case that edits a rate cannot leak into the next.
  const fixture = JSON.parse(JSON.stringify(availabilityFixture)) as HbAvailabilityResponse;
  const hotel = fixture.hotels!.hotels![0] as HbHotel;
  if (mutate) {
    for (const room of hotel.rooms ?? []) {
      for (const rate of room.rates ?? []) mutate(rate as unknown as Record<string, unknown>);
    }
  }
  return adaptAvailability(hotel, intent, "en");
}

describe("what the supplier said it holds", () => {
  it("keeps the allotment on every offer, not just the scarcity phrase", async () => {
    const adapted = await adaptFirst((rate) => {
      rate.allotment = 2;
    });
    expect(adapted).toBeTruthy();
    expect(adapted!.offers.length).toBeGreaterThan(0);
    for (const offer of adapted!.offers) {
      expect(offer.allotment).toBe(2);
    }
  });

  it("says zero when the supplier says nothing, because unknown is not a limit", async () => {
    /*
     * The important half. Inventing a ceiling where the supplier stated none
     * would refuse bookings that would have gone through, which is a worse
     * failure than the one being fixed.
     */
    const adapted = await adaptFirst((rate) => {
      delete rate.allotment;
    });
    for (const offer of adapted!.offers) {
      expect(offer.allotment).toBe(0);
    }
  });

  it("still only shouts about scarcity when the number is small", async () => {
    // A large allotment is inventory data, not urgency, and dressing it as
    // scarcity is the pressure tactic the scope forbids (§8.2).
    const many = await adaptFirst((rate) => {
      rate.allotment = 40;
    });
    for (const offer of many!.offers) {
      expect(offer.allotment).toBe(40);
      expect(offer.remainingLabel).toBeUndefined();
    }

    const few = await adaptFirst((rate) => {
      rate.allotment = 2;
    });
    expect(few!.offers.some((offer) => offer.remainingLabel)).toBe(true);
  });

  it("never reports a negative or fractional count", async () => {
    const odd = await adaptFirst((rate) => {
      rate.allotment = -3;
    });
    for (const offer of odd!.offers) {
      expect(offer.allotment).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(offer.allotment)).toBe(true);
    }
  });
});

/**
 * The link that was actually broken.
 *
 * The adapter reading the number is only half of it — the offer store is what
 * the checkout consults, and its writer passed a literal zero. Everything
 * upstream could be right and the guard would still never fire, which is
 * exactly the state this was found in.
 */
describe("the number survives into the offer store", () => {
  beforeEach(() => {
    resetQuota();
    process.env.HOTELBEDS_API_KEY = "test-key";
    process.env.HOTELBEDS_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(availabilityFixture), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HOTELBEDS_API_KEY;
    delete process.env.HOTELBEDS_SECRET;
  });

  it("hands the checkout what the supplier said, not a zero", async () => {
    const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    expect(result.status).toBe("ok");

    const offers = result.hotels.flatMap((hotel) => hotel.offers);
    expect(offers.length).toBeGreaterThan(0);

    const stored = offers.map((offer) => getOffer(offer.offerId)?.allotment);
    // The fixture's rates hold 8 and 2. Before this, every one of them
    // reached the store as 0 and the overbooking guard read that as
    // "the source did not say".
    expect(stored.every((value) => typeof value === "number")).toBe(true);
    expect(stored.some((value) => (value ?? 0) > 0)).toBe(true);
    expect(new Set(stored)).toEqual(new Set(offers.map((offer) => offer.allotment)));
  });
});
