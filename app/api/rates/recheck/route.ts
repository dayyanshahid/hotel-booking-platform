import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getHotelSeed } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";
import { computePrice } from "@/lib/server/pricing";
import { buildCancellation } from "@/lib/server/normalize";
import { runHotelAvailability } from "@/lib/server/search";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { getOffer, getSession, rememberOffer, saveSession } from "@/lib/server/store";
import { nightsBetween } from "@/lib/format";
import { checkRate } from "@/lib/server/hotelbeds/operations";
import { mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { tourmindPrebook } from "@/lib/server/tourmind/operations";
import { getDestination as destinationById } from "@/lib/data/destinations";
import type { StoredOffer } from "@/lib/server/store";
import type { CancellationPolicy, Locale, PriceStack, RecheckResult } from "@/lib/types";

interface Body {
  offerId: string;
  checkoutSessionId?: string;
  /** Commits the refreshed price/policy after the customer explicitly accepts. */
  accept?: boolean;
}

/**
 * POST /api/rates/recheck — refresh the selected offer before payment.
 *
 * §6.4 / E-08, E-09, E-10, E-11. The supplier's own RECHECK terminology never
 * appears in the response; the customer sees a neutral confirmation state and,
 * for any adverse material change, an explicit acceptance step.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<Body>(req);
  if (!body?.offerId) return fail("validation", "error.validation", locale, { status: 400 });

  const stored = getOffer(body.offerId);
  if (!stored) {
    return fail("availabilityChanged", "error.availabilityChanged", locale, {
      status: 409,
      action: "selectAlternative",
    });
  }

  const previousBoard = stored.boardLabel ?? localized(BOARD_CATALOG[stored.board]?.label, locale);
  const previous = {
    price: stored.price,
    cancellation: stored.cancellation,
    boardLabel: previousBoard,
  };

  /**
   * Live supply performs a real CheckRate. The supplier's own rate type decided
   * whether one was needed; either way the customer sees the same neutral
   * confirmation state and the same acceptance gate (§6.4, §9.1).
   */
  if (stored.hotelbeds) {
    const binding = stored.hotelbeds;
    return recheckLiveOffer({
      stored,
      previous,
      locale,
      accept: body.accept === true,
      checkoutSessionId: body.checkoutSessionId,
      refresh: async () => {
        const live = await checkRate(binding, previous, {
          checkIn: stored.intent.checkIn,
          locale,
          displayCurrency: stored.intent.currency,
        });
        if (!live.available) return { available: false };
        return {
          available: true,
          price: live.price,
          cancellation: live.cancellation,
          boardLabel: live.boardLabel,
          // The refreshed key is the only one the supplier will accept at booking.
          commit: (offer) => ({ ...offer, hotelbeds: { ...binding, rateKey: live.rateKey, net: live.net } }),
        };
      },
    });
  }

  /*
   * TourMind, through exactly the same gate.
   *
   * Their offers have always declared `recheckRequired: true` and nothing ever
   * honoured it — the route knew one supplier. So a TourMind rate went to
   * CreateOrder on the code availability handed out, when their prebook returns
   * a different code and is the step that confirms the price. An agency was
   * committing credit against a rate nobody had confirmed.
   */
  if (stored.tourmind) {
    const binding = stored.tourmind;
    const countryCode = destinationById(stored.intent.destinationId)?.countryCode;
    return recheckLiveOffer({
      stored,
      previous,
      locale,
      accept: body.accept === true,
      checkoutSessionId: body.checkoutSessionId,
      refresh: async () => {
        const live = await tourmindPrebook(binding, stored.intent, locale, countryCode);
        if (!live) return { available: false };
        return {
          available: true,
          price: live.price,
          cancellation: live.cancellation,
          boardLabel: localized(BOARD_CATALOG[live.boardCode]?.label, locale) || live.boardCode,
          // Their prebook mints a new rate code; booking with the old one is
          // booking a rate the supplier no longer holds for us.
          commit: (offer) => ({
            ...offer,
            tourmind: { ...binding, rateCode: live.rateCode, net: live.net },
          }),
        };
      },
    });
  }

  const seed = getHotelSeed(stored.hotelSlug);
  const dest = seed ? getDestination(seed.destinationId) : undefined;
  if (!seed || !dest) return fail("validation", "error.notFound", locale, { status: 404 });

  const expired = new Date(stored.expiresAt).getTime() < Date.now();

  const unavailable = scenario === "rateSoldOut" || (scenario === "offerExpired" && !body.accept) || expired;

  if (unavailable) {
    const availability = await runHotelAvailability(stored.hotelSlug, stored.intent, locale, "normal");
    const alternatives =
      availability?.offers
        .filter((o) => o.offerId !== stored.offerId)
        .sort((a, b) => a.price.total - b.price.total)
        .slice(0, 3)
        .map((o) => ({
          offerId: o.offerId,
          roomName: availability.rooms.find((r) => r.canonicalRoomId === o.canonicalRoomId)?.name ?? "",
          boardLabel: o.board.label,
          price: o.price,
          refundable: o.cancellation.refundable,
        })) ?? [];

    const result: RecheckResult = {
      outcome: "unavailable",
      requiresAcceptance: true,
      previous,
      changeReasons: [
        locale === "ar"
          ? "لم يعد هذا السعر متاحًا لنفس التواريخ وعدد الضيوف."
          : "This rate is no longer available for the same dates and occupancy.",
      ],
      alternatives,
    };
    return ok(result);
  }

  const adjust =
    scenario === "priceIncrease" ? 1.14 : scenario === "priceDecrease" ? 0.88 : 1;
  const policyShift = scenario === "policyChange" ? -1 : 0;

  const nights = Math.max(1, nightsBetween(stored.intent.checkIn, stored.intent.checkOut));
  const currentPrice = computePrice({
    seed,
    roomKey: stored.roomKey,
    board: stored.board,
    rateClass: stored.rateClass,
    checkIn: stored.intent.checkIn,
    checkOut: stored.intent.checkOut,
    rooms: stored.intent.rooms,
    currency: stored.intent.currency,
    countryCode: dest.countryCode,
    sourceCode: stored.sourceCode,
    memberRate: stored.memberRate,
    adjust,
    locale,
  });
  const currentCancellation = buildCancellation(
    stored.rateClass,
    stored.intent.checkIn,
    currentPrice.total,
    nights,
    dest.timezone,
    locale,
    policyShift,
  );

  const priceDelta = currentPrice.total - stored.price.total;
  const policyChanged =
    currentCancellation.freeUntil !== stored.cancellation.freeUntil ||
    currentCancellation.refundable !== stored.cancellation.refundable;

  let outcome: RecheckResult["outcome"] = "unchanged";
  const reasons: string[] = [];
  if (priceDelta < -1) {
    outcome = "lower";
    reasons.push(
      locale === "ar"
        ? "انخفض السعر النهائي منذ اختيارك وطبّقنا الأقل تلقائيًا."
        : "The final price fell since you selected it, and we applied the lower amount automatically.",
    );
  } else if (priceDelta > 1) {
    outcome = "higher";
    reasons.push(
      locale === "ar"
        ? "ارتفع إجمالي الإقامة عند التحقق النهائي من التوفر."
        : "The stay total increased when we confirmed final availability.",
    );
  }
  if (policyChanged) {
    if (outcome === "unchanged") outcome = "policyChanged";
    reasons.push(
      locale === "ar"
        ? "تغيّر موعد الإلغاء المجاني لهذا السعر."
        : "The free-cancellation deadline for this rate changed.",
    );
  }

  // A lower price is applied without asking; anything adverse must be accepted. §6.4
  const requiresAcceptance = outcome === "higher" || outcome === "policyChanged";
  const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const shouldCommit = !requiresAcceptance || body.accept === true;
  if (shouldCommit) {
    rememberOffer(stored.offerId, {
      ...stored,
      price: currentPrice,
      cancellation: currentCancellation,
      expiresAt: newExpiresAt,
    });
    if (body.checkoutSessionId) {
      const session = getSession(body.checkoutSessionId);
      if (session) {
        saveSession({
          ...session,
          price: currentPrice,
          cancellation: currentCancellation,
          expiresAt: newExpiresAt,
          accepted: true,
        });
      }
    }
  }

  const result: RecheckResult = {
    outcome,
    requiresAcceptance: requiresAcceptance && !body.accept,
    previous,
    current: {
      price: currentPrice,
      cancellation: currentCancellation,
      boardLabel: previousBoard,
    },
    changeReasons: reasons,
    newExpiresAt,
  };

  return ok(result);
}

