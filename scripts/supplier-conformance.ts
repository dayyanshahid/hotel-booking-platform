import { config as loadEnv } from "dotenv";

// Before any module reads process.env: the supplier configs are resolved at
// import time, so a late load leaves every credential undefined.
loadEnv({ path: ".env.local" });
import {
  getHotelbedsConfig,
  isHotelbedsEnabled,
} from "@/lib/server/hotelbeds/config";
import { HotelbedsError, hotelbeds, quotaStatus, signature } from "@/lib/server/hotelbeds/client";
import { searchHotelbedsDestination, searchHotelbedsHotel } from "@/lib/server/hotelbeds/search";
import type { AdaptedHotel } from "@/lib/server/hotelbeds/adapter";
import type { HotelbedsOfferBinding } from "@/lib/server/store";
import {
  checkRate,
  confirmBooking,
  getSupplierBooking,
  performCancellation,
  simulateCancellation,
} from "@/lib/server/hotelbeds/operations";
import { getCachedDestinations, getHotelContent, getIndex } from "@/lib/server/hotelbeds/content";
import { mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { getTourmindConfig, isTourmindEnabled } from "@/lib/server/tourmind/config";
import { TM, tourmindPost } from "@/lib/server/tourmind/client";

/*
 * Two endpoints their API offers that the app does not use. They are kept
 * under test so the request shapes stay known — both are surprising, and
 * rediscovering them from the documentation cost an afternoon once already.
 */
const TM_UNUSED = { regions: "/v2/RegionList", rooms: "/v2/RoomStaticList" } as const;
import {
  tourmindAvailability,
  tourmindBook,
  tourmindCancel,
  tourmindPrebook,
  tourmindRetrieve,
} from "@/lib/server/tourmind/operations";
import { tourmindHotels } from "@/lib/server/tourmind/catalogue";
import { mapTourmindError } from "@/lib/server/tourmind/errors";
import { runSearch } from "@/lib/server/search";
import { addDays, todayIso } from "@/lib/format";
import type { SearchIntent } from "@/lib/types";

/**
 * Every supplier operation, run against the real APIs, with a verdict each.
 *
 * The unit suite proves our adapters handle the shapes we recorded from the
 * suppliers. That is not the same claim as "the integration works" — a fixture
 * cannot notice that a field was renamed, that a credential expired, or that
 * an account was never provisioned for the product it is being asked about.
 * Only calling them can.
 *
 * A case that cannot be run is reported as SKIP with the reason, never quietly
 * dropped and never counted as a pass. The point of this file is to be able to
 * answer "is it working" with something other than an opinion, and a run that
 * hides what it could not do would be worse than no run at all.
 *
 * Hotelbeds meters requests and the test key is on a small daily allowance, so
 * the cases here are ordered cheapest-first and the budget is reported at the
 * end. Nothing books on Hotelbeds without `--book-hotelbeds`.
 */

type Verdict = "PASS" | "FAIL" | "SKIP";

interface Case {
  supplier: "Hotelbeds" | "TourMind";
  /** The supplier endpoint or behaviour under test. */
  name: string;
  verdict: Verdict;
  detail: string;
  ms?: number;
}

const results: Case[] = [];

async function check(
  supplier: Case["supplier"],
  name: string,
  fn: () => Promise<string>,
): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    // A case may decline itself: returning "SKIP: …" records why rather than
    // claiming a pass for something that never ran.
    if (detail.startsWith("SKIP:")) {
      results.push({ supplier, name, verdict: "SKIP", detail: detail.slice(5).trim(), ms });
    } else {
      results.push({ supplier, name, verdict: "PASS", detail, ms });
    }
  } catch (error) {
    results.push({
      supplier,
      name,
      verdict: "FAIL",
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ms: Date.now() - started,
    });
  }
}

function stayIntent(days = 30, nights = 2): SearchIntent {
  const checkIn = addDays(todayIso(), days);
  return {
    destinationId: "",
    destinationDisplay: "",
    destinationType: "city",
    checkIn,
    checkOut: addDays(checkIn, nights),
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale: "en",
    currency: "USD",
  };
}

/* ------------------------------------------------------------- Hotelbeds */

