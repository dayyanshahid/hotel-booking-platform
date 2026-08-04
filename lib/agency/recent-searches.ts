import type { SearchIntent } from "@/lib/types";

/**
 * The last few stays this agent looked for.
 *
 * An agent works several enquiries at once and comes back to them all day —
 * the customer rings back, the dates move, the colleague asks what that Dubai
 * one came to. Retyping destination, dates and party for the fourth time is
 * the single most repeated action in the portal, and nothing was keeping it.
 *
 * Held in the browser rather than on the account, deliberately. This is one
 * agent's working state on one machine: it is not agency data, nobody else
 * needs it, and putting a customer's travel dates on the server to save four
 * keystrokes is a worse trade than it looks. It also means it survives without
 * a round trip, which is the whole point on a page that must appear instantly.
 */
export interface RecentSearch {
  intent: SearchIntent;
  /** Epoch ms. Written by the caller, never read from the clock in a render. */
  at: number;
  /** What came back last time, when we know. Purely informational. */
  resultCount?: number;
}

const LIMIT = 6;

/** Per agent, so a shared machine does not leak one agent's work to the next. */
function keyFor(agentId: string): string {
  return `nazil.recent-searches.${agentId}`;
}

/**
 * What makes two searches "the same" for this list.
 *
 * Only the stay. Searching Dubai twice with the dates nudged is two entries,
 * because they are two enquiries; searching the identical stay twice is one,
 * moved back to the top.
 */
function sameStay(a: SearchIntent, b: SearchIntent): boolean {
  return (
    a.destinationId === b.destinationId &&
    a.checkIn === b.checkIn &&
    a.checkOut === b.checkOut &&
    a.currency === b.currency &&
    a.rooms.length === b.rooms.length &&
    a.rooms.every(
      (room, i) =>
        room.adults === b.rooms[i].adults &&
        [...room.childrenAges].sort().join() === [...b.rooms[i].childrenAges].sort().join(),
    )
  );
}

export function readRecentSearches(agentId: string): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(agentId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than rendered: this is a
    // convenience, and a convenience must never be the thing that breaks the
    // page an agent lands on.
    return parsed
      .filter((entry): entry is RecentSearch => Boolean(entry?.intent?.destinationId && entry?.intent?.checkIn))
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Records a search and returns the new list, newest first. */
export function rememberSearch(agentId: string, intent: SearchIntent, at: number, resultCount?: number): RecentSearch[] {
  const existing = readRecentSearches(agentId).filter((entry) => !sameStay(entry.intent, intent));
  const next = [{ intent, at, resultCount }, ...existing].slice(0, LIMIT);
  try {
    window.localStorage.setItem(keyFor(agentId), JSON.stringify(next));
  } catch {
    // A full or disabled store costs the agent a convenience, not a search.
  }
  return next;
}

export function forgetSearches(agentId: string): void {
  try {
    window.localStorage.removeItem(keyFor(agentId));
  } catch {
    /* nothing to undo */
  }
}
