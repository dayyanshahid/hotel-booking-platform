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

  it("reads a count written as a word", async () => {
    /*
     * Found by the console's own availability probe: "Two rooms in Porto"
     * booked one room, and the stray "two" matched a property called Two
     * Seasons — so the search ran against a hotel in Dubai and came back empty,
     * which read as a supply gap in Portugal.
     */
    const result = await interpretTrip("Two rooms in Porto, 12 October, 4 nights", "en", "USD", TODAY);
    expect(result.intent?.destinationDisplay).toBe("Porto");
    expect(result.intent?.destinationType).not.toBe("hotel");
    expect(result.intent?.rooms).toHaveLength(2);
    expect(result.intent?.checkIn).toBe("2026-10-12");
    expect(stayLength(result.intent!)).toBe(4);
  });

  it("reads a party size the way people state it", async () => {
    // The example printed in the field's own placeholder. "Family of four" was
    // silently searched as two adults, which prices a different holiday.
    const result = await interpretTrip(
      "Family of four, Jeddah beachfront, 3 nights in October, free cancellation",
      "en",
      "USD",
      TODAY,
    );
    expect(result.intent?.destinationDisplay).toBe("Jeddah");
    const guests = result.intent!.rooms.reduce((sum, room) => sum + room.adults + room.childrenAges.length, 0);
    expect(guests).toBe(4);
    // "free cancellation" now sets the three-way condition rather than the old
    // boolean, so the sidebar shows the state the sentence asked for.
    expect(result.filters.rateConditions).toEqual(["free"]);
    expect(stayLength(result.intent!)).toBe(3);
  });

  it("fills each room, rather than spreading one party across them", async () => {
    /*
     * "2 rooms in Dubai" used to come back as two rooms holding one adult each,
     * because the default party was two and it was then divided. Nobody asking
     * a counter for two rooms means two people sleeping apart — they mean four
     * — and single occupancy is a different rate, sometimes an unavailable one,
     * so the whole page was priced for a stay the caller never asked for.
     */
    const two = await interpretTrip("2 rooms in Dubai for 3 nights", "en", "USD", TODAY);
    expect(two.intent!.rooms).toHaveLength(2);
    expect(two.intent!.rooms.every((room) => room.adults === 2)).toBe(true);

    const three = await interpretTrip("3 rooms in Dubai", "en", "USD", TODAY);
    expect(three.intent!.rooms.reduce((sum, room) => sum + room.adults, 0)).toBe(6);

    // And the assumption says what was actually assumed, so the line on screen
    // and the search behind it are the same number.
    expect(two.assumed.join(" ")).toContain("per room");
  });

  it("divides a party the sentence did state", async () => {
    // Stated beats assumed: four adults across two rooms is two each, not two
    // per room on top of what they said.
    const result = await interpretTrip("2 rooms for 4 adults in Dubai", "en", "USD", TODAY);
    expect(result.intent!.rooms.map((room) => room.adults)).toEqual([2, 2]);
    expect(result.assumed.join(" ")).not.toContain("adults");
  });

  it("leaves a single room at two adults", async () => {
    const result = await interpretTrip("Dubai for 3 nights", "en", "USD", TODAY);
    expect(result.intent!.rooms).toEqual([{ adults: 2, childrenAges: [] }]);
    expect(result.assumed).toContain("2 adults");
  });

  it("takes children out of a stated party rather than adding to it", async () => {
    const result = await interpretTrip("Family of 4 in Lisbon with 2 children", "en", "USD", TODAY);
    const rooms = result.intent!.rooms;
    expect(rooms.reduce((sum, room) => sum + room.adults, 0)).toBe(2);
    expect(rooms.flatMap((room) => room.childrenAges)).toHaveLength(2);
  });

  it("prefers a place named anywhere in the sentence over a hotel", async () => {
    // A word early in the sentence matching a property name must not win over
    // a city named later; the guest said where they were going.
    const result = await interpretTrip("Grand tour of Lisbon, 3 nights", "en", "USD", TODAY);
    expect(result.intent?.destinationType).not.toBe("hotel");
    expect(result.intent?.destinationDisplay).toBe("Lisbon");
  });

  it("still resolves a property when the sentence names no place", async () => {
    const result = await interpretTrip("Porto Grand Hotel, 2 nights", "en", "USD", TODAY);
    expect(result.intent).not.toBeNull();
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
    // "free cancellation" now sets the three-way condition rather than the old
    // boolean, so the sidebar shows the state the sentence asked for.
    expect(result.filters.rateConditions).toEqual(["free"]);
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
