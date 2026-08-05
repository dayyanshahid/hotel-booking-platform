import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getHotelSeed, buildHotel } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { ROOM_TEMPLATES } from "@/lib/data/rooms";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";
import { buildRequirements } from "@/lib/server/requirements";
import { commentsFor } from "@/lib/server/normalize";
import { getHotelContent } from "@/lib/server/hotelbeds/content";
import { loadOffer, getSession, saveSession } from "@/lib/server/store";
import { countryForOffer } from "@/lib/agency/context";
import type { CheckoutSession, SessionLine } from "@/lib/types";
import type { StoredOffer } from "@/lib/server/store";
import { rollUpLines } from "@/lib/server/checkout-lines";

const TERMS_VERSION = "2026-07-01";

/**
 * POST /api/checkout/sessions — freeze the platform order context.
 * Returns an opaque session, a price snapshot, the requirement schema and an
 * explicit expiry (§9.3). No supplier identifiers are included.
 *
 * Takes a list of offers, one per room. `offerId` is still accepted for a single
 * room, because that is most bookings and there is no reason to make a caller
 * wrap one id in an array to say the obvious thing.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ offerId?: string; offerIds?: string[] }>(req);
  const requested = body?.offerIds?.length ? body.offerIds : body?.offerId ? [body.offerId] : [];
  if (!requested.length) return fail("validation", "error.validation", locale, { status: 400 });

  /*
   * One room per line, and no accidental duplicates.
   *
   * A basket sends the ids an agent picked, and picking the same rate for three
   * rooms is normal — so the same id may legitimately appear more than once.
   * What it may not do is exceed what the rate has left, which is checked below.
   */
  const offers: StoredOffer[] = [];
  for (const offerId of requested.slice(0, 12)) {
    const offer = await loadOffer(offerId);
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
    offers.push(offer);
  }

  const offer = offers[0];

  /*
   * Everything in one checkout has to be the same stay at the same property.
   *
   * A session carries one hotel, one arrival and one departure, and a supplier
   * order is placed against exactly that. Two hotels in one basket is a real
   * thing an agent will eventually want; it is two orders and two vouchers, and
   * quietly booking the first while dropping the second is the worst way to find
   * that out. Refused here until the model carries it.
   */
  const mismatch = offers.find(
    (candidate) =>
      candidate.hotelSlug !== offer.hotelSlug ||
      candidate.intent.checkIn !== offer.intent.checkIn ||
      candidate.intent.checkOut !== offer.intent.checkOut,
  );
  if (mismatch) {
    return fail("validation", "checkout.oneStayPerBooking", locale, { status: 422 });
  }

  /*
   * A rate cannot sell more rooms than it holds.
   *
   * Availability reports what is left; three lines on a rate with two left is a
   * booking that fails at the supplier having already taken the customer's card
   * details and their agreement to a price. Refusing while the basket is still
   * being built is the only cheap moment.
   *
   * `allotment` of zero means the source did not tell us, which is most of the
   * live rates — an unknown is not a limit, and inventing one would refuse
   * bookings that would have succeeded.
   */
  const wantedPerOffer = new Map<string, number>();
  for (const candidate of offers) {
    wantedPerOffer.set(candidate.offerId, (wantedPerOffer.get(candidate.offerId) ?? 0) + 1);
  }
  for (const [offerId, wanted] of wantedPerOffer) {
    const held = offers.find((candidate) => candidate.offerId === offerId)!.allotment;
    if (held > 0 && wanted > held) {
      return fail("availabilityChanged", "checkout.notEnoughRooms", locale, {
        status: 409,
        action: "selectAlternative",
      });
    }
  }

  /*
   * Never more rooms than the search asked for.
   *
   * Found by a test that expected two lines to cover two rooms and got four. A
   * rate covers one room or the whole party depending on the supplier, so two
   * party-priced offers in one basket buy the party twice — the same trap as
   * assuming one rate covers everything, pointing the other way, and just as
   * silent. The customer is charged double and half the rooms go unused.
   *
   * Booking a fourth room against a three-room search is refused too, even
   * though the agent may well want four: the occupancies, the guest form and the
   * requirement schema all come from the allocation, so a room the search never
   * described has nobody to put in it. Changing the search is the fix, and it is
   * one click.
   */
  const requestedRooms = offer.intent.rooms.length;
  const coveredRooms = offers.reduce(
    (sum, candidate) => sum + Math.max(1, candidate.price.roomsCovered),
    0,
  );
  if (coveredRooms > requestedRooms) {
    return fail("validation", "checkout.moreRoomsThanSearched", locale, {
      status: 422,
      action: "editInput",
    });
  }

  const seed = getHotelSeed(offer.hotelSlug);
  const dest = seed ? getDestination(seed.destinationId) : undefined;

  /*
   * Live-supply offers carry their own labels; demo offers resolve theirs from
   * the seed catalogue. Both produce the same session.
   *
   * The test here used to be `!offer.hotelbeds`, which excused one live
   * supplier from needing a seeded hotel and left the other to fall through to
   * a 404. A TourMind rate could be searched, ranked, priced and shown, and
   * then refused the moment anyone tried to buy it — the checkout knew about
   * exactly one of the two suppliers we sell.
   */
  const live = Boolean(offer.hotelbeds || offer.tourmind);
  const liveHotel = offer.hotelbeds ? await getHotelContent(offer.hotelbeds.hotelCode) : null;
  if (!live && (!seed || !dest)) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const hotelName =
    (seed ? buildHotel(seed, locale).name : undefined) ??
    offer.hotelName ??
    liveHotel?.name?.content ??
    offer.hotelSlug;
  /*
   * Which country the stay is in, for the requirement schema.
   *
   * Hotelbeds carries it on their content record. TourMind does not, but the
   * offer's own intent does — both suppliers are searched by our geography, so
   * the destination is ours either way. Without this a TourMind checkout asked
   * for the wrong documents, or for none at all.
   */
  const countryCode =
    (seed ? dest!.countryCode : liveHotel?.countryCode) || countryForOffer(offer) || "";
  const allocation = offer.intent.rooms;
  /*
   * Walked, not indexed.
   *
   * A line covers as many rooms as its rate covers — one for Hotelbeds, the whole
   * party for TourMind — so the allocation is consumed as the lines are built
   * rather than read off by position. Indexing by position gave a single TourMind
   * line the first room only, and named one room's guests on a three-room order.
   *
   * Coverage is capped at the allocation above, so the cursor cannot run past it.
   */
  let cursor = 0;
  const lines: SessionLine[] = offers.map((lineOffer, index) => {
    const template = ROOM_TEMPLATES[lineOffer.roomKey];
    const covers = Math.max(1, lineOffer.price.roomsCovered);
    const roomIndexes = Array.from({ length: covers }, (_, step) =>
      Math.min(cursor + step, allocation.length - 1),
    );
    cursor += covers;
    return {
      lineId: `cl_${index}_${lineOffer.offerId.slice(-6)}`,
      offerId: lineOffer.offerId,
      roomIndexes,
      roomName: lineOffer.roomLabel ?? localized(template?.name, locale),
      boardLabel: lineOffer.boardLabel ?? localized(BOARD_CATALOG[lineOffer.board]?.label, locale),
      occupancies: roomIndexes.map((roomIndex) => allocation[roomIndex]),
      price: lineOffer.price,
      cancellation: lineOffer.cancellation,
      paymentTiming: lineOffer.rateClass === "nrf" ? "payNow" : "payLater",
      // Live offers already carry structured conditions from the supplier's rate
      // comments; demo offers resolve theirs from the condition catalogue.
      comments: lineOffer.comments ?? commentsFor(lineOffer.conditionCodes, locale),
      capabilities: {
        recheckRequired: lineOffer.rateTypeInternal === "RECHECK",
        cancellationQuote: lineOffer.rateClass !== "nrf",
        modifyAllowed: lineOffer.modifiable,
        guaranteeEligible: lineOffer.guaranteeEligible,
        instantConfirmation: lineOffer.rateTypeInternal === "BOOKABLE",
      },
      expiresAt: lineOffer.expiresAt,
    } satisfies SessionLine;
  });

  const rolled = rollUpLines(lines);

  const session: CheckoutSession = {
    checkoutSessionId: `cs_${Math.random().toString(36).slice(2, 12)}`,
    hotelSlug: offer.hotelSlug,
    hotelName,
    checkIn: offer.intent.checkIn,
    checkOut: offer.intent.checkOut,
    rooms: allocation,
    lines,
    price: rolled.price,
    cancellation: rolled.cancellation,
    paymentTiming: rolled.paymentTiming,
    comments: rolled.comments,
    requirements: buildRequirements({
      locale,
      countryCode,
      // The rooms actually being bought, so a three-line checkout asks for three
      // rooms' worth of guests rather than the one the first rate covered.
      rooms: lines.flatMap((line) => line.occupancies),
      paymentTiming: rolled.paymentTiming,
      nationalityRequired: countryCode === "SA" && !live && (seed?.category ?? 0) >= 5,
    }),
    capabilities: rolled.capabilities,
    /*
     * The sooner of our own twenty minutes and the earliest line's own expiry.
     *
     * A session cannot outlive the rates inside it: holding the checkout open
     * for twenty minutes when a line expires in four means the customer fills in
     * the form, pays, and is refused.
     */
    expiresAt: [new Date(Date.now() + 20 * 60 * 1000).toISOString(), rolled.expiresAt].sort()[0],
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
