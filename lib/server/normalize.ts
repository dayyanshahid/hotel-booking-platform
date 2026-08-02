import type {
  CanonicalHotel,
  CanonicalRoom,
  CancellationPolicy,
  HotelResultCard,
  Locale,
  Offer,
  RateComment,
  SearchIntent,
} from "../types";
import { BOARD_CATALOG, localized } from "../data/catalog";
import { buildHotel, buildRooms, getHotelSeed, type HotelSeed } from "../data/hotels";
import { getDestination } from "../data/destinations";
import { ROOM_TEMPLATES } from "../data/rooms";
import { addDays, comparableTotal, nightsBetween } from "../format";
import { computePrice, hash01, type BoardCode, type RateClass } from "./pricing";
import type { RawOffer } from "./suppliers";
import type { ScenarioId } from "./scenarios";
import { rememberOffer } from "./store";

/**
 * Supplier → canonical normalization (scope §5.7, §8.4, §9.1).
 * Rules enforced here:
 *  - one canonical property per physical hotel, regardless of source count (E-04)
 *  - rooms are merged only when material attributes are compatible (E-05)
 *  - raw rate comments become structured notices with the mandatory wording kept
 *  - supplier rate types, keys and codes never leave this module
 */

const CONDITION_CATALOG: Record<
  string,
  { summary: Record<Locale, string>; verbatim: string; mandatory: boolean }
> = {
  "C-ID": {
    summary: {
      en: "Every adult guest must show the passport or ID used to book at check-in.",
      ar: "على كل ضيف بالغ إبراز جواز السفر أو الهوية المستخدمة في الحجز عند الوصول.",
    },
    verbatim: "ALL GUESTS MUST PRESENT VALID PHOTO IDENTIFICATION AT CHECK IN. THE LEAD NAME MUST MATCH THE RESERVATION.",
    mandatory: true,
  },
  "C-DEPOSIT": {
    summary: {
      en: "The property takes a refundable deposit at check-in and releases it after departure.",
      ar: "يأخذ العقار تأمينًا مستردًا عند الوصول ويُفرج عنه بعد المغادرة.",
    },
    verbatim: "A REFUNDABLE SECURITY DEPOSIT IS COLLECTED ON ARRIVAL AND REFUNDED WITHIN 14 DAYS AFTER DEPARTURE SUBJECT TO INSPECTION.",
    mandatory: true,
  },
  "C-CITYFEE": {
    summary: {
      en: "A municipality or tourism fee is collected by the hotel and is not part of the amount you pay us.",
      ar: "يحصّل الفندق رسومًا بلدية أو سياحية وهي ليست جزءًا من المبلغ الذي تدفعه لنا.",
    },
    verbatim: "CITY/TOURISM TAX IS PAYABLE DIRECTLY AT THE HOTEL AND IS NOT INCLUDED IN THE RATE.",
    mandatory: true,
  },
  "TM-LOCALFEE": {
    summary: {
      en: "Local charges apply at the property. The amount shown is the latest we hold and may be updated by the hotel.",
      ar: "تُطبق رسوم محلية في العقار. المبلغ المعروض هو الأحدث لدينا وقد يُحدّثه الفندق.",
    },
    verbatim: "LOCAL TAXES AND FEES MAY APPLY AND ARE PAYABLE LOCALLY.",
    mandatory: true,
  },
  "TM-ID": {
    summary: {
      en: "The lead guest must be at least 18 and present the booking name at reception.",
      ar: "يجب ألا يقل عمر الضيف الرئيسي عن ١٨ عامًا وأن يقدم اسم الحجز عند الاستقبال.",
    },
    verbatim: "LEAD GUEST MUST BE 18 YEARS OR OLDER.",
    mandatory: false,
  },
  "C-EARLY": {
    summary: {
      en: "Early check-in and late check-out are requests only and are charged by the property if granted.",
      ar: "الوصول المبكر والمغادرة المتأخرة طلبات فقط ويحتسبها العقار عند الموافقة.",
    },
    verbatim: "EARLY CHECK IN / LATE CHECK OUT SUBJECT TO AVAILABILITY AND LOCAL CHARGE.",
    mandatory: false,
  },
};

