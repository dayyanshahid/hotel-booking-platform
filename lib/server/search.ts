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
import { AMENITY_CATALOG, BOARD_CATALOG, PROPERTY_TYPES, localized, titleCaseBoard } from "../data/catalog";
import {
  bookableCountryList,
  destinationsInCountry,
  DESTINATIONS,
  EXTRA_PLACES,
  getDestination,
} from "../data/destinations";
import { HOTEL_SEEDS, getHotelSeed, hotelsInDestination } from "../data/hotels";
import { addDays, comparableTotal, nightsBetween } from "../format";
import { createTranslator } from "../i18n";
import { buildResultCard, normalizeHotel, scoreSupply, type NormalizedHotel } from "./normalize";
import { fetchFromSources } from "./suppliers";
import { rememberOffer } from "./store";
import { primeMarkup } from "./platform";
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
import { fold, foldedIncludes as matches } from "../text";
import { readSupply, supplyKey, writeSupply, type LiveStatus as CachedLiveStatus } from "./supply-cache";
import { newOfferBatch, publishOffers, rebatchOffers } from "./store";
import { anchorPoint, anchorsFor } from "@/lib/geo/anchors";
import { GENERATED_AIRPORTS } from "@/lib/data/airports.generated";
import { roomCategoryOf, ROOM_CATEGORY_ORDER } from "@/lib/search/room-category";
import { conditionsOf, RATE_CONDITIONS } from "@/lib/search/rate-conditions";

/* ------------------------------------------------------- suggestions */

