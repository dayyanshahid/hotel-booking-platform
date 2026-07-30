// Importing this module from a client component is a build error:
// Performs booking and cancellation calls.
import "server-only";

import type {
  BookingGuest,
  CancellationPolicy,
  CurrencyCode,
  Locale,
  PriceStack,
  RoomAllocation,
} from "@/lib/types";
import { convertCurrency, isSupportedCurrency } from "@/lib/format";
import { applyMarkup } from "../markup";
import { hotelbeds, HotelbedsError } from "./client";
import { getHotelbedsConfig } from "./config";
import { getHotelContent } from "./content";
import { buildCancellationFromPolicies, buildRateComments } from "./adapter";
import { toNumber, type HbBookingResponse, type HbCheckRateResponse, type HbRate } from "./types";
import type { HotelbedsOfferBinding } from "../store";

/**
 * CheckRate, booking confirmation and cancellation against the live API.
 *
 * The supplier's documented workflow is exactly one availability call, then one
 * CheckRate only when the rate requires it, then one booking call. That
 * sequence is enforced by the callers; this module performs the individual
 * operations and translates the results into canonical shapes.
 */

export interface LiveRateResult {
  price: PriceStack;
  cancellation: CancellationPolicy;
  boardLabel: string;
  /** The refreshed key, which must replace the previous one before booking. */
  rateKey: string;
  net: number;
  available: boolean;
}

function priceFromRate(
  rate: HbRate,
  supplierCurrency: CurrencyCode,
  display: CurrencyCode,
  previous: PriceStack,
  locale: Locale,
): PriceStack {
  const net = toNumber(rate.net, 0);
  const total = convertCurrency(applyMarkup(net).total, supplierCurrency, display);
  const ar = locale === "ar";

  const included = previous.includedCharges.length
    ? previous.includedCharges
    : [
        {
          code: "netInclusive",
          label: ar ? "الضرائب والرسوم المشمولة" : "Included taxes and charges",
          amount: 0,
          basis: "included" as const,
        },
      ];

  const payAtProperty = (rate.taxes?.taxes ?? [])
    .filter((tax) => tax.included === false)
    .map((tax, index) => ({
      code: `tax-local-${index}`,
      label: ar ? "ضرائب ورسوم محلية" : "Local taxes and fees",
      amount: convertCurrency(
        toNumber(tax.clientAmount ?? tax.amount, 0),
        isSupportedCurrency(tax.clientCurrency ?? tax.currency)
          ? ((tax.clientCurrency ?? tax.currency) as CurrencyCode)
          : supplierCurrency,
        display,
      ),
      basis: "payAtProperty" as const,
      estimated: false,
    }))
    .filter((line) => line.amount > 0);

  const includedSum = included.reduce((sum, line) => sum + line.amount, 0);

  return {
    ...previous,
    currency: display,
    total,
    nightlyAverage: Math.round(total / Math.max(1, previous.nights)),
    base: Math.max(0, total - includedSum),
    includedCharges: included,
    payAtProperty: payAtProperty.length ? payAtProperty : previous.payAtProperty,
    // A refreshed rate is a fresh quote; a stale comparison is not carried over.
    strikeTotal: undefined,
    discountLabel: undefined,
  };
}

