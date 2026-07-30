import type {
  CancellationPolicy,
  OfferCapabilities,
  PriceStack,
  RateComment,
  SessionLine,
} from "../types";

/**
 * Reducing many rooms to the few numbers a checkout has to state once.
 *
 * A session shows one total, one cancellation deadline, one expiry countdown and
 * one payment mode, however many rooms it holds. Every one of those is a rollup,
 * and every rollup has a direction it can be wrong in. They all round towards
 * the answer that cannot overpromise: the earliest expiry, the strictest policy,
 * the least capability, `payNow` if anything demands it.
 *
 * The alternative — taking the first line's values, or the most generous — is how
 * a customer is told a booking is fully refundable when a third of it is not.
 */

/** The sum of every line, described as the party rather than as one room. */
export function sumPrices(lines: SessionLine[]): PriceStack {
  const first = lines[0].price;
  const add = (pick: (price: PriceStack) => number) =>
    Math.round(lines.reduce((sum, line) => sum + pick(line.price), 0));

  /*
   * Charges are merged by code and summed, not concatenated. Three rooms each
   * carrying "City tax" produced three identical lines in the breakdown and a
   * customer counting them as three separate taxes.
   */
  const mergeCharges = (pick: (price: PriceStack) => PriceStack["includedCharges"]) => {
    const byCode = new Map<string, PriceStack["includedCharges"][number]>();
    for (const line of lines) {
      for (const charge of pick(line.price)) {
        const held = byCode.get(charge.code);
        byCode.set(
          charge.code,
          held
            ? { ...held, amount: Math.round(held.amount + charge.amount), estimated: held.estimated || charge.estimated }
            : { ...charge },
        );
      }
    }
    return [...byCode.values()];
  };

  return {
    ...first,
    total: add((price) => price.total),
    base: add((price) => price.base),
    nightlyAverage: add((price) => price.nightlyAverage),
    strikeTotal: lines.every((line) => line.price.strikeTotal)
      ? add((price) => price.strikeTotal ?? 0)
      : undefined,
    // A per-line discount label cannot describe a set, and the sum of the strike
    // totals already carries the saving.
    discountLabel: lines.length === 1 ? first.discountLabel : undefined,
    memberDelta: lines.some((line) => line.price.memberDelta)
      ? add((price) => price.memberDelta ?? 0)
      : undefined,
    includedCharges: mergeCharges((price) => price.includedCharges),
    payAtProperty: mergeCharges((price) => price.payAtProperty),
    guests: lines.reduce(
      (sum, line) =>
        sum +
        line.occupancies.reduce(
          (heads, room) => heads + room.adults + room.childrenAges.length,
          0,
        ),
      0,
    ),
    /*
     * The set covers as many rooms as it has lines, and that is now the whole
     * point: a session that requested three rooms and holds three lines is
     * complete, and `isPerRoomTotal` on this total is false because it is no
     * longer a per-room figure standing in for a party.
     */
    roomsCovered: lines.reduce((sum, line) => sum + Math.max(1, line.price.roomsCovered), 0),
    roomsRequested: Math.max(
      first.roomsRequested,
      lines.reduce((sum, line) => sum + Math.max(1, line.price.roomsCovered), 0),
    ),
  };
}

/**
 * The line a customer is least free to change their mind about.
 *
 * Non-refundable beats refundable outright. Between two refundable lines the
 * earlier free-cancellation deadline wins, because that is the date after which
 * the set stops being free to cancel — the later one is already lost by then.
 */
export function strictestCancellation(lines: SessionLine[]): CancellationPolicy {
  return lines.reduce((strictest, line) => {
    const candidate = line.cancellation;
    if (strictest.refundable !== candidate.refundable) {
      return strictest.refundable ? candidate : strictest;
    }
    if (!strictest.freeUntil || !candidate.freeUntil) return strictest.freeUntil ? candidate : strictest;
    return new Date(candidate.freeUntil) < new Date(strictest.freeUntil) ? candidate : strictest;
  }, lines[0].cancellation);
}

/** True for a capability only if every line has it; recheck if any line needs one. */
export function combineCapabilities(lines: SessionLine[]): OfferCapabilities {
  const every = (pick: (capabilities: OfferCapabilities) => boolean) =>
    lines.every((line) => pick(line.capabilities));
  return {
    recheckRequired: lines.some((line) => line.capabilities.recheckRequired),
    cancellationQuote: every((capabilities) => capabilities.cancellationQuote),
    modifyAllowed: every((capabilities) => capabilities.modifyAllowed),
    guaranteeEligible: every((capabilities) => capabilities.guaranteeEligible),
    instantConfirmation: every((capabilities) => capabilities.instantConfirmation),
  };
}

/** One statement of each condition, in the order they were first met. */
export function mergeComments(lines: SessionLine[]): RateComment[] {
  const byKey = new Map<string, RateComment>();
  for (const line of lines) {
    for (const comment of line.comments) {
      // Keyed on what it says rather than on its id: the same condition arrives
      // from three rooms with three different ids and one meaning.
      const key = `${comment.summary}|${comment.verbatim}`;
      if (!byKey.has(key)) byKey.set(key, comment);
    }
  }
  return [...byKey.values()];
}

export interface LineRollup {
  price: PriceStack;
  cancellation: CancellationPolicy;
  capabilities: OfferCapabilities;
  comments: RateComment[];
  paymentTiming: SessionLine["paymentTiming"];
  expiresAt: string;
}

export function rollUpLines(lines: SessionLine[]): LineRollup {
  return {
    price: sumPrices(lines),
    cancellation: strictestCancellation(lines),
    capabilities: combineCapabilities(lines),
    comments: mergeComments(lines),
    // Any line that must be paid now sets the terms for the set: the booking is
    // placed as one act and cannot half-settle.
    paymentTiming: lines.some((line) => line.paymentTiming === "payNow") ? "payNow" : "payLater",
    // The set is held only until its first loss.
    expiresAt: lines.reduce(
      (earliest, line) => (new Date(line.expiresAt) < new Date(earliest) ? line.expiresAt : earliest),
      lines[0].expiresAt,
    ),
  };
}
