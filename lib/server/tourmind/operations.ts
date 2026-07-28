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
  refundable: boolean;
}

/**
 * Availability for one property.
 *
 * TourMind takes up to twenty hotel codes per call, but this asks for one: the
 * detail page is the only place we have a property in hand, and batching would
 * mean holding rates for hotels nobody opened.
 */
export async function tourmindAvailability(
  hotelCode: string,
  intent: SearchIntent,
  locale: Locale,
  countryCode?: string,
): Promise<TourmindOffer[]> {
  const config = getTourmindConfig();
  const response = await tourmindPost<TmHotelDetailResponse>(TM.search, {
    HotelCodes: [Number(hotelCode)],
    CheckIn: intent.checkIn,
    CheckOut: intent.checkOut,
    PaxRooms: paxRooms(intent),
    Nationality: intent.nationality || config.nationality,
    IsDailyPrice: false,
  });

  const hotel = response.Hotels?.[0];
  if (!hotel) return [];

  const offers: TourmindOffer[] = [];
  for (const roomType of hotel.RoomTypes ?? []) {
    for (const rate of roomType.RateInfos ?? []) {
      const offer = toOffer(rate, {
        hotelCode: hotel.HotelCode ?? hotelCode,
        // Their aggregated name is cleaner; the sub-room name is more accurate.
        // Prefer the aggregated one and fall back, matching their own advice.
        roomName: roomType.Name || rate.Name || "Room",
        bedText: roomType.BedTypeDesc || rate.bedTypeDesc,
        intent,
        locale,
        countryCode,
      });
      if (offer) offers.push(offer);
    }
  }
  return offers;
}

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
    cancellation: buildCancellation(rate.CancelPolicyInfos, {
      refundable: Boolean(rate.Refundable),
      checkIn: ctx.intent.checkIn,
      total: pricing.price.total,
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
  const response = await tourmindPost<TmRoomAvailResponse>(TM.prebook, {
    HotelCodes: [Number(offer.hotelCode)],
    RateCode: offer.rateCode,
    TotalPrice: offer.net,
    CheckIn: intent.checkIn,
    CheckOut: intent.checkOut,
    PaxRooms: paxRooms(intent),
    Nationality: intent.nationality || config.nationality,
  });

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
      PaxRooms: paxRooms(input.intent),
      ContactInfo: {
        FirstName: input.contact.name,
        LastName: input.contact.surname,
        Email: input.contact.email,
        Phone: input.contact.phone,
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
  return { reservationId: response.ReservationID, agentRefId };
}

/** Cancel by our own reference, which is the only key we are sure we hold. */
export async function tourmindCancel(agentRefId: string): Promise<boolean> {
  const response = await tourmindPost<TmCancelOrderResponse>(
    TM.cancel,
    { AgentRefID: agentRefId },
    "booking",
  );
  return !response.Error;
}
