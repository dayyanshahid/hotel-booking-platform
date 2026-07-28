import type {
  HotelResultCard,
  Locale,
  SearchFacets,
  SearchFilters,
  SearchIntent,
  SearchResponse,
  SortKey,
  Suggestion,
} from "../types";
import { AMENITY_CATALOG, BOARD_CATALOG, PROPERTY_TYPES, localized } from "../data/catalog";
import {
  bookableCountryList,
  destinationsInCountry,
  DESTINATIONS,
  EXTRA_PLACES,
  getDestination,
} from "../data/destinations";
import { HOTEL_SEEDS, getHotelSeed, hotelsInDestination } from "../data/hotels";
import { addDays, nightsBetween } from "../format";
import { createTranslator } from "../i18n";
import { buildResultCard, normalizeHotel, type NormalizedHotel } from "./normalize";
import { fetchFromSources } from "./suppliers";
import { isHotelbedsEnabled } from "./hotelbeds/config";
import {
  isTourmindSlug,
  searchTourmind,
  searchTourmindHotel,
  tourmindSuggestions,
} from "./tourmind/search";
import { isTourmindEnabled } from "./tourmind/config";
import { normalizeTourmind } from "./tourmind/normalize";
import {
  hotelbedsSuggestions,
  resolveHotelbedsDestination,
  searchHotelbedsDestination,
  searchHotelbedsHotel,
} from "./hotelbeds/search";
import type { ScenarioId } from "./scenarios";
import { hash01 } from "./pricing";

/* ------------------------------------------------------- suggestions */

export function suggest(query: string, locale: Locale, limit = 8): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = createTranslator(locale);
  const out: Suggestion[] = [];

  for (const d of DESTINATIONS) {
    const label = localized(d.name, locale);
    const en = d.name.en.toLowerCase();
    if (label.toLowerCase().includes(q) || en.includes(q)) {
      out.push({
        id: d.id,
        type: "city",
        label,
        context: localized(d.country, locale),
        countryCode: d.countryCode,
        coordinates: d.coordinates,
        propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id).length,
      });
    }
    for (const n of d.neighborhoods) {
      const nLabel = localized(n.name, locale);
      if (nLabel.toLowerCase().includes(q) || n.name.en.toLowerCase().includes(q)) {
        out.push({
          id: `${d.id}::${n.key}`,
          type: "neighborhood",
          label: nLabel,
          context: `${localized(d.name, locale)}, ${localized(d.country, locale)}`,
          countryCode: d.countryCode,
          coordinates: d.coordinates,
          propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id && h.neighborhood === n.key).length,
        });
      }
    }
  }

  // Countries. On a six-city catalogue nobody types a country name; on a global
  // one it is often the first thing they type, and it should land somewhere.
  for (const country of bookableCountryList()) {
    const label = locale === "ar" ? (country.nameAr ?? country.name) : country.name;
    if (label.toLowerCase().includes(q) || country.name.toLowerCase().includes(q)) {
      const cities = destinationsInCountry(country.code);
      out.push({
        id: `country-${country.code}`,
        type: "country",
        label,
        context: t(`region.${country.region}`),
        countryCode: country.code,
        coordinates: cities[0]?.coordinates,
        propertyCount: cities.reduce((sum, c) => sum + hotelsInDestination(c.id).length, 0),
      });
    }
  }

  for (const p of EXTRA_PLACES) {
    const label = localized(p.name, locale);
    if (label.toLowerCase().includes(q) || p.name.en.toLowerCase().includes(q)) {
      const d = getDestination(p.destinationId)!;
      out.push({
        id: p.id,
        type: p.type,
        label,
        context: `${localized(d.name, locale)}, ${localized(d.country, locale)}`,
        countryCode: d.countryCode,
        coordinates: p.coordinates,
      });
    }
  }

  // Hotels rank below every place type, so there is no point collecting more
  // than could ever be shown — the catalogue is ~1,000 properties and this runs
  // on every keystroke.
  let hotelMatches = 0;
  for (const h of HOTEL_SEEDS) {
    if (hotelMatches >= limit) break;
    const label = localized(h.name, locale);
    if (label.toLowerCase().includes(q) || h.name.en.toLowerCase().includes(q)) {
      hotelMatches += 1;
      const d = getDestination(h.destinationId)!;
      out.push({
        id: `hotel-${h.slug}`,
        type: "hotel",
        label,
        context: `${localized(d.name, locale)}, ${localized(d.country, locale)}`,
        countryCode: d.countryCode,
        hotelSlug: h.slug,
      });
    }
  }

  // Rank: exact prefix, then type weight (city > neighborhood > landmark > hotel), then size.
  const weight: Record<string, number> = { city: 0, country: 1, neighborhood: 2, airport: 3, landmark: 4, region: 2, hotel: 5 };
  return out
    .sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const aw = weight[a.type] ?? 5;
      const bw = weight[b.type] ?? 5;
      if (aw !== bw) return aw - bw;
      return (b.propertyCount ?? 0) - (a.propertyCount ?? 0);
    })
    .slice(0, limit);
}

