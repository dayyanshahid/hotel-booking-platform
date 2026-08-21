import { localeFrom, ok, sanitize } from "@/lib/server/api";
import {
  DESTINATIONS,
  bookableCountryList,
  destinationLabel,
  destinationsInCountry,
  destinationsInRegion,
} from "@/lib/data/destinations";
import { destinationPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import type { Region } from "@/lib/data/geo/countries";
import type { DestinationSeed } from "@/lib/data/destinations";
import type { Locale } from "@/lib/types";

/**
 * The places this platform sells, as data rather than as an import.
 *
 * The catalogue was reachable only by importing the module, which is fine for a
 * page rendered in the same process and no use at all to anything else. With
 * one backend behind three front ends — the shop, the agency portal and the
 * operator console — "somewhere else" is the normal case, and a front end that
 * cannot ask for the list of destinations cannot be deployed apart from the
 * data.
 *
 * Localised here rather than shipped as `{ en, ar }` pairs: the caller has
 * already told us which language it is rendering, and sending both doubles the
 * payload so the client can throw one away.
 */

/** The shape a card needs, and nothing a page would have to assemble itself. */
function summarise(seed: DestinationSeed, locale: Locale) {
  return {
    id: seed.id,
    slug: seed.slug,
    type: seed.type,
    name: destinationLabel(seed, locale),
    country: seed.country[locale] || seed.country.en,
    countryCode: seed.countryCode,
    region: seed.region,
    currency: seed.currency,
    tier: seed.tier,
    curated: seed.curated,
    coordinates: seed.coordinates,
    photo: destinationPhoto(seed.slug, 0, { shape: PHOTO_SHAPE.card }),
  };
}

/**
 * GET /api/destinations
 *
 * `?country=SA` or `?region=middle-east` narrow it; `?countries=1` answers the
 * different question of which countries can be booked at all, which is what a
 * country index renders and would otherwise be derived by scanning every
 * destination on the client.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = localeFrom(req);

  if (url.searchParams.get("countries") === "1") {
    return ok({ countries: bookableCountryList() });
  }

  const country = sanitize(url.searchParams.get("country"), 2).toUpperCase();
  const region = sanitize(url.searchParams.get("region"), 40);

  const seeds = country
    ? destinationsInCountry(country)
    : region
      ? destinationsInRegion(region as Region)
      : DESTINATIONS;

  return ok({ destinations: seeds.map((seed) => summarise(seed, locale)) });
}
