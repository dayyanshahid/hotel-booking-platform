import type { Locale, SearchIntent, Suggestion } from "@/lib/types";
import { hotelbeds, HotelbedsError } from "./client";
import { isHotelbedsEnabled } from "./config";
import { fold } from "../../text";
import { getDestination } from "@/lib/data/destinations";
import { getCachedDestinations, getHotelBySlug, getIndex, getTypes, warmContent } from "./content";
import { adaptAvailability, buildCanonicalHotelFromContent, type AdaptedHotel } from "./adapter";
import type { HbAvailabilityResponse } from "./types";
import { rememberOffer } from "../store";

/**
 * Live availability search.
 *
 * The occupancy sent to the supplier is exactly the customer's room allocation,
 * including each child's age, because both change eligibility and price (§5.3).
 */

function occupancies(intent: SearchIntent) {
  return intent.rooms.map((room) => ({
    rooms: 1,
    adults: room.adults,
    children: room.childrenAges.length,
    ...(room.childrenAges.length
      ? { paxes: room.childrenAges.map((age) => ({ type: "CH", age })) }
      : {}),
  }));
}

function baseRequest(intent: SearchIntent) {
  return {
    stay: { checkIn: intent.checkIn, checkOut: intent.checkOut },
    occupancies: occupancies(intent),
    // Cancellation fees are requested up front so the timeline can be shown
    // before selection rather than discovered at checkout (§5.7).
    ...(intent.nationality ? { keywords: undefined, sourceMarket: intent.nationality } : {}),
  };
}

/** Resolve a platform destination ID to a supplier destination code. */
/**
 * Where to search, for one of our destinations.
 *
 * Matching our city names against theirs does not work and cannot be made to.
 * Their catalogue holds "New London - CT", "London-ON" and "County Londonderry
 * of Northern Ireland"; ours holds "london". It also required hotels to be
 * cached for a destination before that destination could be mapped, which is
 * circular — nothing could ever be searched the first time.
 *
 * Their availability endpoint takes a coordinate and a radius instead, and we
 * have a verified coordinate for all 183 cities. A point cannot be spelled
 * wrong, so this is exact for every destination rather than lucky for a few.
 */
export async function resolveHotelbedsDestination(
  destinationId: string,
): Promise<{ code: string } | { lat: number; lng: number } | null> {
  // An explicit supplier destination still wins, for deep links into one.
  if (destinationId.startsWith("hbd-")) return { code: destinationId.replace("hbd-", "") };
  const destination = getDestination(destinationId);
  if (!destination) return null;
  return { lat: destination.coordinates.lat, lng: destination.coordinates.lng };
}

export interface HotelbedsSearchResult {
  hotels: AdaptedHotel[];
  status: "ok" | "unavailable";
  /** Customer-safe reason, already mapped away from supplier wording. */
  reason?: string;
}

async function runAvailability(
  body: Record<string, unknown>,
  intent: SearchIntent,
  locale: Locale,
): Promise<HotelbedsSearchResult> {
  try {
    const response = await hotelbeds.availability<HbAvailabilityResponse>(body);
    const hbHotels = response.hotels?.hotels ?? [];
    const adapted: AdaptedHotel[] = [];

    /*
     * Warm a bounded number of uncached properties before adapting any of them.
     *
     * Adaptation used to fetch content inline, one hotel at a time, which made
     * a page of fifty into fifty sequential detail calls: half a minute of
     * waiting and an entire day's request allowance for a single search of a
     * destination we had not seen before. Hoisting it means the fetches happen
     * together and there are at most a page of them; the adaptation below then
     * reads only what is cached and never touches the network.
     */
    await warmContent(hbHotels.map((hotel) => hotel.code ?? 0));

    for (const hbHotel of hbHotels) {
      const result = await adaptAvailability(hbHotel, intent, locale, { allowLiveContent: false });
      if (!result) continue;

      // Bind each offer to its rateKey, server-side only.
      for (const [offerId, context] of result.contexts) {
        const offer = result.offers.find((candidate) => candidate.offerId === offerId);
        if (!offer) continue;
        const room = result.rooms.find((candidate) => candidate.canonicalRoomId === offer.canonicalRoomId);
        rememberOffer(offerId, {
          offerId,
          hotelSlug: result.hotel.slug,
          roomKey: context.roomCode,
          canonicalRoomKey: context.roomCode,
          board: context.boardCode as never,
          rateClass: offer.cancellation.refundable ? "flex" : "nrf",
          sourceCode: "HB",
          rateTypeInternal: context.rateTypeInternal,
          conditionCodes: [],
          memberRate: false,
          guaranteeEligible: offer.capabilities.guaranteeEligible,
          modifiable: offer.capabilities.modifyAllowed,
          // What the supplier said it still holds. Hard-coding zero here made the
          // checkout's overbooking guard inert: it reads zero as "the source did not
          // say" and waves the basket through.
          allotment: offer.allotment,
          intent,
          price: offer.price,
          cancellation: offer.cancellation,
          expiresAt: offer.expiresAt,
          supplierRoomLabel: room?.name ?? context.roomCode,
          hotelName: result.hotel.name,
          roomLabel: room?.name ?? context.roomCode,
          boardLabel: offer.board.label,
          comments: offer.comments,
          hotelbeds: {
            rateKey: context.rateKey,
            hotelCode: context.hotelCode,
            roomCode: context.roomCode,
            boardCode: context.boardCode,
            net: context.net,
            supplierCurrency: context.supplierCurrency,
          },
        });
      }

      adapted.push(result);
    }

    return { hotels: adapted, status: "ok" };
  } catch (error) {
    if (error instanceof HotelbedsError) {
      // Partial-results messaging is the caller's job; here we only say the
      // source could not answer, in customer-safe language.
      return {
        hotels: [],
        status: "unavailable",
        reason:
          error.kind === "quotaExceeded"
            ? "daily request budget reached"
            : error.kind === "auth"
              ? "credentials rejected"
              : error.kind,
      };
    }
    return { hotels: [], status: "unavailable", reason: "unexpected error" };
  }
}

