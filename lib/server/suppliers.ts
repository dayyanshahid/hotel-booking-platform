import type { SearchIntent } from "../types";
import { HOTEL_SEEDS, type HotelSeed } from "../data/hotels";
import { ROOM_TEMPLATES } from "../data/rooms";
import { hash01, type BoardCode, type RateClass } from "./pricing";
import type { ScenarioId } from "./scenarios";

/**
 * Two simulated supply sources with deliberately different contracts, mirroring
 * the launch suppliers described in scope §9. Nothing in this file may reach the
 * browser: the normalizer converts these shapes into the canonical model, and the
 * BFF never echoes source codes, rate keys or raw comments.
 *
 * Source S1 mirrors a Hotelbeds-style contract: hotel codes, BOOKABLE/RECHECK
 * rate types, rateKey blobs, numeric board codes and comment identifiers.
 * Source S2 mirrors a TourMind-style contract: hotelId/ratePlan naming, boolean
 * refundability and a penalty array. Endpoint contracts for the real supplier are
 * not public and must be validated against the signed specification. [S3–S4]
 */

export const SOURCES = ["S1", "S2"] as const;
export type SourceCode = (typeof SOURCES)[number];

/* ------------------------------------------------------------ raw shapes */

interface S1Rate {
  rateKey: string;
  rateType: "BOOKABLE" | "RECHECK";
  boardCode: BoardCode;
  rateClassCode: RateClass;
  allotment: number;
  rateCommentsId: string[];
  packaging: boolean;
  offerFlag: boolean;
}

interface S1Room {
  code: string; // e.g. DBL.ST
  name: string; // e.g. "STANDARD KING"
  rates: S1Rate[];
  /** internal template link — a real adapter derives this from mapping. */
  _templateKey: string;
}

interface S1Hotel {
  code: number;
  name: string;
  categoryCode: string;
  zoneCode: number;
  rooms: S1Room[];
  _slug: string;
}

interface S2RatePlan {
  planId: string;
  mealPlan: "NONE" | "BREAKFAST" | "HALF" | "FULL" | "ALLIN";
  refundable: boolean;
  penaltyWindowDays: number;
  roomsLeft: number;
  memberOnly: boolean;
  guaranteeEligible: boolean;
  modifiable: boolean;
  conditionCodes: string[];
}

interface S2Room {
  roomTypeName: string;
  ratePlans: S2RatePlan[];
  _templateKey: string;
}

interface S2Hotel {
  hotelId: string;
  hotelName: string;
  starRating: number;
  roomList: S2Room[];
  _slug: string;
}

/** Internal, post-adapter shape shared by every source. */
export interface RawOffer {
  sourceCode: SourceCode;
  hotelSlug: string;
  roomKey: string;
  supplierRoomLabel: string;
  board: BoardCode;
  rateClass: RateClass;
  /** BOOKABLE proceeds directly; RECHECK needs a live refresh. Never exposed. */
  rateTypeInternal: "BOOKABLE" | "RECHECK";
  allotment: number;
  conditionCodes: string[];
  memberRate: boolean;
  guaranteeEligible: boolean;
  modifiable: boolean;
  packaging: boolean;
  offerFlag: boolean;
}

export interface SupplierResponse {
  sourceCode: SourceCode;
  status: "ok" | "timeout" | "error";
  latencyMs: number;
  offers: RawOffer[];
  hotelSlugs: string[];
}

/* --------------------------------------------------------- generation */

const BOARDS_BY_TIER: Record<number, BoardCode[]> = {
  3: ["RO", "BB"],
  4: ["RO", "BB", "HB"],
  5: ["BB", "HB", "FB"],
};

const MEAL_MAP: Record<S2RatePlan["mealPlan"], BoardCode> = {
  NONE: "RO",
  BREAKFAST: "BB",
  HALF: "HB",
  FULL: "FB",
  ALLIN: "AI",
};

