import "server-only";
import { getTourmindConfig } from "./config";
import { TM, tourmindPost } from "./client";
import { boardCodeFor, buildCancellation, buildPrice, remainingLabel } from "./adapter";
import type {
  TmCancelOrderResponse,
  TmCreateOrderResponse,
  TmHotelDetailResponse,
  TmPaxRoom,
  TmRateInfo,
  TmRoomAvailResponse,
  TmSearchOrderResponse,
} from "./types";
import type { CancellationPolicy, Locale, PriceStack, SearchIntent } from "@/lib/types";

/**
 * The four calls a booking needs, in the order a booking needs them.
 *
 * Search → Prebook → CreateOrder → CancelOrder maps onto the same shape as the
 * Hotelbeds flow, which is what lets the checkout route stay supplier-agnostic:
 * it asks for an offer, re-checks it, books it, and cancels it, without knowing
 * whose API is underneath.
 */

/** Their occupancy shape. One entry per distinct occupancy, with a room count. */
function paxRooms(intent: SearchIntent): TmPaxRoom[] {
  return intent.rooms.map((room) => ({
    Adults: room.adults,
    Children: room.childrenAges.length,
    ChildrenAges: room.childrenAges,
    RoomCount: 1,
  }));
}

/**
 * The same rooms, with the guests named — which booking requires and searching
 * does not.
 *
 * Their `Type` is `ADU` or `CHI`, and only those. We sent no names at all and
 * every booking came back "Invalid PaxNames"; sending a friendlier "Adult" is
 * rejected the same way, so the enum is copied here rather than derived.
 *
 * A room with no named guest still needs one, because they will not take a
 * booking without it — the lead traveller stands in, which is also who the
 * hotel would ask for at check-in.
 */
function paxRoomsWithNames(intent: SearchIntent, guests: BookingPax[]): TmPaxRoom[] {
  const lead = guests[0];
  return intent.rooms.map((room, index) => {
    const inRoom = guests.filter((guest) => guest.roomIndex === index);
    const named = inRoom.length ? inRoom : lead ? [lead] : [];
    return {
      Adults: room.adults,
      Children: room.childrenAges.length,
      ChildrenAges: room.childrenAges,
      RoomCount: 1,
      PaxNames: named.map((guest) => ({
        FirstName: guest.firstName,
        LastName: guest.surname,
        Type: guest.type === "child" ? "CHI" : "ADU",
      })),
    };
  });
}

/** Test seam: the rate collapse, against a payload shaped like theirs. */
export function __offersFromHotel(
  hotel: NonNullable<TmHotelDetailResponse["Hotels"]>[number],
  intent: SearchIntent,
): TourmindOffer[] {
  return offersFromHotel(hotel, String(hotel.HotelCode ?? ""), intent, "en");
}

/** Test seam: the occupancy block a create call actually sends. */
export function __paxRoomsWithNames(intent: SearchIntent, guests: BookingPax[]): TmPaxRoom[] {
  return paxRoomsWithNames(intent, guests);
}

/** The subset of a booking guest their create call needs. */
export interface BookingPax {
  roomIndex: number;
  type: "adult" | "child";
  firstName: string;
  surname: string;
}

export interface TourmindOffer {
  /** Their rate identifier. Server-side only — never serialised to a client. */
  rateCode: string;
  hotelCode: string;
  roomName: string;
  bedText?: string;
  boardCode: string;
  price: PriceStack;
  /** Supplier net and currency, for reconciliation. Never sent to the client. */
  net: number;
  supplierCurrency: string;
  cancellation: CancellationPolicy;
  remainingLabel?: string;
  /** Rooms the rate still holds, 0 when TourMind did not say. */
  allotment: number;
  refundable: boolean;
}

/**
 * Availability for up to twenty properties in one call.
 *
 * This started as one call per property, on the theory that a batch failing
 * would lose every property in it. Measured against their server the theory was
 * backwards: twenty parallel single calls timed out on a quarter of them and
 * took eight seconds, while one batched call returned the same eighteen
 * properties in under three. Their endpoint is built to be asked once.
 *
 * A batch that does fail costs the supplier's whole contribution to that
 * search, which is what partial completeness is for — the other sources still
 * fill the page.
 */
