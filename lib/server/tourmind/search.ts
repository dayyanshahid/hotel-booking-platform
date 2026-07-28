import "server-only";
import { getDestination } from "@/lib/data/destinations";
import { localized } from "@/lib/data/catalog";
import { isTourmindEnabled } from "./config";
import { tourmindHotelsInCity, type TourmindHotelRecord } from "./catalogue";
import { tourmindAvailability, type TourmindOffer } from "./operations";
import type { Locale, SearchIntent, Suggestion } from "@/lib/types";
import { fold } from "../../text";

/**
 * TourMind's contribution to a search.
 *
 * Kept deliberately narrow. The simulated catalogue and Hotelbeds already
 * populate a results page; TourMind adds live rates for the properties it
 * actually holds in the searched city, and does nothing at all when it has no
 * credentials or no synced catalogue. A supplier that is not configured must
 * cost a search nothing.
 */

/** Their properties carry a `tm-` prefixed slug so a slug identifies its source. */
export function tourmindSlug(hotelId: number): string {
  return `tm-${hotelId}`;
}

export function isTourmindSlug(slug: string): boolean {
  return slug.startsWith("tm-");
}

function hotelIdFromSlug(slug: string): number | null {
  const id = Number(slug.slice(3));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * How many of a city's properties to price per search.
 *
 * Availability takes up to twenty hotel codes per call and a city can hold
 * hundreds. Pricing all of them would spend the customer's wait on rooms they
 * will never scroll to, so a search prices one batch and the rest stay
 * reachable by opening the property.
 */
const BATCH = 20;

export interface TourmindResult {
  slug: string;
  record: TourmindHotelRecord;
  offers: TourmindOffer[];
}

/** Live rates for properties TourMind holds in the searched city. */
export async function searchTourmind(
  intent: SearchIntent,
  locale: Locale,
): Promise<TourmindResult[]> {
  if (!isTourmindEnabled()) return [];
  const destination = getDestination(intent.destinationId);
  if (!destination) return [];

  const records = (await tourmindHotelsInCity(destination.slug)).slice(0, BATCH);
  if (!records.length) return [];

  // One call per property: their availability endpoint accepts a batch, but a
  // batch failing loses every property in it, and one slow hotel should not
  // take the others down with it.
  const settled = await Promise.allSettled(
    records.map(async (record) => ({
      slug: tourmindSlug(record.hotelId),
      record,
      offers: await tourmindAvailability(
        String(record.hotelId),
        intent,
        locale,
        destination.countryCode,
      ),
    })),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<TourmindResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((result) => result.offers.length > 0);
}

/** Rates for one TourMind property, for the detail page. */
export async function searchTourmindHotel(
  slug: string,
  intent: SearchIntent,
  locale: Locale,
): Promise<TourmindResult | null> {
  if (!isTourmindEnabled()) return null;
  const hotelId = hotelIdFromSlug(slug);
  if (!hotelId) return null;

  const destination = getDestination(intent.destinationId);
  const records = destination ? await tourmindHotelsInCity(destination.slug) : [];
  const record = records.find((r) => r.hotelId === hotelId);
  if (!record) return null;

  const offers = await tourmindAvailability(
    String(hotelId),
    intent,
    locale,
    destination?.countryCode,
  );
  return offers.length ? { slug, record, offers } : null;
}

/**
 * Property-name suggestions from the synced catalogue.
 *
 * Reads the local cache only — typing must never spend a supplier request
 * (§12.2), and their static data is exactly the sort of thing worth holding
 * locally for that reason.
 */
export async function tourmindSuggestions(
  query: string,
  locale: Locale,
  limit = 5,
): Promise<Suggestion[]> {
  if (!isTourmindEnabled()) return [];
  const q = fold(query.trim());
  if (q.length < 2) return [];

  const out: Suggestion[] = [];
  const { tourmindHotels } = await import("./catalogue");
  for (const record of await tourmindHotels()) {
    if (out.length >= limit) break;
    // Folded, for the same reason as everywhere else: accents are not typed.
    if (!fold(record.name).includes(q)) continue;
    const destination = record.citySlug ? getDestination(record.citySlug) : undefined;
    out.push({
      id: `tm-${record.hotelId}`,
      type: "hotel",
      label: record.name,
      context: destination
        ? `${localized(destination.name, locale)}, ${localized(destination.country, locale)}`
        : record.cityName,
      countryCode: record.countryCode,
      coordinates: { lat: record.lat, lng: record.lng },
      hotelSlug: tourmindSlug(record.hotelId),
    });
  }
  return out;
}
