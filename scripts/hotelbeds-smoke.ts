/**
 * Live connectivity check.
 *
 *   npm run hotelbeds:smoke -- --destination PMI --nights 2 --in 2026-09-10
 *
 * Spends at most three requests: one availability, one CheckRate when the rate
 * requires it, and nothing else. It never books. Output shows what the customer
 * would see, so a credential problem, a quota problem and a mapping problem all
 * look different.
 */
import { config as loadEnv } from "dotenv";
import { quotaStatus, signature } from "../lib/server/hotelbeds/client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "../lib/server/hotelbeds/config";
import { searchHotelbedsDestination } from "../lib/server/hotelbeds/search";
import { checkRate } from "../lib/server/hotelbeds/operations";
import { getOffer } from "../lib/server/store";
import { addDays, todayIso } from "../lib/format";
import type { SearchIntent } from "../lib/types";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function main() {
  const config = getHotelbedsConfig();

  console.log("Hotelbeds connectivity check");
  console.log("────────────────────────────");
  console.log(`Environment : ${config.baseUrl}`);
  console.log(`API key     : ${config.apiKey ? `${config.apiKey.slice(0, 6)}…` : "(missing)"}`);
  console.log(`Secret      : ${config.secret ? "configured" : "(missing)"}`);

  if (!isHotelbedsEnabled()) {
    console.error(
      "\nCredentials are not configured.\n\n" +
        "1. Sign in at https://developer.hotelbeds.com/dashboard\n" +
        "2. Copy the API key and secret for the Hotels API\n" +
        "3. Put them in .env.local (never commit that file):\n\n" +
        "   HOTELBEDS_API_KEY=your-key\n" +
        "   HOTELBEDS_SECRET=your-secret\n",
    );
    process.exit(1);
  }

  // Proves the signature scheme without spending a request.
  const sample = signature("demo-key", "demo-secret", 1_700_000_000);
  console.log(`Signature   : SHA256(key+secret+ts) → ${sample.slice(0, 16)}…`);

  const destination = arg("destination", "PMI")!;
  const checkIn = arg("in", addDays(todayIso(), 30))!;
  const nights = Number(arg("nights", "2"));
  const intent: SearchIntent = {
    destinationId: `hbd-${destination}`,
    destinationDisplay: destination,
    destinationType: "city",
    checkIn,
    checkOut: addDays(checkIn, nights),
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale: "en",
    currency: "EUR",
  };

  console.log(`\nAvailability: ${destination}, ${intent.checkIn} → ${intent.checkOut}, 2 adults`);
  const result = await searchHotelbedsDestination(destination, intent, "en");

  if (result.status !== "ok") {
    console.error(`\nThe supplier did not answer: ${result.reason}`);
    console.error("If this says credentials rejected, re-copy the key and secret from the dashboard.");
    process.exit(1);
  }

  console.log(`Hotels      : ${result.hotels.length}`);
  if (!result.hotels.length) {
    console.log("\nNo availability for those dates. Try another destination code or date range.");
    return;
  }

  for (const adapted of result.hotels.slice(0, 3)) {
    const best = adapted.offers.reduce((a, b) => (a.price.total <= b.price.total ? a : b));
    const room = adapted.rooms.find((candidate) => candidate.canonicalRoomId === best.canonicalRoomId);
    console.log(
      `\n  ${adapted.hotel.name} (${adapted.hotel.category}★, ${adapted.hotel.address.city})\n` +
        `    ${room?.name ?? "room"} · ${best.board.label}\n` +
        `    total ${best.price.total} ${best.price.currency} · ${best.price.nights} nights\n` +
        `    ${best.cancellation.refundable ? `free until ${best.cancellation.freeUntil} (${best.cancellation.timezone})` : "non-refundable"}\n` +
        `    needs live confirmation: ${best.capabilities.recheckRequired ? "yes" : "no"}`,
    );
  }

  // CheckRate only where the supplier says one is required.
  const candidate = result.hotels
    .flatMap((hotel) => hotel.offers)
    .find((offer) => offer.capabilities.recheckRequired);

  if (candidate) {
    const stored = getOffer(candidate.offerId);
    if (stored?.hotelbeds) {
      console.log("\nCheckRate   : refreshing one rate that requires confirmation…");
      const live = await checkRate(
        stored.hotelbeds,
        { price: stored.price, cancellation: stored.cancellation, boardLabel: "" },
        { checkIn: intent.checkIn, locale: "en", displayCurrency: intent.currency },
      );
      console.log(
        live.available
          ? `  refreshed total ${live.price.total} ${live.price.currency} (was ${stored.price.total})`
          : "  that rate is no longer available",
      );
    }
  } else {
    console.log("\nCheckRate   : skipped — no rate required one.");
  }

  const quota = quotaStatus();
  console.log(`\nLocal budget used today: ${quota.used}/${quota.used + quota.remaining}`);
  console.log("No booking was made.");
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