export function commentsFor(codes: string[], locale: Locale): RateComment[] {
  const list = [...new Set([...codes, "C-EARLY"])];
  return list
    .filter((c) => CONDITION_CATALOG[c])
    .map((c) => ({
      id: c,
      summary: CONDITION_CATALOG[c].summary[locale] ?? CONDITION_CATALOG[c].summary.en,
      verbatim: CONDITION_CATALOG[c].verbatim,
      mandatory: CONDITION_CATALOG[c].mandatory,
    }));
}

/** Build a cancellation timeline in the destination's own time zone (§12.5). */
export function buildCancellation(
  rateClass: RateClass,
  checkIn: string,
  totalAmount: number,
  nights: number,
  timezone: string,
  locale: Locale,
  shiftDays = 0,
): CancellationPolicy {
  const ar = locale === "ar";
  const oneNight = Math.round(totalAmount / Math.max(1, nights));
  const atCheckIn = `${checkIn}T15:00:00`;

  if (rateClass === "nrf") {
    return {
      refundable: false,
      timezone,
      steps: [
        {
          until: atCheckIn,
          fee: totalAmount,
          label: ar ? "غير قابل للاسترداد" : "Non-refundable",
        },
      ],
    };
  }

  const freeDays = (rateClass === "flex" ? 2 : 7) + shiftDays;
  const freeUntil = `${addDays(checkIn, -freeDays)}T18:00:00`;
  return {
    refundable: true,
    freeUntil,
    timezone,
    steps: [
      { until: freeUntil, fee: 0, label: ar ? "إلغاء مجاني" : "Free cancellation" },
      {
        until: atCheckIn,
        fee: rateClass === "flex" ? oneNight : Math.round(totalAmount * 0.5),
        label: ar ? "رسوم إلغاء جزئية" : "Partial cancellation fee",
      },
      {
        until: `${addDays(checkIn, 1)}T12:00:00`,
        fee: totalAmount,
        label: ar ? "لا يوجد استرداد بعد الوصول" : "No refund after check-in",
      },
    ],
  };
}

/**
 * Room-identity decision. Supplier labels collapse into one canonical room only
 * when the mapping confidence clears the threshold; otherwise each label stays
 * separate with its attributes exposed (E-05).
 */
const MERGE_THRESHOLD = 0.8;

function canonicalRoomKeyFor(raw: RawOffer): string {
  const template = ROOM_TEMPLATES[raw.roomKey];
  if (template && template.mappingConfidence < MERGE_THRESHOLD) {
    return `${raw.roomKey}__${raw.sourceCode}`;
  }
  return raw.roomKey;
}

export interface NormalizedHotel {
  hotel: CanonicalHotel;
  rooms: CanonicalRoom[];
  offers: Offer[];
  sourceCount: number;
}

