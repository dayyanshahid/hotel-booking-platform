/**
 * Content sync.
 *
 *   npm run hotelbeds:sync -- --destinations
 *   npm run hotelbeds:sync -- --types
 *   npm run hotelbeds:sync -- --hotels PMI --limit 50
 *
 * Content is cached to .data/hotelbeds so the request path never spends a live
 * call on descriptive data. Run it once after adding credentials, then whenever
 * the portfolio changes.
 *
 * Evaluation keys allow 50 requests per day, so every command here is bounded
 * and reports how much of the local budget it used.
 */
import { config as loadEnv } from "dotenv";
import { quotaStatus } from "../lib/server/hotelbeds/client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "../lib/server/hotelbeds/config";
import { syncDestinations, syncHotels, syncTypes, contentCacheDir } from "../lib/server/hotelbeds/content";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "true";
}

async function main() {
  if (!isHotelbedsEnabled()) {
    console.error(
      "Hotelbeds credentials are not configured.\n" +
        "Add HOTELBEDS_API_KEY and HOTELBEDS_SECRET to .env.local, then run this again.",
    );
    process.exit(1);
  }

  const config = getHotelbedsConfig();
  console.log(`Environment : ${config.baseUrl}`);
  console.log(`Cache       : ${contentCacheDir()}`);
  console.log(`Daily budget: ${config.dailyQuota} requests\n`);

  const log = (message: string) => console.log(`  ${message}`);
  const wantsAll = !arg("types") && !arg("destinations") && !arg("hotels");

  if (wantsAll || arg("types")) {
    console.log("Syncing reference types…");
    await syncTypes(log);
  }

  if (wantsAll || arg("destinations")) {
    console.log("Syncing destinations…");
    const destinations = await syncDestinations(log);
    console.log(`  ${destinations.length} destinations cached`);
  }

  const destinationCode = arg("hotels");
  if (destinationCode && destinationCode !== "true") {
    const limit = Number(arg("limit") ?? 50);
    console.log(`Syncing hotel content for ${destinationCode} (limit ${limit})…`);
    const saved = await syncHotels(destinationCode, { limit, log });
    console.log(`  ${saved} hotels cached`);
  } else if (wantsAll) {
    console.log(
      "\nNo destination given. Pick one from the cached list and run:\n" +
        "  npm run hotelbeds:sync -- --hotels <DESTINATION_CODE> --limit 50",
    );
  }

  const quota = quotaStatus();
  console.log(`\nLocal budget used today: ${quota.used}/${quota.used + quota.remaining}`);
}

main().catch((error) => {
  console.error("\nSync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
