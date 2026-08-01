import type { ChargeLine, CurrencyCode, PriceStack, RoomAllocation } from "../types";
import { convertFromSar } from "../format";
import { getCountry } from "../data/geo/countries";
import { isCurrencyCode } from "../currencies";
import { nightsBetween } from "../format";
import type { HotelSeed } from "../data/hotels";
import { ROOM_TEMPLATES } from "../data/rooms";
import { hash01 } from "../hash";

/**
 * Deterministic commercial pricing. Lives on the server only — §9.4 requires the
 * browser to format, never to recompute, commercial totals.
 */

/*
 * Re-exported so the many modules that reach for it here keep working. The
 * function itself moved to `lib/hash`, which a client bundle may import.
 */
export { hash01 };

export type RateClass = "flex" | "semi" | "nrf";
export type BoardCode = "RO" | "BB" | "HB" | "FB" | "AI";

const BOARD_FACTOR: Record<BoardCode, number> = { RO: 1, BB: 1.09, HB: 1.24, FB: 1.36, AI: 1.55 };
const RATE_FACTOR: Record<RateClass, number> = { flex: 1, semi: 0.95, nrf: 0.87 };

/** VAT / tourism tax included in the displayed total, by market. */
const TAX_RATE: Record<string, number> = { SA: 0.15, AE: 0.05, QA: 0.05, TR: 0.2 };

export function seasonFactor(checkIn: string): number {
  const month = Number(checkIn.slice(5, 7));
  // Gulf high season is Nov–Mar; Jul–Aug is low in the Gulf, high in Türkiye.
  const gulfHigh = [11, 12, 1, 2, 3];
  if (gulfHigh.includes(month)) return 1.16;
  if (month === 7 || month === 8) return 0.92;
  return 1;
}

export interface PriceInput {
  seed: HotelSeed;
  roomKey: string;
  board: BoardCode;
  rateClass: RateClass;
  checkIn: string;
  checkOut: string;
  rooms: RoomAllocation[];
  currency: CurrencyCode;
  countryCode: string;
  /** Internal supply source code — never leaves the server. */
  sourceCode: string;
  /** Multiplier applied by a forced scenario (price increase / decrease). */
  adjust?: number;
  memberRate?: boolean;
  locale: "en" | "ar";
}

