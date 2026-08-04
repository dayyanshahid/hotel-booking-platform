import { beforeEach, describe, expect, it } from "vitest";
import { __resetSupplyCache, readSupply, supplyKey, writeSupply } from "@/lib/server/supply-cache";
import type { SearchIntent } from "@/lib/types";

const stay: SearchIntent = {
  destinationId: "dest-dubai",
  destinationType: "city",
  destinationDisplay: "Dubai",
  checkIn: "2026-10-01",
  checkOut: "2026-10-03",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "USD",
} as SearchIntent;

const key = (over: Partial<SearchIntent> = {}, locale = "en", supply = "live") =>
  supplyKey({ ...stay, ...over } as SearchIntent, locale, supply);

describe("what counts as the same search", () => {
  it("treats a different stay as a different search", () => {
    expect(key()).not.toBe(key({ checkIn: "2026-10-02" }));
    expect(key()).not.toBe(key({ destinationId: "dest-singapore" }));
    expect(key()).not.toBe(key({ currency: "EUR" }));
    expect(key()).not.toBe(key({ rooms: [{ adults: 3, childrenAges: [] }] } as Partial<SearchIntent>));
  });

  it("treats the same party written differently as the same search", () => {
    // Children arrive in whatever order the form collected them; two 6-and-9
    // parties are one party and must not cost two supplier calls.
    const a = key({ rooms: [{ adults: 2, childrenAges: [9, 6] }] } as Partial<SearchIntent>);
    const b = key({ rooms: [{ adults: 2, childrenAges: [6, 9] }] } as Partial<SearchIntent>);
    expect(a).toBe(b);
  });

  it("separates locales, because supplier text is localised", () => {
    // The room names an Arabic search returns are the ones the room-category
    // classifier reads, so the two must not share a cache entry.
    expect(key({}, "en")).not.toBe(key({}, "ar"));
  });

  it("separates the trade's live-only supply from the public catalogue", () => {
    expect(key({}, "en", "live")).not.toBe(key({}, "en", "all"));
  });
});

describe("holding supply", () => {
  beforeEach(() => __resetSupplyCache());

  it("gives back what it was given", () => {
    writeSupply("k", { normalized: [], liveStatuses: ["ok"] });
    expect(readSupply("k")?.liveStatuses).toEqual(["ok"]);
  });

  it("knows nothing about a search it has not seen", () => {
    expect(readSupply("never")).toBeNull();
  });

  it("does not grow without limit", () => {
    for (let i = 0; i < 60; i++) writeSupply(`k${i}`, { normalized: [], liveStatuses: ["ok"] });
    // The most recent search must survive; the oldest need not.
    expect(readSupply("k59")).not.toBeNull();
    expect(readSupply("k0")).toBeNull();
  });
});
