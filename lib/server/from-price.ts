import { computePrice, type BoardCode, type RateClass } from "./pricing";
import { getDestination } from "../data/destinations";
import { HOTEL_SEEDS, type HotelSeed } from "../data/hotels";
import { ROOM_TEMPLATES } from "../data/rooms";
import { addDays, todayIso } from "../format";
import type { CurrencyCode, Locale, PriceStack } from "../types";

/**
 * Indicative "from" prices for browse surfaces.
 *
 * The home page has no dates and no occupancy, so it cannot show a bookable
 * total — but showing nothing turns a shop into a brochure. These figures come
 * from the same {@link computePrice} model the search path uses, run against a
 * fixed, stated set of assumptions, so a browse price and a search price are
 * produced by one calculation rather than two that can drift apart.
 *
 * The assumptions are the cheapest arrangement a property offers, which is what
 * "from" has to mean if it is not to mislead (§8.2): the lowest-factor room, no
 * board, the non-refundable rate class, two adults, one night. Every surface
 * that renders one of these must say the price is indicative and per night —
 * {@link FROM_PRICE_BASIS} carries that wording.
 */

/** Fixed assumptions, so the number is reproducible and explainable. */
const BOARD: BoardCode = "RO";
const RATE_CLASS: RateClass = "nrf";
const LEAD_DAYS = 21;

/** The disclosure every "from" price must be shown with. */
export const FROM_PRICE_BASIS: Record<Locale, string> = {
  en: "Indicative nightly price, room only, taxes included. Your total depends on dates and guests.",
  ar: "سعر ليلي استرشادي، الغرفة فقط، شامل الضرائب. يعتمد إجماليك على التواريخ وعدد الضيوف.",
};

export interface FromPrice {
  amount: number;
  currency: CurrencyCode;
}

/** Cheapest room template the property actually has, by price factor. */
function cheapestRoomKey(seed: HotelSeed): string {
  return seed.rooms.reduce((best, key) =>
    (ROOM_TEMPLATES[key]?.priceFactor ?? Infinity) < (ROOM_TEMPLATES[best]?.priceFactor ?? Infinity) ? key : best,
  );
}

export function hotelFromPrice(seed: HotelSeed, currency: CurrencyCode, locale: Locale): FromPrice {
  const destination = getDestination(seed.destinationId);
  const checkIn = addDays(todayIso(), LEAD_DAYS);
  const price: PriceStack = computePrice({
    seed,
    roomKey: cheapestRoomKey(seed),
    board: BOARD,
    rateClass: RATE_CLASS,
    checkIn,
    checkOut: addDays(checkIn, 1),
    rooms: [{ adults: 2, childrenAges: [] }],
    currency,
    countryCode: destination?.countryCode ?? "SA",
    // The cheaper of the two simulated sources is the one a search would
    // surface, so the browse price matches what the results page shows.
    sourceCode: "S1",
    locale,
  });
  return { amount: price.nightlyAverage, currency };
}

/** The lowest indicative nightly price across a destination's properties. */
export function destinationFromPrice(
  destinationId: string,
  currency: CurrencyCode,
  locale: Locale,
): FromPrice | null {
  const seeds = HOTEL_SEEDS.filter((h) => h.destinationId === destinationId);
  if (!seeds.length) return null;
  const amount = Math.min(...seeds.map((seed) => hotelFromPrice(seed, currency, locale).amount));
  return { amount, currency };
}