/** POST /checkrates — one rateKey per call, per the supplier's integration rules. */
export async function checkRate(
  binding: HotelbedsOfferBinding,
  previous: { price: PriceStack; cancellation: CancellationPolicy; boardLabel: string },
  options: { checkIn: string; locale: Locale; displayCurrency: CurrencyCode },
): Promise<LiveRateResult> {
  const response = await hotelbeds.booking<HbCheckRateResponse>("/checkrates", {
    method: "POST",
    kind: "search",
    body: { rooms: [{ rateKey: binding.rateKey }] },
    retries: 1,
  });

  const hotel = response.hotel;
  const rate = hotel?.rooms?.[0]?.rates?.[0];
  if (!rate || !rate.rateKey) {
    return {
      price: previous.price,
      cancellation: previous.cancellation,
      boardLabel: previous.boardLabel,
      rateKey: binding.rateKey,
      net: binding.net,
      available: false,
    };
  }

  const supplierCurrency: CurrencyCode = isSupportedCurrency(hotel?.currency ?? binding.supplierCurrency)
    ? ((hotel?.currency ?? binding.supplierCurrency) as CurrencyCode)
    : "EUR";
  const content = await getHotelContent(binding.hotelCode);
  const price = priceFromRate(rate, supplierCurrency, options.displayCurrency, previous.price, options.locale);

  return {
    price,
    cancellation: buildCancellationFromPolicies(rate.cancellationPolicies, {
      checkIn: options.checkIn,
      total: price.total,
      supplierCurrency,
      displayCurrency: options.displayCurrency,
      countryCode: content?.countryCode,
      locale: options.locale,
    }),
    boardLabel: rate.boardName ?? previous.boardLabel,
    rateKey: rate.rateKey,
    net: toNumber(rate.net, binding.net),
    available: true,
  };
}

/* ----------------------------------------------------------------- booking */

export interface ConfirmBookingInput {
  /**
   * One binding per room, in room order.
   *
   * Their `/bookings` takes a `rooms` array and always did; we sent one entry.
   * A party of three therefore had one room booked and two silently dropped —
   * the customer's card charged for the total, the supplier holding a third of
   * it. Each entry carries its own rateKey, and the paxes are split across them
   * by `roomId`, which is how the supplier knows who sleeps where.
   *
   * Sending them as one call is also what makes all-or-nothing free: the order
   * is accepted whole or refused whole, so there is no half-booked state to
   * unwind and no second reference to reconcile.
   */
  bindings: HotelbedsOfferBinding[];
  holder: { name: string; surname: string };
  rooms: RoomAllocation[];
  guests: BookingGuest[];
  /** The platform's own reference, sent for supplier-side reconciliation. */
  clientReference: string;
  remark?: string;
}

export interface ConfirmBookingResult {
  supplierReference: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | string;
  supplierTotalNet: number;
  supplierCurrency: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  roomName?: string;
  boardName?: string;
  cancellationPolicies?: HbRate["cancellationPolicies"];
  rateComments?: string;
}

/**
 * POST /bookings.
 *
 * Paxes are sent per room with the lead guest first. The `tolerance` field lets
 * the supplier confirm a small price movement without failing the booking; the
 * customer-facing acceptance gate for material change has already run before
 * this point (§6.4).
 */
export async function confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
  const config = getHotelbedsConfig();

  const pax = (guest: BookingGuest, roomId: number) => ({
    roomId,
    type: guest.type === "child" ? "CH" : "AD",
    ...(guest.type === "child" && guest.age != null ? { age: guest.age } : {}),
    name: guest.firstName,
    surname: guest.surname,
  });

  /*
   * A room per binding, carrying only the guests assigned to it.
   *
   * `roomId` is the supplier's own index into this array, so it is derived from
   * the position here rather than copied from `roomIndex`. Sending every guest
   * against every room — which is what one flat pax list did — over-occupies
   * each room, and an over-occupied room is either refused or accepted and
   * discovered by the guest at the desk.
   *
   * A room with nobody named to it still needs an occupant, because the supplier
   * will not take it otherwise. The holder stands in, which is also who the
   * hotel would ask for at check-in.
   */
  const rooms = input.bindings.map((binding, index) => {
    const roomId = index + 1;
    const inRoom = input.guests.filter((guest) => guest.roomIndex === index);
    const occupants = inRoom.length ? inRoom : input.guests.slice(0, 1);
    return {
      rateKey: binding.rateKey,
      paxes: occupants.map((guest) => pax(guest, roomId)),
    };
  });

  const response = await hotelbeds.booking<HbBookingResponse>("/bookings", {
    method: "POST",
    kind: "booking",
    body: {
      holder: { name: input.holder.name, surname: input.holder.surname },
      rooms,
      clientReference: `${config.clientReference}-${input.clientReference}`.slice(0, 40),
      remark: input.remark?.slice(0, 250),
      tolerance: config.tolerancePercent,
    },
  });

  const booking = response.booking;
  if (!booking?.reference) {
    throw new HotelbedsError("supplierError", "The supplier did not return a booking reference.", {
      retryable: false,
    });
  }

  const rate = booking.hotel?.rooms?.[0]?.rates?.[0];
  return {
    supplierReference: booking.reference,
    status: booking.status ?? "CONFIRMED",
    supplierTotalNet: toNumber(booking.totalNet ?? booking.hotel?.totalNet, 0),
    supplierCurrency: booking.currency ?? booking.hotel?.currency ?? "EUR",
    hotelName: booking.hotel?.name,
    checkIn: booking.hotel?.checkIn,
    checkOut: booking.hotel?.checkOut,
    roomName: booking.hotel?.rooms?.[0]?.name,
    boardName: rate?.boardName,
    cancellationPolicies: rate?.cancellationPolicies,
    rateComments: rate?.rateComments,
  };
}

