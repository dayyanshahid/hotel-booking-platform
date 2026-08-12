import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { buildHotel, getHotelSeed } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import { hash01 } from "@/lib/server/pricing";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import {
  getBooking,
  loadOffer,
  getSession,
  linkSupplierReference,
  peekIdempotency,
  pushNotification,
  rememberOffer,
  republishOffer,
  saveBooking,
  saveSession,
  setIdempotency,
} from "@/lib/server/store";
import { confirmBooking } from "@/lib/server/hotelbeds/operations";
import { HotelbedsError } from "@/lib/server/hotelbeds/client";
import { logSupplierError, mapSupplierError } from "@/lib/server/hotelbeds/errors";
import { getHotelContent } from "@/lib/server/hotelbeds/content";
import { tourmindBook, tourmindPrebook } from "@/lib/server/tourmind/operations";
import { isIndeterminate, logTourmindError, mapTourmindError } from "@/lib/server/tourmind/errors";
import { activeAgent } from "@/lib/agency/session";
import { canAtLeast, capabilitiesOf } from "@/lib/agency/types";
import { canHold, reserveForHold } from "@/lib/agency/holds";
import { commitBooking, hasHeadroom, priceForAgency, type AgencyCommit } from "@/lib/agency/bookings";
import { agentHeadroom } from "@/lib/agency/store";
import { saveAgencyBooking } from "@/lib/agency/store";
import { countryForOffer } from "@/lib/agency/context";
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
  /**
   * Place this as a hold rather than issuing it.
   *
   * Trade only, and only on a refundable rate whose free window is still open —
   * the supplier order is identical either way, because neither supplier offers
   * anything else. What differs is that the credit is reserved rather than
   * charged, and something will cancel it before the deadline unless an issuer
   * confirms it first.
   */
  hold?: boolean;
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

  /*
   * Never more names than the rooms were priced for.
   *
   * `guests` means everyone *except* the lead, who is sent separately. Both of
   * our clients build it that way and neither says so anywhere, so a caller
   * that also includes the lead ends up with one occupant more than the
   * allocation — the voucher prints the lead twice, and the extra name is sent
   * to the supplier, where an over-occupied room is either refused or accepted
   * and discovered by the guest at the desk.
   *
   * Only the upper bound is enforced. Fewer names is a real and legitimate
   * case: a booking is often made before everyone travelling is known, and the
   * lead alone is enough for both suppliers. More names than beds is never
   * anything but a mistake, and it is not recoverable after the order is sent.
   */
  const bedsPriced = session.rooms.reduce(
    (sum, room) => sum + room.adults + room.childrenAges.length,
    0,
  );
  if (1 + (body.guests?.length ?? 0) > bedsPriced) {
    fields.guests =
      locale === "ar"
        ? `عدد الأسماء أكثر من الغرف المحجوزة: الحد الأقصى ${bedsPriced} بما في ذلك الضيف الرئيسي.`
        : `More names than the rooms were booked for — at most ${bedsPriced}, including the lead guest.`;
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

  /*
   * Every room of the checkout, and the offer behind each.
   *
   * A session is one property and one stay, one property is served by one source,
   * and both suppliers take every room of an order in a single call — so these
   * all belong to the same supplier and go out together. That is what makes
   * all-or-nothing free rather than a rollback: the order is accepted whole or
   * refused whole, and there is no half-booked state to unwind.
   *
   * A line whose offer has fallen out of the store is refused before anything is
   * charged. Booking the rooms that survived would leave a party split across a
   * reservation and a gap, which is the outcome E-17 exists to prevent.
   */
  const lineOffers = await Promise.all(
    session.lines.map(async (line) => ({ line, offer: await loadOffer(line.offerId) })),
  );
  const lostLine = lineOffers.find((entry) => !entry.offer);

  /*
   * E-10 and E-11 at the moment they actually hurt.
   *
   * Both scenarios were honoured at recheck and silently ignored here, so the
   * one place a rate going away costs something — after the guest form, with
   * an authorisation ready to go — could not be demonstrated or regression
   * tested at all. The switch existed and did nothing, which is worse than not
   * having it: a run of the edge-case harness reported the booking endpoint as
   * handling a sold-out rate when what it had actually done was sell it.
   */
  const soldOut = scenario === "rateSoldOut" || scenario === "offerExpired";

  if (lostLine || soldOut) {
    return fail("availabilityChanged", "error.availabilityChanged", locale, {
      status: 409,
      action: "selectAlternative",
    });
  }
  const offer = lineOffers[0].offer;
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

  /*
   * Trade bookings pay on account, not by card.
   *
   * The gate has to close here — after validation, before any supplier order
   * exists. An agency told "insufficient credit" once the room is already held
   * has promised a stay it now has to cancel, in front of the customer who
   * asked for it. Checking first costs nothing and makes the refusal honest.
   */
  const agent = await activeAgent();
  /*
   * A view-only account cannot reach the supplier at all.
   *
   * The portal hides the button, which is a courtesy; this is the rule. An
   * account that may only browse must not be able to create a supplier order by
   * replaying a request, and the check belongs on the same side of the wire as
   * the credit gate — before anything is held.
   */
  if (agent && !canAtLeast(agent.permission ?? "issue", "booking")) {
    return fail("accountSecurity", "agency.notPermitted", locale, { status: 403 });
  }

  /*
   * The two rights that sit beside the ladder rather than on it.
   *
   * Checked here, on the same side of the wire as the credit gate and the
   * view-only rule, because a permission enforced only by a disabled button is
   * a suggestion. The screen hides what an agent may not do as a courtesy; this
   * is what makes it true when somebody replays the request.
   */
  const rights = agent ? capabilitiesOf(agent) : { hold: true, nonRefundable: true };

  if (agent && body.hold && !rights.hold) {
    /*
     * Refused here rather than beside the hold window further down, which runs
     * after the supplier order exists. A refusal that arrives once the room is
     * booked is not a refusal; it is a booking plus an apology.
     *
     * Kept separate from "this rate cannot be held" for the same reason the
     * credit gate is separate: the two lead somewhere different. One means find
     * another rate, the other means find the person who is allowed.
     */
    return fail("policyRestriction", "agency.holdNotPermitted", locale, { status: 403, action: "contactSupport" });
  }

  if (agent && !rights.nonRefundable && !session.cancellation.refundable) {
    /*
     * The right the ladder could not express.
     *
     * An agent may be trusted to spend the agency's credit and still not be
     * trusted to spend it on a room nobody can hand back — that is the whole
     * distinction, and it can only be checked against the rate in front of us,
     * so it lives here rather than in the session gate.
     */
    return fail("policyRestriction", "agency.nonRefundableNotPermitted", locale, { status: 403, action: "selectAlternative" });
  }
  let agencyCommit: AgencyCommit | null = null;
  if (agent) {
    agencyCommit = await priceForAgency(
      session.price.total,
      session.price.currency,
      agent.agencyId,
      countryForOffer(offer),
      agent.markup,
    );
    if (!agencyCommit) {
      return fail("policyRestriction", "agency.suspended", locale, { status: 403, action: "contactSupport" });
    }
    /*
     * The agent's own allocation, checked before the agency's.
     *
     * Both refusals mean "not enough credit" and they send the agent to
     * different people: the agency line is a conversation with us, a sub-agent's
     * allocation is a conversation with their own manager. Told apart here
     * because an agent who reads "your agency is out of credit" when their
     * branch simply capped them at 2,000 will ring the wrong number.
     */
    const mine = await agentHeadroom(agent.agencyId, agent.agentId);
    if (mine && agencyCommit.cost > mine.available) {
      return fail("policyRestriction", "agency.allocationExceeded", locale, {
        status: 402,
        action: "contactSupport",
        message:
          locale === "ar"
            ? "هذا الحجز يتجاوز حد الائتمان المخصص لحسابك. لم يُنشأ أي حجز."
            : "This booking would exceed the credit allocated to your account. Nothing was booked.",
      });
    }
    if (!(await hasHeadroom(agent.agencyId, agencyCommit.cost))) {
      return fail("policyRestriction", "agency.creditExceeded", locale, {
        status: 402,
        action: "contactSupport",
        message:
          locale === "ar"
            ? "هذا الحجز يتجاوز حد الائتمان المتاح لوكالتك. لم يُنشأ أي حجز."
            : "This booking would exceed your agency's available credit. Nothing was booked.",
      });
    }
  }

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
        /*
         * A binding per room, in room order — the supplier's own `rooms` array.
         *
         * Repeated per room the line covers, because Hotelbeds prices per room
         * and a rateKey buys one of them. A line covering more than one is a
         * TourMind line, which never reaches this branch.
         */
        bindings: lineOffers.flatMap((entry) =>
          entry.line.occupancies.map(() => entry.offer!.hotelbeds!),
        ),
        holder: { name: guests[0].firstName, surname: guests[0].surname },
        rooms: session.lines.flatMap((sessionLine) => sessionLine.occupancies),
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

  /*
   * TourMind, on the same terms. Their create call is idempotent on our own
   * AgentRefID, so a retry after a timeout returns the original order rather
   * than making a second one — but the outcome is still unknown to us at that
   * moment, so it becomes pending and reconciliation resolves it.
   */
  let tourmindAgentRef: string | null = null;
  if (offer?.tourmind && !pending && !rejected) {
    const guests = guestList(session.rooms, body);

    /*
     * A fresh supplier session, immediately before the order.
     *
     * TourMind refuses CreateOrder outright unless a CheckRoomRate has just run
     * for the rate — their code 102, "no valid session, please get the lastest
     * price via CheckRoomRate message". The trade path happened to satisfy this
     * by accident, because an agent rechecks before committing credit. The
     * consumer checkout goes straight from a frozen price to the order, so
     * every TourMind booking on the public site failed, as a validation error
     * about dates and guests that no customer could act on and that named
     * nothing they had got wrong.
     *
     * Done here rather than asked of the client: a supplier's session rule is
     * the server's contract to keep, and a caller that forgets it reproduces
     * exactly that failure. Doing it unconditionally also covers the trade
     * path, where the recheck may have been several minutes and one guest form
     * ago — long enough for their session to have lapsed again.
     */
    let binding = offer.tourmind;
    try {
      const confirmed = await tourmindPrebook(
        binding,
        { ...offer.intent, nationality: body.lead.nationality || offer.intent.nationality },
        locale,
        dest?.countryCode,
      );

      if (!confirmed) {
        // They no longer hold it. Nothing has been charged at this point.
        return fail("availabilityChanged", "error.availabilityChanged", locale, {
          status: 409,
          action: "selectAlternative",
        });
      }

      /*
       * Their final price has to be the one the customer agreed to.
       *
       * A prebook is also a price confirmation, and it is the last moment the
       * rate can move. Booking a changed price because the order was already
       * in flight is the one outcome worse than refusing: the customer accepted
       * a number and would be charged another. Refused back to the recheck
       * gate, which exists to show the new price and ask.
       *
       * A rounding difference is not a change — the comparison is in the
       * display currency, which is converted.
       */
      if (Math.abs(confirmed.price.total - offer.price.total) > 1) {
        return fail("availabilityChanged", "error.availabilityChanged", locale, {
          status: 409,
          action: "selectAlternative",
          message:
            locale === "ar"
              ? "تغيّر السعر النهائي لدى المورد قبل تأكيد الحجز. لم يُخصم أي مبلغ — راجع السعر الجديد ثم أكّد."
              : "The final price changed at the supplier before the booking was placed. Nothing was charged — review the new price and confirm.",
        });
      }

      // Their prebook mints a new rate code, and it is the only one CreateOrder
      // will accept; the availability code is already dead by this point.
      binding = { ...binding, rateCode: confirmed.rateCode, net: confirmed.net };
      rememberOffer(offer.offerId, { ...offer, tourmind: binding });
      // TourMind's prebook replaces the rate code, and CreateOrder must use
      // the confirmed one. It is committed on the very next line here, but
      // publishing keeps the stored copy honest if the order is retried.
      await republishOffer(offer.offerId);
    } catch (error) {
      logTourmindError("bookings.prebook", error, ref);
      const mapped = mapTourmindError(error, locale);
      // Nothing has been sent to their order endpoint, so this is a clean
      // refusal rather than an order in an unknown state.
      return fail(mapped.category, mapped.messageKey, locale, {
        status: mapped.status,
        action: mapped.action,
        retryable: mapped.retryable,
        message: mapped.message,
      });
    }

    try {
      const result = await tourmindBook({
        sessionId: session.checkoutSessionId,
        hotelCode: binding.hotelCode,
        rateCode: binding.rateCode,
        net: binding.net,
        supplierCurrency: binding.supplierCurrency,
        // The session holds the stay, not the original intent; rebuild the
        // shape the supplier call needs from what checkout actually captured.
        intent: {
          destinationId: "",
          destinationDisplay: "",
          destinationType: "city" as const,
          checkIn: session.checkIn,
          checkOut: session.checkOut,
          flexibility: "exact" as const,
          rooms: session.rooms,
          nationality: body.lead.nationality,
          locale,
          currency: session.price.currency,
        },
        contact: {
          name: guests[0].firstName,
          surname: guests[0].surname,
          email: body.contact.email,
          phone: body.contact.phone,
        },
        // Their create call refuses a booking with no named guest per room.
        guests: guests.map((guest) => ({
          roomIndex: guest.roomIndex,
          type: guest.type === "child" ? ("child" as const) : ("adult" as const),
          firstName: guest.firstName,
          surname: guest.surname,
        })),
        specialRequest: requests.join(" | ") || undefined,
      });
      supplierReference = result.reservationId;
      // Cancellation keys on our own AgentRefID, not their reservation id: a
      // create that timed out may have succeeded without us ever seeing theirs.
      tourmindAgentRef = result.agentRefId;
      /*
       * Their own status, not our inference from having received an id.
       *
       * PENDING is a real outcome for this supplier — their documentation says
       * to poll for the final one — and calling it confirmed would put a
       * voucher in a guest's hand for a room nobody has held yet.
       */
      if (result.status === "pending") pending = true;
      if (result.status === "failed") rejected = true;
    } catch (error) {
      logTourmindError("bookings.create", error, ref);
      if (isIndeterminate(error)) {
        pending = true;
      } else {
        const mapped = mapTourmindError(error, locale);
        return fail(mapped.category, mapped.messageKey, locale, {
          status: mapped.status,
          action: mapped.action,
          retryable: mapped.retryable,
          message: mapped.message,
        });
      }
    }
  }

  const bookingGuests = guestList(session.rooms, body);
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
    /*
     * Every room, as it was sold.
     *
     * Both vouchers printed "{rooms.length} x {roomName}" from a single room's
     * rate — "3 x Deluxe twin" over the cost of one, which is what a guest
     * arrived at the desk holding. Guests are attached per room so a voucher can
     * say who is in which, and a room with nobody named to it falls back to the
     * lead, who is who the hotel asks for anyway.
     */
    lines: session.lines.map((sessionLine) => {
      const named = bookingGuests.filter((guest) => sessionLine.roomIndexes.includes(guest.roomIndex));
      return {
        lineId: sessionLine.lineId,
        roomName: sessionLine.roomName,
        boardLabel: sessionLine.boardLabel,
        occupancies: sessionLine.occupancies,
        price: sessionLine.price,
        cancellation: sessionLine.cancellation,
        guests: named.length ? named : bookingGuests.slice(0, 1),
      };
    }),
    rooms: session.rooms,
    guests: bookingGuests,
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

  /*
   * The commercial record and the credit movement.
   *
   * Written after the booking exists, so credit is only ever committed against
   * something real — and skipped for a rejection, where nothing was sold. Both
   * writes key on the platform reference, so a replayed request lands on the
   * same rows rather than charging the agency twice.
   */
  /*
   * A hold reserves; a sale charges.
   *
   * The supplier order above is the same either way — there is no such thing as
   * an unconfirmed booking at either of them — so the difference lives entirely
   * on our side of the wire: which ledger entry is written, and whether a
   * sweeper is going to cancel this before the free window closes.
   */
  const holdWindow =
    agent && body.hold && !pending && !rejected
      ? canHold({
          refundable: session.cancellation.refundable,
          freeCancellationUntil: session.cancellation.freeUntil,
        })
      : null;

  if (agent && body.hold && (!holdWindow || !holdWindow.ok)) {
    return fail("policyRestriction", "agency.cannotHold", locale, {
      status: 409,
      action: "selectAlternative",
      message:
        locale === "ar"
          ? "لا يمكن حجز هذا السعر مؤقتًا — الإلغاء المجاني غير متاح أو انتهت مهلته. أصدره الآن أو اختر سعرًا آخر."
          : "This rate cannot be held — it is non-refundable or its free-cancellation window is closing. Issue it now, or pick another rate.",
    });
  }

  const isHold = Boolean(holdWindow?.ok);

  if (agent && agencyCommit && !rejected) {
    const commit = { ...agencyCommit, reference: booking.reference };
    if (isHold && holdWindow?.ok) {
      await reserveForHold(agent, commit.reference, commit.cost, commit.currency, booking.hotelName, now);
    } else {
      await commitBooking(agent, commit, booking.hotelName, now);
    }
    await saveAgencyBooking({
      reference: booking.reference,
      agencyId: agent.agencyId,
      agentId: agent.agentId,
      agentName: agent.name,
      hotelName: booking.hotelName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      leadGuest: `${booking.guests[0].firstName} ${booking.guests[0].surname}`.trim(),
      publicPrice: commit.publicPrice,
      cost: commit.cost,
      sell: commit.sell,
      currency: commit.currency,
      status: pending ? "pending" : isHold ? "held" : "confirmed",
      createdAt: now,
      holdExpiresAt: holdWindow?.ok ? holdWindow.deadline : undefined,
      freeCancellationUntil: isHold ? session.cancellation.freeUntil : undefined,
    });
  }
  if (supplierReference && offer?.hotelbeds) {
    // Held apart from the customer record: the platform reference is the only
    // identifier the customer ever sees (§8.5).
    //
    // Guarded by supplier now that there is more than one. Writing "hotelbeds"
    // unconditionally overwrote the TourMind link recorded above, which would
    // have sent every TourMind cancellation to the wrong API.
    await linkSupplierReference(booking.reference, supplierReference, "hotelbeds");
  }
  if (tourmindAgentRef) {
    await linkSupplierReference(booking.reference, tourmindAgentRef, "tourmind");
  }
  saveSession({ ...session, idempotencyKeys: [...session.idempotencyKeys, body.idempotencyKey] });

  await pushNotification(booking.contact.email, {
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
