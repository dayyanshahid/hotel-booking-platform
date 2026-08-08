import { describe, expect, it } from "vitest";
import {
  EXPIRING_WITHIN_DAYS,
  MAX_EXTENSION_DAYS,
  VALID_DAYS,
  daysUntilExpiry,
  extendedExpiry,
  isExpiringSoon,
  withExpiry,
} from "@/lib/agency/quotes";
import type { AgencyQuote } from "@/lib/agency/types";

/**
 * When a quote lapses, and what an agent can do about it beforehand.
 *
 * The date was stored, printed and otherwise ignored: the first anyone knew was
 * the badge turning to "expired", by which point the moment to chase had gone.
 */

const NOW = Date.parse("2026-08-08T12:00:00Z");
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

const quote = (over: Partial<AgencyQuote> = {}): AgencyQuote => ({
  id: "q1",
  reference: "QT-1",
  agencyId: "agc",
  agentId: "agt",
  agentName: "Agent",
  customerName: "A customer",
  items: [],
  currency: "USD",
  validUntil: inDays(10),
  status: "open",
  createdAt: inDays(-1),
  updatedAt: inDays(-1),
  ...over,
});

describe("a quote running out", () => {
  it("is expired the moment its validity passes, without anything having run", () => {
    // Derived on read rather than by a job, so the list and the detail agree
    // whether or not a cron fired last night.
    expect(withExpiry(quote({ validUntil: inDays(-1) }), NOW).status).toBe("expired");
  });

  it("leaves a decided quote alone", () => {
    /*
     * An accepted quote whose validity has passed is still accepted — the
     * customer said yes inside the window, and rewriting that later would
     * erase the answer.
     */
    for (const status of ["accepted", "declined"] as const) {
      expect(withExpiry(quote({ status, validUntil: inDays(-5) }), NOW).status).toBe(status);
    }
  });

  it("counts the days left", () => {
    expect(daysUntilExpiry(quote({ validUntil: inDays(3) }), NOW)).toBe(3);
  });
});

describe("what is worth chasing today", () => {
  it("flags an open quote inside the window", () => {
    expect(isExpiringSoon(quote({ validUntil: inDays(EXPIRING_WITHIN_DAYS) }), NOW)).toBe(true);
  });

  it("leaves one with weeks on it out of it", () => {
    // A quote lapsing tomorrow and one lapsing next month must not look alike.
    expect(isExpiringSoon(quote({ validUntil: inDays(20) }), NOW)).toBe(false);
  });

  it("does not flag a quote the moment it is written", () => {
    /*
     * The mistake this guards. The window was first set to the same three days
     * a new quote is valid for, so every quote was "expiring soon" from birth
     * — a mark on every row in the list, which is decoration rather than a
     * signal. The window has to be a fraction of the validity, and the two
     * numbers now live in one file so they cannot drift apart again.
     */
    expect(EXPIRING_WITHIN_DAYS).toBeLessThan(VALID_DAYS);
    expect(isExpiringSoon(quote({ validUntil: inDays(VALID_DAYS) }), NOW)).toBe(false);
  });

  it("does not flag one that has already gone", () => {
    // Expired is a different message from expiring, and a list that mixes the
    // two sends an agent chasing something they can no longer sell.
    expect(isExpiringSoon(quote({ validUntil: inDays(-1) }), NOW)).toBe(false);
  });

  it("does not chase a quote the customer has already answered", () => {
    expect(isExpiringSoon(quote({ status: "accepted", validUntil: inDays(1) }), NOW)).toBe(false);
    expect(isExpiringSoon(quote({ status: "declined", validUntil: inDays(1) }), NOW)).toBe(false);
  });
});

describe("extending one", () => {
  it("measures from now, not from the old expiry", () => {
    /*
     * Adding to a date that has already passed would "extend" a lapsed quote
     * to another date in the past, and the agent would press the button again.
     */
    const next = extendedExpiry(7, NOW);
    expect(Date.parse(next)).toBe(NOW + 7 * 86_400_000);
  });

  it("refuses to hold a price open for a season", () => {
    // An agent extending is holding a price given days ago against rates that
    // have moved since; the cap is what stops that being indefinite.
    expect(Date.parse(extendedExpiry(365, NOW))).toBe(NOW + MAX_EXTENSION_DAYS * 86_400_000);
  });

  it("always moves it forward by at least a day", () => {
    for (const asked of [0, -5, 0.2]) {
      expect(Date.parse(extendedExpiry(asked, NOW))).toBeGreaterThan(NOW);
    }
  });
});
