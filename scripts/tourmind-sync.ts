/**
 * Sync TourMind's static hotel catalogue into the local cache.
 *
 *   npx tsx --conditions=react-server scripts/tourmind-sync.ts --countries=PK,AE,SA
 *
 * Static data changes monthly at most and their catalogue runs to seven
 * figures, so this is a deliberate operation rather than something a page
 * request triggers. Only properties that fall inside a city this platform
 * lists are kept — a hotel we cannot place on our own map is inventory we
 * could never surface.
 */
import { config as loadEnv } from "dotenv";
import { isTourmindEnabled } from "../lib/server/tourmind/config";
import { syncTourmindCatalogue } from "../lib/server/tourmind/catalogue";
import { bookableCountryList } from "../lib/data/destinations";

// Credentials live in .env.local, which a CLI does not get for free the way a
// Next request does. Without this the script reported "credentials are not
// set" no matter what was configured.
loadEnv({ path: ".env.local" });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  if (!isTourmindEnabled()) {
    console.error(
      "TourMind credentials are not set. Populate TOURMIND_AGENT_CODE, " +
        "TOURMIND_USERNAME and TOURMIND_PASSWORD, then run this again.",
    );
    process.exit(1);
  }

  const requested = arg("countries");
  const countries = requested
    ? requested.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : bookableCountryList().map((c) => c.code);

  const maxPages = Number(arg("max-pages") ?? 20);
  const pageSize = Number(arg("page-size") ?? 500);

  console.log(`Syncing ${countries.length} countries (max ${maxPages} pages each)…`);
  const summary = await syncTourmindCatalogue(countries, {
    maxPagesPerCountry: maxPages,
    pageSize,
  });

  console.log(
    `Fetched ${summary.fetched} properties; kept ${summary.matched} ` +
      `across ${summary.cities} cities; dropped ${summary.skipped} that fell ` +
      `outside every city we list.`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
