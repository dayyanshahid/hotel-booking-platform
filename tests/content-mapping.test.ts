import { describe, expect, it } from "vitest";
import { buildCanonicalHotelFromContent } from "@/lib/server/hotelbeds/adapter";
import type { HbContentHotel } from "@/lib/server/hotelbeds/types";

/**
 * What the supplier sends about a property, against what we keep.
 *
 * These three were all silent. Nothing errored, no test failed, and every one
 * of them was visible on the page as something plausible-but-wrong rather than
 * as an obvious gap — which is why they survived.
 *
 * The payload below is the shape the live content API actually returns, taken
 * from a probe of a real property, rather than the flattened shape our own
 * sync writes. Reading only the flattened names is what broke all three.
 */

const LIVE_SHAPE: HbContentHotel = {
  code: 91264,
  name: { content: "Golden Sands Hotel Apartments" },
  description: { content: "In the heart of Bur Dubai." },
  city: { content: "BUR DUBAI" },
  // An object, not a `countryCode` string.
  country: { code: "AE", isoCode: "AE", description: { content: "United Arab Emirates" } },
  coordinates: { latitude: 25.250508, longitude: 55.298822 },
  categoryCode: "3EST",
  phones: [
    { phoneNumber: "+97143555553", phoneType: "PHONEBOOKING" },
    { phoneNumber: "+97143555554", phoneType: "PHONEHOTEL" },
    { phoneNumber: "+97143526903", phoneType: "FAXNUMBER" },
  ],
  email: "reservation@goldensands.ae",
  web: "www.goldensandsdubai.com",
  // Kilometres here…
  terminals: [{ terminalCode: "DXB", distance: 11, name: { content: "Dubai Int. Airport" } }],
  // …and metres here, in the same payload — and as a string, where the
  // terminal above is a number. Two units and two types in one response.
  interestPoints: [{ poiName: "Bur Dubai", distance: "5900" }],
} as HbContentHotel;

const TYPES = { categories: {}, facilities: {}, facilityGroups: {}, boards: {}, segments: {} };

function build(overrides: Partial<HbContentHotel> = {}) {
  return buildCanonicalHotelFromContent({ ...LIVE_SHAPE, ...overrides }, TYPES as never, "en");
}

describe("the property, as the supplier describes it", () => {
  it("reads the country out of the object the API sends", () => {
    /*
     * The one that mattered. `countryCode` is what our own sync writes; the
     * live API sends `country: { code }`. Only the flat name was read, so
     * anything fetched live had no country — and the country is what picks the
     * timezone a cancellation deadline is displayed in.
     */
    const hotel = build();
    expect(hotel.address.countryCode).toBe("AE");
    expect(hotel.address.country).toBe("United Arab Emirates");
  });

  it("still reads the flattened shape our own sync writes", () => {
    // Both shapes reach this function, and the cached one must keep working.
    const hotel = build({ country: undefined, countryCode: "AE" });
    expect(hotel.address.countryCode).toBe("AE");
  });

  it("measures an airport in the units the airport came in", () => {
    /*
     * Terminals are kilometres and interest points are metres, in one payload.
     * Dividing both by a thousand put every airport on every property at
     * "0 km", which reads as "at the airport".
     */
    const hotel = build();
    const airport = hotel.landmarks.find((landmark) => landmark.type === "airport");
    expect(airport?.distanceKm).toBe(11);

    const poi = hotel.landmarks.find((landmark) => landmark.type === "landmark");
    expect(poi?.distanceKm).toBe(5.9);
  });

  it("keeps the numbers an agent rings", () => {
    const hotel = build();
    expect(hotel.contact?.bookingPhone).toBe("+97143555553");
    expect(hotel.contact?.hotelPhone).toBe("+97143555554");
    expect(hotel.contact?.fax).toBe("+97143526903");
    expect(hotel.contact?.email).toBe("reservation@goldensands.ae");
    expect(hotel.contact?.web).toBe("www.goldensandsdubai.com");
  });

  it("says nothing rather than an empty contact card", () => {
    // A property with no contact details at all must not render a heading over
    // four blank rows.
    const hotel = build({ phones: undefined, email: undefined, web: undefined });
    expect(hotel.contact).toBeUndefined();
  });
});
