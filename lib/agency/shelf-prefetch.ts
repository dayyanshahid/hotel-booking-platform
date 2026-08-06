import { apiCredentials, apiUrl } from "@/lib/api-origin";
import type { CanonicalRoom, Offer, SearchIntent } from "@/lib/types";

/** What a property's availability call returns. */
export interface AvailabilityPayload {
  hotel: { name: string; slug: string } | null;
  rooms: CanonicalRoom[];
  offers: Offer[];
}

/**
 * Fetching a rate sheet a moment before it is asked for.
 *
 * Opening a rate sheet is two supplier round-trips deep and the first of them
 * has not started until the agent has clicked. The gap between reaching for a
 * button and pressing it is a few hundred milliseconds of nothing, and this
 * spends it on the request.
 *
 * It deliberately does *not* warm the whole page of results. Availability is a
 * real supplier request against a real allowance, and twelve of them per search
 * — to answer a question nobody has asked yet — would spend the quota an agent
 * needs for the searches they actually run. Warming on hover and focus costs
 * one request for a property somebody is already reaching for, and nothing at
 * all for the eleven they are not.
 *
 * Nothing here is a cache in the usual sense: a warmed sheet is claimed once
 * and then gone. Rates move, allotment moves, and a rate sheet held over from
 * five minutes ago is a quote an agent gives a customer and then cannot honour.
 */

interface Warm {
  at: number;
  work: Promise<AvailabilityPayload | null>;
}

/**
 * How long a warmed sheet may be handed over.
 *
 * Short on purpose. It only has to survive the distance between a pointer
 * arriving on a button and a finger pressing it; anything longer is a stale
 * price wearing a fresh one's clothes.
 */
const WARM_TTL_MS = 30_000;

const warmed = new Map<string, Warm>();

/** A sheet is only the same sheet for the same property and the same stay. */
export function shelfKey(slug: string, intent: SearchIntent): string {
  const occupancy = intent.rooms
    .map((room) => `${room.adults}-${room.childrenAges.join(".")}`)
    .join("|");
  return [slug, intent.checkIn, intent.checkOut, occupancy, intent.currency].join("::");
}

async function fetchAvailability(
  slug: string,
  intent: SearchIntent,
): Promise<AvailabilityPayload | null> {
  const res = await fetch(apiUrl(`/api/hotels/${encodeURIComponent(slug)}/availability`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: apiCredentials(),
    body: JSON.stringify({ intent }),
  });
  const body = (await res.json()) as { ok: boolean; data?: AvailabilityPayload };
  return body.ok && body.data ? body.data : null;
}

/**
 * Start fetching a property's rates. Safe to call repeatedly — a pointer moving
 * across a button fires this many times and must only ever ask once.
 */
export function prefetchShelf(slug: string, intent: SearchIntent): void {
  const key = shelfKey(slug, intent);
  const held = warmed.get(key);
  if (held && Date.now() - held.at < WARM_TTL_MS) return;
  warmed.set(key, {
    at: Date.now(),
    // A rejection here is not an error anybody asked for; the shelf will fetch
    // for itself and report it properly if it happens again.
    work: fetchAvailability(slug, intent).catch(() => null),
  });
}

/**
 * Take the warmed sheet if there is a fresh one, leaving nothing behind.
 *
 * Claimed rather than read, so re-opening the same shelf later asks the
 * supplier again instead of showing an agent the prices from five minutes ago.
 */
export function claimShelf(
  slug: string,
  intent: SearchIntent,
): Promise<AvailabilityPayload | null> | undefined {
  const key = shelfKey(slug, intent);
  const held = warmed.get(key);
  if (!held) return undefined;
  warmed.delete(key);
  return Date.now() - held.at < WARM_TTL_MS ? held.work : undefined;
}

/** A new search invalidates every warmed sheet from the last one. */
export function forgetWarmedShelves(): void {
  warmed.clear();
}