async function hotelbedsCases(allowBooking: boolean): Promise<void> {
  if (!isHotelbedsEnabled()) {
    results.push({
      supplier: "Hotelbeds",
      name: "credentials",
      verdict: "SKIP",
      detail: "HOTELBEDS_API_KEY / HOTELBEDS_SECRET not set",
    });
    return;
  }

  const config = getHotelbedsConfig();

  await check("Hotelbeds", "X-Signature (SHA256 of key+secret+ts)", async () => {
    // Deterministic and offline: their auth is the one thing that must be
    // right before any failure above can be blamed on the account.
    const a = signature("key", "secret", 1_700_000_000);
    const b = signature("key", "secret", 1_700_000_000);
    const c = signature("key", "secret", 1_700_000_001);
    if (a !== b) throw new Error("signature is not deterministic for one timestamp");
    if (a === c) throw new Error("signature does not change with the timestamp");
    if (!/^[a-f0-9]{64}$/.test(a)) throw new Error(`not a sha256 hex digest: ${a}`);
    return `64-hex, stable per second, rotates per second`;
  });

  await check("Hotelbeds", "GET /hotel-api/1.0/status", async () => {
    const body = await hotelbeds.booking<{ status?: string }>("/status", { kind: "search" });
    if (!body?.status) throw new Error(`no status field: ${JSON.stringify(body).slice(0, 200)}`);
    return `status=${body.status}`;
  });

  await check("Hotelbeds", "GET /hotel-content-api/1.0/types/* (cached)", async () => {
    const destinations = await getCachedDestinations();
    if (!destinations.length) return "SKIP: no destinations cached; run scripts/hotelbeds-sync.ts";
    return `${destinations.length} destinations in the local content cache`;
  });

  await check("Hotelbeds", "GET /hotel-content-api/1.0/hotels/{code}/details", async () => {
    const content = await getHotelContent(1067);
    if (!content) return "SKIP: hotel 1067 not in cache and the live fetch returned nothing";
    return `${content.name?.content ?? "(unnamed)"} · ${content.images?.length ?? 0} images`;
  });

  let repriceable: { binding: HotelbedsOfferBinding; offer: AdaptedHotel["offers"][number] } | undefined;

  await check("Hotelbeds", "POST /hotel-api/1.0/hotels (availability)", async () => {
    const intent = stayIntent();
    const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    if (!result.hotels.length) return "SKIP: PMI returned zero hotels for these dates";
    const first = result.hotels[0];
    const offer = first.offers[0];
    // The rate key lives in the server-side context map, never on the offer —
    // that separation is the §9.4 rule, and reading it here confirms it holds.
    const context = offer ? first.contexts.get(offer.offerId) : undefined;
    if (context) {
      repriceable = {
        binding: {
          rateKey: context.rateKey,
          hotelCode: context.hotelCode,
          roomCode: context.roomCode,
          boardCode: context.boardCode,
          net: context.net,
          supplierCurrency: context.supplierCurrency,
        },
        offer,
      };
    }
    return `${result.hotels.length} hotels, first "${first.hotel.name}" with ${first.offers.length} rates`;
  });

  await check("Hotelbeds", "POST /hotel-api/1.0/checkrates", async () => {
    if (!repriceable) return "SKIP: availability produced no rate key to re-price";
    const intent = stayIntent();
    const live = await checkRate(
      repriceable.binding,
      {
        price: repriceable.offer.price,
        cancellation: repriceable.offer.cancellation,
        boardLabel: repriceable.offer.board.label,
      },
      { checkIn: intent.checkIn, locale: "en", displayCurrency: "USD" },
    );
    return `available=${live.available} at ${live.price.total} ${live.price.currency}, key rotated=${live.rateKey !== repriceable.binding.rateKey}`;
  });

  await check("Hotelbeds", "GET /hotel-api/1.0/bookings/{ref} — unknown reference", async () => {
    // The negative case matters as much as the positive: a lookup for a
    // reference we do not hold must come back empty, not throw, or every
    // voucher for a booking the supplier has forgotten would fail to print.
    const missing = await getSupplierBooking("NOT-A-REAL-REFERENCE-0000");
    if (missing !== null) throw new Error(`expected null, got ${JSON.stringify(missing).slice(0, 120)}`);
    return "returns null rather than throwing";
  });

  await check("Hotelbeds", "error mapping is customer-safe", async () => {
    // §9.4: supplier wording must never reach a customer. Checked against a
    // constructed error so it runs whether or not the account is healthy.
    const raw = "RATE_KEY 8f2a|NRF|net 118.20 EUR expired at origin";
    const mapped = mapSupplierError(new HotelbedsError("noAvailability", raw, { retryable: false }), "en");
    const text = JSON.stringify(mapped);
    for (const leak of ["RATE_KEY", "8f2a", "118.20", "net"]) {
      if (text.includes(leak)) throw new Error(`supplier detail "${leak}" leaked into ${text}`);
    }
    if (!mapped.messageKey) throw new Error("no customer-facing message key");
    return `→ ${mapped.category} / ${mapped.messageKey}`;
  });

  if (!allowBooking) {
    results.push({
      supplier: "Hotelbeds",
      name: "POST /bookings → GET → DELETE (simulate + cancel)",
      verdict: "SKIP",
      detail: "not run without --book-hotelbeds (creates a real test booking)",
    });
  } else {
    await check("Hotelbeds", "POST /bookings → GET → DELETE (simulate + cancel)", async () => {
      /*
       * Booked from one cached property rather than a destination sweep. A
       * destination search costs one availability call plus a content call for
       * every hotel it has never seen, which is enough on its own to exhaust a
       * test key's daily allowance — see the note in the report. One known
       * hotel is three requests and proves the same chain.
       */
      const index = await getIndex();
      const intent = stayIntent();

      for (const slug of Object.keys(index.bySlug).slice(0, 10)) {
        const adapted = await searchHotelbedsHotel(slug, intent, "en");
        const offer = adapted?.offers[0];
        const context = offer ? adapted!.contexts.get(offer.offerId) : undefined;
        if (!adapted || !offer || !context) continue;

        const binding: HotelbedsOfferBinding = {
          rateKey: context.rateKey,
          hotelCode: context.hotelCode,
          roomCode: context.roomCode,
          boardCode: context.boardCode,
          net: context.net,
          supplierCurrency: context.supplierCurrency,
        };

        const confirmed = await confirmBooking({
          binding,
          holder: { name: "Test", surname: "Conformance" },
          rooms: intent.rooms,
          guests: [
            { roomIndex: 0, type: "adult", firstName: "Test", surname: "Conformance" },
            { roomIndex: 0, type: "adult", firstName: "Second", surname: "Conformance" },
          ],
          clientReference: `CONF${Date.now().toString(36).slice(-6)}`.toUpperCase(),
        });
        if (!confirmed.supplierReference) throw new Error("no supplier reference returned");

        const fetched = await getSupplierBooking(confirmed.supplierReference);
        if (!fetched) throw new Error(`booking ${confirmed.supplierReference} not found straight after creating it`);

        // Simulate first: it reports the fee without committing, which is what
        // the cancellation quote in the portal is built on.
        const quote = await simulateCancellation(confirmed.supplierReference);
        const cancelled = await performCancellation(confirmed.supplierReference);
        if (cancelled.status !== "CANCELLED") {
          throw new Error(`cancel returned ${cancelled.status} — a live test booking is left open at ${confirmed.supplierReference}`);
        }

        return `${confirmed.supplierReference} on "${adapted.hotel.name}": ${confirmed.status} → fetched → quoted fee ${quote.feeNet} ${quote.supplierCurrency} → CANCELLED`;
      }
      return "SKIP: none of the first 10 cached properties had availability";
    });
  }

  const quota = quotaStatus();
  console.log(
    `\nHotelbeds budget: ${quota.used} used, ${quota.remaining} remaining today (${config.baseUrl})`,
  );
}

