import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES, createTranslator, dayLabel } from "@/lib/i18n";

/**
 * The two dictionaries have to stay the same shape.
 *
 * Both ways of drifting are silent. A key present in English and missing in
 * Arabic falls back to English, so an Arabic reader gets a sentence in the
 * wrong language and nothing anywhere says so. A placeholder added to one
 * language and not the other is worse: the caller passes `unit`, English
 * consumes it, and the Arabic string renders the literal braces to a customer.
 *
 * That second one is not hypothetical — it is what fixing "Book 1 rooms"
 * would have done to Arabic if only the English line had been touched.
 */

/**
 * Which values a string asks for, as a set.
 *
 * Deliberately not a count: English says "for {rooms} rooms, if all {rooms}
 * are free" and Arabic says it once. Repeating a placeholder is a translator's
 * choice; asking for one the caller does not pass is a bug.
 */
const placeholders = (value: string): string[] =>
  [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe("the dictionaries", () => {
  it("carry the same keys in every locale", () => {
    const en = new Set(Object.keys(DICTIONARIES.en));
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      const theirs = new Set(Object.keys(DICTIONARIES[locale]));
      expect([...en].filter((k) => !theirs.has(k)), `missing from ${locale}`).toEqual([]);
      expect([...theirs].filter((k) => !en.has(k)), `only in ${locale}`).toEqual([]);
    }
  });

  it("ask each locale for the same placeholders", () => {
    const wrong: string[] = [];
    for (const [key, english] of Object.entries(DICTIONARIES.en)) {
      const expected = placeholders(english);
      for (const locale of LOCALES.filter((l) => l !== "en")) {
        const theirs = placeholders(DICTIONARIES[locale][key] ?? "");
        if (theirs.join(",") !== expected.join(",")) {
          wrong.push(`${key}: en {${expected}} vs ${locale} {${theirs}}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("leave no braces behind once the values are supplied", () => {
    // Every placeholder filled with a stand-in: what is left is a brace the
    // string asks for and no naming convention would have caught.
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        const vars = Object.fromEntries(placeholders(value).map((name) => [name, "x"]));
        expect(t(key, vars), `${locale}/${key}`).not.toMatch(/[{}]/);
      }
    }
  });

  /**
   * Strings whose number cannot be one, with the reason it cannot.
   *
   * Kept short and argued for individually. The temptation with a list like
   * this is to add a key rather than fix it, so each line here has to name the
   * thing that makes one impossible — a guard in the code, or arithmetic.
   */
  const ALWAYS_PLURAL: Record<string, string> = {
    // The whole catalogue: tens of thousands of properties in a hundred cities.
    "home.catalogueSize": "a catalogue total, never one of anything",
    // Only rendered when `isPerRoomTotal` — the rate covers fewer rooms than
    // were asked for — which cannot hold unless at least two were asked for.
    "rate.partyEstimate": "shown only when the party needs more than one room",
    // Both call sites gate it on `roomsWanted > 1`; at one room it would do
    // nothing, so it is not offered.
    "agency.useForAllRooms": "offered only when more than one room was searched",
  };

  it("never counts in the plural for one of something", () => {
    /*
     * The specific defect this file was written after: "Book 1 rooms" and
     * "covers 1 of 1 rooms" on the trade basket, on the commonest search there
     * is. A string that hard-codes a plural noun after a placeholder cannot be
     * right for every number, so the noun has to come from the pluraliser.
     */
    /*
     * "days" was missing from this list, and `agency.inDays` had read
     * "in {n} days" the whole time — so the trade dashboard said "in 1 days"
     * about every arrival landing tomorrow. A guard is only as good as its
     * vocabulary, and the countable nouns this product uses are a closed set
     * worth keeping complete rather than adding to after each new sighting.
     */
    const nouns = [
      "rooms",
      "nights",
      "days",
      "hours",
      "minutes",
      "guests",
      "adults",
      "children",
      "properties",
      "cities",
      "bookings",
      "quotes",
    ];
    const guilty = Object.entries(DICTIONARIES.en)
      .filter(([key]) => !(key in ALWAYS_PLURAL))
      .filter(([, value]) => nouns.some((noun) => new RegExp(`\\{\\w+\\}\\s+${noun}\\b`).test(value)))
      .map(([key, value]) => `${key}: "${value}"`);
    expect(guilty).toEqual([]);
  });

  it("counts in Arabic the way Arabic counts", () => {
    /*
     * Arabic splits at two, at three-to-ten, and again at eleven — and the
     * eleven-and-up form is the accusative singular, so a thirty-day credit
     * term is "30 يومًا" and never "30 أيام". Routing these through a
     * one/other pluraliser silently broke a settlement line that had been
     * right for months, which is the kind of thing nobody who does not read
     * Arabic will ever notice on a screenshot.
     */
    const t = ((key: string) => DICTIONARIES.ar[key] ?? key) as never as (key: never) => string;
    expect(dayLabel(t, 1, "ar")).toBe("يوم");
    expect(dayLabel(t, 2, "ar")).toBe("يومان");
    expect(dayLabel(t, 5, "ar")).toBe("أيام");
    expect(dayLabel(t, 30, "ar")).toBe("يومًا");
  });

  it("leaves English alone, where one and other is the whole story", () => {
    const t = ((key: string) => DICTIONARIES.en[key] ?? key) as never as (key: never) => string;
    expect(dayLabel(t, 1, "en")).toBe("day");
    for (const n of [2, 5, 30, 100]) expect(dayLabel(t, n, "en")).toBe("days");
  });

  it("keeps the exemption list honest", () => {
    // An exempted key that no longer counts anything is an exemption nobody
    // will notice has stopped applying.
    const stale = Object.keys(ALWAYS_PLURAL).filter((key) => !/\{\w+\}/.test(DICTIONARIES.en[key] ?? ""));
    expect(stale).toEqual([]);
  });
});