export async function tourmindAvailabilityBatch(
  hotelCodes: string[],
  intent: SearchIntent,
  locale: Locale,
  countryCode?: string,
): Promise<Map<string, TourmindOffer[]>> {
  const config = getTourmindConfig();
  const codes = hotelCodes.map(Number).filter((code) => Number.isFinite(code) && code > 0);
  const byHotel = new Map<string, TourmindOffer[]>();
  if (!codes.length) return byHotel;

  const response = await tourmindPost<TmHotelDetailResponse>(TM.search, {
    // Numbers, not strings: their static catalogue returns the id as a string
    // and this endpoint rejects that same string with "request parameter error".
    HotelCodes: codes.slice(0, MAX_HOTELS_PER_CALL),
    CheckIn: intent.checkIn,
    CheckOut: intent.checkOut,
    PaxRooms: paxRooms(intent),
    Nationality: intent.nationality || config.nationality,
    IsDailyPrice: false,
  });

  for (const hotel of response.Hotels ?? []) {
    const code = String(hotel.HotelCode ?? "");
    if (!code) continue;
    byHotel.set(code, offersFromHotel(hotel, code, intent, locale, countryCode));
  }
  return byHotel;
}

/** Availability for one property — the detail page, where one is all we need. */
export async function tourmindAvailability(
  hotelCode: string,
  intent: SearchIntent,
  locale: Locale,
  countryCode?: string,
): Promise<TourmindOffer[]> {
  const batch = await tourmindAvailabilityBatch([hotelCode], intent, locale, countryCode);
  return batch.get(String(Number(hotelCode))) ?? batch.get(hotelCode) ?? [];
}

/** Their documented maximum for a single availability call. */
const MAX_HOTELS_PER_CALL = 20;

/**
 * Every materially distinct rate for one property, and no more.
 *
 * Their data returns over a thousand rates for a single hotel — the same room
 * at a hundred prices that differ by a few yuan. Passing that through would put
 * a thousand rows on a property page and a thousand offers in the store per
 * hotel, for a choice no guest can make.
 *
 * So rates collapse onto the three axes a guest actually chooses between: the
 * room, what is included, and whether it can be cancelled. Cheapest wins each
 * combination, which is also the only defensible tie-break — showing a dearer
 * rate that is identical in every respect would be selling against them.
 */
