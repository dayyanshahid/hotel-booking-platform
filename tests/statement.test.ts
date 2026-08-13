import { describe, expect, it } from "vitest";
import { committedSplit, isCreditLow, statementLines } from "@/lib/agency/statement";
import type { LedgerEntry } from "@/lib/agency/types";

/**
 * A statement reconciles, or it is only a list.
 */

const LIMIT = 10_000;

const entry = (at: string, amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `l_${at}_${amount}`,
  agencyId: "agc",
  at,
  amount,
  currency: "USD",
  kind: amount < 0 ? "booking" : "settlement",
  note: "",
  ...over,
});

describe("every line says what the balance was after it", () => {
  const entries = [
    entry("2026-03-01T10:00:00Z", -1000),
    entry("2026-03-02T10:00:00Z", -500),
    entry("2026-03-03T10:00:00Z", 400),
  ];

  it("runs the balance forward through history and returns it newest first", () => {
    const lines = statementLines(entries, LIMIT);
    expect(lines.map((l) => l.usedAfter)).toEqual([1100, 1500, 1000]);
    expect(lines[0].availableAfter).toBe(8900);
  });

  it("orders by time rather than trusting the order it was handed", () => {
    /*
     * The store sorts newest first and the caller may slice, filter or
     * concatenate before this sees it. A running balance computed over a
     * shuffled array is wrong at every line and looks entirely plausible.
     */
    const shuffled = [entries[2], entries[0], entries[1]];
    expect(statementLines(shuffled, LIMIT).map((l) => l.usedAfter)).toEqual([1100, 1500, 1000]);
  });

  it("never reports more available than the limit", () => {
    // A settlement larger than the outstanding balance is a credit, not
    // headroom above the line the operator agreed.
    const lines = statementLines([entry("2026-03-01T10:00:00Z", 5000)], LIMIT);
    expect(lines[0].availableAfter).toBe(LIMIT);
    expect(lines[0].usedAfter).toBe(0);
  });

  it("names who committed it, and says nothing when nobody was recorded", () => {
    const names = new Map([["agt_1", "Layla"]]);
    const lines = statementLines(
      [entry("2026-03-01T10:00:00Z", -100, { agentId: "agt_1" }), entry("2026-03-02T10:00:00Z", -100)],
      LIMIT,
      names,
    );
    expect(lines.find((l) => l.agentId === "agt_1")?.agentName).toBe("Layla");
    expect(lines.find((l) => !l.agentId)?.agentName).toBeUndefined();
  });

  it("leaves an unknown agent unnamed rather than guessing", () => {
    // A deleted account, or an entry written by an operator against the whole
    // line. Inventing a name here would put words in somebody's mouth.
    const lines = statementLines([entry("2026-03-01T10:00:00Z", -100, { agentId: "gone" })], LIMIT, new Map());
    expect(lines[0].agentName).toBeUndefined();
  });
});

describe("what the committed figure is made of", () => {
  it("separates a debt from a reservation", () => {
    /*
     * Different remedies. What is owed appears on a statement and has to be
     * paid; what is held can be released this afternoon for nothing.
     */
    expect(committedSplit(2400, 900)).toEqual({ owed: 1500, held: 900 });
  });

  it("never reports more held than committed", () => {
    // Defensive: the two figures are derived from the same ledger, and a split
    // that returned a negative debt would render as a credit the agency does
    // not have.
    expect(committedSplit(500, 900)).toEqual({ owed: 0, held: 500 });
  });

  it("handles a line with nothing on it", () => {
    expect(committedSplit(0, 0)).toEqual({ owed: 0, held: 0 });
  });
});

describe("when to say the line is running out", () => {
  it("warns inside a tenth of the limit", () => {
    expect(isCreditLow(10_000, 900)).toBe(true);
    expect(isCreditLow(10_000, 1_100)).toBe(false);
  });

  it("says nothing to an agency that has not touched its line", () => {
    // A new account is at 100% available. Warning them about a limit they have
    // never used is noise on their first visit.
    expect(isCreditLow(10_000, 10_000)).toBe(false);
  });

  it("says nothing when there is no line to run out of", () => {
    expect(isCreditLow(0, 0)).toBe(false);
  });
});
