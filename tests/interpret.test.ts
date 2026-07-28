import { describe, expect, it } from "vitest";
import { fold } from "@/lib/text";
import { interpretTrip, stayLength } from "@/lib/server/interpret";

/** Fixed so "next month" and year-rollover assertions do not drift. */
const TODAY = "2026-08-15";

describe("folding what people type", () => {
  /**
   * The bug: the catalogue spells places properly and nobody types accents, so
   * "reykjavik" found nothing while "reyk" found Reykjavík. Every accented city
   * was unsearchable by its own name across all three surfaces.
   */
  it("matches a place spelled without its accents", () => {
    for (const [typed, held] of [
      ["reykjavik", "Reykjavík"],
      ["sao paulo", "São Paulo"],
      ["krakow", "Kraków"],
      ["montreal", "Montréal"],
      ["zurich", "Zürich"],
    ]) {
      expect(fold(held)).toContain(fold(typed));
    }
  });

  it("folds Arabic marks and the letter variants people type interchangeably", () => {
    // إ decomposes under NFD, so folding the letters after decomposing left the
    // hamza in place and Istanbul stayed unfindable.
    expect(fold("إسطنبول")).toBe(fold("اسطنبول"));
    expect(fold("مكة")).toBe(fold("مكه"));
    expect(fold("المدينة")).toBe(fold("المدينه"));
  });

  it("leaves an unaccented string alone", () => {
    expect(fold("Lisbon")).toBe("lisbon");
  });
});

describe("interpreting a described trip", () => {
  it("resolves a destination the old six-city regex never knew", async () => {
    const result = await interpretTrip("4 nights in Reykjavik", "en", "USD", TODAY);
    expect(result.intent?.destinationDisplay).toBe("Reykjavík");
    expect(stayLength(result.intent!)).toBe(4);
  });

  it("honours an explicit date rather than assuming one", async () => {
    // "2 rooms" used to consume the date match and the guest silently got the
    // first of the month instead of the twelfth.
    const result = await interpretTrip("2 rooms in Zurich 12 September 5 nights", "en", "USD", TODAY);
    expect(result.intent?.checkIn).toBe("2026-09-12");
    expect(stayLength(result.intent!)).toBe(5);
    expect(result.intent?.rooms).toHaveLength(2);
    expect(result.assumed).not.toContain("in two weeks");
  });

  it("pushes a month that has passed into next year", async () => {
    const result = await interpretTrip("Porto 12 March", "en", "USD", TODAY);
    expect(result.intent?.checkIn).toBe("2027-03-12");
  });

  it("reads every child age in a list", async () => {
    // Reading only the first age invented one for the second child, which is a
    // mispriced booking and a guest the property was never told about.
    const result = await interpretTrip("Tokyo, 2 adults 2 children aged 6 and 9", "en", "USD", TODAY);
    expect(result.intent?.rooms[0].childrenAges).toEqual([6, 9]);
    expect(result.assumed).not.toContain("children aged 8 where no age was given");
  });

  it("says when it had to guess an age", async () => {
    const result = await interpretTrip("Tokyo with 1 child", "en", "USD", TODAY);
    expect(result.intent?.rooms[0].childrenAges).toEqual([8]);
    expect(result.assumed.join(" ")).toContain("aged 8");
  });

  it("turns preferences into real filters", async () => {
    const result = await interpretTrip(
      "3 star in Lisbon under 90 a night with breakfast and free cancellation",
      "en",
      "USD",
      TODAY,
    );
    expect(result.filters.categories).toEqual([3]);
    expect(result.filters.refundableOnly).toBe(true);
    expect(result.filters.boards).toEqual(["BB"]);
    // A nightly ceiling becomes a stay total, because that is what a card shows.
    expect(result.filters.maxPrice).toBe(270);
  });

  it("separates what it read from what it assumed", async () => {
    const result = await interpretTrip("Lisbon", "en", "USD", TODAY);
    expect(result.understood).toContain("Lisbon");
    expect(result.assumed).toEqual(expect.arrayContaining(["2 adults", "3 nights"]));
  });

  it("refuses to invent a destination it cannot sell", async () => {
    const result = await interpretTrip("a week in Atlantis", "en", "USD", TODAY);
    expect(result.intent).toBeNull();
    expect(result.missing).toContain("destination");
  });

  it("works in Arabic", async () => {
    const result = await interpretTrip("رحلة إلى إسطنبول لثلاث ليال مع إفطار", "ar", "SAR", TODAY);
    expect(result.intent?.destinationDisplay).toBe("إسطنبول");
    expect(result.filters.boards).toEqual(["BB"]);
  });
});