/**
 * Suggestions across every catalogue the platform knows about. Live-supply
 * places come from the content cache, so typing never spends a supplier request
 * (§12.2 debounce/cancel, and the supplier's own quota rules).
 */
export async function suggestAll(query: string, locale: Locale, limit = 8): Promise<Suggestion[]> {
  const local = suggest(query, locale, limit);

  // Both live suppliers read their own local caches here, so typing never
  // spends a supplier request no matter how many are configured.
  const fromTourmind = await tourmindSuggestions(query, locale, limit);
  const withTourmind = [...local, ...fromTourmind.filter((s) => !local.some((l) => l.id === s.id))];

  if (!isHotelbedsEnabled()) return withTourmind.slice(0, limit);

  const live = await hotelbedsSuggestions(query, locale, limit);
  const seen = new Set(withTourmind.map((item) => item.id));
  const merged = [...withTourmind];
  for (const item of live) {
    if (seen.has(item.id)) continue;
    merged.push(item);
    seen.add(item.id);
  }
  return merged.slice(0, limit);
}

/* ------------------------------------------------------------ search */

export function resolveDestination(intent: SearchIntent): {
  destinationId: string;
  neighborhoodKey?: string;
  hotelSlug?: string;
} {
  const raw = intent.destinationId;
  if (raw.startsWith("hotel-")) {
    const slug = raw.replace("hotel-", "");
    const seed = getHotelSeed(slug);
    return { destinationId: seed?.destinationId ?? raw, hotelSlug: slug };
  }
  if (raw.includes("::")) {
    const [destId, hood] = raw.split("::");
    return { destinationId: destId, neighborhoodKey: hood };
  }
  const place = EXTRA_PLACES.find((p) => p.id === raw);
  if (place) return { destinationId: place.destinationId };
  return { destinationId: raw };
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface SearchOptions {
  filters?: SearchFilters;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  scenario: ScenarioId;
  locale: Locale;
}

export async function runSearch(intent: SearchIntent, options: SearchOptions): Promise<SearchResponse> {
  const { locale, scenario } = options;
  const resolved = resolveDestination(intent);
  const effectiveIntent: SearchIntent = { ...intent, destinationId: resolved.destinationId };

  const responses = await fetchFromSources(effectiveIntent, scenario);
  const healthy = responses.filter((r) => r.status === "ok");
  const failedCount = responses.length - healthy.length;

  const bySlug = new Map<string, ReturnType<typeof groupInit>>();
  function groupInit() {
    return [] as (typeof healthy)[number]["offers"];
  }
  for (const response of healthy) {
    for (const offer of response.offers) {
      const list = bySlug.get(offer.hotelSlug) ?? groupInit();
      list.push(offer);
      bySlug.set(offer.hotelSlug, list);
    }
  }

  const normalized: NormalizedHotel[] = [];
  for (const [slug, offers] of bySlug) {
    const seed = getHotelSeed(slug);
    if (!seed) continue;
    if (resolved.neighborhoodKey && seed.neighborhood !== resolved.neighborhoodKey) continue;
    const n = normalizeHotel(seed, offers, effectiveIntent, locale, scenario);
    if (n && n.offers.length) normalized.push(n);
  }

  /**
   * Live supply is merged in as one more source. It produces the same canonical
   * shape, so filters, sorting, facets and cards treat it identically (§9.1).
   * The scenario harness stays authoritative: a forced outage must also suppress
   * the live source, or the edge case could not be demonstrated.
   */
  let liveStatus: "ok" | "unavailable" | "skipped" = "skipped";
  const supplierOutageForced = scenario === "allSuppliersFail" || scenario === "zeroResults";

  /*
   * TourMind, merged the same way. It is a no-op until credentials are set and
   * the catalogue has been synced, so an unconfigured supplier costs a search
   * nothing — and a forced outage suppresses it alongside the others, or the
   * edge case could not be demonstrated.
   */
  if (isTourmindEnabled() && !supplierOutageForced) {
    try {
      const results = await searchTourmind(effectiveIntent, locale);
      for (const result of results) {
        const adapted = normalizeTourmind(result, effectiveIntent, locale);
        if (adapted.offers.length) {
          normalized.push({ ...adapted, sourceCount: 1 });
          liveStatus = "ok";
        }
      }
    } catch {
      // A live source failing degrades the page; it never empties it. The
      // simulated and Hotelbeds results above still stand.
      liveStatus = "unavailable";
    }
  }
  if (isHotelbedsEnabled() && !supplierOutageForced) {
    // A coordinate for every city, or a supplier destination code on a deep link.
    const where = await resolveHotelbedsDestination(resolved.destinationId);
    if (where) {
      const live = await searchHotelbedsDestination(where, effectiveIntent, locale);
      liveStatus = live.status;
      for (const adapted of live.hotels) {
        normalized.push({
          hotel: adapted.hotel,
          rooms: adapted.rooms,
          offers: adapted.offers,
          sourceCount: 1,
        });
      }
    }
  }

  let cards = normalized.map((n) => buildResultCard(n, effectiveIntent, locale));

  // Multi-room partial availability (E-17): the party cannot be split silently.
  if (scenario === "multiRoomPartial" && effectiveIntent.rooms.length > 1) {
    cards = cards.filter((_, i) => i % 3 !== 0);
  }

  const dest = getDestination(resolved.destinationId);
  const centre = dest?.coordinates ?? cards[0]?.coordinates ?? { lat: 0, lng: 0 };
  const withDistance = cards.map((c) => ({ card: c, distance: distanceKm(centre, c.coordinates) }));

  const facets = buildFacets(cards, locale);
  const filtered = applyFilters(withDistance, options.filters ?? {}, normalized);
  const sorted = applySort(filtered, options.sort ?? "recommended");

  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 12;
  const pageItems = sorted.slice(0, page * pageSize).map((x) => x.card);

  const liveFailed = liveStatus === "unavailable";
  const totalSources = responses.length + (liveStatus === "skipped" ? 0 : 1);
  const totalFailed = failedCount + (liveFailed ? 1 : 0);
  const completeness: SearchResponse["completeness"] =
    totalFailed >= totalSources ? "empty" : totalFailed > 0 ? "partial" : "complete";

  const response: SearchResponse = {
    searchToken: `st_${hash01(JSON.stringify(effectiveIntent)).toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
    intent: effectiveIntent,
    results: pageItems,
    totalCount: sorted.length,
    facets,
    completeness,
    completenessMessage:
      totalFailed >= totalSources
        ? locale === "ar"
          ? "تعذّر الوصول إلى مصادر الفنادق. بحثك محفوظ ويمكنك إعادة المحاولة."
          : "We could not reach our hotel sources. Your search is saved — try again in a moment."
        : totalFailed > 0
          ? locale === "ar"
            ? "بعض الخيارات لا تزال قيد التحميل. الأسعار المعروضة حية وقد تُضاف خيارات أخرى."
            : "Some options are still loading. Prices shown are live and more may appear."
          : undefined,
    page,
    pageSize,
    fetchedAt: new Date().toISOString(),
  };

  if (!sorted.length) {
    response.recovery = buildRecovery(effectiveIntent, options.filters ?? {}, locale);
  }

  return response;
}

function buildFacets(cards: HotelResultCard[], locale: Locale): SearchFacets {
  const prices = cards.map((c) => c.price.total);
  const count = <T extends string | number>(values: T[]) => {
    const map = new Map<T, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return map;
  };

  const catCount = count(cards.map((c) => c.category));
  const hoodCount = count(cards.map((c) => c.neighborhood));
  const typeCount = count(cards.map((c) => c.propertyType));
  const amenityCount = new Map<string, number>();
  for (const c of cards) for (const a of c.topAmenities) amenityCount.set(a.code, (amenityCount.get(a.code) ?? 0) + 1);
  const boardCount = count(cards.map((c) => c.offerSummary.boardSummary));
  const payCount = count(cards.map((c) => c.offerSummary.paymentTiming));

  return {
    priceRange: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    categories: [...catCount.entries()].map(([value, c]) => ({ value, count: c })).sort((a, b) => b.value - a.value),
    neighborhoods: [...hoodCount.entries()].map(([value, c]) => ({ value, count: c })).sort((a, b) => b.count - a.count),
    amenities: [...amenityCount.entries()]
      .map(([code, c]) => ({ code, label: localized(AMENITY_CATALOG[code]?.label, locale) || code, count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    boards: [...boardCount.entries()].map(([value, c]) => ({ code: value, label: value, count: c })),
    propertyTypes: [...typeCount.entries()].map(([value, c]) => ({ value, count: c })),
    paymentTiming: [...payCount.entries()].map(([value, c]) => ({ value, count: c })),
  };
}

type Entry = { card: HotelResultCard; distance: number };

function applyFilters(entries: Entry[], f: SearchFilters, normalized: NormalizedHotel[]): Entry[] {
  return entries.filter(({ card, distance }) => {
    if (f.minPrice != null && card.price.total < f.minPrice) return false;
    if (f.maxPrice != null && card.price.total > f.maxPrice) return false;
    if (f.categories?.length && !f.categories.includes(card.category)) return false;
    if (f.minRating != null && (card.review?.score ?? 0) < f.minRating) return false;
    if (f.neighborhoods?.length && !f.neighborhoods.includes(card.neighborhood)) return false;
    if (f.propertyTypes?.length && !f.propertyTypes.includes(card.propertyType)) return false;
    if (f.maxDistanceKm != null && distance > f.maxDistanceKm) return false;
    if (f.refundableOnly && !card.offerSummary.refundable) return false;
    if (f.payLaterOnly && card.offerSummary.paymentTiming === "payNow") return false;
    if (f.dealsOnly && !card.price.strikeTotal) return false;
    if (f.accessibleOnly && !card.accessibilityHighlights.length) return false;
    if (f.amenities?.length) {
      const n = normalized.find((x) => x.hotel.slug === card.slug);
      const codes = new Set(n?.hotel.amenities.map((a) => a.code));
      if (!f.amenities.every((a) => codes.has(a))) return false;
    }
    if (f.boards?.length) {
      const n = normalized.find((x) => x.hotel.slug === card.slug);
      const labels = new Set(n?.offers.map((o) => o.board.label));
      if (!f.boards.some((b) => labels.has(b))) return false;
    }
    if (f.bounds) {
      const { north, south, east, west } = f.bounds;
      const { lat, lng } = card.coordinates;
      if (lat > north || lat < south || lng > east || lng < west) return false;
    }
    return true;
  });
}

function applySort(entries: Entry[], sort: SortKey): Entry[] {
  const copy = [...entries];
  switch (sort) {
    case "priceAsc":
      return copy.sort((a, b) => a.card.price.total - b.card.price.total);
    case "priceDesc":
      return copy.sort((a, b) => b.card.price.total - a.card.price.total);
    case "rating":
      return copy.sort((a, b) => (b.card.review?.score ?? 0) - (a.card.review?.score ?? 0));
    case "distance":
      return copy.sort((a, b) => a.distance - b.distance);
    case "flexible":
      return copy.sort(
        (a, b) =>
          Number(b.card.offerSummary.refundable) - Number(a.card.offerSummary.refundable) ||
          a.card.price.total - b.card.price.total,
      );
    case "bestValue":
      return copy.sort((a, b) => valueOf(b.card) - valueOf(a.card));
    case "recommended":
    default:
      return copy.sort((a, b) => recommendOf(b) - recommendOf(a));
  }
}

function valueOf(c: HotelResultCard): number {
  return c.scores.price * 0.4 + c.scores.quality * 0.3 + c.scores.flexibility * 0.2 + c.scores.fit * 0.1;
}

/** Recommended = published, testable criteria (§3.1 "Explain recommendations"). */
function recommendOf(e: Entry): number {
  const c = e.card;
  return (
    c.scores.price * 0.3 +
    c.scores.quality * 0.3 +
    c.scores.flexibility * 0.15 +
    c.scores.fit * 0.1 +
    Math.max(0, 1 - e.distance / 12) * 0.15
  );
}

export const RECOMMENDATION_CRITERIA: Record<Locale, string[]> = {
  en: [
    "Stay total for your exact dates and occupancy (30%)",
    "Verified guest rating and quality signals (30%)",
    "Cancellation flexibility (15%)",
    "Distance from your searched area (15%)",
    "How well the room fits your party (10%)",
  ],
  ar: [
    "إجمالي الإقامة لتواريخك وعدد ضيوفك (٣٠٪)",
    "تقييم النزلاء المُتحقق ومؤشرات الجودة (٣٠٪)",
    "مرونة الإلغاء (١٥٪)",
    "المسافة عن المنطقة التي بحثت عنها (١٥٪)",
    "مدى ملاءمة الغرفة لمجموعتك (١٠٪)",
  ],
};

function buildRecovery(intent: SearchIntent, filters: SearchFilters, locale: Locale) {
  const nights = Math.max(1, nightsBetween(intent.checkIn, intent.checkOut));
  const nearbyDates = [-7, -3, 3, 7].map((shift) => {
    const checkIn = addDays(intent.checkIn, shift);
    return {
      checkIn,
      checkOut: addDays(checkIn, nights),
      fromTotal: Math.round(600 * nights * (0.85 + hash01(checkIn) * 0.4)),
    };
  });

  const current = getDestination(intent.destinationId);
  const nearbyDestinations = DESTINATIONS.filter((d) => d.id !== current?.id)
    .slice(0, 3)
    .map((d) => ({
      id: d.id,
      label: localized(d.name, locale),
      propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id).length,
    }));

  const relaxable = Object.entries(filters)
    .filter(([, v]) => (Array.isArray(v) ? v.length : v != null && v !== false))
    .map(([k]) => k);

  return { nearbyDates, nearbyDestinations, relaxableFilters: relaxable };
}

/* --------------------------------------------------- single hotel view */

export async function runHotelAvailability(
  slug: string,
  intent: SearchIntent,
  locale: Locale,
  scenario: ScenarioId,
): Promise<NormalizedHotel | null> {
  // Live properties resolve through the supplier adapter; demo properties keep
  // using the simulated sources. Both return the same canonical shape.
  if (isTourmindSlug(slug)) {
    const result = await searchTourmindHotel(slug, intent, locale);
    if (!result) return null;
    const adapted = normalizeTourmind(result, intent, locale);
    return { hotel: adapted.hotel, rooms: adapted.rooms, offers: adapted.offers, sourceCount: 1 };
  }

  if (slug.startsWith("hb-") && isHotelbedsEnabled()) {
    const adapted = await searchHotelbedsHotel(slug, intent, locale);
    if (!adapted) return null;
    return { hotel: adapted.hotel, rooms: adapted.rooms, offers: adapted.offers, sourceCount: 1 };
  }

  const seed = getHotelSeed(slug);
  if (!seed) return null;
  const responses = await fetchFromSources({ ...intent, destinationId: seed.destinationId }, scenario);
  const offers = responses
    .filter((r) => r.status === "ok")
    .flatMap((r) => r.offers)
    .filter((o) => o.hotelSlug === slug);
  if (!offers.length) return null;
  return normalizeHotel(seed, offers, intent, locale, scenario);
}

export { BOARD_CATALOG, PROPERTY_TYPES };
