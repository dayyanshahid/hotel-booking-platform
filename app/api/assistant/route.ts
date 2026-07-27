import { localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { buildHotel, getHotelSeed } from "@/lib/data/hotels";
import { getBooking, getOffer } from "@/lib/server/store";
import { formatDeadline, formatMoney } from "@/lib/format";

/**
 * Grounded assistant (§5.12).
 *
 * Rules enforced here rather than left to a model prompt:
 *  - answers are constructed only from approved hotel content, the selected
 *    offer and the customer's own booking
 *  - every answer cites the on-screen section it came from
 *  - anything not covered returns an explicit hand-off instead of a guess
 *  - contract rates, source codes, confidence scores and margins are never used
 */

interface Body {
  question: string;
  hotelSlug?: string;
  offerId?: string;
  bookingReference?: string;
}

type Answer = { text: string; source: string } | null;

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<Body>(req);
  const question = sanitize(body?.question ?? "", 300).toLowerCase();
  if (!question) return ok({ answer: null, handoff: false });

  const ar = locale === "ar";
  const seed = body?.hotelSlug ? getHotelSeed(body.hotelSlug) : undefined;
  const hotel = seed ? buildHotel(seed, locale) : undefined;
  const offer = body?.offerId ? getOffer(body.offerId) : undefined;
  const booking = body?.bookingReference ? await getBooking(body.bookingReference) : undefined;

  const has = (...terms: string[]) => terms.some((t) => question.includes(t));
  let answer: Answer = null;

  if (has("cancel", "refund", "إلغاء", "استرداد")) {
    const policy = booking?.cancellation ?? offer?.cancellation;
    if (policy) {
      answer = policy.refundable && policy.freeUntil
        ? {
            text: ar
              ? `الإلغاء مجاني حتى ${formatDeadline(policy.freeUntil, policy.timezone, locale)} بتوقيت الفندق (${policy.timezone}). بعد ذلك تُطبق الرسوم الموضحة في الجدول الزمني.`
              : `Cancellation is free until ${formatDeadline(policy.freeUntil, policy.timezone, locale)} in the property's time zone (${policy.timezone}). After that the fees in the timeline apply.`,
            source: ar ? "الجدول الزمني للإلغاء" : "Cancellation timeline",
          }
        : {
            text: ar
              ? "هذا السعر غير قابل للاسترداد: لا يوجد استرداد عند الإلغاء بعد الحجز."
              : "This rate is non-refundable: no refund applies once the booking is made.",
            source: ar ? "شروط السعر" : "Rate conditions",
          };
    }
  } else if (has("pay", "payment", "card", "دفع", "بطاقة")) {
    if (offer || booking) {
      const price = booking?.price ?? offer?.price;
      const payAtProperty = price?.payAtProperty ?? [];
      answer = {
        text: ar
          ? `الإجمالي المعروض ${formatMoney(price!.total, price!.currency, locale)} ويشمل الضرائب والرسوم المدرجة تحت «مشمول في الإجمالي».${payAtProperty.length ? ` بالإضافة إلى ذلك يحصّل الفندق ${payAtProperty.map((c) => `${c.label} (${formatMoney(c.amount, price!.currency, locale)})`).join("، ")}.` : ""}`
          : `The displayed total is ${formatMoney(price!.total, price!.currency, locale)} and includes the taxes and charges listed under "Included in the total".${payAtProperty.length ? ` Separately, the hotel collects ${payAtProperty.map((c) => `${c.label} (${formatMoney(c.amount, price!.currency, locale)})`).join(", ")}.` : ""}`,
        source: ar ? "تفاصيل السعر" : "Price breakdown",
      };
    }
  } else if (has("check-in", "checkin", "check in", "arrive", "وصول", "تسجيل")) {
    if (hotel) {
      answer = {
        text: ar
          ? `تسجيل الوصول من ${hotel.policies.checkInFrom} والمغادرة حتى ${hotel.policies.checkOutBy}. ${hotel.policies.idRequirement}`
          : `Check-in is from ${hotel.policies.checkInFrom} and check-out is by ${hotel.policies.checkOutBy}. ${hotel.policies.idRequirement}`,
        source: ar ? "السياسات" : "Policies",
      };
    }
  } else if (has("child", "kid", "cot", "طفل", "أطفال", "سرير أطفال")) {
    if (hotel) {
      answer = {
        text: `${hotel.policies.childPolicy} ${hotel.policies.cotPolicy}`,
        source: ar ? "السياسات — الأطفال" : "Policies — children",
      };
    }
  } else if (has("breakfast", "board", "meal", "إفطار", "وجبات")) {
    if (offer) {
      answer = {
        text: ar
          ? `نظام الوجبات لهذا السعر هو ${offer.board}. التفاصيل تظهر على بطاقة السعر المختار.`
          : `The board basis for this rate is shown on the selected rate card (${offer.board}).`,
        source: ar ? "بطاقة السعر" : "Rate card",
      };
    }
  } else if (has("wifi", "parking", "pool", "gym", "spa", "واي فاي", "موقف", "مسبح", "نادي")) {
    if (hotel) {
      const list = hotel.amenities.slice(0, 8).map((a) => a.label).join(", ");
      answer = {
        text: ar ? `المرافق المؤكدة للعقار: ${list}.` : `Confirmed property facilities: ${list}.`,
        source: ar ? "المرافق" : "Amenities",
      };
    }
  } else if (has("accessible", "wheelchair", "إعاقة", "كرسي")) {
    if (hotel) {
      answer = { text: hotel.descriptions.accessibility, source: ar ? "إمكانية الوصول" : "Accessibility" };
    }
  } else if (has("where", "location", "address", "airport", "الموقع", "العنوان", "المطار")) {
    if (hotel) {
      const near = hotel.landmarks.map((l) => `${l.label} — ${l.distanceKm} km`).join(", ");
      answer = {
        text: ar
          ? `${hotel.address.line1}. ما حولك: ${near}.`
          : `${hotel.address.line1}. Nearby: ${near}.`,
        source: ar ? "الموقع" : "Location",
      };
    }
  } else if (has("status", "booking", "reference", "حالة", "حجز")) {
    if (booking) {
      answer = {
        text: ar
          ? `حجزك ${booking.reference} حالته: ${booking.statusDetail}`
          : `Booking ${booking.reference}: ${booking.statusDetail}`,
        source: ar ? "حالة الحجز" : "Booking status",
      };
    }
  }

  if (!answer) {
    return ok({
      answer: null,
      handoff: true,
      message: ar
        ? "لم أجد ذلك في معلومات هذا الفندق المنشورة. يمكن لموظف الدعم التحقق مع العقار."
        : "I could not find that in this hotel's published information. A support agent can check with the property.",
    });
  }

  return ok({ answer, handoff: false });
}

export const dynamic = "force-dynamic";
