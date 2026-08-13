import type { LedgerEntry } from "./types";

/**
 * The credit statement, as an accounts clerk reads it.
 *
 * A list of movements is not a statement. A statement reconciles: every line
 * says what the balance was after it, so a clerk matching an invoice can find
 * the point where the two disagree instead of adding a hundred figures by eye.
 * That is the whole reason this file exists rather than the screen mapping over
 * the array it was given.
 */

/** A movement with the state of the line after it happened. */
export interface StatementLine extends LedgerEntry {
  /**
   * Committed against the limit immediately after this entry, counting every
   * movement up to and including it.
   */
  usedAfter: number;
  /** What was left of the limit at that moment. */
  availableAfter: number;
  /** Who committed it, resolved from the agent record. Absent when nobody was recorded. */
  agentName?: string;
}

/**
 * Movements newest first, each carrying the balance it left behind.
 *
 * Computed over the whole history and sliced afterwards, never the other way
 * round. A running balance calculated from the most recent hundred entries
 * starts from zero a hundred entries in and is wrong by everything before it —
 * and wrong in a way that looks entirely plausible, which is worse than an
 * obvious error on a page about money.
 *
 * `limit` is today's limit, applied to every historical line. An operator
 * raising an agency's line does not retroactively change what was available
 * last March, so the older `availableAfter` figures are a reconstruction rather
 * than a record. The alternative is storing the limit on every entry, which is
 * the honest fix and a migration; this is noted here so the difference is known
 * rather than discovered.
 */
export function statementLines(
  entries: LedgerEntry[],
  limit: number,
  names: Map<string, string> = new Map(),
): StatementLine[] {
  const ascending = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  let net = 0;
  const withBalance = ascending.map((entry) => {
    net += entry.amount;
    const usedAfter = Math.max(0, -net);
    return {
      ...entry,
      usedAfter,
      availableAfter: Math.max(0, limit - usedAfter),
      agentName: entry.agentId ? names.get(entry.agentId) : undefined,
    };
  });
  return withBalance.reverse();
}

/**
 * What the committed figure is actually made of.
 *
 * "Committed $2,400" is a number an agency cannot act on. Split, it becomes two
 * facts with different remedies: what is owed will appear on a statement and
 * has to be paid, and what is held can be released this afternoon for nothing
 * if the line is needed elsewhere.
 */
export interface CommittedSplit {
  /** Bookings that have been issued. This is a debt. */
  owed: number;
  /** Rooms reserved but not issued. Releasable at no cost. */
  held: number;
}

export function committedSplit(used: number, heldAmount: number): CommittedSplit {
  const held = Math.min(Math.max(0, heldAmount), Math.max(0, used));
  return { owed: Math.max(0, used - held), held };
}

/**
 * Whether the line is close enough to matter.
 *
 * Ten per cent, and only once something has actually been committed: a brand
 * new agency with a limit and no bookings is at 100% available, and warning
 * them about a line they have not touched is noise on their first visit.
 */
export const LOW_CREDIT_RATIO = 0.1;

export function isCreditLow(limit: number, available: number): boolean {
  if (limit <= 0 || available >= limit) return false;
  return available / limit <= LOW_CREDIT_RATIO;
}
