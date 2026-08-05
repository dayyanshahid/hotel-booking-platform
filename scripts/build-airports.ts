import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Builds the airport anchors from OurAirports.
 *
 *   npm run airports:build
 *
 * "Distance from the airport" is the anchor an agent reaches for most often —
 * a transit guest, a late arrival, a crew booking — and it existed for twelve
 * cities out of a hundred and eighty-three. The other hundred and seventy-one
 * offered "city centre" and nothing else.
 *
 * The coordinates are not ours to invent. An airport in roughly the right place
 * is a filter that quietly returns the wrong hotels, and nobody would ever
 * catch it: the radius still works, the counts still look plausible, and the
 * properties are simply not the ones near the airport. So they come from
 * OurAirports, which is public domain, and this script writes a generated file
 * rather than anybody typing a latitude.
 *
 * Matching is by distance, never by name. Municipality strings disagree across
 * languages and datasets — "Makkah" against "Mecca", "Al Madinah al Munawwarah"
 * against "Medina" — and a name match that silently fails leaves a city with no
 * airport for a reason no one can see. Coordinates cannot disagree with
 * themselves.
 */

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const RUNWAYS = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const OUT = path.resolve("lib/data/airports.generated.ts");

/**
 * How far an airport can be and still be this city's airport.
 *
 * Generous, because the real ones are: Narita is 60km from Tokyo, Stansted 50km
 * from London, and King Abdulaziz 70km from Makkah — which is the airport every
 * pilgrim actually flies into. A major hub earns more room than a regional
 * field, which is the difference between the two numbers.
 */
const LARGE_RADIUS_KM = 100;
const MEDIUM_RADIUS_KM = 45;

/** Three is a picker; six is a list nobody reads. */
const MAX_PER_CITY = 3;

/**
 * What a kilometre of distance is worth against a foot of runway.
 *
 * Ranking by distance alone put Taif ahead of Jeddah for Makkah, Le Bourget
 * ahead of Charles de Gaulle for Paris, and dropped JFK from New York
 * altogether — in every case the nearest strip beating the airport people
 * actually fly into. The dataset has no passenger numbers, but the longest
 * runway is a good proxy for what a field is *for*: a business-aviation
 * airport does not have four kilometres of it.
 *
 * Distance still matters, so it is priced rather than ignored. At forty feet
 * per kilometre a hub eighty kilometres out still beats a regional field next
 * door, and two comparable airports are separated by which is closer.
 */
const FEET_PER_KM = 40;

interface Row {
  type: string;
  name: string;
  lat: number;
  lng: number;
  iata: string;
  country: string;
  /** Longest runway in feet, from the companion dataset. */
  runwayFt: number;
}

