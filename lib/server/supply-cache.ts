import type { SearchIntent } from "@/lib/types";
import type { NormalizedHotel } from "./normalize";


/**
 * The supply behind one search, held just long enough to filter it.
 *
 * Filtering is not a new question. Ticking "5★" or dragging a price slider asks
 * something about the *same* availability the agent is already looking at — but
 * every filter change re-ran both suppliers, and a live search takes the better
 * part of fifteen seconds. A sidebar of eight filters was therefore a sidebar
 * nobody could use: three clicks cost forty-five seconds, and a type-ahead
 * hotel-name box would have fired one of those per keystroke.
 *
 * So the normalised supply is cached against the stay. Change the destination,
 * the dates or the party and it is a genuinely different question, which misses
 * and goes to the suppliers. Change a filter and it is the same supply, read
 * again.
 *
 * The window is deliberately short. Results are a snapshot in this industry —
 * every rate carries its own `expiresAt`, and the price an agent commits to is
 * the one the prebook returns, not the one the list showed. Two minutes is long
 * enough to work a sidebar and short enough that nobody is quoting from
 * yesterday.
 *
 * In process, like the rest of the caches here. On a warm instance the sidebar
 * is instant; on a cold one the filter change costs what it used to and is
 * still correct. There is no case where this returns a wrong answer — only one
 * where it does not save the trip.
 */
const TTL_MS = 120_000;

/** Never let a busy box hold more than this many searches' supply. */
const MAX_ENTRIES = 24;

/** Mirrors the union in search.ts; kept local so this module imports nothing from it. */
export type LiveStatus = "ok" | "unavailable" | "skipped";

export interface CachedSupply {
  normalized: NormalizedHotel[];
  liveStatuses: LiveStatus[];
}

const entries = new Map<string, { at: number; value: CachedSupply }>();

/**
 * What makes two searches the same search.
 *
 * Everything that changes which rooms come back, and nothing that only changes
 * how they are shown. Locale is in because supplier responses are localised —
 * the room names an Arabic search returns are the ones the category classifier
 * reads. Filters, sort and paging are deliberately absent: those are the whole
 * point of the cache.
 */
export function supplyKey(intent: SearchIntent, locale: string, supply: string, scenario?: string): string {
  const rooms = intent.rooms
    .map((room) => `${room.adults}-${[...(room.childrenAges ?? [])].sort((a, b) => a - b).join(".")}`)
    .join("|");
  return [
    intent.destinationId,
    intent.checkIn,
    intent.checkOut,
    rooms,
    intent.currency,
    intent.nationality ?? "",
    locale,
    supply,
    scenario ?? "",
  ].join("::");
}

export function readSupply(key: string): CachedSupply | null {
  const hit = entries.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    entries.delete(key);
    return null;
  }
  return hit.value;
}

export function writeSupply(key: string, value: CachedSupply): void {
  entries.set(key, { at: Date.now(), value });
  if (entries.size <= MAX_ENTRIES) return;
  // Oldest first: a Map iterates in insertion order, and a re-read does not
  // reorder it, so the front of the map is the least recently *started*.
  const cutoff = Date.now() - TTL_MS;
  for (const [candidate, held] of entries) {
    if (held.at < cutoff) entries.delete(candidate);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

/** Test seam: behave like a process that has never run a search. */
export function __resetSupplyCache(): void {
  entries.clear();
}
