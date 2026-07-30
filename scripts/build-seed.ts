import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Pack the synced TourMind catalogue into the copy that ships with the build.
 *
 *   npm run tourmind:sync && npm run seed:build
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
}

void main().catch((error) => {
  console.error("Could not build the seed:", error instanceof Error ? error.message : error);
  console.error("Run `npm run tourmind:sync` first — there is nothing in .data/tourmind to pack.");
  process.exit(1);
});