export function normalizeHotel(
  seed: HotelSeed,
  rawOffers: RawOffer[],
  intent: SearchIntent,
  locale: Locale,
  scenario: ScenarioId,
  options: { persistOffers?: boolean; priceAdjust?: number; policyShiftDays?: number } = {},
): NormalizedHotel | null {
  if (!rawOffers.length) return null;
  const dest = getDestination(seed.destinationId)!;
  const hotel = buildHotel(seed, locale);
  const nights = Math.max(1, nightsBetween(intent.checkIn, intent.checkOut));

  if (scenario === "missingContent") {
    hotel.images = [];
    hotel.review = undefined;
  }

  // Dedupe across sources: identical room+board+flexibility keeps the better total.
  const grouped = new Map<string, RawOffer[]>();
  for (const raw of rawOffers) {
    const key = `${canonicalRoomKeyFor(raw)}|${raw.board}|${raw.rateClass}|${raw.memberRate ? "M" : "P"}`;
    const list = grouped.get(key) ?? [];
    list.push(raw);
    grouped.set(key, list);
  }

  const usedRoomKeys = new Set<string>();
  const offers: Offer[] = [];

  for (const [, candidates] of grouped) {
    const priced = candidates.map((raw) => ({
      raw,
      price: computePrice({
        seed,
        roomKey: raw.roomKey,
        board: raw.board,
        rateClass: raw.rateClass,
        checkIn: intent.checkIn,
        checkOut: intent.checkOut,
        rooms: intent.rooms,
        currency: intent.currency,
        countryCode: dest.countryCode,
        sourceCode: raw.sourceCode,
        memberRate: raw.memberRate,
        adjust: options.priceAdjust,
        locale,
      }),
    }));
    priced.sort((a, b) => a.price.total - b.price.total);
    const winner = priced[0];
    const raw = winner.raw;
    const canonicalRoomKey = canonicalRoomKeyFor(raw);
    usedRoomKeys.add(canonicalRoomKey);

    const template = ROOM_TEMPLATES[raw.roomKey];
    const cancellation = buildCancellation(
      raw.rateClass,
      intent.checkIn,
      winner.price.total,
      nights,
      dest.timezone,
      locale,
      options.policyShiftDays ?? 0,
    );

    const board = BOARD_CATALOG[raw.board];
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const offerId = `of_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

    const scores = {
      price: 1 - Math.min(1, winner.price.total / (seed.baseNightlySar * 3 * nights)),
      flexibility: raw.rateClass === "flex" ? 1 : raw.rateClass === "semi" ? 0.6 : 0.15,
      quality: (seed.review?.score ?? 7.5) / 10,
      location: 1 - Math.min(1, (seed.landmarks[0]?.distanceKm ?? 3) / 6),
      fit:
        template && intent.rooms.every((r) => r.adults + r.childrenAges.length <= template.maxOccupancy)
          ? 1
          : 0.4,
    };

    const offer: Offer = {
      offerId,
      canonicalRoomId: `${seed.slug}::${canonicalRoomKey}`,
      board: {
        code: raw.board,
        label: localized(board?.label, locale),
        detail: localized(board?.detail, locale),
      },
      paymentTiming: raw.rateClass === "nrf" ? "payNow" : raw.offerFlag ? "payNow" : "payLater",
      payLaterBy:
        raw.rateClass !== "nrf" && !raw.offerFlag ? `${addDays(intent.checkIn, -3)}T23:59:00` : undefined,
      cancellation,
      price: winner.price,
      comments: commentsFor(raw.conditionCodes, locale),
      badges: [],
      // Generated inventory has no supplier holding rooms for it, and zero
      // is the honest way to say "nobody told us".
      allotment: 0,
      remainingLabel:
        raw.allotment <= 3
          ? locale === "ar"
            ? `بقيت ${raw.allotment} غرف بهذا السعر`
            : `${raw.allotment} left at this price`
          : undefined,
      capabilities: {
        recheckRequired: raw.rateTypeInternal === "RECHECK",
        cancellationQuote: raw.rateClass !== "nrf",
        modifyAllowed: raw.modifiable && raw.rateClass !== "nrf",
        guaranteeEligible: raw.guaranteeEligible,
        instantConfirmation: raw.rateTypeInternal === "BOOKABLE",
      },
      expiresAt,
      roomsCovered: intent.rooms.length,
      scores,
    };

    if (raw.memberRate) {
      offer.badges.push({
        code: "member",
        label: locale === "ar" ? "سعر الأعضاء" : "Member price",
        kind: "promotional",
        reason:
          locale === "ar"
            ? "سعر مخفض متاح لأعضاء الحساب المسجلين."
            : "A reduced price available to signed-in account members.",
      });
    }
    if (raw.guaranteeEligible) {
      offer.badges.push({
        code: "guarantee",
        label: locale === "ar" ? "مؤهل لضمان السفر" : "Travel guarantee eligible",
        kind: "factual",
        reason:
          locale === "ar"
            ? "يشمل هذا العرض ضمان إعادة الحجز المتفق عليه تعاقديًا في حال رفض العقار الحجز."
            : "This offer carries the contracted re-accommodation guarantee if the property cannot honour the booking.",
      });
    }

    if (options.persistOffers !== false) {
      rememberOffer(offerId, {
        offerId,
        hotelSlug: seed.slug,
        roomKey: raw.roomKey,
        canonicalRoomKey,
        board: raw.board as BoardCode,
        rateClass: raw.rateClass,
        sourceCode: raw.sourceCode,
        rateTypeInternal: raw.rateTypeInternal,
        conditionCodes: raw.conditionCodes,
        memberRate: raw.memberRate,
        guaranteeEligible: raw.guaranteeEligible,
        modifiable: raw.modifiable,
        allotment: raw.allotment,
        intent,
        price: winner.price,
        cancellation,
        expiresAt,
        supplierRoomLabel: raw.supplierRoomLabel,
      });
    }

    offers.push(offer);
  }

  // Recommendation labels, computed against equivalent occupancy only (§5.7).
  if (offers.length) {
    const cheapest = offers.reduce((a, b) => (a.price.total <= b.price.total ? a : b));
    cheapest.badges.push({
      code: "bestPrice",
      label: locale === "ar" ? "أقل إجمالي" : "Lowest total",
      kind: "recommendation",
      reason:
        locale === "ar"
          ? "أقل إجمالي لنفس التواريخ وعدد الضيوف في هذا الفندق."
          : "The lowest stay total for the same dates and occupancy at this property.",
    });
    const flexible = offers.filter((o) => o.cancellation.refundable);
    if (flexible.length) {
      const mostFlexible = flexible.reduce((a, b) =>
        (a.cancellation.freeUntil ?? "") >= (b.cancellation.freeUntil ?? "") ? a : b,
      );
      mostFlexible.badges.push({
        code: "mostFlexible",
        label: locale === "ar" ? "الأكثر مرونة" : "Most flexible",
        kind: "recommendation",
        reason:
          locale === "ar"
            ? "أطول فترة إلغاء مجاني بين خيارات هذا الفندق."
            : "The longest free-cancellation window among this property's options.",
      });
    }
    const bestValue = offers.reduce((a, b) => (valueScore(a) >= valueScore(b) ? a : b));
    if (!bestValue.badges.some((b) => b.code === "bestPrice")) {
      bestValue.badges.push({
        code: "bestValue",
        label: locale === "ar" ? "أفضل قيمة" : "Best value",
        kind: "recommendation",
        reason:
          locale === "ar"
            ? "أفضل توازن بين السعر ونظام الوجبات والمرونة والتقييم لنفس عدد الضيوف."
            : "The best balance of price, board, flexibility and rating for the same occupancy.",
      });
    }
  }

  // Canonical rooms actually referenced by at least one offer.
  const baseRooms = buildRooms(seed, locale);
  const rooms: CanonicalRoom[] = [];
  for (const key of usedRoomKeys) {
    const templateKey = key.split("__")[0];
    const base = baseRooms.find((r) => r.canonicalRoomId === `${seed.slug}::${templateKey}`);
    if (!base) continue;
    const template = ROOM_TEMPLATES[templateKey];
    const isSplit = key.includes("__");
    rooms.push({
      ...base,
      canonicalRoomId: `${seed.slug}::${key}`,
      name: isSplit
        ? `${base.name} · ${template.supplierLabels[key.endsWith("S2") ? 1 : 0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`
        : base.name,
      mappingConfidence: template.mappingConfidence,
      images: base.images.map((i) => ({ ...i, roomId: `${seed.slug}::${key}` })),
    });
  }

  return { hotel, rooms, offers, sourceCount: seed.sourceCount };
}

function valueScore(o: Offer): number {
  return o.scores.price * 0.4 + o.scores.flexibility * 0.2 + o.scores.quality * 0.25 + o.scores.fit * 0.15;
}

/**
 * Score every offer on the page, from one place, after the sources are merged.
 *
 * Each adapter used to fill these in itself, and they disagreed. Hotelbeds set
 * quality and flexibility and left price at zero; TourMind set the whole
 * structure to zeroes. Since `recommended` is mostly price, quality and
 * flexibility, a TourMind property could not outrank a Hotelbeds one at any
 * price — measured across five cities, TourMind held the last eighteen
 * positions of every result set and never once appeared in the first twelve,
 * including in Istanbul where it was the cheaper supplier. An agent working the
 * first page of results never saw it, and the better margin went unsold.
 *
 * Price was zero for both, so the thirty per cent of `recommended` and forty
 * per cent of `bestValue` that we publish as being about price was not about
 * anything at all.
 *
 * Doing it here rather than in the adapters is the point: a score is a claim
 * about how one offer compares with another, which no adapter can make because
 * none of them can see the others.
 */
export function scoreSupply(hotels: NormalizedHotel[], intent: SearchIntent): void {
  /*
   * Per room, because the totals are not the same kind of number.
   *
   * Hotelbeds prices a rate per room and TourMind prices the whole party, so on
   * a three-room search a Hotelbeds total is a third of a TourMind one for the
   * same stay. Comparing them raw scored every Hotelbeds rate as cheaper than
   * almost everything, which fed `price` into both `bestValue` and
   * `recommended` — the default ranking was wrong in one supplier's favour on
   * every multi-room search, and nothing on the page said so.
   */
  const totals = hotels
    .flatMap((h) => h.offers.map((o) => comparableTotal(o.price)))
    .filter((total) => Number.isFinite(total) && total > 0)
    .sort((a, b) => a - b);

  /*
   * Percentile rather than a min-max stretch. One five-thousand-dollar suite in
   * a list of hundred-dollar rooms flattens a linear scale until every real
   * option scores about the same; a rank is unmoved by it. It is also the
   * honest reading of the criterion we publish — this rate is cheaper than
   * four-fifths of what your search returned.
   */
  const priceScore = (total: number): number => {
    if (!totals.length || !Number.isFinite(total)) return 0.5;
    let cheaperThan = 0;
    for (const candidate of totals) {
      if (candidate > total) cheaperThan += 1;
    }
    return cheaperThan / totals.length;
  };

  const roomsWanted = Math.max(1, intent.rooms.length);

  for (const hotel of hotels) {
    // A licensed guest score is a better quality signal than a star rating,
    // because stars are self-declared. Falls back to the rating when there is
    // no review, rather than scoring an unreviewed property as zero.
    const review = hotel.hotel.review;
    const quality =
      review && review.scale > 0 ? review.score / review.scale : hotel.hotel.category / 5;

    for (const offer of hotel.offers) {
      offer.scores = {
        price: priceScore(comparableTotal(offer.price)),
        flexibility: offer.cancellation.refundable ? 1 : 0.15,
        quality: Math.min(1, Math.max(0, quality)),
        location: offer.scores.location || 0.6,
        // An offer that covers the whole party is a fit; one that covers part
        // of it is not, and should not headline a card as though it were.
        fit: offer.roomsCovered >= roomsWanted ? 1 : offer.roomsCovered / roomsWanted,
      };
    }
  }
}

export function buildResultCard(n: NormalizedHotel, intent: SearchIntent, locale: Locale): HotelResultCard {
  // Accessible rooms are a limited resource: they never become the headline
  // offer unless the customer asked for one (§5.4, §12.1).
  const accessibleIds = new Set(n.rooms.filter((r) => r.accessible).map((r) => r.canonicalRoomId));
  const eligible = intent.accessibleRoom
    ? n.offers
    : n.offers.filter((o) => !accessibleIds.has(o.canonicalRoomId));
  const pool = eligible.length ? eligible : n.offers;
  const best = pool.reduce((a, b) => (a.price.total <= b.price.total ? a : b));
  const room = n.rooms.find((r) => r.canonicalRoomId === best.canonicalRoomId);
  // Live-supply hotels have no local seed; the source count comes from the
  // normalized record instead.
  const seed = getHotelSeed(n.hotel.slug);
  const hero = n.hotel.images.find((i) => i.category === "exterior") ?? n.hotel.images[0];

  return {
    canonicalHotelId: n.hotel.canonicalHotelId,
    slug: n.hotel.slug,
    name: n.hotel.name,
    category: n.hotel.category,
    propertyType: n.hotel.propertyType,
    heroImage: hero?.url ?? "",
    heroImageSrcSet: hero?.srcSet,
    heroImageFallback: hero?.fallbackUrl,
    heroAlt: hero?.alt ?? n.hotel.name,
    locality: n.hotel.address.city,
    neighborhood: n.hotel.address.neighborhood,
    coordinates: n.hotel.coordinates,
    landmarkDistance: n.hotel.landmarks[0]
      ? { label: n.hotel.landmarks[0].label, distanceKm: n.hotel.landmarks[0].distanceKm }
      : undefined,
    review: n.hotel.review,
    qualityBadges: n.hotel.qualityBadges,
    topAmenities: n.hotel.amenities.slice(0, 4).map((a) => ({ code: a.code, label: a.label })),
    accessibilityHighlights: n.rooms.some((r) => r.accessible)
      ? [locale === "ar" ? "غرف مهيأة متاحة" : "Accessible rooms available"]
      : [],
    offerSummary: {
      offerId: best.offerId,
      roomSummary: room?.name ?? "",
      boardSummary: best.board.label,
      boardCode: best.board.code,
      refundable: best.cancellation.refundable,
      freeCancellationUntil: best.cancellation.freeUntil,
      paymentTiming: best.paymentTiming,
    },
    price: best.price,
    badges: best.badges.filter((b) => b.kind !== "recommendation" || b.code === "bestValue"),
    availabilityStatus: best.remainingLabel ? "lastRooms" : "available",
    remainingLabel: best.remainingLabel,
    offerTimestamp: new Date().toISOString(),
    sourceCount: seed?.sourceCount ?? n.sourceCount,
    scores: best.scores,
  };
}

export { hash01 };
