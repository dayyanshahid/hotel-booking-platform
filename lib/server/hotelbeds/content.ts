import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { dataDir, seedDir } from "../runtime";
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

/* ------------------------------------------------------------- shipped seed */

/**
 * The content that ships with the build.
 *
 * `dataDir` is `/tmp` on a serverless platform and a cold instance starts with
 * nothing in it. Content is the one thing this app cannot cheaply fetch again:
 * it is a call per property against an allowance of fifty a day, so an empty
 * cache turned every search of every city into thirteen requests and the key
 * was spent by the fourth. Four searches, and then a trade portal that sells
 * live supply only had nothing to sell — in any city, for the rest of the day.
 *
 * So a trimmed, gzipped copy of the synced cache is committed and read whenever
 * the writable cache does not hold a property. It carries only the fields the
 * adapter reads, which is what makes sixty-seven megabytes of supplier detail
 * into something small enough to belong in a repository.
 *
 * It is a seed and not a cache: anything a sync has written to `dataDir` is the
 * fresher of the two and wins. `npm run hotelbeds:seed` rebuilds it.
 */
interface ContentSeed {
  hotels: Record<string, HbContentHotel>;
  index?: ContentIndex;
  types?: TypeDictionaries;
  destinations?: HbDestination[];
}

const SEED_FILE = path.join(seedDir(), "hotelbeds", "content.json.gz");

declare global {
  var __hbContentSeed: ContentSeed | null | undefined;
}

/**
 * Read once per process, synchronously, and held.
 *
 * One decompression of a few megabytes on the first search of an instance,
 * against a network call per property on every search forever. A missing or
 * corrupt seed is not an error — it is a deployment that has not built one, and
 * the live fetch path still works.
 */
function contentSeed(): ContentSeed | null {
  if (globalThis.__hbContentSeed !== undefined) return globalThis.__hbContentSeed;
  try {
    const packed = readFileSync(SEED_FILE);
    const parsed = JSON.parse(gunzipSync(packed).toString("utf8")) as ContentSeed;
    globalThis.__hbContentSeed = parsed?.hotels ? parsed : null;
  } catch {
    globalThis.__hbContentSeed = null;
  }
  return globalThis.__hbContentSeed;
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
  memory.index ??= await readJson<ContentIndex>(INDEX_FILE, contentSeed()?.index ?? EMPTY_INDEX);
  return memory.index;
}

export async function getTypes(): Promise<TypeDictionaries> {
  memory.types ??= await readJson<TypeDictionaries>(TYPES_FILE, contentSeed()?.types ?? EMPTY_TYPES);
  return memory.types;
}

export async function getCachedDestinations(): Promise<HbDestination[]> {
  memory.destinations ??= await readJson<HbDestination[]>(
    DESTINATIONS_FILE,
    contentSeed()?.destinations ?? [],
  );
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

/** Content already on this instance, without touching the network. */
async function cachedContent(code: number): Promise<HbContentHotel | null> {
  const cached = memory.hotels.get(code);
  if (cached) return cached;

  const fromDisk = await readJson<HbContentHotel | null>(path.join(HOTELS_DIR, `${code}.json`), null);
  if (isContentShaped(fromDisk)) {
    memory.hotels.set(code, fromDisk);
    return fromDisk;
  }

  // Nothing synced on this instance. The copy that shipped with the build is
  // the difference between a named property and a call we cannot afford.
  const fromSeed = contentSeed()?.hotels[String(code)];
  if (isContentShaped(fromSeed)) {
    memory.hotels.set(code, fromSeed);
    return fromSeed;
  }
  return null;
}

/**
 * Content for one hotel.
 *
 * `allowFetch: false` restricts it to what is already cached. A search passes
 * that for most of its results — see `warmContent` — because the alternative is
 * a detail call per hotel, and a page of fifty is fifty calls nobody budgeted
 * for. Single-property paths leave it alone: fetching content for the one hotel
 * a person is actually looking at is exactly what this is for.
 */
export async function getHotelContent(
  code: number,
  options: { allowFetch?: boolean } = {},
): Promise<HbContentHotel | null> {
  const cached = await cachedContent(code);
  if (cached) return cached;

  if (options.allowFetch === false) return null;

  // A single detail call for a hotel that appeared in availability but is not
  // in the cache yet. It is cached immediately so it costs once.
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

/**
 * How many uncached properties a single search will fetch content for.
 *
 * Availability returns up to fifty hotels and content is a call per hotel, so
 * an unwarmed destination used to cost fifty-one requests and — because they
 * ran one after another — half a minute of a person waiting. Measured on the
 * test key: 32.8 seconds and the whole daily allowance for one search of
 * Palma, against 0.9 seconds once the same hotels were cached.
 *
 * Twelve is a page. The properties beyond it still appear, priced and bookable,
 * with the name, stars, location and zone that availability itself carries;
 * they are missing photography and the long description until the cache
 * catches up, which it does at twelve a search and in bulk from the sync
 * script. Rates are never affected — those come from availability, not content.
 */
const CONTENT_FETCH_BUDGET = (() => {
  const parsed = Number(process.env.HOTELBEDS_CONTENT_FETCH_BUDGET);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 12;
})();

/**
 * Fetch content for the first few uncached hotels of a search, together.
 *
 * Order is the supplier's, which is their relevance order, so the budget is
 * spent on the properties most likely to be looked at. Concurrent because these
 * are independent reads and serialising them was the whole of the latency:
 * twelve at once is one round trip, twelve in sequence is eight seconds.
 *
 * Failures are ignored on purpose. Content is presentation; a property with no
 * description is worth showing, and a search that failed because a photograph
 * could not be loaded is not.
 */
export async function warmContent(codes: number[], limit = CONTENT_FETCH_BUDGET): Promise<number> {
  if (!isHotelbedsEnabled() || limit <= 0) return 0;

  /*
   * Never ask for more content than content is allowed to buy today.
   *
   * The budget below is per search; this is the day's. Asking for twelve when
   * two remain does not get ten of them — it gets ten refusals from the guard,
   * each of which still bumps the shared counter, which is how a search for
   * photography came to cost the search allowance it was not spending.
   */
  const affordable = Math.min(limit, hotelbeds.quotaStatus().contentRemaining);
  if (affordable <= 0) return 0;

  const seen = new Set<number>();
  const missing: number[] = [];
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (await cachedContent(code)) continue;
    missing.push(code);
    if (missing.length >= affordable) break;
  }

  await Promise.all(missing.map((code) => getHotelContent(code).catch(() => null)));
  return missing.length;
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
