import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir } from "../runtime";
import { hotelbeds } from "./client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "./config";
import {
  hbImageUrl,
  type HbContentHotel,
  type HbContentHotelsResponse,
  type HbDestination,
  type HbDestinationsResponse,
  type HbTypeItem,
  type HbTypesResponse,
} from "./types";

/**
 * Content cache.
 *
 * Scope §9.1: static content is ingested and cached, and hotel pages render from
 * the cache — never from a live content call on the request path. That is also
 * what keeps a 50-request evaluation quota usable: content costs zero requests
 * once synced, so the daily allowance is spent on availability and booking.
 *
 * `npm run hotelbeds:sync` populates the cache.
 */

const CACHE_DIR = process.env.HOTELBEDS_CACHE_DIR ?? path.join(dataDir(), "hotelbeds");
const HOTELS_DIR = path.join(CACHE_DIR, "hotels");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");
const DESTINATIONS_FILE = path.join(CACHE_DIR, "destinations.json");
const TYPES_FILE = path.join(CACHE_DIR, "types.json");

export interface ContentIndex {
  /** slug → hotel code */
  bySlug: Record<string, number>;
  /** hotel code → slug */
  byCode: Record<string, string>;
  /** destination code → hotel codes held in the cache */
  byDestination: Record<string, number[]>;
  syncedAt?: string;
}

export interface TypeDictionaries {
  boards: Record<string, string>;
  categories: Record<string, string>;
  /** `${groupCode}:${facilityCode}` → label */
  facilities: Record<string, string>;
  rooms: Record<string, string>;
  syncedAt?: string;
}

const EMPTY_INDEX: ContentIndex = { bySlug: {}, byCode: {}, byDestination: {} };
const EMPTY_TYPES: TypeDictionaries = { boards: {}, categories: {}, facilities: {}, rooms: {} };

declare global {
  var __hbContentCache:
    | { index?: ContentIndex; types?: TypeDictionaries; destinations?: HbDestination[]; hotels: Map<number, HbContentHotel> }
    | undefined;
}

const memory = (globalThis.__hbContentCache ??= { hotels: new Map<number, HbContentHotel>() });

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export function slugify(name: string, code: number): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `hb-${code}${base ? `-${base}` : ""}`;
}

/* ------------------------------------------------------------- cache reads */

export async function getIndex(): Promise<ContentIndex> {
  memory.index ??= await readJson<ContentIndex>(INDEX_FILE, EMPTY_INDEX);
  return memory.index;
}

export async function getTypes(): Promise<TypeDictionaries> {
  memory.types ??= await readJson<TypeDictionaries>(TYPES_FILE, EMPTY_TYPES);
  return memory.types;
}

export async function getCachedDestinations(): Promise<HbDestination[]> {
  memory.destinations ??= await readJson<HbDestination[]>(DESTINATIONS_FILE, []);
  return memory.destinations;
}

/**
 * A content payload must actually look like content before it is trusted.
 *
 * The cache is written to disk, so accepting an unexpected shape here would
 * poison every later page render — a hotel would show as "Hotel 100234"
 * indefinitely. Anything that does not carry a code and a localized name is
 * discarded rather than cached.
 */
type ValidContentHotel = HbContentHotel & { code: number; name: { content: string } };

function isContentShaped(value: unknown): value is ValidContentHotel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as HbContentHotel;
  return typeof candidate.code === "number" && typeof candidate.name?.content === "string";
}

export async function getHotelContent(code: number): Promise<HbContentHotel | null> {
  const cached = memory.hotels.get(code);
  if (cached) return cached;

  const fromDisk = await readJson<HbContentHotel | null>(path.join(HOTELS_DIR, `${code}.json`), null);
  if (isContentShaped(fromDisk)) {
    memory.hotels.set(code, fromDisk);
    return fromDisk;
  }

  // Last resort: a single detail call for a hotel that appeared in availability
  // but is not in the cache yet. It is cached immediately so it costs once.
  if (!isHotelbedsEnabled()) return null;
  try {
    const { language } = getHotelbedsConfig();
    const response = await hotelbeds.content<{ hotel?: HbContentHotel }>(`/hotels/${code}/details`, {
      query: { language, useSecondaryLanguage: false },
    });
    const hotel = response.hotel;
    if (!isContentShaped(hotel)) return null;
    await cacheHotel(hotel);
    return hotel;
  } catch {
    return null;
  }
}

export async function getHotelBySlug(slug: string): Promise<HbContentHotel | null> {
  const index = await getIndex();
  const code = index.bySlug[slug];
  if (!code) return null;
  return getHotelContent(code);
}

export async function isHotelbedsSlug(slug: string): Promise<boolean> {
  if (!slug.startsWith("hb-")) return false;
  const index = await getIndex();
  return Boolean(index.bySlug[slug]);
}