/**
 * A CSV parser that respects quotes.
 *
 * Airport names contain commas — "Chicago O'Hare International Airport" is fine
 * but "Ministro Pistarini International Airport, Ezeiza" is not — and splitting
 * on commas shifts every later column by one. That failure is silent: the
 * latitude column ends up holding a fragment of a name, parses as NaN, and the
 * airport is dropped without a word.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function main(): Promise<void> {
  const { DESTINATIONS, EXTRA_PLACES } = await import("../lib/data/destinations");

  process.stdout.write(`Fetching ${SOURCE}\n`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`OurAirports returned ${res.status}`);
  const csv = await res.text();

  process.stdout.write(`Fetching ${RUNWAYS}\n`);
  const runwaysRes = await fetch(RUNWAYS);
  if (!runwaysRes.ok) throw new Error(`OurAirports runways returned ${runwaysRes.status}`);
  const runwayCsv = await runwaysRes.text();
  const runwayLines = runwayCsv.split("\n");
  const runwayHeader = parseCsvLine(runwayLines[0]);
  const rIdent = runwayHeader.indexOf("airport_ident");
  const rLength = runwayHeader.indexOf("length_ft");
  const rClosed = runwayHeader.indexOf("closed");
  if (rIdent < 0 || rLength < 0) throw new Error("OurAirports runways has changed its columns");
  const longestRunway = new Map<string, number>();
  for (let i = 1; i < runwayLines.length; i++) {
    if (!runwayLines[i].trim()) continue;
    const cells = parseCsvLine(runwayLines[i]);
    if (rClosed >= 0 && cells[rClosed] === "1") continue;
    const length = Number(cells[rLength]);
    if (!Number.isFinite(length)) continue;
    const ident = cells[rIdent];
    longestRunway.set(ident, Math.max(longestRunway.get(ident) ?? 0, length));
  }

  const lines = csv.split("\n");
  const header = parseCsvLine(lines[0]);
  const at = (name: string) => header.indexOf(name);
  const cType = at("type");
  const cName = at("name");
  const cLat = at("latitude_deg");
  const cLng = at("longitude_deg");
  const cIata = at("iata_code");
  const cIdent = at("ident");
  const cCountry = at("iso_country");
  const cScheduled = at("scheduled_service");
  if ([cType, cName, cLat, cLng, cIata, cCountry, cScheduled].some((i) => i < 0)) {
    throw new Error("OurAirports has changed its columns; check the header before trusting this output");
  }

  const airports: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    const type = cells[cType];
    if (type !== "large_airport" && type !== "medium_airport") continue;
    const iata = cells[cIata]?.trim();
    // No IATA code means no passenger flights anyone books, and no way to
    // label the anchor in a way an agent recognises.
    if (!iata || iata.length !== 3) continue;
    if (cells[cScheduled] !== "yes") continue;
    const lat = Number(cells[cLat]);
    const lng = Number(cells[cLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    airports.push({
      type,
      name: cells[cName],
      lat,
      lng,
      iata,
      country: cells[cCountry],
      runwayFt: longestRunway.get(cells[cIdent]) ?? 0,
    });
  }
  process.stdout.write(`${airports.length} scheduled airports with an IATA code\n`);

  /** Curated entries win: somebody wrote those names, including in Arabic. */
  const curated = new Set(EXTRA_PLACES.filter((place) => place.type === "airport").map((place) => place.id));

  const rows: string[] = [];
  let covered = 0;
  const empty: string[] = [];

  for (const destination of DESTINATIONS) {
    if (!destination.coordinates) continue;
    const inRange = airports
      .map((airport) => ({ airport, km: distanceKm(destination.coordinates, airport) }))
      .filter(({ airport, km }) => km <= (airport.type === "large_airport" ? LARGE_RADIUS_KM : MEDIUM_RADIUS_KM));

    /*
     * Its own country's airports, unless it has none.
     *
     * Batam and Johor Bahru are both inside a hundred kilometres of Singapore
     * and neither is a Singapore airport; offering them beside Changi is noise
     * at best and a border crossing at worst. The fallback matters for the
     * cities where the honest answer really is abroad — an enclave, or a
     * border town whose nearest field is on the other side of it.
     */
    const domestic = inRange.filter(({ airport }) => airport.country === destination.countryCode);
    const near = (domestic.length ? domestic : inRange)
      /*
       * The airport their customer is flying into, not the nearest tarmac.
       * See FEET_PER_KM for why this is a trade rather than a sort by distance.
       */
      .sort((a, b) => {
        const score = (row: { airport: Row; km: number }) => row.airport.runwayFt - row.km * FEET_PER_KM;
        return score(b) - score(a);
      })
      .slice(0, MAX_PER_CITY);

    if (!near.length) {
      empty.push(`${destination.id} (${destination.name.en})`);
      continue;
    }
    covered += 1;
    for (const { airport, km } of near) {
      const id = `air-${airport.iata.toLowerCase()}`;
      if (curated.has(id)) continue;
      const label = `${airport.name} (${airport.iata})`.replace(/"/g, '\\"');
      rows.push(
        `  { id: ${JSON.stringify(id)}, destinationId: ${JSON.stringify(destination.id)}, ` +
          `iata: ${JSON.stringify(airport.iata)}, name: ${JSON.stringify(label)}, ` +
          `coordinates: { lat: ${airport.lat}, lng: ${airport.lng} }, km: ${Math.round(km)}, runwayFt: ${airport.runwayFt} },`,
      );
    }
  }

  const file = `// Generated by scripts/build-airports.ts — do not edit by hand.
//
// Source: OurAirports (${SOURCE}), public domain.
// Scheduled-service airports carrying an IATA code, matched to a destination by
// distance: within ${LARGE_RADIUS_KM}km for a major hub, ${MEDIUM_RADIUS_KM}km for a regional field.
// Ranked by longest runway less ${FEET_PER_KM}ft per km of distance — a proxy for the airport
// travellers actually use — and capped at ${MAX_PER_CITY} per city.
//
// Names are as the source has them, in English. A curated entry in
// EXTRA_PLACES wins over anything here — that is where a translated name or a
// local correction belongs.

export interface GeneratedAirport {
  id: string;
  destinationId: string;
  iata: string;
  /** As published by the source; English only. */
  name: string;
  coordinates: { lat: number; lng: number };
  /** Distance from the destination centre, for reference. */
  km: number;
  /** Longest runway, the signal used to rank hubs above regional fields. */
  runwayFt: number;
}

export const GENERATED_AIRPORTS: GeneratedAirport[] = [
${rows.join("\n")}
];
`;

  await fs.writeFile(OUT, file, "utf8");
  process.stdout.write(`\nWrote ${rows.length} airports for ${covered} of ${DESTINATIONS.length} destinations\n`);
  if (empty.length) {
    // Named rather than counted: a city with no airport within range is either
    // a genuine island case or a coordinate that is wrong, and the two look
    // identical in a total.
    process.stdout.write(`\nNo airport in range for ${empty.length}:\n  ${empty.join("\n  ")}\n`);
  }
}

void main();