/* -------------------------------------------------------------- TourMind */

async function tourmindCases(allowBooking: boolean): Promise<void> {
  if (!isTourmindEnabled()) {
    results.push({
      supplier: "TourMind",
      name: "credentials",
      verdict: "SKIP",
      detail: "TOURMIND_AGENT_CODE / USERNAME / PASSWORD not set",
    });
    return;
  }

  await check("TourMind", "POST /v2/HotelStaticList (catalogue)", async () => {
    const hotels = await tourmindHotels();
    if (!hotels.length) return "SKIP: no catalogue cached; run scripts/tourmind-sync.ts";
    return `${hotels.length} properties cached`;
  });

  await check("TourMind", "POST /v2/RegionList (declared, not used by the app)", async () => {
    const body = await tourmindPost<{ Error?: never; RegionListResult?: { Regions?: unknown[] } }>(
      TM_UNUSED.regions,
      { PageIndex: 1, PageSize: 5 },
      "catalogue",
    );
    // Their regions come back nested under RegionListResult, not at the root.
    const regions = body?.RegionListResult?.Regions;
    if (!Array.isArray(regions)) throw new Error(`no RegionListResult.Regions in ${JSON.stringify(body).slice(0, 160)}`);
    return `${regions.length} regions in one page`;
  });

  await check("TourMind", "POST /v2/RoomStaticList (declared, not used by the app)", async () => {
    const hotels = await tourmindHotels();
    const hotel = hotels[0];
    if (!hotel) return "SKIP: no catalogue to pick a hotel from";
    // `HotelCode`, singular and numeric. `HotelId` and `HotelCodes` are both
    // rejected with "Invalid HotelCode", which is worth writing down because
    // the field is named HotelId everywhere else in their API.
    const body = await tourmindPost<{ Error?: never; RoomTypes?: unknown[] }>(
      TM_UNUSED.rooms,
      { HotelCode: Number(hotel.hotelId), PageIndex: 1, PageSize: 20 },
      "catalogue",
    );
    const rooms = body?.RoomTypes;
    if (!Array.isArray(rooms)) throw new Error(`no RoomTypes in ${JSON.stringify(body).slice(0, 160)}`);
    return `${rooms.length} room types for hotel ${hotel.hotelId}`;
  });

  const intent = stayIntent();
  let bookableOffer: Awaited<ReturnType<typeof tourmindAvailability>>[number] | undefined;
  let refundableOffer: typeof bookableOffer;

  await check("TourMind", "POST /v2/HotelDetail (availability)", async () => {
    const hotels = await tourmindHotels();
    if (!hotels.length) return "SKIP: no catalogue";
    // Walk a handful rather than one: an empty result from a single property
    // is ordinary and would otherwise read as an integration failure.
    for (const hotel of hotels.slice(0, 12)) {
      const offers = await tourmindAvailability(String(hotel.hotelId), intent, "en");
      if (offers.length) {
        bookableOffer = offers[0];
        refundableOffer = offers.find((o) => o.refundable && o.cancellation.freeUntil);
        return `${hotel.name}: ${offers.length} rates (${offers.filter((o) => o.refundable).length} refundable)`;
      }
    }
    return "SKIP: none of the first 12 properties had availability for these dates";
  });

  await check("TourMind", "POST /v2/CheckRoomRate (prebook)", async () => {
    if (!bookableOffer) return "SKIP: no offer from availability";
    const rechecked = await tourmindPrebook(bookableOffer, intent, "en");
    if (!rechecked) return "SKIP: the rate was gone at prebook (a valid outcome)";
    return `confirmed at ${rechecked.price.total} ${rechecked.price.currency}`;
  });

  await check("TourMind", "refundable rate carries a free-cancellation deadline", async () => {
    // The hold engine is built on this field. If a supplier stops sending it,
    // every hold silently becomes unholdable and nobody would notice.
    if (!bookableOffer) return "SKIP: no offer from availability";
    if (!refundableOffer) return "SKIP: no refundable rate among the offers returned";
    const when = new Date(refundableOffer.cancellation.freeUntil!);
    if (Number.isNaN(when.getTime())) throw new Error("freeCancellationUntil is not a date");
    return `free until ${when.toISOString()}`;
  });

  await check("TourMind", "POST /v2/SearchOrder — unknown reference", async () => {
    const missing = await tourmindRetrieve("NOT-A-REAL-REF-0000");
    if (missing !== null) throw new Error(`expected null, got ${JSON.stringify(missing).slice(0, 120)}`);
    return "returns null rather than throwing";
  });

  await check("TourMind", "error mapping is customer-safe", async () => {
    const raw = "RateCode NRF-7781 net CNY 812.00 for AgentRefID TMS-1 is no longer sellable";
    const mapped = mapTourmindError(new Error(raw), "en");
    const text = JSON.stringify(mapped);
    for (const leak of ["RateCode", "NRF-7781", "812.00", "AgentRefID"]) {
      if (text.includes(leak)) throw new Error(`supplier detail "${leak}" leaked into ${text}`);
    }
    return `→ ${mapped.category} / ${mapped.messageKey}`;
  });

  if (!allowBooking) {
    results.push({
      supplier: "TourMind",
      name: "POST /v2/CreateOrder → SearchOrder → CancelOrder",
      verdict: "SKIP",
      detail: "not run without --book (creates and cancels a real test order)",
    });
    return;
  }

  await check("TourMind", "POST /v2/CreateOrder → SearchOrder → CancelOrder", async () => {
    if (!bookableOffer) return "SKIP: no offer from availability";
    const rechecked = await tourmindPrebook(bookableOffer, intent, "en");
    if (!rechecked) return "SKIP: rate gone at prebook, nothing to book";

    const booked = await tourmindBook({
      sessionId: `conf${Date.now().toString(36).slice(-6)}`,
      hotelCode: rechecked.hotelCode,
      rateCode: rechecked.rateCode,
      net: rechecked.net,
      supplierCurrency: rechecked.supplierCurrency,
      intent,
      contact: { name: "Test", surname: "Conformance", email: "conformance@example.com", phone: "+971500000000" },
      guests: [
        { roomIndex: 0, type: "adult", firstName: "Test", surname: "Conformance" },
        { roomIndex: 0, type: "adult", firstName: "Second", surname: "Conformance" },
      ],
    });
    if (!booked?.agentRefId) throw new Error("CreateOrder returned no agent reference");

    const retrieved = await tourmindRetrieve(booked.agentRefId);
    if (!retrieved) throw new Error(`SearchOrder could not find ${booked.agentRefId} straight after booking`);

    const cancelled = await tourmindCancel(booked.agentRefId);
    if (!cancelled) throw new Error(`CancelOrder refused ${booked.agentRefId} — a live test booking is left open`);

    const after = await tourmindRetrieve(booked.agentRefId);
    return `${booked.agentRefId}: created (${booked.status}) → retrieved (${retrieved.status}) → cancelled → now ${after?.status ?? "gone"}`;
  });
}

