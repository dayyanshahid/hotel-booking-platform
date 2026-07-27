import { describe, expect, it } from "vitest";
import { CITIES, bookableCountries, citiesInCountry } from "@/lib/data/geo/cities";
import { COUNTRIES, REGIONS, getCountry } from "@/lib/data/geo/countries";
import { CURRENCY_TABLE, isCurrencyCode } from "@/lib/currencies";
import {
  DESTINATIONS,
  bookableCountryList,
  featuredDestinations,
  getDestination,
} from "@/lib/data/destinations";
import { HOTEL_SEEDS, hotelsInDestination } from "@/lib/data/hotels";
import { GENERIC_AREAS } from "@/lib/data/editorial";
import { PROPERTY_TYPES } from "@/lib/data/catalog";
import { suggest } from "@/lib/server/search";

/**
 * The catalogue used to be six hand-written cities, so nothing could drift.
 * It is now assembled from geography, and these are the joins that would fail
 * quietly: a country with no rate, a city with no country, a destination with
 * nothing to book. Each of those looks fine in review and breaks a real search.
 */

describe("geography", () => {
  it("gives every city a country that exists", () => {
    const orphans = CITIES.filter((c) => !getCountry(c.countryCode));
    expect(orphans.map((c) => c.slug)).toEqual([]);
  });

  it("uses a slug only once", () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("places every city on the planet", () => {
    for (const city of CITIES) {
      expect(Math.abs(city.coordinates.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.coordinates.lng)).toBeLessThanOrEqual(180);
      // 0,0 is in the Atlantic and is what an unset coordinate looks like.
      expect(city.coordinates.lat === 0 && city.coordinates.lng === 0).toBe(false);
    }
  });

  it("gives every city an IANA time zone", () => {
    // Deadlines are shown in the hotel's own zone, so a bad zone is a wrong
    // cancellation deadline rather than a cosmetic problem.
    for (const city of CITIES) {
      expect(() =>
        new Intl.DateTimeFormat("en", { timeZone: city.timezone }).format(new Date(0)),
      ).not.toThrow();
    }
  });

  it("quotes every country in a currency the platform has a rate for", () => {
    const unpriced = COUNTRIES.filter((c) => !isCurrencyCode(c.currency));
    expect(unpriced.map((c) => `${c.code}:${c.currency}`)).toEqual([]);
  });

  it("carries no currency that no country uses", () => {
    // Dead rows in the rate table are how a stale rate survives unnoticed.
    const used = new Set(COUNTRIES.map((c) => c.currency));
    const orphaned = Object.keys(CURRENCY_TABLE).filter((code) => !used.has(code));
    expect(orphaned).toEqual([]);
  });

  it("covers every region with at least one bookable country", () => {
    for (const region of REGIONS) {
      expect(bookableCountries(region).length).toBeGreaterThan(0);
    }
  });
});

describe("destinations", () => {
  it("builds one destination per city", () => {
    expect(DESTINATIONS.length).toBe(CITIES.length);
  });

  it("resolves a destination by slug and by id", () => {
    for (const d of DESTINATIONS.slice(0, 20)) {
      expect(getDestination(d.slug)?.id).toBe(d.id);
      expect(getDestination(d.id)?.slug).toBe(d.slug);
    }
  });

  it("gives every destination areas that its properties can sit in", () => {
    // A property whose neighbourhood key is not among its destination's areas
    // disappears from the area filter without erroring anywhere.
    for (const seed of HOTEL_SEEDS) {
      const destination = getDestination(seed.destinationId);
      expect(destination, seed.slug).toBeDefined();
      const keys = destination!.neighborhoods.map((n) => n.key);
      expect(keys, `${seed.slug} in ${seed.destinationId}`).toContain(seed.neighborhood);
    }
  });

  it("spreads the featured list across regions", () => {
    const featured = featuredDestinations(12);
    const regions = new Set(featured.map((d) => d.region));
    // The whole point of the round-robin: a global home page must not open
    // with twelve cities from one market.
    expect(regions.size).toBeGreaterThanOrEqual(4);
  });

  it("counts only countries that can actually be booked", () => {
    for (const country of bookableCountryList()) {
      expect(citiesInCountry(country.code).length).toBeGreaterThan(0);
    }
  });
});

describe("inventory", () => {
  it("leaves no destination without something to book", () => {
    const empty = DESTINATIONS.filter((d) => hotelsInDestination(d.id).length === 0);
    expect(empty.map((d) => d.slug)).toEqual([]);
  });

  it("uses a property slug only once", () => {
    const slugs = HOTEL_SEEDS.map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only uses property types the filter rail knows about", () => {
    for (const seed of HOTEL_SEEDS) {
      expect(Object.keys(PROPERTY_TYPES), seed.slug).toContain(seed.propertyType);
    }
  });

  it("prices every property above zero", () => {
    for (const seed of HOTEL_SEEDS) {
      expect(seed.baseNightlySar, seed.slug).toBeGreaterThan(0);
    }
  });

  it("reflects local cost of stay rather than one global price", () => {
    const nightly = (slug: string) =>
      Math.min(...hotelsInDestination(`dest-${slug}`).map((h) => h.baseNightlySar));
    // Zurich is not Kathmandu, and a generated catalogue that prices them the
    // same is a catalogue nobody would believe.
    expect(nightly("zurich")).toBeGreaterThan(nightly("kathmandu") * 2);
  });

  it("keeps generated properties out of curated cities", () => {
    // Mixing written detail with generated filler in one results list makes the
    // written detail look like an accident of which row you clicked.
    const riyadh = hotelsInDestination("dest-riyadh");
    expect(riyadh.some((h) => h.slug.startsWith("riyadh-grand"))).toBe(false);
    expect(riyadh.length).toBeGreaterThan(0);
  });

  it("claims no landmark distances it cannot know", () => {
    const generated = HOTEL_SEEDS.filter((h) => h.slug.endsWith("-hostel"));
    expect(generated.length).toBeGreaterThan(0);
    for (const seed of generated) {
      expect(seed.landmarks, seed.slug).toEqual([]);
    }
  });
});

describe("editorial overlay", () => {
  it("falls back to generic areas for cities nobody has written about", () => {
    const templated = DESTINATIONS.find((d) => !d.curated)!;
    expect(templated.neighborhoods.map((n) => n.key)).toEqual(GENERIC_AREAS.map((n) => n.key));
  });

  it("keeps curated cities on their own areas", () => {
    const riyadh = getDestination("dest-riyadh")!;
    expect(riyadh.curated).toBe(true);
    expect(riyadh.neighborhoods.map((n) => n.key)).toContain("olaya");
  });

  it("answers only what the platform actually knows for templated cities", () => {
    // The temptation at this scale is to generate "the best time to visit Lima"
    // for 180 cities. That is invention dressed as guidance, so the templated
    // FAQ answers policy questions instead — and this is the guard.
    const templated = DESTINATIONS.find((d) => !d.curated)!;
    const questions = templated.faqs.map((f) => f.q.en.toLowerCase()).join(" ");
    expect(questions).not.toMatch(/best time|weather|season|nightlife|cuisine/);
  });

  it("localises every templated string in both languages", () => {
    const templated = DESTINATIONS.find((d) => !d.curated)!;
    expect(templated.blurb.ar.length).toBeGreaterThan(10);
    expect(templated.blurb.ar).not.toBe(templated.blurb.en);
    for (const faq of templated.faqs) {
      expect(faq.q.ar).not.toBe(faq.q.en);
      expect(faq.a.ar).not.toBe(faq.a.en);
    }
  });
});

describe("global search", () => {
  it("finds cities on every continent", () => {
    for (const [query, expected] of [
      ["tokyo", "Tokyo"],
      ["lima", "Lima"],
      ["reykja", "Reykjavík"],
      ["cape", "Cape Town"],
      ["sydney", "Sydney"],
    ] as const) {
      const hit = suggest(query, "en", 5).find((s) => s.type === "city");
      expect(hit?.label, query).toBe(expected);
    }
  });

  it("resolves a country name to a country suggestion", () => {
    const hit = suggest("japan", "en", 5).find((s) => s.type === "country");
    expect(hit?.countryCode).toBe("JP");
    expect(hit?.propertyCount).toBeGreaterThan(0);
  });

  it("ranks the city above its own hotels", () => {
    const results = suggest("paris", "en", 6);
    const city = results.findIndex((s) => s.type === "city");
    const hotel = results.findIndex((s) => s.type === "hotel");
    expect(city).toBeGreaterThanOrEqual(0);
    if (hotel >= 0) expect(city).toBeLessThan(hotel);
  });

  it("stays bounded on a query that matches most of the catalogue", () => {
    // Every generated property contains its city name, so a loose query used to
    // walk all ~1,000 seeds on every keystroke.
    expect(suggest("a", "en", 8).length).toBeLessThanOrEqual(8);
  });
});