/**
 * What a supplier's re-check returns, whoever the supplier is.
 *
 * `commit` carries the part only that supplier understands — a refreshed rate
 * key, a new rate code — so everything after it, the comparison, the acceptance
 * gate and the session update, is written once.
 */
type LiveRefresh = () => Promise<
  | { available: false }
  | {
      available: true;
      price: PriceStack;
      cancellation: CancellationPolicy;
      boardLabel: string;
      commit: (offer: StoredOffer) => StoredOffer;
    }
>;

/**
 * Re-check against a live supplier, mapped into the same RecheckResult the
 * simulated path returns. The refreshed binding replaces the stored one only
 * when the customer has accepted, so an unaccepted change can never be booked.
 */
async function recheckLiveOffer(input: {
  stored: NonNullable<ReturnType<typeof getOffer>>;
  previous: { price: PriceStack; cancellation: CancellationPolicy; boardLabel: string };
  locale: Locale;
  accept: boolean;
  checkoutSessionId?: string;
  refresh: LiveRefresh;
}) {
  const { stored, previous, locale, accept } = input;

  let live: Awaited<ReturnType<LiveRefresh>>;
  try {
    live = await input.refresh();
  } catch (error) {
    const mapped = mapSupplierError(error, locale);
    return fail(mapped.category, mapped.messageKey, locale, {
      status: mapped.status,
      action: mapped.action,
      retryable: mapped.retryable,
      message: mapped.message,
    });
  }

  if (!live.available) {
    const availability = await runHotelAvailability(stored.hotelSlug, stored.intent, locale, "normal");
    const alternatives =
      availability?.offers
        .filter((offer) => offer.offerId !== stored.offerId)
        .sort((a, b) => a.price.total - b.price.total)
        .slice(0, 3)
        .map((offer) => ({
          offerId: offer.offerId,
          roomName: availability.rooms.find((room) => room.canonicalRoomId === offer.canonicalRoomId)?.name ?? "",
          boardLabel: offer.board.label,
          price: offer.price,
          refundable: offer.cancellation.refundable,
        })) ?? [];

    const result: RecheckResult = {
      outcome: "unavailable",
      requiresAcceptance: true,
      previous,
      changeReasons: [
        locale === "ar"
          ? "لم يعد هذا السعر متاحًا لنفس التواريخ وعدد الضيوف."
          : "This rate is no longer available for the same dates and occupancy.",
      ],
      alternatives,
    };
    return ok(result);
  }

  const delta = live.price.total - previous.price.total;
  const policyChanged =
    live.cancellation.freeUntil !== previous.cancellation.freeUntil ||
    live.cancellation.refundable !== previous.cancellation.refundable;

  let outcome: RecheckResult["outcome"] = "unchanged";
  const reasons: string[] = [];
  if (delta < -1) {
    outcome = "lower";
    reasons.push(
      locale === "ar"
        ? "انخفض السعر النهائي منذ اختيارك وطبّقنا الأقل تلقائيًا."
        : "The final price fell since you selected it, and we applied the lower amount automatically.",
    );
  } else if (delta > 1) {
    outcome = "higher";
    reasons.push(
      locale === "ar"
        ? "ارتفع إجمالي الإقامة عند التحقق النهائي من التوفر."
        : "The stay total increased when we confirmed final availability.",
    );
  }
  if (policyChanged) {
    if (outcome === "unchanged") outcome = "policyChanged";
    reasons.push(
      locale === "ar"
        ? "تغيّر موعد الإلغاء المجاني لهذا السعر."
        : "The free-cancellation deadline for this rate changed.",
    );
  }

  const requiresAcceptance = outcome === "higher" || outcome === "policyChanged";
  const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  if (!requiresAcceptance || accept) {
    rememberOffer(
      stored.offerId,
      live.commit({
        ...stored,
        price: live.price,
        cancellation: live.cancellation,
        expiresAt: newExpiresAt,
      }),
    );
    if (input.checkoutSessionId) {
      const session = getSession(input.checkoutSessionId);
      if (session) {
        saveSession({
          ...session,
          price: live.price,
          cancellation: live.cancellation,
          expiresAt: newExpiresAt,
          accepted: true,
        });
      }
    }
  }

  const result: RecheckResult = {
    outcome,
    requiresAcceptance: requiresAcceptance && !accept,
    previous,
    current: { price: live.price, cancellation: live.cancellation, boardLabel: live.boardLabel },
    changeReasons: reasons,
    newExpiresAt,
  };
  return ok(result);
}

export const dynamic = "force-dynamic";
