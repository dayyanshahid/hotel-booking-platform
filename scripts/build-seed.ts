import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Pack the synced supplier catalogues into the copies that ship with the build.
 *
 *   npm run tourmind:sync && npm run hotelbeds:sync && npm run seed:build
 *
 * A deployment's writable directory is an empty `/tmp` on every cold start, and
 * the catalogue is the one thing the app cannot fetch again on demand: their
 * availability call takes hotel ids, so without the static list there is no way
 * to know which of their nine thousand properties are in a city. The result was
 * that a deployment with perfectly good credentials returned no TourMind supply
 * at all — searched, ranked and merged correctly, over nothing.
 *
 * Committed compressed because it is thirteen megabytes of JSON and under two
 * gzipped. Generated rather than hand-copied so it can be refreshed the same
 * way it was made, and so nobody has to guess which files matter.
 */

const SOURCE = path.join(process.cwd(), ".data", "tourmind");
const TARGET = path.join(process.cwd(), "data-seed", "tourmind");

const HB_SOURCE = process.env.HOTELBEDS_CACHE_DIR ?? path.join(process.cwd(), ".data", "hotelbeds");
const HB_TARGET = path.join(process.cwd(), "data-seed", "hotelbeds");

async function pack(from: string, to: string): Promise<number> {
  const raw = await fs.readFile(from);
  // Reparsed rather than copied: a truncated sync should fail here, loudly,
  // rather than ship a catalogue that throws on a cold start in production.
  JSON.parse(raw.toString("utf8"));
  const packed = gzipSync(raw, { level: 9 });
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.writeFile(to, packed);
  return packed.length;
}

/* ------------------------------------------------------------- Hotelbeds */

/**
 * Which fields of a Hotelbeds content record are worth shipping.
 *
 * The synced cache is sixty-seven megabytes across five hundred files, and most
 * of it is detail nothing renders: room descriptions in nine languages, full
 * facility measurements, board dictionaries repeated per property. What the
 * adapter actually reads is this, and trimming to it is the difference between
 * a seed that belongs in a repository and one that does not.
 *
 * The caps mirror the adapter's own: twenty-four images, six interest points,
 * two terminals, forty facilities. Shipping more would be bytes nobody reads.
 */
interface Trimmed {
  [key: string]: unknown;
}