function fitsOccupancy(templateKey: string, intent: SearchIntent): boolean {
  const t = ROOM_TEMPLATES[templateKey];
  if (!t) return false;
  return intent.rooms.every(
    (r) =>
      r.adults <= t.maxAdults &&
      r.childrenAges.length <= t.maxChildren &&
      r.adults + r.childrenAges.length <= t.maxOccupancy,
  );
}

function buildS1(seed: HotelSeed, intent: SearchIntent): S1Hotel {
  const rooms: S1Room[] = seed.rooms
    .filter((k) => fitsOccupancy(k, intent))
    .map((templateKey) => {
      const t = ROOM_TEMPLATES[templateKey];
      const boards = BOARDS_BY_TIER[seed.category] ?? ["RO", "BB"];
      const rates: S1Rate[] = [];
      boards.forEach((boardCode, bi) => {
        const classes: RateClass[] = bi === 0 ? ["flex", "nrf"] : ["flex"];
        classes.forEach((rateClassCode) => {
          const r = hash01(`${seed.slug}|${templateKey}|${boardCode}|${rateClassCode}|S1`);
          rates.push({
            rateKey: `RK|${seed.slug}|${templateKey}|${boardCode}|${rateClassCode}|${intent.checkIn}`,
            rateType: r > 0.55 ? "RECHECK" : "BOOKABLE",
            boardCode,
            rateClassCode,
            allotment: 1 + Math.floor(r * 8),
            rateCommentsId: seed.depositSar ? ["C-DEPOSIT", "C-ID"] : seed.localFeeSar ? ["C-CITYFEE"] : ["C-ID"],
            packaging: false,
            offerFlag: r > 0.7,
          });
        });
      });
      return { code: t.supplierLabels[2] ?? t.supplierLabels[0], name: t.supplierLabels[0], rates, _templateKey: templateKey };
    });

  return {
    code: 100000 + Math.floor(hash01(seed.slug) * 89999),
    name: seed.name.en.toUpperCase(),
    categoryCode: `${seed.category}EST`,
    zoneCode: Math.floor(hash01(seed.neighborhood) * 900),
    rooms,
    _slug: seed.slug,
  };
}

function buildS2(seed: HotelSeed, intent: SearchIntent): S2Hotel {
  const roomList: S2Room[] = seed.rooms
    .filter((k) => fitsOccupancy(k, intent))
    .map((templateKey) => {
      const t = ROOM_TEMPLATES[templateKey];
      const boards = BOARDS_BY_TIER[seed.category] ?? ["RO", "BB"];
      const ratePlans: S2RatePlan[] = boards.slice(0, 2).map((boardCode) => {
        const r = hash01(`${seed.slug}|${templateKey}|${boardCode}|S2`);
        const mealPlan = (Object.keys(MEAL_MAP) as S2RatePlan["mealPlan"][]).find(
          (m) => MEAL_MAP[m] === boardCode,
        )!;
        return {
          planId: `TM-${Math.floor(r * 999999)}`,
          mealPlan,
          refundable: r > 0.35,
          penaltyWindowDays: r > 0.7 ? 3 : 2,
          roomsLeft: 1 + Math.floor(r * 5),
          memberOnly: r > 0.82,
          guaranteeEligible: true,
          modifiable: r > 0.6,
          conditionCodes: seed.localFeeSar ? ["TM-LOCALFEE", "TM-ID"] : ["TM-ID"],
        };
      });
      return { roomTypeName: t.supplierLabels[1] ?? t.supplierLabels[0], ratePlans, _templateKey: templateKey };
    });

  return {
    hotelId: `TM${Math.floor(hash01(`tm-${seed.slug}`) * 999999)}`,
    hotelName: seed.name.en,
    starRating: seed.category,
    roomList,
    _slug: seed.slug,
  };
}

/* ----------------------------------------------------------- adapters */

