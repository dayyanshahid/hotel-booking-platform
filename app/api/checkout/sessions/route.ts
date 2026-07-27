import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getHotelSeed, buildHotel } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { ROOM_TEMPLATES } from "@/lib/data/rooms";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";
import { buildRequirements } from "@/lib/server/requirements";
import { commentsFor } from "@/lib/server/normalize";
import { getHotelContent } from "@/lib/server/hotelbeds/content";
import { getOffer, getSession, saveSession } from "@/lib/server/store";
import type { CheckoutSession } from "@/lib/types";

const TERMS_VERSION = "2026-07-01";

/**
 * POST /api/checkout/sessions — freeze the platform order context.
 * Returns an opaque session, a price snapshot, the requirement schema and an
 * explicit expiry (§9.3). No supplier identifiers are included.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ offerId: string }>(req);
  if (!body?.offerId) return fail("validation", "error.validation", locale, { status: 400 });

  const offer = getOffer(body.offerId);
  if (!offer) {
    return fail("availabilityChanged", "error.availabilityChanged", locale, {
      status: 409,
      action: "selectAlternative",
    });
  }
  if (new Date(offer.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "error.availabilityChanged", locale, {
      status: 409,
      action: "selectAlternative",
    });
  }

  const seed = getHotelSeed(offer.hotelSlug);
  const dest = seed ? getDestination(seed.destinationId) : undefined;

  // Live-supply offers carry their own labels and country context; demo offers
  // resolve theirs from the seed catalogue. Both produce the same session.
  const liveHotel = offer.hotelbeds ? await getHotelContent(offer.hotelbeds.hotelCode) : null;
  if (!offer.hotelbeds && (!seed || !dest)) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const hotelName =
    (seed ? buildHotel(seed, locale).name : undefined) ??
    offer.hotelName ??
    liveHotel?.name?.content ??
    offer.hotelSlug;
  const countryCode = seed ? dest!.countryCode : (liveHotel?.countryCode ?? "");
  const template = ROOM_TEMPLATES[offer.roomKey];
  const paymentTiming: CheckoutSession["paymentTiming"] = offer.rateClass === "nrf" ? "payNow" : "payLater";

  const session: CheckoutSession = {
    checkoutSessionId: `cs_${Math.random().toString(36).slice(2, 12)}`,
    offerId: offer.offerId,
    hotelSlug: offer.hotelSlug,
    hotelName,
    roomName: offer.roomLabel ?? localized(template?.name, locale),
    boardLabel: offer.boardLabel ?? localized(BOARD_CATALOG[offer.board]?.label, locale),
    checkIn: offer.intent.checkIn,
    checkOut: offer.intent.checkOut,
    rooms: offer.intent.rooms,
    price: offer.price,
    cancellation: offer.cancellation,
    paymentTiming,
    // Live offers already carry structured conditions from the supplier's rate
    // comments; demo offers resolve theirs from the condition catalogue.
    comments: offer.comments ?? commentsFor(offer.conditionCodes, locale),
    requirements: buildRequirements({
      locale,
      countryCode,
      rooms: offer.intent.rooms,
      paymentTiming,
      nationalityRequired: countryCode === "SA" && !offer.hotelbeds && (seed?.category ?? 0) >= 5,
    }),
    capabilities: {
      recheckRequired: offer.rateTypeInternal === "RECHECK",
      cancellationQuote: offer.rateClass !== "nrf",
      modifyAllowed: offer.modifiable,
      guaranteeEligible: offer.guaranteeEligible,
      instantConfirmation: offer.rateTypeInternal === "BOOKABLE",
    },
    expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    termsVersion: TERMS_VERSION,
    createdAt: new Date().toISOString(),
  };

  saveSession({ ...session, idempotencyKeys: [] });
  return ok(session);
}

/** GET /api/checkout/sessions?id=... — restore an in-progress checkout. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("validation", "error.validation", locale, { status: 400 });
  const session = getSession(id);
  if (!session) {
    return fail("availabilityChanged", "checkout.expired", locale, { status: 404, action: "selectAlternative" });
  }
  return ok(session);
}