export async function listCachedHotelCodes(destinationCode?: string): Promise<number[]> {
  const index = await getIndex();
  if (destinationCode) return index.byDestination[destinationCode] ?? [];
  return Object.values(index.bySlug);
}

/* ------------------------------------------------------------ cache writes */

export async function cacheHotel(candidate: HbContentHotel): Promise<void> {
  if (!isContentShaped(candidate)) return;
  const hotel = candidate;
  const index = await getIndex();
  const slug = slugify(hotel.name.content, hotel.code);

  index.bySlug[slug] = hotel.code;
  index.byCode[String(hotel.code)] = slug;
  if (hotel.destinationCode) {
    const list = index.byDestination[hotel.destinationCode] ?? [];
    if (!list.includes(hotel.code)) list.push(hotel.code);
    index.byDestination[hotel.destinationCode] = list;
  }

  memory.hotels.set(hotel.code, hotel);
  memory.index = index;
  await writeJson(path.join(HOTELS_DIR, `${hotel.code}.json`), hotel);
  await writeJson(INDEX_FILE, { ...index, syncedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------- sync */

export interface SyncProgress {
  (message: string): void;
}

/** Reference dictionaries — three requests, then cached indefinitely. */
export async function syncTypes(log: SyncProgress = () => {}): Promise<TypeDictionaries> {
  const { language } = getHotelbedsConfig();
  const types: TypeDictionaries = { boards: {}, categories: {}, facilities: {}, rooms: {} };

  const label = (item: HbTypeItem) => item.description?.content ?? String(item.code ?? "");

  const boards = await hotelbeds.content<HbTypesResponse>("/types/boards", {
    query: { fields: "all", language, from: 1, to: 200 },
  });
  for (const board of boards.boards ?? []) types.boards[String(board.code)] = label(board);
  log(`boards: ${Object.keys(types.boards).length}`);

  const categories = await hotelbeds.content<HbTypesResponse>("/types/categories", {
    query: { fields: "all", language, from: 1, to: 200 },
  });
  for (const category of categories.categories ?? []) types.categories[String(category.code)] = label(category);
  log(`categories: ${Object.keys(types.categories).length}`);

  const facilities = await hotelbeds.content<HbTypesResponse>("/types/facilities", {
    query: { fields: "all", language, from: 1, to: 1000 },
  });
  for (const facility of facilities.facilities ?? []) {
    types.facilities[`${facility.facilityGroupCode}:${facility.code}`] = label(facility);
  }
  log(`facilities: ${Object.keys(types.facilities).length}`);

  memory.types = types;
  await writeJson(TYPES_FILE, { ...types, syncedAt: new Date().toISOString() });
  return types;
}

export async function syncDestinations(log: SyncProgress = () => {}): Promise<HbDestination[]> {
  const { language } = getHotelbedsConfig();
  const all: HbDestination[] = [];
  let from = 1;
  const pageSize = 1000;

  // Paged, but bounded: the guard in the client stops this long before a quota
  // is exhausted, and destinations change rarely.
  for (let page = 0; page < 5; page++) {
    const response = await hotelbeds.content<HbDestinationsResponse>("/locations/destinations", {
      query: { fields: "all", language, from, to: from + pageSize - 1 },
    });
    const batch = response.destinations ?? [];
    all.push(...batch);
    log(`destinations: ${all.length}/${response.total ?? "?"}`);
    if (!response.total || all.length >= response.total || batch.length === 0) break;
    from += pageSize;
  }

  memory.destinations = all;
  await writeJson(DESTINATIONS_FILE, all);
  return all;
}

/** Hotel content for one destination, paged and written to the cache. */
export async function syncHotels(
  destinationCode: string,
  options: { limit?: number; log?: SyncProgress } = {},
): Promise<number> {
  const { language } = getHotelbedsConfig();
  const log = options.log ?? (() => {});
  const limit = options.limit ?? 100;
  let saved = 0;
  let from = 1;
  const pageSize = Math.min(100, limit);

  while (saved < limit) {
    const response = await hotelbeds.content<HbContentHotelsResponse>("/hotels", {
      query: {
        fields: "all",
        language,
        from,
        to: from + pageSize - 1,
        destinationCode,
        useSecondaryLanguage: false,
      },
    });
    const batch = response.hotels ?? [];
    for (const hotel of batch) {
      await cacheHotel(hotel);
      saved += 1;
    }
    log(`${destinationCode}: cached ${saved} hotels`);
    if (batch.length < pageSize || saved >= (response.total ?? saved)) break;
    from += pageSize;
  }

  return saved;
}

export function contentCacheDir(): string {
  return CACHE_DIR;
}

export { hbImageUrl };