function adaptS1(hotel: S1Hotel): RawOffer[] {
  return hotel.rooms.flatMap((room) =>
    room.rates.map<RawOffer>((rate) => ({
      sourceCode: "S1",
      hotelSlug: hotel._slug,
      roomKey: room._templateKey,
      supplierRoomLabel: room.name,
      board: rate.boardCode,
      rateClass: rate.rateClassCode,
      rateTypeInternal: rate.rateType,
      allotment: rate.allotment,
      conditionCodes: rate.rateCommentsId,
      memberRate: false,
      guaranteeEligible: false,
      modifiable: rate.rateType === "BOOKABLE",
      packaging: rate.packaging,
      offerFlag: rate.offerFlag,
    })),
  );
}

function adaptS2(hotel: S2Hotel): RawOffer[] {
  return hotel.roomList.flatMap((room) =>
    room.ratePlans.map<RawOffer>((plan) => ({
      sourceCode: "S2",
      hotelSlug: hotel._slug,
      roomKey: room._templateKey,
      supplierRoomLabel: room.roomTypeName,
      board: MEAL_MAP[plan.mealPlan],
      rateClass: plan.refundable ? (plan.penaltyWindowDays > 2 ? "flex" : "semi") : "nrf",
      rateTypeInternal: plan.refundable ? "BOOKABLE" : "RECHECK",
      allotment: plan.roomsLeft,
      conditionCodes: plan.conditionCodes,
      memberRate: plan.memberOnly,
      guaranteeEligible: plan.guaranteeEligible,
      modifiable: plan.modifiable,
      packaging: false,
      offerFlag: !plan.refundable,
    })),
  );
}

/* -------------------------------------------------------------- fetch */

function seedsFor(intent: SearchIntent): HotelSeed[] {
  const byDestination = HOTEL_SEEDS.filter((h) => h.destinationId === intent.destinationId);
  if (byDestination.length) return byDestination;
  // Property-level or landmark intent resolves to its parent destination set.
  const single = HOTEL_SEEDS.find((h) => `hotel-${h.slug}` === intent.destinationId || h.slug === intent.destinationId);
  if (single) return HOTEL_SEEDS.filter((h) => h.destinationId === single.destinationId);
  return [];
}

export async function fetchFromSources(
  intent: SearchIntent,
  scenario: ScenarioId,
): Promise<SupplierResponse[]> {
  const seeds = seedsFor(intent);
  const responses: SupplierResponse[] = [];

  for (const source of SOURCES) {
    const failed =
      scenario === "allSuppliersFail" || (scenario === "supplierTimeout" && source === "S2");
    const latencyMs =
      scenario === "slowSearch" ? 1400 : failed ? 8000 : 180 + Math.floor(hash01(source + intent.checkIn) * 320);

    if (failed) {
      responses.push({ sourceCode: source, status: "timeout", latencyMs, offers: [], hotelSlugs: [] });
      continue;
    }

    if (scenario === "zeroResults") {
      responses.push({ sourceCode: source, status: "ok", latencyMs, offers: [], hotelSlugs: [] });
      continue;
    }

    // S1 lists every property; S2 lists only the ones it is contracted for.
    const visible = source === "S1" ? seeds : seeds.filter((s) => s.sourceCount === 2);
    const offers = visible.flatMap((seed) =>
      source === "S1" ? adaptS1(buildS1(seed, intent)) : adaptS2(buildS2(seed, intent)),
    );

    responses.push({
      sourceCode: source,
      status: "ok",
      latencyMs,
      offers,
      hotelSlugs: visible.map((s) => s.slug),
    });
  }

  // Simulated network latency keeps the progressive-results path honest.
  const maxLatency = Math.max(...responses.map((r) => (r.status === "ok" ? r.latencyMs : 250)));
  await new Promise((resolve) => setTimeout(resolve, Math.min(maxLatency, scenario === "slowSearch" ? 1400 : 320)));

  return responses;
}
