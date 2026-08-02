import { describe, expect, it } from "vitest";
import { QUOTE_BATCH } from "@/lib/agency/rates";

/**
 * The batch the client sends must be the batch the server answers.
 *
 * The quote route prices `QUOTE_BATCH` offers and drops the remainder without
 * a word — no error, no partial flag, just fewer quotes than were asked for.
 * That was harmless while trade search only ever loaded a page of twelve, and
 * stopped being harmless the moment the map began loading a whole city: a
 * sixty-eight property Dubai search came back with sixty prices and eight rows
 * shimmering for a cost that was never coming.
 *
 * These are cheap arithmetic checks rather than a rendered component, because
 * the defect was never in the rendering — it was one number written twice.
 */

/** The batching the search view does before it calls the route. */
function batches(count: number): string[][] {
  const ids = Array.from({ length: count }, (_, i) => `of_${i}`);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += QUOTE_BATCH) out.push(ids.slice(i, i + QUOTE_BATCH));
  return out;
}

/** What the route does with one batch. */
function priced(batch: string[]): string[] {
  return batch.slice(0, QUOTE_BATCH);
}

describe("pricing a whole result set", () => {
  it("asks for no more in one request than the route will price", () => {
    for (const count of [1, 12, 59, 60, 61, 68, 240]) {
      for (const batch of batches(count)) {
        expect(batch.length).toBeLessThanOrEqual(QUOTE_BATCH);
      }
    }
  });

  it("leaves no offer unpriced, at the size that broke it", () => {
    /*
     * Sixty-eight is the Dubai result set that exposed this. Sending it as one
     * request returned sixty quotes; the eight rooms past the cap were on
     * screen, live and bookable, with no cost and no selling price.
     */
    const all = batches(68).flatMap(priced);
    expect(all).toHaveLength(68);
    expect(new Set(all).size).toBe(68);
  });

  it("covers every offer for result sets either side of the cap", () => {
    for (const count of [1, 12, 59, 60, 61, 68, 121, 240]) {
      const covered = batches(count).flatMap(priced);
      expect(covered).toHaveLength(count);
    }
  });

  it("sends nothing at all for an empty result set", () => {
    // An empty body is a 400 from the route, so the caller must not make the
    // request rather than handle the refusal.
    expect(batches(0)).toEqual([]);
  });
});
