/**
 * Live connectivity check for TourMind.
 *
 *   npm run tourmind:smoke -- --city dubai --in 2026-08-20 --nights 2
 *   npm run tourmind:smoke -- --book        # also books and cancels a test order
 *
 * Walks the whole chain the way a customer would: availability, then the
 * prebook that confirms the price, and — only when asked — a create and an
 * immediate cancel. Output separates a credential problem, a catalogue problem
 * and an availability problem, because they look identical from a results page
 * and need completely different fixes.
 *
 * It books nothing unless `--book` is passed.
 */
import { config as loadEnv } from "dotenv";
import { isTourmindEnabled, getTourmindConfig } from "../lib/server/tourmind/config";
import { tourmindHotelsInCity, tourmindHotels } from "../lib/server/tourmind/catalogue";
import {
  tourmindAvailability,
  tourmindBook,
  tourmindCancel,
  tourmindPrebook,
  tourmindRetrieve,
} from "../lib/server/tourmind/operations";
import { addDays, todayIso } from "../lib/format";
import type { SearchIntent } from "../lib/types";

loadEnv({ path: ".env.local" });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=")[1];
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (!isTourmindEnabled()) {
    console.error("TourMind credentials are not set. See .env.example.");
    process.exit(1);
  }
  const config = getTourmindConfig();
  console.log(`host ${config.baseUrl} · agent ${config.agentCode}`);

  const city = arg("city") ?? "dubai";
  const checkIn = arg("in") ?? addDays(todayIso(), 21);
  const nights = Number(arg("nights") ?? 2);
  const checkOut = addDays(checkIn, nights);

  const all = await tourmindHotels();
  if (!all.length) {
    console.error("The catalogue has never been synced. Run: npm run tourmind:sync");
    process.exit(1);
  }
  const held = await tourmindHotelsInCity(city);
  console.log(`catalogue: ${all.length} properties cached, ${held.length} in ${city}`);
  if (!held.length) {
    console.error(`No TourMind properties are mapped to "${city}". Try another city or re-sync.`);
    process.exit(1);
  }

  const intent: SearchIntent = {
    destinationId: `dest-${city}`,
    destinationDisplay: city,
    destinationType: "city",
    checkIn,
    checkOut,
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale: "en",
    currency: "USD",
  };
  console.log(`stay: ${checkIn} → ${checkOut}, 1 room, 2 adults`);

  // Walk the city until a property actually has rates: an empty response is a
  // normal answer from a supplier, not a fault.
  for (const record of held.slice(0, 8)) {
    const started = Date.now();
    const offers = await tourmindAvailability(String(record.hotelId), intent, "en");
    if (!offers.length) {
      console.log(`  ${record.name}: no availability (${Date.now() - started}ms)`);
      continue;
    }
    console.log(`\navailability: ${record.name} — ${offers.length} distinct rates in ${Date.now() - started}ms`);
    const offer = offers[0];
    console.log(
      `  cheapest: ${offer.roomName} · ${offer.boardCode} · ${offer.price.currency} ${offer.price.total} ` +
        `(net ${offer.supplierCurrency} ${offer.net}) · ${offer.cancellation.refundable ? `free until ${offer.cancellation.freeUntil}` : "non-refundable"}`,
    );

    const rechecked = await tourmindPrebook(offer, intent, "en");
    if (!rechecked) {
      console.log("  prebook: the rate is gone — this is what a guest would be told");
      return;
    }
    const moved = rechecked.price.total - offer.price.total;
    console.log(
      `  prebook: ${rechecked.price.currency} ${rechecked.price.total} ` +
        `${moved === 0 ? "(unchanged)" : `(moved ${moved > 0 ? "+" : ""}${moved})`}`,
    );

    if (!process.argv.includes("--book")) {
      console.log("\nStopping before booking. Pass --book to create and cancel a test order.");
      return;
    }

    const sessionId = `smoke${Date.now().toString(36)}`;
    const booked = await tourmindBook({
      sessionId,
      hotelCode: rechecked.hotelCode,
      rateCode: rechecked.rateCode,
      net: rechecked.net,
      supplierCurrency: rechecked.supplierCurrency,
      intent,
      contact: { name: "Smoke", surname: "Test", email: "smoke@example.com", phone: "+971500000000" },
      guests: [
        { roomIndex: 0, type: "adult", firstName: "Smoke", surname: "Test" },
        { roomIndex: 0, type: "adult", firstName: "Second", surname: "Test" },
      ],
      specialRequest: "Automated integration check — please ignore",
    });
    console.log(`  booked: ${booked.status} · reservation ${booked.reservationId} · ref ${booked.agentRefId}`);

    const retrieved = await tourmindRetrieve(booked.agentRefId);
    console.log(`  retrieved: ${retrieved?.status ?? "not found"}`);

    const cancelled = await tourmindCancel(booked.agentRefId);
    console.log(`  cancelled: ${cancelled ? "accepted" : "refused"}`);
    return;
  }

  console.log("\nNo property in this city had availability for these dates.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
