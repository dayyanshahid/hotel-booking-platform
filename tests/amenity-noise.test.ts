import { describe, expect, it } from "vitest";
import { isAmenityNoise } from "@/lib/server/amenity-noise";

/**
 * What a supplier calls a facility, and what actually is one.
 *
 * Both bed banks send things down the facilities array that describe the
 * property rather than offer anything. Hotelbeds has a facility labelled simply
 * "hotel", which led every one of its cards with the word "hotel" as a feature;
 * TourMind sends the cards it takes at the desk and stray distance readings,
 * and everything unmatched is kept verbatim.
 *
 * It surfaced in the trade comparison, where all three columns' facilities row
 * read "hotel · American Express · MasterCard" — three identical rows of
 * nothing in a panel whose whole job is telling three properties apart.
 *
 * The rule has to be a reject list rather than an allow list: a facility we do
 * not recognise is still one the guest is being offered, and dropping the
 * unfamiliar would quietly thin every property in the catalogue.
 */

describe("facility entries that are not facilities", () => {
  it("drops the property type, which is a field of its own", () => {
    for (const label of ["hotel", "Hotel", "Apartment", "apartments", "Resort", "Guest House", "B&B"]) {
      expect(isAmenityNoise(label), label).toBe(true);
    }
  });

  it("drops what the desk takes payment on", () => {
    for (const label of ["American Express", "MasterCard", "Master Card", "Visa", "EC", "Diners", "UnionPay"]) {
      expect(isAmenityNoise(label), label).toBe(true);
    }
  });

  it("drops a distance with nothing named to measure from", () => {
    expect(isAmenityNoise("Distance from property (ft) - 1640")).toBe(true);
    expect(isAmenityNoise("Distance to city centre")).toBe(true);
  });

  it("drops an empty label", () => {
    expect(isAmenityNoise("   ")).toBe(true);
  });

  it("keeps real facilities, including ones we have no code for", () => {
    for (const label of [
      "Outdoor Pool",
      "Wheelchair-accessible",
      "Car park",
      "Rooftop cinema",
      "Prayer room",
      "24-hour reception",
    ]) {
      expect(isAmenityNoise(label), label).toBe(false);
    }
  });

  it("does not mistake a facility that merely contains a rejected word", () => {
    /*
     * The trap in a reject list. "Hotel bar" is a bar, "Visa assistance" is a
     * service the property performs, and an over-eager pattern would take both
     * — thinning the catalogue to fix a cosmetic problem.
     */
    for (const label of ["Hotel bar", "Hotel safe", "Visa assistance", "Distance running track"]) {
      expect(isAmenityNoise(label), label).toBe(false);
    }
  });
});
