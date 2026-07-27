import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { buildHotel, getHotelSeed } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { hash01 } from "@/lib/server/pricing";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import {
  getBooking,
  getOffer,
  getSession,
  linkSupplierReference,
  peekIdempotency,
  pushNotification,
  saveBooking,
  saveSession,
  setIdempotency,
} from "@/lib/server/store";
import { confirmBooking } from "@/lib/server/hotelbeds/operations";
import { HotelbedsError } from "@/lib/server/hotelbeds/client";
import { logSupplierError, mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { getHotelContent } from "@/lib/server/hotelbeds/content";
import type { Booking, BookingGuest, Locale, RoomAllocation, ServiceEvent } from "@/lib/types";

interface Body {
  checkoutSessionId: string;
  idempotencyKey: string;
  contact: { email: string; phone: string; language: Locale };
  lead: { firstName: string; surname: string; nationality?: string };
  guests: { roomIndex: number; type: "adult" | "child"; firstName: string; surname?: string; age?: number }[];
  requests?: { arrivalTime?: string; bedPreference?: string; accessibilityRequest?: string; remarks?: string };
  billing?: Record<string, string>;
  consents: { terms: boolean; cancellation: boolean; localFees: boolean; mandatory: boolean; marketing: boolean };
  payment: { method: string; token: string; threeDsStatus: "notRequired" | "passed" | "abandoned" | "failed" };
}

function reference(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "NZ-";
  for (let i = 0; i < 3; i++) out += letters[Math.floor(Math.random() * letters.length)];
  out += "-";
  for (let i = 0; i < 4; i++) out += Math.floor(Math.random() * 10);
  return out;
}

function guestList(rooms: RoomAllocation[], body: Body): BookingGuest[] {
  const guests: BookingGuest[] = [
    {
      roomIndex: 0,
      type: "adult",
      firstName: sanitize(body.lead.firstName, 40),
      surname: sanitize(body.lead.surname, 40),
      nationality: body.lead.nationality,
      lead: true,
    },
  ];
  for (const g of body.guests ?? []) {
    guests.push({
      roomIndex: g.roomIndex,
      type: g.type,
      firstName: sanitize(g.firstName, 40),
      surname: sanitize(g.surname ?? body.lead.surname, 40),
      age: g.age,
    });
  }
  return guests;
}

/**
 * POST /api/bookings — single idempotent booking orchestration (§9.3, E-16).
 *
 * Contract:
 *  - the same idempotency key never creates a second order
 *  - the response is accepted / confirmed / pending / failed, never ambiguous
 *  - a pending outcome is reconciled server-side; the client must not retry
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<Body>(req);
  if (!body?.checkoutSessionId || !body.idempotencyKey) {
    return fail("validation", "error.validation", locale, { status: 400 });
  }

  // Replay of the same intent returns the original order (double-click, back/refresh).
  const existingRef = peekIdempotency(body.idempotencyKey);
  if (existingRef) {
    const previous = await getBooking(existingRef);
    if (previous) return ok({ booking: previous, replay: true, emailDelivered: true });
  }

  const session = getSession(body.checkoutSessionId);
  if (!session) {
    return fail("availabilityChanged", "checkout.expired", locale, { status: 409, action: "selectAlternative" });
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "checkout.expired", locale, { status: 409, action: "selectAlternative" });
  }

  const fields: Record<string, string> = {};
  if (!isEmail(body.contact?.email ?? "")) fields.email = locale === "ar" ? "أدخل بريدًا صحيحًا." : "Enter a valid email address.";
  if (!body.contact?.phone || body.contact.phone.replace(/\D/g, "").length < 7) {
    fields.phone = locale === "ar" ? "أدخل رقم جوال صحيحًا." : "Enter a valid mobile number.";
  }
  if (!body.lead?.firstName || !body.lead?.surname) {
    fields.lead = locale === "ar" ? "اسم الضيف الرئيسي مطلوب." : "The lead guest name is required.";
  }
  if (!body.consents?.terms || !body.consents?.cancellation) {
    fields.consents = locale === "ar" ? "يجب قبول الشروط وسياسة الإلغاء." : "Booking terms and the cancellation policy must be accepted.";
  }
  if (Object.keys(fields).length) {
    return fail("validation", "error.validation", locale, { status: 422, fields });
  }

  // Payment outcomes are decided before any supplier order is submitted (E-12).
  if (scenario === "paymentDeclined" || body.payment?.threeDsStatus === "failed") {
    return fail("paymentActionNeeded", "error.paymentActionNeeded", locale, {
      status: 402,
      action: "changeMethod",
      message:
        locale === "ar"
          ? "رفض البنك هذه العملية. لم يُنشأ أي حجز ولم يُخصم أي مبلغ. جرّب وسيلة دفع أخرى."
          : "Your bank declined this payment. No booking was created and nothing was charged. Try another method.",
    });
  }
  if (scenario === "threeDsTimeout" || body.payment?.threeDsStatus === "abandoned") {
    return fail("paymentActionNeeded", "checkout.threeDs", locale, {
      status: 402,
      action: "retry",
      retryable: true,
      message:
        locale === "ar"
          ? "لم تكتمل خطوة التحقق البنكي. تحققنا من حالة الدفع ولم يُخصم أي مبلغ — يمكنك المحاولة بأمان."
          : "The bank verification step was not completed. We checked the payment state and nothing was captured — you can safely try again.",
    });
  }

  const offer = getOffer(session.offerId);
  const seed = getHotelSeed(session.hotelSlug);
  const dest = seed ? getDestination(seed.destinationId) : undefined;
  const hotel = seed ? buildHotel(seed, locale) : null;
  const liveContent = offer?.hotelbeds ? await getHotelContent(offer.hotelbeds.hotelCode) : null;

  const hotelName = hotel?.name ?? offer?.hotelName ?? liveContent?.name?.content ?? session.hotelName;
  const hotelAddress = hotel
    ? `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.country}`
    : [liveContent?.address?.content, liveContent?.city?.content, liveContent?.countryCode]
        .filter(Boolean)
        .join(", ");
  const hotelPhone =
    liveContent?.phones?.find((phone) => phone.phoneType?.includes("HOTEL"))?.phoneNumber ??
    liveContent?.phones?.[0]?.phoneNumber ??
    (seed && dest
      ? `+${dest.countryCode === "SA" ? "966" : dest.countryCode === "AE" ? "971" : dest.countryCode === "QA" ? "974" : "90"} ${Math.floor(hash01(seed.slug) * 900000000 + 100000000)}`
      : "");
  const hotelCoordinates = hotel?.coordinates ?? {
    lat: liveContent?.coordinates?.latitude ?? 0,
    lng: liveContent?.coordinates?.longitude ?? 0,
  };

  const ref = reference();
  setIdempotency(body.idempotencyKey, ref);

  const now = new Date().toISOString();
  const timeline: ServiceEvent[] = [
    { at: now, code: "payment.authorised", label: locale === "ar" ? "تم تفويض الدفع" : "Payment authorised", actor: "platform" },
    { at: now, code: "booking.submitted", label: locale === "ar" ? "أُرسل الحجز للتأكيد" : "Booking submitted for confirmation", actor: "platform" },
  ];

  const requests: string[] = [];
  if (body.requests?.arrivalTime) requests.push(`${locale === "ar" ? "الوصول" : "Arrival"}: ${sanitize(body.requests.arrivalTime, 30)}`);
  if (body.requests?.bedPreference) requests.push(`${locale === "ar" ? "السرير" : "Bed"}: ${sanitize(body.requests.bedPreference, 30)}`);
  if (body.requests?.accessibilityRequest) requests.push(sanitize(body.requests.accessibilityRequest, 200));
  if (body.requests?.remarks) requests.push(sanitize(body.requests.remarks, 300));

  let pending = scenario === "bookingPending";
  let rejected = scenario === "bookingFailed";
  let supplierReference: string | undefined;

  /**
   * Live supply: the payment is authorised, so the supplier order is submitted
   * exactly once. Three outcomes matter and each maps to a distinct customer
   * state (§6.5):
   *  - confirmed → the supplier returned a reference
   *  - uncertain (timeout / network) → pending, reconciled server-side, never
   *    resubmitted from the client (E-14)
   *  - rejected → failed, with the authorisation released (E-12)
   */
  if (offer?.hotelbeds && !pending && !rejected) {
    const guests = guestList(session.rooms, body);
    try {
      const confirmation = await confirmBooking({
        binding: offer.hotelbeds,
        holder: { name: guests[0].firstName, surname: guests[0].surname },
        rooms: session.rooms,
        guests,
        clientReference: ref,
        remark: requests.join(" | "),
      });
      supplierReference = confirmation.supplierReference;
      if (confirmation.status === "PENDING") pending = true;
      if (confirmation.status === "CANCELLED") rejected = true;
    } catch (error) {
      logSupplierError("bookings.confirm", error, ref);
      const uncertain =
        error instanceof HotelbedsError && (error.kind === "timeout" || error.kind === "network");

      if (uncertain) {
        // The order may exist. It is never retried: it becomes a pending
        // booking and reconciliation resolves it.
        pending = true;
      } else {
        const mapped = mapSupplierError(error, locale);
        // Nothing was captured, so this is a clean failure the customer can act
        // on rather than an order in an unknown state.
        return fail(mapped.category, mapped.messageKey, locale, {
          status: mapped.status,
          action: mapped.action,
          retryable: mapped.retryable,
          message: mapped.message,
        });
      }
    }
  }

  const payNow = session.paymentTiming === "payNow";
  const dueAtProperty = session.price.payAtProperty.reduce((s, c) => s + c.amount, 0);

  const booking: Booking = {
    reference: ref,
    status: rejected ? "failed" : pending ? "pending" : "confirmed",
    statusDetail: rejected
      ? locale === "ar"
        ? "رفض العقار الحجز بعد التفويض. تم الإفراج عن مبلغ التفويض."
        : "The property could not accept the booking after authorisation. The authorisation has been released."
      : pending
        ? locale === "ar"
          ? "جارٍ التحقق من التأكيد مع العقار."
          : "We are verifying the confirmation with the property."
        : locale === "ar"
          ? "مؤكد من العقار."
          : "Confirmed by the property.",
    hotelSlug: session.hotelSlug,
    hotelName,
    hotelAddress,
    hotelPhone,
    hotelCoordinates,
    checkIn: session.checkIn,
    checkOut: session.checkOut,
    roomName: session.roomName,
    boardLabel: session.boardLabel,
    rooms: session.rooms,
    guests: guestList(session.rooms, body),
    contact: {
      email: sanitize(body.contact.email, 120).toLowerCase(),
      phone: sanitize(body.contact.phone, 30),
      language: body.contact.language ?? locale,
    },
    price: session.price,
    paidAmount: rejected ? 0 : payNow ? session.price.total : 0,
    dueAtProperty: payNow ? dueAtProperty : session.price.total + dueAtProperty,
    paymentTiming: session.paymentTiming,
    paymentMethodLabel: sanitize(body.payment?.method ?? "card", 30),
    cancellation: session.cancellation,
    comments: session.comments,
    specialRequests: requests,
    capabilities: {
      ...session.capabilities,
      cancelAllowed: !rejected,
    },
    voucherVersion: 1,
    createdAt: now,
    updatedAt: now,
    timeline: rejected
      ? [
          ...timeline,
          { at: now, code: "booking.rejected", label: locale === "ar" ? "رُفض الحجز" : "Booking rejected by property", actor: "platform" },
          { at: now, code: "payment.released", label: locale === "ar" ? "أُفرج عن التفويض" : "Payment authorisation released", actor: "platform" },
        ]
      : pending
        ? [...timeline, { at: now, code: "booking.reconciling", label: locale === "ar" ? "جارٍ المطابقة" : "Reconciling with the property", actor: "platform" }]
        : [...timeline, { at: now, code: "booking.confirmed", label: locale === "ar" ? "تم تأكيد الحجز" : "Booking confirmed", actor: "platform" }],
    reconciliation: pending ? { startedAt: now, attempts: 0, nextCheckMs: 4000 } : undefined,
  };

  await saveBooking(booking, booking.contact.email);
  if (supplierReference) {
    // Held apart from the customer record: the platform reference is the only
    // identifier the customer ever sees (§8.5).
    linkSupplierReference(booking.reference, supplierReference, "hotelbeds");
  }
  saveSession({ ...session, idempotencyKeys: [...session.idempotencyKeys, body.idempotencyKey] });

  pushNotification(booking.contact.email, {
    id: `nt_${Math.random().toString(36).slice(2, 9)}`,
    kind: "booking",
    title: pending
      ? locale === "ar" ? "جارٍ تأكيد حجزك" : "We are confirming your booking"
      : rejected
        ? locale === "ar" ? "تعذّر إتمام الحجز" : "Booking could not be completed"
        : locale === "ar" ? "تم تأكيد الحجز" : "Booking confirmed",
    body: `${booking.hotelName} · ${booking.reference}`,
    href: `/trips/${booking.reference}`,
    createdAt: now,
    read: false,
  });

  return ok({
    booking,
    /** E-15: a failed notification never changes booking status. */
    emailDelivered: scenario !== "emailFailure",
    offerExpired: !offer,
  });
}
