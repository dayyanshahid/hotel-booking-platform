/**
 * "Load more" must add rows, not rearrange the ones already read.
 *
 * Paging is cumulative — page three is everything up to the end of page three
 * — and both results screens used to drop the whole response in place. That
 * looks like appending right up until the ranking moves, and it moves easily:
 * the price score is a percentile against the whole result population, so one
 * property selling out between the two calls re-scores every other row and the
 * default ranking comes back in a different order. The agent presses "show 12
 * more" and the row they were reading is somewhere else on the page.
 *
 * So the order the agent has already seen wins. Rows they have seen keep their
 * positions, refreshed with the newer copy so the prices stay live, and only
 * rows they have not seen are appended, in the order the server ranked them.
 *
 * A row that has left supply is dropped rather than held: it is no longer
 * bookable, and quoting a stay that will refuse at booking is worse than a
 * shorter list.
 */
export function appendResults<T extends { canonicalHotelId: string }>(shown: T[], incoming: T[]): T[] {
  const fresh = new Map(incoming.map((card) => [card.canonicalHotelId, card]));
  const kept: T[] = [];
  const seen = new Set<string>();

  for (const card of shown) {
    const still = fresh.get(card.canonicalHotelId);
    if (!still) continue;
    kept.push(still);
    seen.add(card.canonicalHotelId);
  }

  for (const card of incoming) {
    if (!seen.has(card.canonicalHotelId)) kept.push(card);
  }

  return kept;
}
