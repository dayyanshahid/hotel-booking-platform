import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Builds landmark anchors from Wikidata.
 *
 *   npm run landmarks:build
 *
 * "Distance from a key landmark" was a hand-written list covering seventeen
 * cities. This fills in the rest of the top two tiers from Wikidata, ranked by
 * how many Wikipedias bothered to write about a place — a rough but honest
 * proxy for "would a traveller navigate by this".
 *
 * Two earlier attempts failed in opposite directions and both are worth
 * recording. A loose class list gave Tokyo an office block and Lisbon a road
 * bridge; a tight one with a NOT EXISTS filter was too slow and timed out. The
 * class list below is narrow and the expensive filter is gone; what survives is
 * cheap to check by eye, which is the point — this writes a generated file that
 * a person reads before it ships.
 *
 * Coordinates are never invented. A landmark in roughly the right place is a
 * radius filter quietly returning the wrong hotels, and nobody would catch it.
 */

const OUT = path.resolve("lib/data/landmarks.generated.ts");
const ENDPOINT = "https://query.wikidata.org/sparql";
const AGENT = "TravelAndMore-anchors/1.0 (dayyan@tracking.me)";

/** Places a traveller navigates by. No generic "building" — that is what surfaced an office block. */
const CLASSES = [
  "wd:Q32815", "wd:Q16970", "wd:Q34627", "wd:Q842402", "wd:Q16560", "wd:Q23413",
  "wd:Q33506", "wd:Q4989906", "wd:Q570116", "wd:Q839954", "wd:Q22698", "wd:Q1440300",
  "wd:Q57821", "wd:Q2087181",
];

/** Two per city. A picker is a shortcut, not a gazetteer. */
const PER_CITY = 2;

/**
 * What the ranking cannot be trusted to exclude.
 *
 * Sitelink count rewards the city's own article above everything in it, and a
 * casino with a viewing deck outranks the museum next door. Judgement, applied
 * once, in the open.
 */
const REJECT = [
  /^Q\d+$/,                      // an unlabelled entity
  /hotel|casino|resort/i,        // a property, on a site that sells properties
  /\bairport\b/i,                // already an anchor of its own
  /\bbridge\b/i,                 // you do not stay near a bridge
];

/**
 * Historical or alternative names for a destination, which rank first in their
 * own radius and are not landmarks within themselves. Kept as data because
 * there is no rule that derives "Heian-kyō" from "Kyoto".
 */
const CITY_ALIASES: Record<string, string[]> = {
  "dest-kyoto": ["heian-kyo"],
};

function isCityItself(name: string, city: string, destinationId: string): boolean {
  /*
   * Exact match only.
   *
   * A substring test looked sensible and quietly deleted Milan Cathedral,
   * Florence Cathedral, Mexico City Metropolitan Cathedral, Buenos Aires
   * Cathedral and the Bangkok National Museum — every landmark whose name
   * properly contains the name of the city it is in, which is a great many of
   * the best ones.
   */
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (fold(name) === fold(city)) return true;
  return (CITY_ALIASES[destinationId] ?? []).includes(fold(name));
}

interface Candidate { en: string; ar: string | null; lat: number; lng: number; links: number }

function ask(lat: number, lng: number): Candidate[] | null {
  const query = `SELECT DISTINCT ?item ?en ?ar ?coord ?sitelinks WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "14". }
  ?item wikibase:sitelinks ?sitelinks. FILTER(?sitelinks > 22)
  ?item wdt:P31/wdt:P279* ?class. VALUES ?class { ${CLASSES.join(" ")} }
  ?item rdfs:label ?en FILTER(lang(?en) = "en")
  OPTIONAL { ?item rdfs:label ?ar FILTER(lang(?ar) = "ar") }
} ORDER BY DESC(?sitelinks) LIMIT 12`;
  try {
    const out = execFileSync(
      "curl",
      ["-sS", "--max-time", "75", "-G", ENDPOINT, "--data-urlencode", `query=${query}`,
       "-H", "Accept: application/sparql-results+json", "-H", `User-Agent: ${AGENT}`],
      { encoding: "utf8", maxBuffer: 8 << 20 },
    );
    const seen = new Set<string>();
    const rows: Candidate[] = [];
    for (const b of JSON.parse(out).results.bindings) {
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
      if (!m) continue;
      const en = b.en.value as string;
      if (seen.has(en)) continue;
      seen.add(en);
      rows.push({ en, ar: b.ar?.value ?? null, lng: Number(m[1]), lat: Number(m[2]), links: Number(b.sitelinks.value) });
    }
    return rows;
  } catch {
    return null;
  }
}

function slug(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function main(): Promise<void> {
  const { DESTINATIONS, EXTRA_PLACES } = await import("../lib/data/destinations");
  const curated = new Set(EXTRA_PLACES.filter((p) => p.type === "landmark").map((p) => p.destinationId));
  const targets = DESTINATIONS.filter((d) => (d.tier === 1 || d.tier === 2) && !curated.has(d.id) && d.coordinates);

  process.stdout.write(`${targets.length} destinations without a landmark\n\n`);
  const rows: string[] = [];
  const empty: string[] = [];
  const failed: string[] = [];

  for (const d of targets) {
    const found = ask(d.coordinates.lat, d.coordinates.lng);
    if (found === null) { failed.push(d.name.en); process.stdout.write(`${d.name.en.padEnd(20)} TIMEOUT\n`); continue; }
    const keep = found
      .filter((c) => !REJECT.some((r) => r.test(c.en)) && !isCityItself(c.en, d.name.en, d.id))
      .slice(0, PER_CITY);
    if (!keep.length) { empty.push(d.name.en); process.stdout.write(`${d.name.en.padEnd(20)} —\n`); continue; }
    process.stdout.write(`${d.name.en.padEnd(20)} ${keep.map((k) => `${k.en} (${k.links})`).join(" · ")}\n`);
    for (const k of keep) {
      rows.push(
        `  { id: ${JSON.stringify(`lm-${slug(k.en)}`)}, destinationId: ${JSON.stringify(d.id)}, ` +
        `name: { en: ${JSON.stringify(k.en)}, ar: ${JSON.stringify(k.ar ?? k.en)} }, ` +
        `coordinates: { lat: ${k.lat}, lng: ${k.lng} } },`,
      );
    }
  }

  const file = `// Generated by scripts/build-landmarks.ts — do not edit by hand.
//
// Source: Wikidata (${ENDPOINT}), CC0. Places within 14km of a destination
// whose class is one a traveller navigates by, ranked by sitelink count and
// capped at ${PER_CITY} per city. Reviewed by eye before shipping.
//
// A curated entry in EXTRA_PLACES wins over anything here. Arabic falls back to
// the English name where Wikidata has no Arabic label; an untranslated proper
// noun is honest, an invented one is not.

export interface GeneratedLandmark {
  id: string;
  destinationId: string;
  name: { en: string; ar: string };
  coordinates: { lat: number; lng: number };
}

export const GENERATED_LANDMARKS: GeneratedLandmark[] = [
${rows.join("\n")}
];
`;
  await fs.writeFile(OUT, file, "utf8");
  process.stdout.write(`\nWrote ${rows.length} landmarks\n`);
  if (empty.length) process.stdout.write(`No suitable landmark for ${empty.length}: ${empty.join(", ")}\n`);
  if (failed.length) process.stdout.write(`Query failed for ${failed.length}: ${failed.join(", ")} — re-run to retry\n`);
}

void main();