/**
 * Reconciliation lookup by our own client reference.
 *
 * When a booking call times out we hold no supplier reference, so the only safe
 * way to learn whether the order exists is to ask the supplier for orders
 * carrying our reference — never to submit the booking again (§6.5, E-14).
 */
export async function findSupplierBookingByClientReference(
  clientReference: string,
): Promise<HbBookingResponse["booking"] | null> {
  const config = getHotelbedsConfig();
  const full = `${config.clientReference}-${clientReference}`.slice(0, 40);
  try {
    const response = await hotelbeds.booking<{ bookings?: HbBookingResponse["booking"][] }>("/bookings", {
      method: "GET",
      kind: "search",
      query: { clientReference: full, from: 1, to: 5 },
      retries: 1,
    });
    return response.bookings?.[0] ?? null;
  } catch {
    return null;
  }
}

/** GET /bookings/{reference} — used for reconciliation after an uncertain call. */
export async function getSupplierBooking(reference: string): Promise<HbBookingResponse["booking"] | null> {
  try {
    const response = await hotelbeds.booking<HbBookingResponse>(`/bookings/${encodeURIComponent(reference)}`, {
      method: "GET",
      kind: "search",
      retries: 1,
    });
    return response.booking ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ cancellation */

export interface CancellationOutcome {
  /** Fee in the supplier's currency. */
  feeNet: number;
  supplierCurrency: string;
  status: string;
  cancellationReference?: string;
}

/**
 * DELETE /bookings/{reference}?cancellationFlag=...
 *
 * SIMULATION returns the fee that would apply without touching the booking —
 * exactly the live quote §6.6 requires before the customer confirms.
 * CANCELLATION performs it.
 */
async function cancellationCall(
  reference: string,
  flag: "SIMULATION" | "CANCELLATION",
): Promise<CancellationOutcome> {
  const config = getHotelbedsConfig();
  const response = await hotelbeds.booking<HbBookingResponse>(
    `/bookings/${encodeURIComponent(reference)}`,
    {
      method: "DELETE",
      kind: flag === "CANCELLATION" ? "booking" : "search",
      query: { cancellationFlag: flag, language: config.language },
      retries: 1,
    },
  );

  const booking = response.booking;
  const explicitFee = toNumber(booking?.hotel?.cancellationAmount, NaN);
  const fee = Number.isFinite(explicitFee)
    ? explicitFee
    : // Some responses express the outcome as the amount still owed rather than
      // an explicit cancellation amount.
      toNumber(booking?.pendingAmount, 0);

  return {
    feeNet: fee,
    supplierCurrency: booking?.currency ?? booking?.hotel?.currency ?? "EUR",
    status: booking?.status ?? (flag === "CANCELLATION" ? "CANCELLED" : "CONFIRMED"),
    cancellationReference: booking?.cancellationReference,
  };
}

export function simulateCancellation(reference: string): Promise<CancellationOutcome> {
  return cancellationCall(reference, "SIMULATION");
}

export function performCancellation(reference: string): Promise<CancellationOutcome> {
  return cancellationCall(reference, "CANCELLATION");
}

export { buildRateComments };