function trimHotel(hotel: Trimmed): Trimmed | null {
  if (typeof hotel.code !== "number") return null;
  const name = hotel.name as { content?: string } | undefined;
  // The adapter's own guard: no code and no name means the record is unusable,
  // and a hotel that renders as "Hotel 100234" is worse than one that is absent.
  if (typeof name?.content !== "string") return null;

  const images = Array.isArray(hotel.images) ? (hotel.images as Trimmed[]) : [];
  const rooms = Array.isArray(hotel.rooms) ? (hotel.rooms as Trimmed[]) : [];
  const facilities = Array.isArray(hotel.facilities) ? (hotel.facilities as Trimmed[]) : [];

  return {
    code: hotel.code,
    name: { content: name.content },
    ...(hotel.description ? { description: { content: (hotel.description as { content?: string }).content } } : {}),
    countryCode: hotel.countryCode,
    destinationCode: hotel.destinationCode,
    zoneCode: hotel.zoneCode,
    coordinates: hotel.coordinates,
    categoryCode: hotel.categoryCode,
    chainCode: hotel.chainCode,
    address: hotel.address,
    postalCode: hotel.postalCode,
    city: hotel.city,
    lastUpdate: hotel.lastUpdate,
    facilities: facilities.slice(0, 40).map((facility) => ({
      facilityCode: facility.facilityCode,
      facilityGroupCode: facility.facilityGroupCode,
      indFee: facility.indFee,
      number: facility.number,
      timeFrom: facility.timeFrom,
      timeTo: facility.timeTo,
    })),
    images: images
      .slice()
      .sort(
        (a, b) =>
          ((a.visualOrder as number) ?? (a.order as number) ?? 99) -
          ((b.visualOrder as number) ?? (b.order as number) ?? 99),
      )
      .slice(0, 24)
      .map((image) => ({
        path: image.path,
        imageTypeCode: image.imageTypeCode,
        roomCode: image.roomCode,
        visualOrder: image.visualOrder,
        order: image.order,
      })),
    // Occupancy limits only. The room's prose comes from availability, which is
    // the live one of the two and the one a rate is actually attached to.
    rooms: rooms.map((room) => ({
      roomCode: room.roomCode,
      maxAdults: room.maxAdults,
      maxChildren: room.maxChildren,
      maxPax: room.maxPax,
    })),
    interestPoints: Array.isArray(hotel.interestPoints)
      ? (hotel.interestPoints as Trimmed[]).slice(0, 6).map((point) => ({
          poiName: point.poiName,
          distance: point.distance,
        }))
      : [],
    terminals: Array.isArray(hotel.terminals) ? (hotel.terminals as Trimmed[]).slice(0, 2) : [],
    issues: Array.isArray(hotel.issues) ? hotel.issues : [],
  };
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * One bundle rather than five hundred files.
 *
 * A cold serverless instance pays for every file it opens, and the alternative
 * to one read of a few megabytes is a read per property on every search. It is
 * decompressed once per process and held.
 */
async function packHotelbeds(): Promise<{ hotels: number; bytes: number } | null> {
  const hotelsDir = path.join(HB_SOURCE, "hotels");
  const files = await fs.readdir(hotelsDir).catch(() => null);
  if (!files?.length) return null;

  const hotels: Record<string, Trimmed> = {};
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const parsed = await readJsonFile<Trimmed>(path.join(hotelsDir, file));
    const trimmed = parsed ? trimHotel(parsed) : null;
    if (trimmed) hotels[String(trimmed.code)] = trimmed;
  }
  if (!Object.keys(hotels).length) return null;

  const bundle = {
    hotels,
    // The dictionaries turn facility and category codes into labels, and without
    // them every amenity on a live property is dropped for having no name.
    index: await readJsonFile(path.join(HB_SOURCE, "index.json")),
    types: await readJsonFile(path.join(HB_SOURCE, "types.json")),
    destinations: await readJsonFile(path.join(HB_SOURCE, "destinations.json")),
    builtAt: new Date().toISOString(),
  };

  const packed = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"), { level: 9 });
  await fs.mkdir(HB_TARGET, { recursive: true });
  await fs.writeFile(path.join(HB_TARGET, "content.json.gz"), packed);
  return { hotels: Object.keys(hotels).length, bytes: packed.length };
}

async function main(): Promise<void> {
  await fs.rm(TARGET, { recursive: true, force: true });

  let total = 0;
  total += await pack(path.join(SOURCE, "hotels.json"), path.join(TARGET, "hotels.json.gz"));

  const cities = await fs.readdir(path.join(SOURCE, "content")).catch(() => [] as string[]);
  for (const file of cities) {
    if (!file.endsWith(".json")) continue;
    total += await pack(
      path.join(SOURCE, "content", file),
      path.join(TARGET, "content", `${file}.gz`),
    );
  }

  console.log(
    `packed the index and ${cities.length} cities into data-seed/tourmind — ${(total / 1048576).toFixed(1)} MB`,
  );

  // Absent rather than fatal: a checkout that has never run the Hotelbeds sync
  // still has a TourMind seed to build, and the live fetch path still works.
  const hb = await packHotelbeds();
  if (hb) {
    console.log(
      `packed ${hb.hotels} Hotelbeds properties into data-seed/hotelbeds — ${(hb.bytes / 1048576).toFixed(1)} MB`,
    );
  } else {
    console.log("no Hotelbeds content cache to pack — run `npm run hotelbeds:sync` to build one");
  }
}

void main().catch((error) => {
  console.error("Could not build the seed:", error instanceof Error ? error.message : error);
  console.error("Run `npm run tourmind:sync` first — there is nothing in .data/tourmind to pack.");
  process.exit(1);
});
