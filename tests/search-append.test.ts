import { describe, expect, it } from "vitest";
import { appendResults } from "@/lib/search-append";
import type { HotelResultCard } from "@/lib/types";

/** Only the fields the merge reads; the rest of a card is irrelevant here. */
function card(id: string, total = 100): HotelResultCard {
  return { canonicalHotelId: id, price: { total } } as unknown as HotelResultCard;
}

const ids = (cards: HotelResultCard[]) => cards.map((c) => c.canonicalHotelId);

describe("load more adds rows without moving the ones already read", () => {
  it("appends the new tail in the server's order", () => {
    const shown = [card("a"), card("b"), card("c")];
    const incoming = [card("a"), card("b"), card("c"), card("d"), card("e")];
    expect(ids(appendResults(shown, incoming))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps the order on screen when the server re-ranks underneath it", () => {
    // What actually happens in production: the price score is a percentile
    // across the whole result set, so one property leaving supply re-scores
    // every row and the second call comes back in a different order.
    const shown = [card("a"), card("b"), card("c")];
    const incoming = [card("c"), card("a"), card("b"), card("d")];
    expect(ids(appendResults(shown, incoming))).toEqual(["a", "b", "c", "d"]);
  });

  it("refreshes the price of a row it keeps in place", () => {
    const merged = appendResults([card("a", 100)], [card("a", 130), card("b")]);
    expect(merged[0].price.total).toBe(130);
  });

  it("drops a row that has left supply rather than quoting it", () => {
    const merged = appendResults([card("a"), card("b")], [card("a"), card("c")]);
    expect(ids(merged)).toEqual(["a", "c"]);
  });

  it("never repeats a property", () => {
    const merged = appendResults([card("a"), card("b")], [card("b"), card("a"), card("a")]);
    expect(new Set(ids(merged)).size).toBe(ids(merged).length);
  });

  it("takes the server's page whole on a first page", () => {
    expect(ids(appendResults([], [card("x"), card("y")]))).toEqual(["x", "y"]);
  });
});
