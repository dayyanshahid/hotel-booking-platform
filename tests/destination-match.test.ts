import { describe, expect, it } from "vitest";
import { fold, isConfident, matchDestination } from "@/lib/destination-match";
import { suggest } from "@/lib/server/search";
import type { Suggestion } from "@/lib/types";

/**
 * Typing a city and pressing Search.
 *
 * The rule being tested is a judgement about ambiguity, and both directions of
 * it cost something real. Refusing a search the agent has already spelled out
 * wastes the call they are on; guessing between two cities of the same name
 * sends a customer to the wrong country. So the interesting cases here are not
 * the ones that resolve — they are the ones that must not.
 */

function s(label: string, type: Suggestion["type"] = "city", id = label.toLowerCase()): Suggestion {
  return { id, label, type, context: "", countryCode: "" };
}

describe("folding", () => {
  it("ignores case, accents and punctuation", () => {
    expect(fold("Málaga")).toBe(fold("malaga"));
    expect(fold("  DUBAI ")).toBe("dubai");
    expect(fold("Saint-Denis")).toBe("saint denis");
  });
});

describe("settling typed text onto a destination", () => {
  it("takes an exact name", () => {
    const match = matchDestination("Singapore", [s("Singapore"), s("Singapore Changi Airport", "airport")]);
    expect(match.confidence).toBe("exact");
    expect(match.suggestion?.label).toBe("Singapore");
    expect(isConfident(match)).toBe(true);
  });

  it("takes an exact name typed without its accent", () => {
    expect(matchDestination("malaga", [s("Málaga")]).confidence).toBe("exact");
  });

  it("takes the only candidate", () => {
    const match = matchDestination("kuala", [s("Kuala Lumpur")]);
    expect(match.confidence).toBe("leading");
    expect(match.suggestion?.label).toBe("Kuala Lumpur");
  });

  it("takes the leading place when the rest are its own hotels", () => {
    const match = matchDestination("dubai", [
      s("Dubai"),
      s("Dubai Marina", "neighborhood", "marina"),
      s("Address Downtown Dubai", "hotel", "h1"),
    ]);
    // "Dubai Marina" also begins with "dubai", so this is the case the rule has
    // to get right rather than the case it can shortcut: the exact name wins.
    expect(match.confidence).toBe("exact");
    expect(match.suggestion?.label).toBe("Dubai");
  });

  /* ------------------------------------------------ what it must not decide */

  it("takes the city when a city-state is listed as both a city and a country", () => {
    // Singapore, Monaco, Macau — one place, two rows, and nothing for the
    // agent to disambiguate between.
    const match = matchDestination("Singapore", [
      { ...s("Singapore", "city", "dest-singapore"), countryCode: "SG" },
      { ...s("Singapore", "country", "country-sg"), countryCode: "SG" },
    ]);
    expect(match.confidence).toBe("exact");
    expect(match.suggestion?.id).toBe("dest-singapore");
  });

  it("refuses two places with the same name in different countries", () => {
    const match = matchDestination("Cairo", [
      { ...s("Cairo", "city", "cairo-eg"), countryCode: "EG" },
      { ...s("Cairo", "city", "cairo-us"), countryCode: "US" },
    ]);
    expect(match.confidence).toBe("ambiguous");
    expect(match.suggestion).toBeNull();
    expect(isConfident(match)).toBe(false);
  });

  it("refuses two cities of one name inside one country", () => {
    const match = matchDestination("Springfield", [
      { ...s("Springfield", "city", "spr-il"), countryCode: "US" },
      { ...s("Springfield", "city", "spr-ma"), countryCode: "US" },
    ]);
    expect(match.confidence).toBe("ambiguous");
  });

  it("refuses to pick a hotel out of a chain", () => {
    const match = matchDestination("hilton", [
      s("Hilton Dubai Jumeirah", "hotel", "h1"),
      s("Hilton Garden Inn Riyadh", "hotel", "h2"),
    ]);
    expect(match.confidence).toBe("ambiguous");
  });

  it("refuses when two different places both lead", () => {
    const match = matchDestination("san", [
      s("San Francisco", "city", "sf"),
      s("San Diego", "city", "sd"),
    ]);
    expect(match.confidence).toBe("ambiguous");
  });

  it("refuses a single letter, whatever came back", () => {
    expect(matchDestination("s", [s("Singapore")]).confidence).toBe("none");
  });

  it("refuses when nothing came back", () => {
    expect(matchDestination("zzzqq", []).confidence).toBe("none");
  });

  /* ------------------------------------------- against the real index */

  it("settles the cities an agent actually types", async () => {
    /*
     * Against the catalogue rather than a fixture, because the rule is only
     * worth anything if it holds over the real suggestion ranking — which is
     * what decides "first" in the leading case.
     */
    for (const typed of ["Singapore", "Dubai", "Bangkok", "Riyadh"]) {
      const match = matchDestination(typed, await suggest(typed, "en", 8));
      expect(isConfident(match), `${typed} did not settle`).toBe(true);
      expect(match.suggestion?.id).toBeTruthy();
    }
  });
});
