import { describe, expect, it } from "vitest";
import { compareVerdict, type CompareRow } from "@/lib/agency/compare-verdict";

/**
 * Marking the winner of a row, and knowing when there isn't one.
 *
 * The comparison is scanned rather than studied — an agent is reading it down a
 * telephone with a customer waiting. A mark that appears on everything is
 * decoration, and a mark on something that was never a contest is a claim we
 * cannot support.
 */

const row = (over: Partial<CompareRow> = {}): CompareRow => ({
  sell: 200,
  margin: 20,
  refundable: true,
  freeUntil: "2026-12-01T12:00:00Z",
  ...over,
});

describe("what wins a row", () => {
  it("marks the cheapest and the best margin", () => {
    const verdict = compareVerdict([
      row({ sell: 250, margin: 20 }),
      row({ sell: 200, margin: 35 }),
      row({ sell: 300, margin: 10 }),
    ]);
    expect(verdict.cheapest).toEqual([1]);
    expect(verdict.margin).toEqual([1]);
  });

  it("separates cheapest from best margin, because they are not the same question", () => {
    // The whole reason both rows are marked. The cheapest room to the customer
    // is very often not the one that pays the agency best, and an agent
    // choosing between them should be able to see that at a glance.
    const verdict = compareVerdict([
      row({ sell: 200, margin: 10 }),
      row({ sell: 260, margin: 40 }),
    ]);
    expect(verdict.cheapest).toEqual([0]);
    expect(verdict.margin).toEqual([1]);
  });

  it("marks nothing when every column agrees", () => {
    /*
     * Three identical prices with "cheapest" against all three costs the reader
     * a glance and tells them nothing. A mark is only worth anything if it is
     * rare.
     */
    const verdict = compareVerdict([row(), row(), row()]);
    expect(verdict.cheapest).toEqual([]);
    expect(verdict.margin).toEqual([]);
    expect(verdict.flexible).toEqual([]);
  });

  it("marks nothing at all when there is only one column", () => {
    // One property is not a comparison.
    expect(compareVerdict([row()])).toEqual({ cheapest: [], margin: [], flexible: [] });
  });

  it("marks every column that ties for the win", () => {
    const verdict = compareVerdict([
      row({ sell: 200 }),
      row({ sell: 200 }),
      row({ sell: 300 }),
    ]);
    expect(verdict.cheapest).toEqual([0, 1]);
  });

  it("never crowns a rate it could not price", () => {
    /*
     * The trap this guards. A missing sell treated as zero would make the one
     * property we know least about the cheapest on the page, and an agent
     * could quote it on the strength of the mark.
     */
    const verdict = compareVerdict([
      row({ sell: undefined, margin: undefined }),
      row({ sell: 400, margin: 30 }),
      row({ sell: 500, margin: 20 }),
    ]);
    expect(verdict.cheapest).toEqual([1]);
    expect(verdict.margin).toEqual([1]);
  });

  it("declines to name a winner against an unknown", () => {
    /*
     * Two columns, one of them unpriced. There is nothing for the priced one to
     * be cheaper *than* — the missing number might well be lower — so marking
     * it "cheapest" would be a claim we cannot support on the screen an agent
     * quotes from.
     */
    const verdict = compareVerdict([row({ sell: undefined, margin: undefined }), row({ sell: 400 })]);
    expect(verdict.cheapest).toEqual([]);
    expect(verdict.margin).toEqual([]);
  });

  it("puts any refundable rate above a non-refundable one", () => {
    const verdict = compareVerdict([
      row({ refundable: false, freeUntil: undefined }),
      row({ refundable: true, freeUntil: "2026-11-01T12:00:00Z" }),
    ]);
    expect(verdict.flexible).toEqual([1]);
  });

  it("prefers the deadline you can drop latest", () => {
    const verdict = compareVerdict([
      row({ freeUntil: "2026-11-01T12:00:00Z" }),
      row({ freeUntil: "2026-12-20T12:00:00Z" }),
      row({ freeUntil: "2026-12-01T12:00:00Z" }),
    ]);
    expect(verdict.flexible).toEqual([1]);
  });

  it("ranks a refundable rate with no stated deadline between the two", () => {
    // Better than non-refundable, and we cannot claim it beats a date we can
    // actually see.
    const verdict = compareVerdict([
      row({ refundable: false, freeUntil: undefined }),
      row({ refundable: true, freeUntil: undefined }),
      row({ refundable: true, freeUntil: "2026-12-20T12:00:00Z" }),
    ]);
    expect(verdict.flexible).toEqual([2]);
  });

  it("does not fall over on a deadline it cannot read", () => {
    const verdict = compareVerdict([
      row({ refundable: true, freeUntil: "not a date" }),
      row({ refundable: false, freeUntil: undefined }),
    ]);
    expect(verdict.flexible).toEqual([0]);
  });
});