export function computePrice(input: PriceInput): PriceStack {
  const { seed, roomKey, board, rateClass, checkIn, checkOut, rooms, currency, countryCode, sourceCode } = input;
  const template = ROOM_TEMPLATES[roomKey];
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const roomCount = rooms.length;
  const guests = rooms.reduce((s, r) => s + r.adults + r.childrenAges.length, 0);

  // Deterministic per-source spread so the same room genuinely differs between sources.
  const sourceSpread = 0.94 + hash01(`${sourceCode}|${seed.slug}|${roomKey}`) * 0.14;
  const noise = 0.97 + hash01(`${seed.slug}|${roomKey}|${board}|${rateClass}|${checkIn}`) * 0.08;

  // Occupancy surcharge: extra adults above 2 per room, and children over 6.
  const extraAdults = rooms.reduce((s, r) => s + Math.max(0, r.adults - 2), 0);
  const chargedChildren = rooms.reduce((s, r) => s + r.childrenAges.filter((a) => a > 6).length, 0);
  const occupancyFactor = 1 + extraAdults * 0.22 + chargedChildren * 0.12;

  const nightly =
    seed.baseNightlySar *
    template.priceFactor *
    BOARD_FACTOR[board] *
    RATE_FACTOR[rateClass] *
    seasonFactor(checkIn) *
    sourceSpread *
    noise *
    occupancyFactor *
    (input.memberRate ? 0.93 : 1) *
    (input.adjust ?? 1);

  const netStaySar = Math.round(nightly * nights * roomCount);
  const taxRate = TAX_RATE[countryCode] ?? 0.1;
  // What the simulated source contracts in — the destination's own currency,
  // falling back to USD where the platform has no rate for it.
  const settlement: CurrencyCode = (() => {
    const local = getCountry(countryCode)?.currency;
    return isCurrencyCode(local) ? local : "USD";
  })();
  const serviceRate = seed.category >= 5 ? 0.1 : seed.category === 4 ? 0.05 : 0;

  const baseSar = Math.round(netStaySar / (1 + taxRate + serviceRate));
  const taxSar = Math.round(baseSar * taxRate);
  const serviceSar = Math.round(baseSar * serviceRate);
  const totalSar = baseSar + taxSar + serviceSar;

  const ar = input.locale === "ar";
  const included: ChargeLine[] = [
    {
      code: "vat",
      label: ar ? "ضريبة القيمة المضافة والرسوم الحكومية" : "VAT and government charges",
      amount: convertFromSar(taxSar, currency),
      basis: "included",
    },
  ];
  if (serviceSar > 0) {
    included.push({
      code: "service",
      label: ar ? "رسوم الخدمة" : "Service charge",
      amount: convertFromSar(serviceSar, currency),
      basis: "included",
    });
  }

  const payAtProperty: ChargeLine[] = [];
  if (seed.localFeeSar) {
    payAtProperty.push({
      code: "cityFee",
      label: ar
        ? `رسوم بلدية/سياحية · ${roomCount} غرفة × ${nights} ليلة`
        : `Municipality / tourism fee · ${roomCount} room${roomCount > 1 ? "s" : ""} × ${nights} night${nights > 1 ? "s" : ""}`,
      amount: convertFromSar(seed.localFeeSar * nights * roomCount, currency),
      basis: "payAtProperty",
      estimated: false,
    });
  }
  if (seed.depositSar) {
    payAtProperty.push({
      code: "deposit",
      label: ar ? "تأمين مسترد عند الوصول" : "Refundable deposit at check-in",
      amount: convertFromSar(seed.depositSar * roomCount, currency),
      basis: "payAtProperty",
      estimated: true,
    });
  }

  const total = convertFromSar(totalSar, currency);
  const base = convertFromSar(baseSar, currency);

  // A strike-through is only valid against a genuinely comparable basis:
  // here, the same room and board on the flexible rate class.
  let strikeTotal: number | undefined;
  let discountLabel: string | undefined;
  if (rateClass !== "flex" || input.memberRate) {
    const referenceSar = Math.round(
      (netStaySar / RATE_FACTOR[rateClass]) * (input.memberRate ? 1 / 0.93 : 1),
    );
    const reference = convertFromSar(referenceSar, currency);
    if (reference > total * 1.02) {
      strikeTotal = reference;
      const pct = Math.round((1 - total / reference) * 100);
      discountLabel = ar ? `خصم ${pct}%` : `${pct}% off`;
    }
  }

  return {
    currency,
    total,
    nightlyAverage: Math.round(total / nights),
    base,
    includedCharges: included,
    payAtProperty,
    strikeTotal,
    discountLabel,
    memberDelta: input.memberRate ? Math.round(total * 0.07) : undefined,
    // The simulated source settles in the destination's own currency, the way
    // a local contract would. Hard-coding SAR told a guest booking Tokyo that
    // their card would be charged in riyals.
    chargeCurrency: currency === settlement ? undefined : settlement,
    fxBasis:
      currency === settlement
        ? undefined
        : ar
          ? "التحويل تقديري ويُثبّت عند الدفع."
          : "Conversion is indicative and fixed at payment.",
    nights,
    guests,
    // `netStaySar` is multiplied by `roomCount`, so this total buys the whole
    // party. The simulated source and TourMind agree on that; Hotelbeds prices
    // per room, which is why the two numbers have to be declared rather than
    // assumed equal.
    roomsCovered: roomCount,
    roomsRequested: roomCount,
  };
}