/* --------------------------------------------------- across both suppliers */

/**
 * The rule that matters most, checked against a real response.
 *
 * §9.4: no supplier identifier, net rate or supplier name may reach a client.
 * The unit suite asserts this against fixtures, which can only prove that the
 * shapes we recorded are handled. This runs a live search through the same
 * function the API route calls and reads the actual bytes that would be
 * serialised to a browser — the only version of this check that could catch a
 * supplier adding a field we have never seen.
 */
async function leakageCase(): Promise<void> {
  await check("TourMind", "live search response carries no supplier identifiers", async () => {
    if (!isTourmindEnabled() && !isHotelbedsEnabled()) return "SKIP: no supplier configured";

    const intent = stayIntent();
    const response = await runSearch(
      { ...intent, destinationId: "dest-dubai", destinationDisplay: "Dubai" },
      { locale: "en", scenario: "normal", supply: "live", pageSize: 24 },
    );
    if (!response.results.length) return "SKIP: the live search returned nothing to inspect";

    const serialised = JSON.stringify(response);

    // Field names first: these are the carriers, whatever value they hold.
    for (const field of ["rateKey", "RateCode", "rateCode", "AgentRefID", "agentRefId", "supplierRateKey", "net", "netRate", "supplierCurrency"]) {
      if (new RegExp(`"${field}"\\s*:`).test(serialised)) {
        throw new Error(`field "${field}" is present in a client response`);
      }
    }
    // Then the supplier's identity, in any casing.
    for (const name of ["hotelbeds", "tourmind"]) {
      if (serialised.toLowerCase().includes(name)) {
        throw new Error(`supplier name "${name}" appears in a client response`);
      }
    }

    return `${response.results.length} live results, ${Math.round(serialised.length / 1024)}kB inspected, no carrier fields and no supplier name`;
  });
}

/* ----------------------------------------------------------------- report */

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  console.log("Supplier conformance — live APIs, not fixtures\n");

  await hotelbedsCases(args.has("--book-hotelbeds"));
  await tourmindCases(args.has("--book"));
  await leakageCase();

  const width = Math.max(...results.map((r) => r.name.length));
  let supplier = "";
  for (const result of results) {
    if (result.supplier !== supplier) {
      supplier = result.supplier;
      console.log(`\n${supplier}`);
      console.log("─".repeat(supplier.length));
    }
    const mark = result.verdict === "PASS" ? "PASS" : result.verdict === "FAIL" ? "FAIL" : "SKIP";
    const time = result.ms === undefined ? "" : ` ${result.ms}ms`;
    console.log(`  [${mark}] ${result.name.padEnd(width)}  ${result.detail}${time}`);
  }

  const tally = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  console.log(`\n${tally("PASS")} passed · ${tally("FAIL")} failed · ${tally("SKIP")} skipped`);

  // A skip is not a pass. The exit code reflects failures only, but the count
  // above is the number that matters when someone asks whether this is done.
  process.exit(tally("FAIL") > 0 ? 1 : 0);
}

void main();
