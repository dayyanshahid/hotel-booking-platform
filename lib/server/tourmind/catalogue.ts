import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../runtime";
import { TM, tourmindPost } from "./client";
import { CITIES, type City } from "@/lib/data/geo/cities";
import type { TmError } from "./types";

/**
 * The mapping between TourMind's catalogue and ours.
 *
 * A supplier's hotel ids mean nothing outside their own system, so before any
 * live rate can be shown we need to know which of their properties sit in the
 * cities this platform lists. Their `HotelStaticList` gives every property a
 * country, a city name and a coordinate; the coordinate is what we match on.
 *
 * Matching on the city *name* was the obvious first idea and it is wrong.
 * Transliteration alone breaks it — their "ShangHai" against our "Shanghai",
 * their Arabic-market spellings against ours — and city names repeat across
 * countries. A point and a radius cannot be spelled wrong.
 *
 * The result is cached on disk. This is static data that changes monthly at
 * most, and re-downloading a million properties to render a page would be
 * absurd; the sync is a deliberate operation, not something a request triggers.
 */

const CACHE_DIR = process.env.TOURMIND_CACHE_DIR ?? path.join(dataDir(), "tourmind");
const HOTELS_FILE = "hotels.json";

/** How close a supplier property must be to a city centre to count as in it. */
const MATCH_RADIUS_KM = 30;

export interface TourmindHotelRecord {
  hotelId: number;
  name: string;
  countryCode: string;
  cityName: string;
  lat: number;
  lng: number;
  stars?: number;
  address?: string;
  /** Our city slug, resolved at sync time so a request never does geometry. */
  citySlug?: string;
}

interface TmHotelInfo {
  /**
   * A string on the wire — `"739867"` — despite the spec calling it an integer.
   *
   * It matters more than a type annotation usually would: the slug we mint from
   * it is parsed back to a number when a property page opens, and a string here
   * meant the lookup compared "739867" against 739867 and never matched. Every
   * TourMind property was reachable from search and dead on arrival.
   */
  HotelId?: number | string;
  Name?: string;
  CountryCode?: string;
  CityName?: string;
  Latitude?: string;
  Longitude?: string;
  StarRating?: string;
  Address?: string;
}

interface TmHotelStaticListResponse {
  Error?: TmError;
  HotelStaticListResult?: {
    Hotels?: TmHotelInfo[];
    Pagination?: { PageCount?: number; TotalCount?: number };
  };
}

/* ------------------------------------------------------------- geometry */

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance. Good to a few metres at city scale, which is plenty. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The city a supplier property belongs to, or null.
 *
 * Country is checked first and is not negotiable: two cities can be thirty
 * kilometres apart across a border, and a hotel in one is not inventory for
 * the other. Within the country, nearest-centre wins if it is close enough.
 */
export function cityFor(
  hotel: { countryCode: string; lat: number; lng: number },
  cities: City[] = CITIES,
): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const city of cities) {
    if (city.countryCode !== hotel.countryCode.toUpperCase()) continue;
    const km = distanceKm(hotel, city.coordinates);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return best && bestKm <= MATCH_RADIUS_KM ? best : null;
}

/* ---------------------------------------------------------------- cache */

async function readCache(): Promise<TourmindHotelRecord[] | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, HOTELS_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    // A truncated or hand-edited file must not poison every later lookup.
    return Array.isArray(parsed) ? (parsed as TourmindHotelRecord[]) : null;
  } catch {
    return null;
  }
}

async function writeCache(records: TourmindHotelRecord[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, HOTELS_FILE), JSON.stringify(records), "utf8");
}

let memo: TourmindHotelRecord[] | null = null;

/** Cached records, or an empty list when the catalogue has never been synced. */
export async function tourmindHotels(): Promise<TourmindHotelRecord[]> {
  if (memo) return memo;
  memo = (await readCache()) ?? [];
  return memo;
}

/** Their hotel ids for one of our cities, cheapest lookup we can offer. */
export async function tourmindHotelsInCity(citySlug: string): Promise<TourmindHotelRecord[]> {
  const all = await tourmindHotels();
  return all.filter((hotel) => hotel.citySlug === citySlug);
}

/* ----------------------------------------------------------------- sync */

function toRecord(info: TmHotelInfo): TourmindHotelRecord | null {
  const lat = Number(info.Latitude);
  const lng = Number(info.Longitude);
  const hotelId = Number(info.HotelId);
  if (!Number.isFinite(hotelId) || hotelId <= 0) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // 0,0 is in the Atlantic and is what an unset coordinate looks like.
  if (lat === 0 && lng === 0) return null;
  const stars = Number(info.StarRating);
  return {
    hotelId,
    name: info.Name ?? "",
    countryCode: (info.CountryCode ?? "").toUpperCase(),
    cityName: info.CityName ?? "",
    lat,
    lng,
    stars: Number.isFinite(stars) && stars > 0 ? stars : undefined,
    address: info.Address,
  };
}

export interface SyncSummary {
  fetched: number;
  matched: number;
  cities: number;
  skipped: number;
}

/**
 * Pull the static catalogue for the given countries and cache the matches.
 *
 * Country-scoped rather than whole-catalogue: they list over a million
 * properties, and the ones worth holding are the ones in countries we actually
 * sell. Unmatched properties are dropped rather than stored — a hotel we cannot
 * place on our own map is inventory we could never surface.
 */
export async function syncTourmindCatalogue(
  countryCodes: string[],
  options: { maxPagesPerCountry?: number; pageSize?: number } = {},
): Promise<SyncSummary> {
  const maxPages = options.maxPagesPerCountry ?? 20;
  /*
   * A page size, always.
   *
   * Without one their default page is large enough that the request ran past
   * every timeout we set and the sync could never finish — the catalogue was
   * unreachable, not slow. 500 is a page that arrives in a couple of seconds
   * and still pulls a country of two thousand properties in five calls.
   */
  const pageSize = options.pageSize ?? 500;
  const matched: TourmindHotelRecord[] = [];
  let fetched = 0;

  for (const countryCode of countryCodes) {
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await tourmindPost<TmHotelStaticListResponse>(
        TM.hotels,
        {
          CountryCode: countryCode,
          Pagination: { PageIndex: page, PageSize: pageSize },
        },
        // Static data, fetched deliberately rather than on a request path: it
        // is allowed to take longer than a guest would ever wait.
        "catalogue",
      );

      const hotels = response.HotelStaticListResult?.Hotels ?? [];
      fetched += hotels.length;
      for (const info of hotels) {
        const record = toRecord(info);
        if (!record) continue;
        const city = cityFor(record);
        if (!city) continue;
        matched.push({ ...record, citySlug: city.slug });
      }

      const pageCount = response.HotelStaticListResult?.Pagination?.PageCount ?? 1;
      if (!hotels.length || page >= pageCount) break;
    }
  }

  await writeCache(matched);
  memo = matched;
  return {
    fetched,
    matched: matched.length,
    cities: new Set(matched.map((h) => h.citySlug)).size,
    skipped: fetched - matched.length,
  };
}

/** Test seam: the wire-to-record step, so a real payload can be asserted on. */
export function __recordFromStatic(info: unknown): TourmindHotelRecord | null {
  return toRecord(info as TmHotelInfo);
}

/** Test seam: load records without touching the network or the disk. */
export function __setTourmindCatalogue(records: TourmindHotelRecord[] | null): void {
  memo = records;
}
