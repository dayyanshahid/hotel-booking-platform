import { describe, expect, it } from "vitest";
import { zoneLabel } from "@/lib/server/search";

/**
 * The Area filter, which a Dubai search had made useless.
 *
 * Thirteen rows for about six places: "DEIRA", "DEIRA DUBAI" and
 * "DEIRA - DUBAI" as three separate one-property filters, "DUBAI" and "Dubai"
 * as two more. Every one of them a real choice an agent could click, and every
 * click excluding the same neighbourhood spelled the other two ways.
 *
 * These are the actual strings the suppliers returned.
 */

describe("one name per place", () => {
  it("folds the punctuated spellings of one neighbourhood together", () => {
    const seen = ["DEIRA", "DEIRA - DUBAI", "Deira, Dubai"].map((raw) => zoneLabel(raw, "DUBAI"));
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBe("Deira");
  });

  it("drops a trailing city, however it was punctuated", () => {
    expect(zoneLabel("Barsha Heights - Dubai", "Dubai")).toBe("Barsha Heights");
    expect(zoneLabel("Al Khan, Sharjah", "Sharjah")).toBe("Al Khan");
  });

  it("leaves a place whose name contains the city alone", () => {
    /*
     * Bur Dubai is not Bur.
     *
     * Stripping an unpunctuated trailing city would also fold "DEIRA DUBAI"
     * into "Deira", which is the row this whole function exists to remove —
     * but it cannot tell the two cases apart from the string, and renaming a
     * real neighbourhood is the worse of the two mistakes. An agent looking
     * for Bur Dubai has to be able to find it; an agent looking at one extra
     * row is merely annoyed.
     */
    expect(zoneLabel("BUR DUBAI", "Dubai")).toBe("Bur Dubai");
  });

  it("agrees on case", () => {
    expect(zoneLabel("DUBAI", "Dubai")).toBe(zoneLabel("Dubai", "Dubai"));
    expect(zoneLabel("AL BARSHA", "Dubai")).toBe("Al Barsha");
  });

  it("keeps a zone that is only the city, because that is where the results are", () => {
    // Two thirds of a Dubai page is filed under "DUBAI". Stripping it to
    // nothing would delete the filter rather than tidy it.
    expect(zoneLabel("DUBAI", "Dubai")).toBe("Dubai");
  });

  it("does not merge two genuinely different places", () => {
    const distinct = ["DEIRA", "AL BARSHA", "DUBAI-AIRPORT", "DUBAI - ARSHA HEIGHTS"].map((raw) =>
      zoneLabel(raw, "Dubai"),
    );
    expect(new Set(distinct).size).toBe(4);
  });

  it("survives the empty and the strange", () => {
    expect(zoneLabel("", "Dubai")).toBe("");
    expect(zoneLabel(undefined, "Dubai")).toBe("");
    expect(zoneLabel("Deira", undefined)).toBe("Deira");
  });
});