export function suggest(query: string, locale: Locale, limit = 8): Suggestion[] {
  const q = fold(query.trim());
  if (!q) return [];
  const t = createTranslator(locale);
  const out: Suggestion[] = [];

  for (const d of DESTINATIONS) {
    const label = localized(d.name, locale);
        if (matches(label, q) || matches(d.name.en, q)) {
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
      if (matches(nLabel, q) || matches(n.name.en, q)) {
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
    if (matches(label, q) || matches(country.name, q)) {
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
    if (matches(label, q) || matches(p.name.en, q)) {
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

  /*
   * Airports from the generated list, so typing "Heathrow" or "LHR" finds
   * London. The label carries the code in brackets, which is what makes a
   * three-letter query match at all — agents type the code far more often than
   * the name.
   */
  for (const airport of GENERATED_AIRPORTS) {
    if (!matches(airport.name, q)) continue;
    const d = getDestination(airport.destinationId);
    if (!d) continue;
    out.push({
      id: airport.id,
      type: "airport",
      label: airport.name,
      context: `${localized(d.name, locale)}, ${localized(d.country, locale)}`,
      countryCode: d.countryCode,
      coordinates: airport.coordinates,
    });
  }

  // Hotels rank below every place type, so there is no point collecting more
  // than could ever be shown — the catalogue is ~1,000 properties and this runs
  // on every keystroke.
  let hotelMatches = 0;
  for (const h of HOTEL_SEEDS) {
    if (hotelMatches >= limit) break;
    const label = localized(h.name, locale);
    if (matches(label, q) || matches(h.name.en, q)) {
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
      const ap = fold(a.label).startsWith(q) ? 0 : 1;
      const bp = fold(b.label).startsWith(q) ? 0 : 1;
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
  const airport = GENERATED_AIRPORTS.find((a) => a.id === raw);
  if (airport) return { destinationId: airport.destinationId };
  const place = EXTRA_PLACES.find((p) => p.id === raw);
  if (place) return { destinationId: place.destinationId };
  return { destinationId: raw };
}

/**
 * One name per place, out of whatever the supplier called it.
 *
 * Zone names arrive as free text and the two suppliers disagree with
 * themselves as much as with each other. A Dubai search offered "DEIRA",
 * "DEIRA DUBAI" and "DEIRA - DUBAI" as three separate filters of one property
 * each, plus "DUBAI" and "Dubai" as two more — thirteen rows for about six
 * actual places, none of which could be filtered on usefully because picking
 * one excluded the same neighbourhood spelled another way.
 *
 * So the raw string is folded to a key: the city qualifier trailing the zone
 * is dropped, separators are normalised, and the result is title-cased for
 * display. The facet and the filter both run through here, which is what keeps
 * a click on "Deira" matching every property the supplier filed under any of
 * its three spellings.
 */
export function zoneLabel(raw: string | undefined, locality: string | undefined): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  // "Barsha Heights - Dubai", "Al Khan, Sharjah" — the tail is the city, and
  // the city is already the search.
  const city = fold(locality ?? "");
  let parts = text.split(/\s*[-,/]\s*/).filter(Boolean);
  if (parts.length > 1 && city && fold(parts[parts.length - 1]) === city) parts = parts.slice(0, -1);

  let name = parts.join(" - ").trim();

  /*
   * Only where the supplier put a separator.
   *
   * The tempting next step is to strip a trailing city token with no
   * punctuation too, so "DEIRA DUBAI" folds into "DEIRA". It also turns "BUR
   * DUBAI" into "Bur", and Bur Dubai is a place whose name contains the city
   * — the rule cannot tell the two apart from the string alone. A duplicate
   * row is untidy; renaming a neighbourhood is wrong, and an agent looking for
   * Bur Dubai would not find it. So the unpunctuated case is left alone.
   */

  // A zone that was only ever the city name stays the city name: it is where
  // two thirds of the results are, and dropping it would remove the filter
  // rather than tidy it.
  if (!name) name = text;

  return name
    .toLocaleLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, lead, letter) => lead + letter.toLocaleUpperCase());
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
  /**
   * Which inventory to search.
   *
   * The public site sells everything the platform holds, demonstration
   * catalogue included. A trade portal must not: an agent quoting a property to
   * a customer has to be able to book it, and a demo property is a promise
   * nobody can keep. `live` restricts a search to the two contracted suppliers.
   */
  supply?: "all" | "live";
}

/** Whether a live supplier answered, failed, or was never asked. */
type LiveStatus = CachedLiveStatus;

/**
 * How long a search may take, whatever the suppliers are doing.
 *
 * Nothing used to bound this. Each supplier call carried its own timeout and
 * its own retry, so a Hotelbeds availability request that timed out cost twenty
 * seconds, backed off, and cost twenty more before the page gave up on it. A
 * measured Singapore search took thirty-seven seconds and the caller abandoned
 * it first — which is not a slow search, it is a lost phone call.
 *
 * Fifteen seconds is the outer bound, and it is a promise about the page rather
 * than about any one supplier: whatever has arrived by then is what gets
 * ranked, and a source that has not answered is reported as unavailable. That
 * is the same state the page already knows how to render — "this page is
 * missing some options" — so the honest partial answer costs nothing new.
 *
 * It deliberately does not shorten the per-call timeouts. A retry after a fast
 * network blip still happens and still helps; what cannot happen any more is
 * waiting out a second full timeout on a supplier that has already failed to
 * answer once. Set `SEARCH_DEADLINE_MS=0` to wait indefinitely again.
 */
function searchDeadlineMs(): number {
  const raw = Number(process.env.SEARCH_DEADLINE_MS);
  if (Number.isFinite(raw)) return raw > 0 ? raw : Number.POSITIVE_INFINITY;
  return 15_000;
}

/**
 * Whatever the source produced by the deadline, or nothing and a reason.
 *
 * The abandoned work carries on and is discarded; there is nothing to cancel
 * safely mid-flight, and a supplier request that lands late has still written
 * its rates to the offer store, where the next search will find them warm.
 */
async function bySearchDeadline<T>(
  work: Promise<T>,
  deadlineAt: number,
  onLate: () => T,
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (!Number.isFinite(remaining)) return work;
  if (remaining <= 0) return onLate();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onLate()), remaining);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runSearch(intent: SearchIntent, options: SearchOptions): Promise<SearchResponse> {
  // Pick up any markup the console has set before a single rate is priced.
  await primeMarkup();
  const { locale, scenario } = options;
  const resolved = resolveDestination(intent);
  const effectiveIntent: SearchIntent = { ...intent, destinationId: resolved.destinationId };

  const liveOnly = options.supply === "live";
  // A live-only search never asks the simulated sources at all, so it costs
  // nothing to exclude them rather than filtering them out afterwards.
  const responses = liveOnly ? [] : await fetchFromSources(effectiveIntent, scenario);
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

  /*
   * What is available, which does not change when a filter does.
   *
   * Held for two minutes against the stay, so working the sidebar re-reads the
   * same supply instead of asking both suppliers again. See
   * lib/server/supply-cache.ts for why that is safe.
   *
   * A hit also implies the offers behind these rooms are still in this
   * process's offer store, because both caches live in the same process — so
   * nothing has to re-register them for checkout to find them.
   */
  const cacheKey = supplyKey(effectiveIntent, locale, options.supply ?? "all", scenario);
  const cachedSupply = readSupply(cacheKey);
  /*
   * One batch for everything this search builds, so any instance can find an
   * offer again from its id. A cache hit reuses the supply — and therefore the
   * ids, and therefore the batch — that the original run published.
   */
  const batch = newOfferBatch();

  let normalized: NormalizedHotel[];
  let liveStatuses: LiveStatus[];

  if (cachedSupply) {
    normalized = cachedSupply.normalized;
    liveStatuses = cachedSupply.liveStatuses;
  } else {
    const gathered: NormalizedHotel[] = [];
    for (const [slug, offers] of bySlug) {
      const seed = getHotelSeed(slug);
      if (!seed) continue;
      if (resolved.neighborhoodKey && seed.neighborhood !== resolved.neighborhoodKey) continue;
      const n = normalizeHotel(seed, offers, effectiveIntent, locale, scenario, { batch });
      if (n && n.offers.length) gathered.push(n);
    }

    /**
     * Live supply is merged in as one more source. It produces the same canonical
     * shape, so filters, sorting, facets and cards treat it identically (§9.1).
     * The scenario harness stays authoritative: a forced outage must also suppress
     * the live source, or the edge case could not be demonstrated.
     */
    const supplierOutageForced = scenario === "allSuppliersFail" || scenario === "zeroResults";

    /*
     * Live supply, both suppliers at once.
     *
     * They used to run one after the other, which was invisible while only one of
     * them had credentials and costs a guest the sum of both the moment the
     * second one is switched on. They share nothing, so there is no reason to
     * make one wait for the other.
     *
     * Each is a source in its own right for the completeness count. A single
     * shared flag meant a Hotelbeds success overwrote a TourMind failure and the
     * page called itself complete while a supplier was down.
     */
    /*
     * One clock for both of them.
     *
     * Shared and absolute rather than a budget each, because the agent is waiting
     * on the page and not on a supplier: two sources given fifteen seconds apiece
     * is a thirty-second page the moment they do not overlap.
     */
    const deadlineAt = Date.now() + searchDeadlineMs();
    const late = (): { status: LiveStatus; hotels: NormalizedHotel[] } => ({
      status: "unavailable",
      hotels: [],
    });

    const [tourmindOutcome, hotelbedsOutcome] = await Promise.all([
      bySearchDeadline((async (): Promise<{ status: LiveStatus; hotels: NormalizedHotel[] }> => {
        if (!isTourmindEnabled() || supplierOutageForced) return { status: "skipped", hotels: [] };
        try {
          const results = await searchTourmind(effectiveIntent, locale);
          const hotels = results
            .map((result) => normalizeTourmind(result, effectiveIntent, locale))
            .filter((adapted) => adapted.offers.length)
            // Before anything reads an id: the cards, the bindings map and the
            // stored offers all have to agree on what this offer is called.
            .map((adapted) => {
              rebatchOffers(batch, adapted);
              return adapted;
            })
            .map((adapted) => {
              /*
               * Remember every rate, exactly as the Hotelbeds path does.
               *
               * Without this a TourMind room could be searched, ranked and shown
               * with a price, and then refused at checkout: the offer id on the
               * card resolved to nothing in the store, so the session endpoint
               * answered "this option changed or sold out" every single time. The
               * supplier was fine and the search was fine — the rate was simply
               * never written down, so nothing could be bought from one of the
               * two suppliers we sell.
               */
              for (const offer of adapted.offers) {
                const binding = adapted.contexts.get(offer.offerId);
                if (!binding) continue;
                const room = adapted.rooms.find((r) => r.canonicalRoomId === offer.canonicalRoomId);
                rememberOffer(offer.offerId, {
                  offerId: offer.offerId,
                  hotelSlug: adapted.hotel.slug,
                  roomKey: room?.canonicalRoomId ?? offer.canonicalRoomId,
                  canonicalRoomKey: offer.canonicalRoomId,
                  board: offer.board.code as never,
                  rateClass: offer.cancellation.refundable ? "flex" : "nrf",
                  sourceCode: "TM",
                  // Their CheckRoomRate is mandatory before an order, so every
                  // rate here has to be re-priced before it can be committed.
                  rateTypeInternal: "RECHECK",
                  conditionCodes: [],
                  memberRate: false,
                  guaranteeEligible: offer.capabilities.guaranteeEligible,
                  modifiable: offer.capabilities.modifyAllowed,
                  // What the supplier said it still holds. Hard-coding zero here made the
                  // checkout's overbooking guard inert: it reads zero as "the source did not
                  // say" and waves the basket through.
                  allotment: offer.allotment,
                  intent: effectiveIntent,
                  price: offer.price,
                  cancellation: offer.cancellation,
                  expiresAt: offer.expiresAt,
                  supplierRoomLabel: room?.name ?? offer.canonicalRoomId,
                  hotelName: adapted.hotel.name,
                  roomLabel: room?.name ?? offer.canonicalRoomId,
                  boardLabel: offer.board.label,
                  comments: offer.comments,
                  tourmind: binding,
                });
              }
              return { ...adapted, sourceCount: 1 };
            });
          return { status: "ok", hotels };
        } catch {
          // A live source failing degrades the page; it never empties it. The
          // simulated and other live results still stand.
          return { status: "unavailable", hotels: [] };
        }
      })(), deadlineAt, late),
      bySearchDeadline((async (): Promise<{ status: LiveStatus; hotels: NormalizedHotel[] }> => {
        if (!isHotelbedsEnabled() || supplierOutageForced) return { status: "skipped", hotels: [] };
        // A coordinate for every city, or a supplier destination code on a deep link.
        const where = await resolveHotelbedsDestination(resolved.destinationId);
        if (!where) return { status: "skipped", hotels: [] };
        const live = await searchHotelbedsDestination(where, effectiveIntent, locale, batch);
        return {
          status: live.status,
          hotels: live.hotels.map((adapted) => ({
            hotel: adapted.hotel,
            rooms: adapted.rooms,
            offers: adapted.offers,
            sourceCount: 1,
          })),
        };
      })(), deadlineAt, late),
    ]);

    gathered.push(...tourmindOutcome.hotels, ...hotelbedsOutcome.hotels);

      /*
       * Scored here rather than after the branch, because scoring mutates the
       * offers in place — running it again over cached supply would score
       * already-scored rates a second time.
       */
      scoreSupply(gathered, effectiveIntent);

      normalized = gathered;
      liveStatuses = [tourmindOutcome.status, hotelbedsOutcome.status];

      /*
       * A failed run is not an answer worth keeping.
       *
       * Caching it would hold the outage open: both suppliers time out once,
       * and every search for that stay is told "nothing available" for the
       * next two minutes, long after they came back. The cache exists to save
       * repeating a question we have the answer to, and "we could not ask" is
       * not one of those.
       */
      const answered = liveStatuses.some((status) => status === "ok");
      if (answered || normalized.length) writeSupply(cacheKey, { normalized, liveStatuses });
    }

  let cards = normalized.map((n) => buildResultCard(n, effectiveIntent, locale));

  // Multi-room partial availability (E-17): the party cannot be split silently.
  if (scenario === "multiRoomPartial" && effectiveIntent.rooms.length > 1) {
    cards = cards.filter((_, i) => i % 3 !== 0);
  }

  const dest = getDestination(resolved.destinationId);
  const centre = dest?.coordinates ?? cards[0]?.coordinates ?? { lat: 0, lng: 0 };
  const withDistance = cards.map((c) => ({ card: c, distance: distanceKm(centre, c.coordinates) }));

  /*
   * The searched city, for tidying zone names.
   *
   * Not `card.locality`: the live suppliers fill that with the zone string
   * itself, so "DEIRA - DUBAI" was being compared against "DEIRA - DUBAI" and
   * nothing ever matched.
   */
  const cityName = dest ? localized(dest.name, locale) : resolved.destinationId;
  const anchors = anchorsFor(resolved.destinationId, locale);
  const facets = buildFacets(cards, locale, normalized, cityName, anchors.map(({ id, label, type }) => ({ id, label, type })));
  const filtered = applyFilters(
    withDistance,
    options.filters ?? {},
    normalized,
    cityName,
    anchorPoint(resolved.destinationId, options.filters?.distanceFrom, locale),
  );
  const sorted = applySort(filtered, options.sort ?? "recommended");

  /*
   * Paging here is cumulative, and deliberately so.
   *
   * The results screen appends — "load more" adds twelve rows below the ones
   * already read — so page three means everything up to the end of page three,
   * not rows twenty-five to thirty-six. Returning a window instead would make
   * the caller stitch pages together and re-stitch them whenever a filter
   * changed, and a stitch that drops a row is a room the agent never sees.
   *
   * What it does need is a ceiling. Both numbers come from the request body,
   * and `slice(0, page * pageSize)` with either of them unbounded is a way to
   * ask one request for every row of a large city.
   */
  const pageSize = Math.min(Math.max(Math.floor(options.pageSize ?? 12), 1), 48);
  const page = Math.min(Math.max(Math.floor(options.page ?? 1), 1), 40);
  const pageItems = sorted.slice(0, page * pageSize).map((x) => x.card);

  /*
   * The offers this response hands out, put somewhere the next request can
   * find them — which may well be a different instance. Only the lead offer
   * per card: that is the id on the page, the id the quote endpoint prices and
   * the id checkout is given. Everything deeper is reached through the
   * property's own availability call, which publishes its own.
   */
  await publishOffers(pageItems.map((card) => card.offerSummary.offerId));

  // Every live supplier that was asked counts as a source, and each one that
  // could not answer counts as a failure — otherwise a page missing a
  // supplier's entire inventory describes itself as complete.
  const liveAsked = liveStatuses.filter((status) => status !== "skipped").length;
  const liveFailedCount = liveStatuses.filter((status) => status === "unavailable").length;
  const totalSources = responses.length + liveAsked;
  const totalFailed = failedCount + liveFailedCount;

  /*
   * Nobody was asked, so nobody failed.
   *
   * This is what a live-only search looks like in an environment with no
   * supplier credentials: not a bad search and not an outage, just a platform
   * with nothing plugged into it. Counting it as "everything failed" — which is
   * what `0 >= 0` did — told an agent their search could not be reached and to
   * try again in a moment, and no amount of trying would ever have produced a
   * room. They would sooner shift the dates twenty times than guess that the
   * supplier was never connected.
   */
  const unconfigured = totalSources === 0;
  const completeness: SearchResponse["completeness"] = unconfigured
    ? "unconfigured"
    : totalFailed >= totalSources
      ? "empty"
      : totalFailed > 0
        ? "partial"
        : "complete";

  const response: SearchResponse = {
    searchToken: `st_${hash01(JSON.stringify(effectiveIntent)).toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
    intent: effectiveIntent,
    results: pageItems,
    totalCount: sorted.length,
    facets,
    completeness,
    sourcesUnavailable: totalFailed,
    completenessMessage: unconfigured
      ? locale === "ar"
        ? "لا يوجد مورّد متصل بهذه البيئة، لذلك لا توجد أسعار لعرضها. تواصل مع مشغّل المنصة."
        : "No supplier is connected to this environment, so there are no rates to show. This is not a problem with your search — contact the platform operator."
      : totalFailed >= totalSources
        ? locale === "ar"
          ? "تعذّر الوصول إلى مصادر الفنادق. بحثك محفوظ ويمكنك إعادة المحاولة."
          : "We could not reach our hotel sources. Your search is saved — try again in a moment."
        : totalFailed > 0
          ? /*
             * A finished search, short one source.
             *
             * This used to read "some options are still loading… more may
             * appear", which was a promise nothing in the system was going to
             * keep: the sources had all returned and nothing further was on its
             * way. On a page that also had nothing on it, an agent was told to
             * wait for options that were never coming and then, underneath, to
             * try different dates. Both were wrong, and the second one had them
             * re-running a search that could not have worked.
             */
            sorted.length === 0
            ? locale === "ar"
              ? "بحثك وصلنا، لكن أحد مصادر التوريد لم يستجب، فلا توجد أسعار لعرضها. تغيير التواريخ لن يفيد — أعد المحاولة بعد قليل."
              : "Your search reached us, but one of our supply sources did not answer, so there is nothing to price. Changing the dates will not help — try again shortly."
            : locale === "ar"
              ? "أحد مصادر التوريد لم يستجب، لذلك هذه الصفحة لا تعرض كل الخيارات المتاحة. الأسعار المعروضة حية."
              : "One of our supply sources did not answer, so this page is missing some of what is available. The prices shown are live."
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

/**
 * Facet counts must count what the filter matches.
 *
 * Counting the lead offer said "10 properties with breakfast" while the filter
 * — which now looks at every rate — returned 54. A count that disagrees with
 * its own filter is worse than no count: it tells the guest the choice is
 * narrow and then contradicts itself the moment they take it.
 *
 * So board and payment count *properties having at least one such rate*, which
 * is the question the filter asks. Price and category still come from the card,
 * because those describe the property or its lead price rather than its rates.
 */
/**
 * The price range, and the part of it a slider should cover.
 *
 * Rounded outwards so the extremes stay inside their own range — a ceiling
 * rounded down would exclude the priciest result from a filter set to the
 * maximum. `typicalMax` is the 95th percentile, because the true maximum is set
 * by one suite: Singapore ran to $107,058 against a median near $80, so every
 * price anyone was going to filter by sat inside the first pixel of the track.
 *
 * It never drops below `min`, so a result set of one, or of a hundred identical
 * prices, still describes a range rather than an inversion.
 */
function priceRangeOf(prices: number[]): SearchFacets["priceRange"] {
  if (!prices.length) return { min: 0, max: 0, typicalMax: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const min = Math.floor(sorted[0]);
  const max = Math.ceil(sorted[sorted.length - 1]);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { min, max, typicalMax: Math.min(max, Math.max(min, Math.ceil(p95))) };
}

function buildFacets(
  cards: HotelResultCard[],
  locale: Locale,
  normalized: NormalizedHotel[],
  cityName: string,
  anchors: SearchFacets["distanceAnchors"],
): SearchFacets {
  // Per room, so the range spans one kind of number and the filter that reads
  // it back compares like with like.
  const prices = cards.map((c) => comparableTotal(c.price));
  const count = <T extends string | number>(values: T[]) => {
    const map = new Map<T, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return map;
  };

  const catCount = count(cards.map((c) => c.category));
  const hoodCount = count(cards.map((c) => zoneLabel(c.neighborhood, cityName)));
  const typeCount = count(cards.map((c) => c.propertyType));
  /*
   * Labels come from the data, not from our own catalogue.
   *
   * The facet list used to look every code up in AMENITY_CATALOG and fall back
   * to the code itself, so a Hotelbeds facility read "10:70" and an unmapped
   * board read "CE" — while the very same amenity showed its proper name on
   * the card two inches away. Every source already resolves a label; this
   * keeps the one it resolved.
   */
  const amenityCount = new Map<string, number>();
  const amenityLabel = new Map<string, string>();
  const bySlugForAmenities = new Map(normalized.map((entry) => [entry.hotel.slug, entry]));
  for (const c of cards) {
    // The card shows four; the filter should offer everything the property
    // actually has, or ticking an amenity hides hotels that do have it.
    const all = bySlugForAmenities.get(c.slug)?.hotel.amenities ?? [];
    const list = all.length ? all.map((a) => ({ code: a.code, label: a.label })) : c.topAmenities;
    for (const a of list) {
      amenityCount.set(a.code, (amenityCount.get(a.code) ?? 0) + 1);
      if (a.label) amenityLabel.set(a.code, a.label);
    }
  }
  const bySlug = new Map(normalized.map((entry) => [entry.hotel.slug, entry]));
  const boardCount = new Map<string, number>();
  const boardLabel = new Map<string, string>();
  const payCount = new Map<string, number>();
  const roomKindCount = new Map<string, number>();
  const conditionCount = new Map<string, number>();
  for (const card of cards) {
    const offers = bySlug.get(card.slug)?.offers ?? [];
    const boards = offers.length
      ? new Set(offers.map((offer) => offer.board.code))
      : new Set([card.offerSummary.boardCode]);
    for (const code of boards) boardCount.set(code, (boardCount.get(code) ?? 0) + 1);
    for (const offer of offers) {
      if (offer.board.label) boardLabel.set(offer.board.code, offer.board.label);
    }
    if (!offers.length && card.offerSummary.boardSummary) {
      boardLabel.set(card.offerSummary.boardCode, card.offerSummary.boardSummary);
    }

    const timings = offers.length
      ? new Set(offers.map((offer) => offer.paymentTiming))
      : new Set([card.offerSummary.paymentTiming]);
    for (const timing of timings) payCount.set(timing, (payCount.get(timing) ?? 0) + 1);

    /*
     * Counted per property, not per rate.
     *
     * Every count in this object answers "how many rows will I still have if I
     * tick this", and a hotel with nine deluxe rates is one row. Counting rates
     * would promise ninety.
     */
    const rooms = bySlug.get(card.slug)?.rooms ?? [];
    const kinds = new Set<string>();
    for (const room of rooms) {
      const kind = roomCategoryOf(room.name);
      if (kind) kinds.add(kind);
    }
    if (!kinds.size) {
      const kind = roomCategoryOf(card.offerSummary.roomSummary);
      if (kind) kinds.add(kind);
    }
    for (const kind of kinds) roomKindCount.set(kind, (roomKindCount.get(kind) ?? 0) + 1);

    const conditions = offers.length
      ? new Set(offers.flatMap((offer) => conditionsOf(offer.cancellation, comparableTotal(offer.price))))
      : new Set([card.offerSummary.refundable ? "free" : "nonRefundable"]);
    for (const condition of conditions) conditionCount.set(condition, (conditionCount.get(condition) ?? 0) + 1);
  }

  return {
    /*
     * Whole units. Dividing a party total by three rooms gives 56.333…, and a
     * range whose ends are fractions of a currency's smallest unit reads as a
     * rounding error on screen. Rounded outwards so the extremes stay inside
     * their own range — a ceiling rounded down would exclude the priciest
     * result from a filter set to the maximum.
     */
    priceRange: priceRangeOf(prices),
    /*
     * Zero is not a zero-star hotel, it is a property the supplier gave no
     * rating for — which is why it used to be dropped. But dropping it made it
     * unreachable: tick 3★ and 4★ and the unrated properties vanish with no
     * control anywhere to bring them back. It stays, and the panel labels it
     * "Unrated" rather than "0★".
     */
    categories: [...catCount.entries()]
      .map(([value, c]) => ({ value, count: c }))
      .sort((a, b) => b.value - a.value),
    // A supplier that places a property in a city but not a district leaves
    // this blank, and a nameless filter row is not a choice anyone can make.
    neighborhoods: [...hoodCount.entries()]
      .filter(([value]) => value.trim().length > 0)
      .map(([value, c]) => ({ value, count: c }))
      .sort((a, b) => b.count - a.count),
    amenities: [...amenityCount.entries()]
      .map(([code, c]) => ({
        code,
        label: amenityLabel.get(code) || localized(AMENITY_CATALOG[code]?.label, locale) || code,
        count: c,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    boards: [...boardCount.entries()]
      .map(([code, c]) => ({
        code,
        label: localized(BOARD_CATALOG[code]?.label, locale) || titleCaseBoard(boardLabel.get(code) || code),
        count: c,
      }))
      .sort((a, b) => b.count - a.count),
    propertyTypes: [...typeCount.entries()].map(([value, c]) => ({ value, count: c })),
    paymentTiming: [...payCount.entries()].map(([value, c]) => ({ value: value as HotelResultCard["offerSummary"]["paymentTiming"], count: c })),
    roomCategories: ROOM_CATEGORY_ORDER.filter((kind) => roomKindCount.has(kind)).map((kind) => ({
      value: kind,
      count: roomKindCount.get(kind)!,
    })),
    rateConditions: RATE_CONDITIONS.filter((value) => conditionCount.has(value)).map((value) => ({
      value,
      count: conditionCount.get(value)!,
    })),
    distanceAnchors: anchors,
  };
}

type Entry = { card: HotelResultCard; distance: number };

/**
 * Filtering a property by its rates.
 *
 * "Refundable", "pay later" and board are questions about the *property* — does
 * it have such a rate — but they were answered from the single lead offer on
 * the card, which is the cheapest one. The cheapest rate is almost always
 * non-refundable and prepaid, so "pay later" matched nothing at all and
 * "refundable" matched a tenth of the properties that actually had a
 * refundable rate. A guest was being told hotels did not exist because their
 * *cheapest* room did not qualify.
 *
 * These now look at every rate the property returned. The card still shows the
 * lead offer, which is correct — it is the "from" price — but the filter no
 * longer mistakes it for the whole inventory.
 */
function applyFilters(
  entries: Entry[],
  f: SearchFilters,
  normalized: NormalizedHotel[],
  cityName: string,
  anchor: { lat: number; lng: number } | null,
): Entry[] {
  const byHotel = new Map(normalized.map((entry) => [entry.hotel.slug, entry]));
  const needle = f.hotelName?.trim() ? fold(f.hotelName) : null;

  return entries.filter(({ card, distance }) => {
    /*
     * The same denominator the facet's range was built from.
     *
     * Filtering on `total` against a range built from mixed totals meant the
     * slider's own maximum excluded results: a three-room party total sat above
     * a ceiling derived partly from one-room prices.
     */
    if (f.minPrice != null && comparableTotal(card.price) < f.minPrice) return false;
    if (f.maxPrice != null && comparableTotal(card.price) > f.maxPrice) return false;
    if (f.categories?.length && !f.categories.includes(card.category)) return false;
    if (f.minRating != null && (card.review?.score ?? 0) < f.minRating) return false;
    if (f.neighborhoods?.length && !f.neighborhoods.includes(zoneLabel(card.neighborhood, cityName)))
      return false;
    if (f.propertyTypes?.length && !f.propertyTypes.includes(card.propertyType)) return false;
    /*
     * Measured from the anchor when one was chosen, and from the centre when
     * it was not — `distance` is already the distance from the centre, so an
     * unanchored radius costs nothing extra.
     */
    if (f.maxDistanceKm != null) {
      const from = anchor ? distanceKm(anchor, card.coordinates) : distance;
      if (from > f.maxDistanceKm) return false;
    }
    if (needle && !fold(card.name).includes(needle)) return false;
    if (f.dealsOnly && !card.price.strikeTotal) return false;
    if (f.accessibleOnly && !card.accessibilityHighlights.length) return false;

    const offers = byHotel.get(card.slug)?.offers ?? [];
    // Falling back to the card keeps a property filterable even if its
    // normalised entry is missing, rather than silently dropping it.
    if (f.refundableOnly) {
      const any = offers.length
        ? offers.some((offer) => offer.cancellation.refundable)
        : card.offerSummary.refundable;
      if (!any) return false;
    }
    if (f.payLaterOnly) {
      const any = offers.length
        ? offers.some((offer) => offer.paymentTiming !== "payNow")
        : card.offerSummary.paymentTiming !== "payNow";
      if (!any) return false;
    }

    if (f.amenities?.length) {
      const codes = new Set(byHotel.get(card.slug)?.hotel.amenities.map((a) => a.code));
      if (!f.amenities.every((a) => codes.has(a))) return false;
    }
    if (f.boards?.length) {
      // Matched on the board *code*, not its label: a label is display text
      // that differs by locale and by supplier, and matching on it is how the
      // same board became two unrelated filter values.
      const codes = new Set(offers.map((offer) => offer.board.code));
      const labels = new Set(offers.map((offer) => offer.board.label));
      if (!f.boards.some((b) => codes.has(b) || labels.has(b))) return false;
    }
    /*
     * Both of these ask about the property's whole rate list, for the reason
     * spelled out above this function: the lead offer is the cheapest one, and
     * answering "does this hotel have a suite" from it says no for every hotel
     * whose cheapest room is a double.
     */
    if (f.roomCategories?.length) {
      const rooms = byHotel.get(card.slug)?.rooms ?? [];
      const kinds = new Set(rooms.map((room) => roomCategoryOf(room.name)).filter(Boolean) as string[]);
      if (!kinds.size) {
        const lead = roomCategoryOf(card.offerSummary.roomSummary);
        if (lead) kinds.add(lead);
      }
      if (!f.roomCategories.some((kind) => kinds.has(kind))) return false;
    }
    if (f.rateConditions?.length) {
      const conditions = offers.length
        ? new Set(offers.flatMap((offer) => conditionsOf(offer.cancellation, comparableTotal(offer.price))))
        : new Set([card.offerSummary.refundable ? "free" : "nonRefundable"]);
      if (!f.rateConditions.some((condition) => conditions.has(condition as never))) return false;
    }
    if (f.bounds) {
      const { north, south, east, west } = f.bounds;
      const { lat, lng } = card.coordinates;
      if (lat > north || lat < south || lng > east || lng < west) return false;
    }
    return true;
  });
}

/**
 * Sorting by price, on a number that means the same thing for every supplier.
 *
 * `price.total` does not: Hotelbeds prices a rate per room, TourMind and the
 * simulated source price the whole party. On a three-room search that put every
 * Hotelbeds property at the cheap end of "price, low to high" — a room at $83
 * ranked ahead of three rooms at $227, and the cheaper one was really $249.
 * Reducing to per room is the only common denominator that invents nothing;
 * multiplying the other way would quote three rooms at a rate that may have one
 * left.
 */
function sortPrice(card: HotelResultCard): number {
  return comparableTotal(card.price);
}

/*
 * The last word in every comparison.
 *
 * Ties are common — a city block of identically priced three-star rooms scores
 * identically — and a tie left to the merge order is decided by whichever
 * supplier answered first, which is not the same twice. That put two calls for
 * the same search in different orders, and a cumulative page makes it visible:
 * the agent asks for twelve more rows and the tied rows above them swap.
 */
function byId(a: Entry, b: Entry): number {
  return a.card.canonicalHotelId < b.card.canonicalHotelId ? -1 : a.card.canonicalHotelId > b.card.canonicalHotelId ? 1 : 0;
}

function applySort(entries: Entry[], sort: SortKey): Entry[] {
  const copy = [...entries];
  switch (sort) {
    case "priceAsc":
      return copy.sort((a, b) => sortPrice(a.card) - sortPrice(b.card) || byId(a, b));
    case "priceDesc":
      return copy.sort((a, b) => sortPrice(b.card) - sortPrice(a.card) || byId(a, b));
    case "rating":
      return copy.sort((a, b) => (b.card.review?.score ?? 0) - (a.card.review?.score ?? 0) || byId(a, b));
    case "distance":
      return copy.sort((a, b) => a.distance - b.distance || byId(a, b));
    case "flexible":
      return copy.sort(
        (a, b) =>
          Number(b.card.offerSummary.refundable) - Number(a.card.offerSummary.refundable) ||
          sortPrice(a.card) - sortPrice(b.card) ||
          byId(a, b),
      );
    case "bestValue":
      return copy.sort((a, b) => valueOf(b.card) - valueOf(a.card) || byId(a, b));
    case "recommended":
    default:
      return copy.sort((a, b) => recommendOf(b) - recommendOf(a) || byId(a, b));
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
  // The detail page prices independently of search, so it primes too.
  await primeMarkup();

  /*
   * A batch of its own. Every rate on a property page is one the guest can
   * click, so unlike a search — which builds far more than it shows — all of
   * them are published.
   */
  const batch = newOfferBatch();

  // Live properties resolve through the supplier adapter; demo properties keep
  // using the simulated sources. Both return the same canonical shape.
  if (isTourmindSlug(slug)) {
    const result = await searchTourmindHotel(slug, intent, locale);
    if (!result) return null;
    const adapted = normalizeTourmind(result, intent, locale);
    rebatchOffers(batch, adapted);
    await publishOffers(adapted.offers.map((offer) => offer.offerId));
    return { hotel: adapted.hotel, rooms: adapted.rooms, offers: adapted.offers, sourceCount: 1 };
  }

  if (slug.startsWith("hb-") && isHotelbedsEnabled()) {
    const adapted = await searchHotelbedsHotel(slug, intent, locale, batch);
    if (!adapted) return null;
    await publishOffers(adapted.offers.map((offer) => offer.offerId));
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
