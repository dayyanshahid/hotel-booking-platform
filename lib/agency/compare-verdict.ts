/**
 * Which column wins a row, when winning means anything.
 *
 * A comparison an agent reads down a telephone is scanned, not studied. Three
 * columns of numbers all set in the same weight make the reader do the
 * arithmetic every single time, and they are doing it out loud with a customer
 * waiting.
 *
 * So the honest distinctions get marked and nothing else does. Three of them
 * are real: the cheapest price to the customer, the best margin to the agency,
 * and the most forgiving cancellation. The rest are not comparable and are
 * deliberately left alone —
 *
 *   - Distance, because each property measures from a different landmark. "8.0
 *     km from Belém" against "0.2 km from Carmo Fountain" is not a contest, and
 *     marking the smaller number would be inventing a winner.
 *   - Rooms left, because it is a risk signal rather than a virtue. Two rooms
 *     remaining is not better than five, it is more urgent.
 *   - Room, board and facilities, because "better" there belongs to the
 *     customer's taste and not to us.
 */

export interface CompareRow {
  /** What the customer is charged. Absent when the rate could not be priced. */
  sell?: number;
  /** What is left for the agency. Absent for the same reason. */
  margin?: number;
  refundable: boolean;
  /** ISO instant the rate stops being free to cancel, when there is one. */
  freeUntil?: string;
}

export type CompareDimension = "cheapest" | "margin" | "flexible";

/** Index of every column that wins, per dimension. Empty when nothing wins. */
export type CompareVerdict = Record<CompareDimension, number[]>;

/**
 * Winners for one dimension, or none at all.
 *
 * `best` returns undefined for a column that cannot compete — a rate we could
 * not price has no sell and no margin, and treating a missing number as zero
 * would crown the one row we know least about.
 *
 * Nothing is marked unless the columns actually differ. Three identical prices
 * with "cheapest" against all three is decoration that costs the reader a
 * glance and tells them nothing; the whole point of a mark is that it is rare.
 */
function winners(
  rows: CompareRow[],
  best: (row: CompareRow) => number | undefined,
  prefer: "low" | "high",
): number[] {
  const scored = rows
    .map((row, index) => ({ index, value: best(row) }))
    .filter((entry): entry is { index: number; value: number } => entry.value !== undefined);

  if (scored.length < 2) return [];
  const values = scored.map((entry) => entry.value);
  const target = prefer === "low" ? Math.min(...values) : Math.max(...values);
  // Every column is the same, so none of them stands out.
  if (values.every((value) => value === target)) return [];
  return scored.filter((entry) => entry.value === target).map((entry) => entry.index);
}

/**
 * How forgiving a rate is, as one number.
 *
 * Non-refundable scores below every refundable rate. Among refundable rates the
 * one you can drop latest wins, and a refundable rate with no stated deadline
 * sits between the two: it is better than non-refundable and we cannot claim it
 * beats a date we can actually see.
 */
function flexibility(row: CompareRow): number | undefined {
  if (!row.refundable) return 0;
  if (!row.freeUntil) return 1;
  const at = Date.parse(row.freeUntil);
  return Number.isFinite(at) ? at : 1;
}

export function compareVerdict(rows: CompareRow[]): CompareVerdict {
  return {
    cheapest: winners(rows, (row) => row.sell, "low"),
    margin: winners(rows, (row) => row.margin, "high"),
    flexible: winners(rows, flexibility, "high"),
  };
}