function offersFromHotel(
  hotel: NonNullable<TmHotelDetailResponse["Hotels"]>[number],
  hotelCode: string,
  intent: SearchIntent,
  locale: Locale,
  countryCode?: string,
): TourmindOffer[] {
  /*
   * Collapse first, build second.
   *
   * The obvious order — build every rate, then keep the distinct ones — turned
   * a search into thirteen seconds and then a timeout, because building a rate
   * means a price stack, a currency conversion and a cancellation policy, and
   * one property here carries over a thousand of them. Ninety-five per cent of
   * that work was for rates thrown away a moment later.
   *
   * Choosing on the raw fields first is cheap: a room name, their meal enum and
   * a boolean. Only the survivors are ever built.
   */
  const best = new Map<string, { rate: TmRateInfo; roomName: string; bedText?: string; price: number }>();

  for (const roomType of hotel.RoomTypes ?? []) {
    for (const rate of roomType.RateInfos ?? []) {
      const price = Number(rate.TotalPrice);
      if (!Number.isFinite(price) || price <= 0 || !rate.RateCode) continue;
      // Their aggregated name is cleaner; the sub-room name is more accurate.
      // Prefer the aggregated one and fall back, matching their own advice.
      const roomName = roomType.Name || rate.Name || "Room";
      const key = `${roomName}|${boardCodeFor(rate)}|${rate.Refundable ? "R" : "N"}`;
      const held = best.get(key);
      if (!held || price < held.price) {
        best.set(key, { rate, roomName, bedText: roomType.BedTypeDesc || rate.bedTypeDesc, price });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => a.price - b.price)
    .slice(0, MAX_RATES_PER_HOTEL)
    .map((candidate) =>
      toOffer(candidate.rate, {
        hotelCode: hotel.HotelCode ?? hotelCode,
        roomName: candidate.roomName,
        bedText: candidate.bedText,
        intent,
        locale,
        countryCode,
      }),
    )
    .filter((offer): offer is TourmindOffer => offer !== null);
}

/**
 * A ceiling on top of the collapse, for a property with genuinely many rooms.
 *
 * Forty distinct room-and-board combinations is already more than any guest
 * reads; past that the page is a list, not a choice.
 */
const MAX_RATES_PER_HOTEL = 40;

function toOffer(
  rate: TmRateInfo,
  ctx: {
    hotelCode: string;
    roomName: string;
    bedText?: string;
    intent: SearchIntent;
    locale: Locale;
    countryCode?: string;
  },
): TourmindOffer | null {
  if (!rate.RateCode) return null;
  const pricing = buildPrice(rate, ctx.intent, ctx.locale);
  if (!pricing) return null;

  return {
    rateCode: rate.RateCode,
    hotelCode: ctx.hotelCode,
    roomName: ctx.roomName,
    bedText: ctx.bedText,
    boardCode: boardCodeFor(rate),
    price: pricing.price,
    net: pricing.net,
    supplierCurrency: pricing.supplierCurrency,
    refundable: Boolean(rate.Refundable),
    remainingLabel: remainingLabel(rate, ctx.locale),
    // The same field the scarcity phrase is derived from, kept as a number so
    // the checkout can refuse to sell more rooms than the rate holds.
    allotment: Math.max(0, Math.trunc(Number(rate.Allotment)) || 0),
    cancellation: buildCancellation(rate.CancelPolicyInfos, {
      refundable: Boolean(rate.Refundable),
      checkIn: ctx.intent.checkIn,
      total: pricing.price.total,
      net: pricing.net,
      supplierCurrency: pricing.supplierCurrency,
      displayCurrency: ctx.intent.currency,
      countryCode: ctx.countryCode,
      locale: ctx.locale,
    }),
  };
}

/**
 * Re-check a rate immediately before payment.
 *
 * They require the price we last saw, which is how they detect that the rate
 * moved. A changed total comes back as a new offer rather than an error, so the
 * caller compares and shows the customer the difference (E-08) instead of
 * failing the booking.
 */
export async function tourmindPrebook(
  offer: Pick<TourmindOffer, "rateCode" | "hotelCode" | "net">,
  intent: SearchIntent,
  locale: Locale,
  countryCode?: string,
): Promise<TourmindOffer | null> {
  const config = getTourmindConfig();
  const response = await tourmindPost<TmRoomAvailResponse>(
    TM.prebook,
    {
      HotelCodes: [Number(offer.hotelCode)],
      RateCode: offer.rateCode,
      TotalPrice: offer.net,
      CheckIn: intent.checkIn,
      CheckOut: intent.checkOut,
      PaxRooms: paxRooms(intent),
      Nationality: intent.nationality || config.nationality,
    },
    "prebook",
  );

  const rate = response.Hotels?.[0]?.RoomTypes?.[0]?.RateInfos?.[0];
  const roomType = response.Hotels?.[0]?.RoomTypes?.[0];
  if (!rate) return null;

  return toOffer(rate, {
    hotelCode: offer.hotelCode,
    roomName: roomType?.Name || rate.Name || "Room",
    bedText: roomType?.BedTypeDesc || rate.bedTypeDesc,
    intent,
    locale,
    countryCode,
  });
}

export interface TourmindBookingResult {
  /** Their own outcome, not our inference from having received an id. */
  status: "confirmed" | "pending" | "failed";
  reservationId: string;
  agentRefId: string;
}

/**
 * Create the booking.
 *
 * `AgentRefID` is derived from our own checkout session rather than generated,
 * because TourMind treats a repeated AgentRefID as a lookup rather than a new
 * reservation. That makes the call idempotent for free: a retry after a timeout
 * returns the original booking instead of creating a second one (E-16).
 */
export async function tourmindBook(input: {
  sessionId: string;
  hotelCode: string;
  rateCode: string;
  net: number;
  supplierCurrency: string;
  intent: SearchIntent;
  contact: { name: string; surname: string; email: string; phone?: string };
  /** Everyone staying, so their create call has a name for each room. */
  guests: BookingPax[];
  specialRequest?: string;
}): Promise<TourmindBookingResult> {
  const config = getTourmindConfig();
  const agentRefId = `${config.agentRefPrefix}-${input.sessionId}`.slice(0, 128);

  const response = await tourmindPost<TmCreateOrderResponse>(
    TM.book,
    {
      AgentRefID: agentRefId,
      HotelCode: Number(input.hotelCode),
      RateCode: input.rateCode,
      TotalPrice: input.net,
      CurrencyCode: input.supplierCurrency,
      CheckIn: input.intent.checkIn,
      CheckOut: input.intent.checkOut,
      PaxRooms: paxRoomsWithNames(input.intent, input.guests),
      ContactInfo: {
        FirstName: input.contact.name,
        LastName: input.contact.surname,
        Email: input.contact.email,
        // `PhoneNo`, not `Phone` — their field, and the one they read.
        PhoneNo: input.contact.phone,
      },
      SpecialRequest: input.specialRequest,
    },
    "booking",
  );

  if (!response.ReservationID) {
    // No reservation id and no Error means we cannot say whether it booked.
    // The caller must treat this as pending and reconcile, never as a failure.
    throw new Error("TOURMIND_INDETERMINATE");
  }

  /*
   * Their status decides ours.
   *
   * A reservation id alone was being read as a confirmation, and their own
   * documentation says otherwise: PENDING means poll Retrieve Booking for the
   * real outcome, and FAILED means it did not happen. Telling a guest a room is
   * confirmed on the strength of an id is the one mistake this flow must not
   * make.
   */
  const status = String(response.OrderInfo?.OrderStatus ?? response.OrderInfo?.Status ?? "").toUpperCase();
  return {
    reservationId: response.ReservationID,
    agentRefId,
    status: status === "CONFIRMED" ? "confirmed" : status === "FAILED" ? "failed" : "pending",
  };
}

/** Cancel by our own reference, which is the only key we are sure we hold. */
/**
 * What actually happened to a booking we could not read the outcome of.
 *
 * Their documentation is explicit: a create that timed out, errored, or came
 * back PENDING is resolved by asking here, keyed on our own AgentRefID. Without
 * it a pending booking stays pending for ever — which is worse than a failure,
 * because nobody knows whether there is a room.
 */
export async function tourmindRetrieve(agentRefId: string): Promise<{
  status: "confirmed" | "pending" | "cancelled" | "failed";
  reservationId?: string;
  hotelConfirmationNo?: string;
  checkIn?: string;
  checkOut?: string;
  roomCount?: number;
  bookedAt?: string;
  /** Guests as the supplier holds them, which is who the property expects. */
  guests?: { firstName: string; lastName: string; child: boolean }[];
} | null> {
  const response = await tourmindPost<TmSearchOrderResponse>(
    TM.retrieve,
    { AgentRefID: agentRefId },
    "booking",
  );
  const info = response.OrderInfo;
  if (!info) return null;
  const status = String(info.OrderStatus ?? "").toUpperCase();
  const guests = (info.PaxRooms ?? []).flatMap((room) =>
    (room.PaxNames ?? []).map((pax) => ({
      firstName: pax.FirstName,
      lastName: pax.LastName,
      child: pax.Type === "CHI",
    })),
  );

  return {
    status:
      status === "CONFIRMED"
        ? "confirmed"
        : status === "CANCELLED"
          ? "cancelled"
          : status === "FAILED"
            ? "failed"
            : "pending",
    reservationId: info.ReservationID,
    hotelConfirmationNo: info.HotelConfirmationNo,
    checkIn: info.CheckIn,
    checkOut: info.CheckOut,
    roomCount: info.RoomCount,
    bookedAt: info.BookingTime,
    guests: guests.length ? guests : undefined,
  };
}

export async function tourmindCancel(agentRefId: string): Promise<boolean> {
  const response = await tourmindPost<TmCancelOrderResponse>(
    TM.cancel,
    { AgentRefID: agentRefId },
    "booking",
  );
  return !response.Error;
}