/**
 * Radius around a city centre, in kilometres.
 *
 * Wide enough to include the airport hotels and beach strips that belong to a
 * city, narrow enough not to pull in the next one along the coast.
 */
const SEARCH_RADIUS_KM = 20;

export async function searchHotelbedsDestination(
  where: { code: string } | { lat: number; lng: number },
  intent: SearchIntent,
  locale: Locale,
): Promise<HotelbedsSearchResult> {
  if (!isHotelbedsEnabled()) return { hotels: [], status: "unavailable", reason: "not configured" };
  return runAvailability(
    {
      ...baseRequest(intent),
      ...("code" in where
        ? { destination: { code: where.code } }
        : {
            geolocation: {
              latitude: where.lat,
              longitude: where.lng,
              radius: SEARCH_RADIUS_KM,
              unit: "km",
            },
          }),
      // A bounded result set: the supplier's guidance is explicitly against
      // pulling full inventory on every search.
      filter: { maxHotels: 50, maxRatesPerRoom: 6 },
    },
    intent,
    locale,
  );
}

export async function searchHotelbedsHotel(
  slug: string,
  intent: SearchIntent,
  locale: Locale,
): Promise<AdaptedHotel | null> {
  if (!isHotelbedsEnabled()) return null;
  const index = await getIndex();
  const code = index.bySlug[slug];
  if (!code) return null;

  const result = await runAvailability(
    { ...baseRequest(intent), hotels: { hotel: [code] }, filter: { maxRatesPerRoom: 12 } },
    intent,
    locale,
  );
  return result.hotels[0] ?? null;
}

/** Cached-content suggestions, so autocomplete never spends a live request. */
export async function hotelbedsSuggestions(query: string, locale: Locale, limit = 6): Promise<Suggestion[]> {
  if (!isHotelbedsEnabled()) return [];
  const q = fold(query.trim());
  if (q.length < 2) return [];

  const [destinations, index, types] = await Promise.all([getCachedDestinations(), getIndex(), getTypes()]);
  const out: Suggestion[] = [];

  for (const destination of destinations) {
    const label = destination.name?.content ?? "";
    // Folded, so an accented supplier destination is found by the plain spelling.
    if (!label || !fold(label).includes(q)) continue;
    if (!destination.code) continue;
    out.push({
      id: `hbd-${destination.code}`,
      type: "city",
      label,
      context: destination.countryCode ?? "",
      countryCode: destination.countryCode ?? "",
      propertyCount: (index.byDestination[destination.code] ?? []).length,
    });
    if (out.length >= limit) break;
  }

  // Property-level matches from the cached catalogue.
  if (out.length < limit) {
    for (const slug of Object.keys(index.bySlug)) {
      if (!slug.includes(q.replace(/\s+/g, "-"))) continue;
      const content = await getHotelBySlug(slug);
      if (!content) continue;
      const canonical = buildCanonicalHotelFromContent(content, types, locale);
      out.push({
        id: `hotel-${slug}`,
        type: "hotel",
        label: canonical.name,
        context: [canonical.address.city, canonical.address.countryCode].filter(Boolean).join(", "),
        countryCode: canonical.address.countryCode,
        hotelSlug: slug,
      });
      if (out.length >= limit) break;
    }
  }

  return out;
}
