import type { Locale, SearchIntent, Suggestion } from "@/lib/types";
import { hotelbeds, HotelbedsError } from "./client";
import { isHotelbedsEnabled } from "./config";
import { getCachedDestinations, getHotelBySlug, getIndex, getTypes } from "./content";
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
export async function resolveHotelbedsDestination(destinationId: string): Promise<string | null> {
  if (destinationId.startsWith("hbd-")) return destinationId.replace("hbd-", "");
  const index = await getIndex();
  const mapped = index.byDestination;
  // Seed destinations map only when a sync has matched them by name.
  const alias = (await getCachedDestinations()).find(
    (destination) =>
      destination.code &&
      mapped[destination.code] &&
      destinationId.replace("dest-", "").toLowerCase() ===
        (destination.name?.content ?? "").toLowerCase().replace(/\s+/g, "-"),
  );
  return alias?.code ?? null;
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

    for (const hbHotel of hbHotels) {
      const result = await adaptAvailability(hbHotel, intent, locale);
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
          allotment: 0,
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

export async function searchHotelbedsDestination(
  destinationCode: string,
  intent: SearchIntent,
  locale: Locale,
): Promise<HotelbedsSearchResult> {
  if (!isHotelbedsEnabled()) return { hotels: [], status: "unavailable", reason: "not configured" };
  return runAvailability(
    {
      ...baseRequest(intent),
      destination: { code: destinationCode },
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
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const [destinations, index, types] = await Promise.all([getCachedDestinations(), getIndex(), getTypes()]);
  const out: Suggestion[] = [];

  for (const destination of destinations) {
    const label = destination.name?.content ?? "";
    if (!label || !label.toLowerCase().includes(q)) continue;
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
