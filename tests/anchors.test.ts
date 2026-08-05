import { describe, expect, it } from "vitest";
import { anchorPoint, anchorsFor, CITY_CENTRE } from "@/lib/geo/anchors";
import { GENERATED_AIRPORTS } from "@/lib/data/airports.generated";
import { GENERATED_LANDMARKS } from "@/lib/data/landmarks.generated";
import { DESTINATIONS } from "@/lib/data/destinations";

describe("what a radius can be measured from", () => {
  it("offers the centre for every destination we sell", () => {
    // A city with no airport and no landmark still has a centre; a picker with
    // nothing in it is a filter that cannot be used at all.
    for (const destination of DESTINATIONS) {
      const anchors = anchorsFor(destination.id, "en");
      expect(anchors.length, destination.id).toBeGreaterThan(0);
      expect(anchors[0].id).toBe(CITY_CENTRE);
    }
  });

  it("now reaches the cities that used to offer nothing else", () => {
    // Lisbon had a centre and nothing more; the hand-written list covered
    // seventeen cities out of a hundred and eighty-three.
    const lisbon = anchorsFor("dest-lisbon", "en");
    expect(lisbon.some((a) => a.type === "airport")).toBe(true);
  });

  it("gives the busiest markets something to measure from besides the airport", () => {
    // "Distance from a key landmark" was seventeen hand-written cities. Lisbon
    // is the case that showed it up: a tier-one destination offering the city
    // centre and nothing else.
    for (const id of ["dest-lisbon", "dest-florence", "dest-bangkok", "dest-cairo"]) {
      const landmarks = anchorsFor(id, "en").filter((a) => a.type === "landmark");
      expect(landmarks.length, id).toBeGreaterThan(0);
    }
  });

  it("does not offer a city as a landmark inside itself", () => {
    // The city's own article outranks everything in its radius, and "Heian-kyō"
    // is Kyoto. A radius around a city, centred on that city, is the centre
    // anchor wearing a different name.
    for (const d of DESTINATIONS) {
      for (const a of anchorsFor(d.id, "en").filter((x) => x.type === "landmark")) {
        expect(a.label.toLowerCase(), `${d.id}: ${a.label}`).not.toBe(d.name.en.toLowerCase());
      }
    }
  });

  it("keeps landmarks off things that are not landmarks", () => {
    // A hotel is what this site sells; offering one as an anchor is circular.
    // An airport already has its own entry.
    for (const landmark of GENERATED_LANDMARKS) {
      expect(landmark.name.en, landmark.id).not.toMatch(/hotel|casino|resort|airport/i);
    }
  });

  it("holds landmark coordinates that are actually on Earth", () => {
    for (const landmark of GENERATED_LANDMARKS) {
      expect(Math.abs(landmark.coordinates.lat), landmark.id).toBeLessThanOrEqual(90);
      expect(Math.abs(landmark.coordinates.lng), landmark.id).toBeLessThanOrEqual(180);
      expect(landmark.coordinates.lat === 0 && landmark.coordinates.lng === 0).toBe(false);
    }
  });

  it("covers every destination with at least one airport", () => {
    const withAirport = DESTINATIONS.filter((d) =>
      anchorsFor(d.id, "en").some((a) => a.type === "airport"),
    );
    expect(withAirport.length).toBe(DESTINATIONS.length);
  });

  it("names the airport travellers actually use first", () => {
    /*
     * Ranking by distance alone put Taif ahead of Jeddah for Makkah, Le
     * Bourget ahead of Charles de Gaulle, and dropped JFK from New York — the
     * nearest strip beating the airport people fly into, every time. These are
     * the four that caught it.
     */
    const first = (id: string) =>
      anchorsFor(id, "en").find((a) => a.type === "airport")?.label ?? "";
    expect(first("dest-makkah")).toContain("(JED)");
    expect(first("dest-paris")).toContain("(CDG)");
    expect(first("dest-new-york")).toContain("(JFK)");
    expect(first("dest-istanbul")).toContain("(IST)");
  });

  it("does not offer another country's airport when the city has its own", () => {
    // Batam and Johor Bahru are both within a hundred kilometres of Singapore
    // and neither is a Singapore airport.
    for (const airport of GENERATED_AIRPORTS.filter((a) => a.destinationId === "dest-singapore")) {
      expect(airport.iata).not.toBe("BTH");
      expect(airport.iata).not.toBe("JHB");
    }
  });

  it("says an airport once, whichever list it came from", () => {
    // Dubai International is hand-written with an Arabic name and also in the
    // generated file; offering both would list the same airport twice.
    const labels = anchorsFor("dest-dubai", "en")
      .filter((a) => a.type === "airport")
      .map((a) => a.label);
    const codes = labels.map((label) => label.match(/\(([A-Z]{3})\)/)?.[1]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps the hand-written name, including in Arabic", () => {
    // The source publishes English only; a curated entry is where a translated
    // name lives, and it has to win.
    const riyadh = anchorsFor("dest-riyadh", "ar");
    expect(riyadh.some((a) => a.label.includes("مطار الملك خالد"))).toBe(true);
  });

  it("resolves a radius to the place it names, not the city", () => {
    const centre = anchorPoint("dest-dubai", CITY_CENTRE, "en")!;
    const airport = anchorPoint("dest-dubai", "poi-dxb-airport", "en")!;
    expect(airport.lat).not.toBe(centre.lat);
  });

  it("falls back to the centre rather than nothing when an anchor is unknown", () => {
    // A stale link, or an anchor removed from the data between two searches.
    expect(anchorPoint("dest-dubai", "air-nowhere", "en")).toEqual(
      anchorPoint("dest-dubai", CITY_CENTRE, "en"),
    );
  });

  it("holds coordinates that are actually on Earth", () => {
    // A generated file is only as good as the parse behind it; a shifted CSV
    // column reads as a plausible number in the wrong field.
    for (const airport of GENERATED_AIRPORTS) {
      expect(Math.abs(airport.coordinates.lat), airport.id).toBeLessThanOrEqual(90);
      expect(Math.abs(airport.coordinates.lng), airport.id).toBeLessThanOrEqual(180);
      expect(airport.coordinates.lat === 0 && airport.coordinates.lng === 0).toBe(false);
    }
  });

  it("keeps every airport inside the range it claims", () => {
    for (const airport of GENERATED_AIRPORTS) {
      expect(airport.km, `${airport.id} is ${airport.km}km out`).toBeLessThanOrEqual(100);
    }
  });
});
