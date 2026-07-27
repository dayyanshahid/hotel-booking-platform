import type {
  Amenity,
  CanonicalHotel,
  CanonicalRoom,
  CancellationPolicy,
  ChargeLine,
  CurrencyCode,
  HotelImage,
  Locale,
  Offer,
  PriceStack,
  RateComment,
  SearchIntent,
} from "@/lib/types";
import { addDays, convertCurrency, isSupportedCurrency, nightsBetween } from "@/lib/format";
import { sceneUrl } from "@/lib/illustration/scenes";
import { applyMarkup } from "../markup";
import { timezoneForCountry } from "../timezones";
import { getHotelContent, getTypes, slugify, type TypeDictionaries } from "./content";
import {
  hbImageUrl,
  toNumber,
  type HbCancellationPolicy,
  type HbContentHotel,
  type HbHotel,
  type HbRate,
  type HbRoom,
} from "./types";

/**
 * Supplier → canonical adapter for Hotelbeds.
 *
 * Everything supplier-shaped stops here. The output uses exactly the same
 * canonical types as the simulated sources, so no screen, route or test knows
 * which source an offer came from (§9.1, §9.4).
 */

/* ------------------------------------------------------------------ prices */

export interface OfferPricing {
  price: PriceStack;
  /** Supplier net — server-side only, never serialised into a response. */
  net: number;
  supplierCurrency: CurrencyCode;
}

function buildPrice(
  rate: HbRate,
  hotelCurrency: string | undefined,
  intent: SearchIntent,
  locale: Locale,
): OfferPricing | null {
  const netRaw = toNumber(rate.net, NaN);
  if (!Number.isFinite(netRaw) || netRaw <= 0) return null;

  const supplierCurrency: CurrencyCode = isSupportedCurrency(hotelCurrency) ? hotelCurrency : "EUR";
  const display: CurrencyCode = intent.currency;
  const ar = locale === "ar";
  const nights = Math.max(1, nightsBetween(intent.checkIn, intent.checkOut));
  const guests = intent.rooms.reduce((sum, room) => sum + room.adults + room.childrenAges.length, 0);

  const { total: markedUpNet } = applyMarkup(netRaw);
  const total = convertCurrency(markedUpNet, supplierCurrency, display);

  // Taxes flagged as included are already inside net; the rest are collected by
  // the property and must never be folded into the total (§8.4, E-07).
  const included: ChargeLine[] = [];
  const payAtProperty: ChargeLine[] = [];

  for (const tax of rate.taxes?.taxes ?? []) {
    const amountRaw = toNumber(tax.clientAmount ?? tax.amount, 0);
    if (amountRaw <= 0) continue;
    const taxCurrency: CurrencyCode = isSupportedCurrency(tax.clientCurrency ?? tax.currency)
      ? ((tax.clientCurrency ?? tax.currency) as CurrencyCode)
      : supplierCurrency;
    const amount = convertCurrency(amountRaw, taxCurrency, display);
    const label = tax.type
      ? ar
        ? `ضرائب ورسوم (${tax.type})`
        : `Taxes and fees (${tax.type})`
      : ar
        ? "ضرائب ورسوم"
        : "Taxes and fees";

    if (tax.included) {
      included.push({ code: `tax-${included.length}`, label, amount, basis: "included" });
    } else {
      payAtProperty.push({
        code: `tax-local-${payAtProperty.length}`,
        label,
        amount,
        basis: "payAtProperty",
        estimated: false,
      });
    }
  }

  if (!included.length) {
    included.push({
      code: "netInclusive",
      label: ar ? "الضرائب والرسوم المشمولة" : "Included taxes and charges",
      amount: 0,
      basis: "included",
    });
  }

  // A rate flagged as hotel-mandatory carries charges the property collects
  // whose amount the supplier does not always quantify. It is surfaced as a
  // labelled possibility rather than a false exact total (E-07).
  if (rate.hotelMandatory && !payAtProperty.length) {
    payAtProperty.push({
      code: "hotelMandatory",
      label: ar
        ? "رسوم إلزامية يحصّلها الفندق — يؤكد العقار المبلغ"
        : "Mandatory charge collected by the property — amount confirmed by the hotel",
      amount: 0,
      basis: "payAtProperty",
      estimated: true,
    });
  }

  const includedSum = included.reduce((sum, line) => sum + line.amount, 0);

  // A strike-through only where the supplier itself quotes a comparable higher
  // selling rate (§8.2 — valid comparable basis only).
  const sellingRaw = toNumber(rate.sellingRate ?? rate.hotelSellingRate, 0);
  const selling = sellingRaw > 0 ? convertCurrency(applyMarkup(sellingRaw).total, supplierCurrency, display) : 0;
  const strikeTotal = selling > total * 1.02 ? selling : undefined;

  return {
    net: netRaw,
    supplierCurrency,
    price: {
      currency: display,
      total,
      nightlyAverage: Math.round(total / nights),
      base: Math.max(0, total - includedSum),
      includedCharges: included,
      payAtProperty,
      strikeTotal,
      discountLabel: strikeTotal
        ? ar
          ? `خصم ${Math.round((1 - total / strikeTotal) * 100)}%`
          : `${Math.round((1 - total / strikeTotal) * 100)}% off`
        : undefined,
      chargeCurrency: display === supplierCurrency ? undefined : supplierCurrency,
      fxBasis:
        display === supplierCurrency
          ? undefined
          : ar
            ? "التحويل تقديري ويُثبّت عند الدفع."
            : "Conversion is indicative and fixed at payment.",
      nights,
      guests,
    },
  };
}

/* ------------------------------------------------------------ cancellation */

export function buildCancellationFromPolicies(
  policies: HbCancellationPolicy[] | undefined,
  options: {
    checkIn: string;
    total: number;
    supplierCurrency: CurrencyCode;
    displayCurrency: CurrencyCode;
    countryCode?: string;
    locale: Locale;
  },
): CancellationPolicy {
  const ar = options.locale === "ar";
  const timezone = timezoneForCountry(options.countryCode);
  const sorted = [...(policies ?? [])]
    .filter((policy) => policy.from)
    .sort((a, b) => String(a.from).localeCompare(String(b.from)));

  // No policy block at all means the supplier applies a charge from the moment
  // of booking: presented plainly as non-refundable rather than left ambiguous.
  if (!sorted.length) {
    return {
      refundable: false,
      timezone,
      steps: [
        {
          until: `${options.checkIn}T23:59:00`,
          fee: options.total,
          label: ar ? "غير قابل للاسترداد" : "Non-refundable",
        },
      ],
    };
  }

  const firstFrom = String(sorted[0].from);
  const freeUntil = firstFrom;
  const refundable = new Date(firstFrom).getTime() > Date.now();

  const steps = sorted.map((policy, index) => {
    const feeRaw = toNumber(policy.amount, 0);
    const fee = convertCurrency(feeRaw, options.supplierCurrency, options.displayCurrency);
    const next = sorted[index + 1]?.from;
    return {
      until: String(next ?? `${addDays(options.checkIn, 1)}T12:00:00`),
      fee: Math.min(fee, options.total),
      label:
        fee >= options.total
          ? ar
            ? "لا يوجد استرداد"
            : "No refund"
          : ar
            ? "رسوم إلغاء جزئية"
            : "Partial cancellation fee",
    };
  });

  return {
    refundable,
    freeUntil: refundable ? freeUntil : undefined,
    timezone,
    steps: refundable
      ? [{ until: freeUntil, fee: 0, label: ar ? "إلغاء مجاني" : "Free cancellation" }, ...steps]
      : steps,
  };
}

/* --------------------------------------------------------------- comments */

/**
 * Raw rate comments become a structured, readable notice while the supplier's
 * mandatory wording is preserved verbatim behind a disclosure (§5.7).
 */
export function buildRateComments(rate: HbRate, locale: Locale): RateComment[] {
  const comments: RateComment[] = [];
  const raw = (rate.rateComments ?? "").trim();

  if (raw) {
    const sentences = raw
      .split(/\.\s+|\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const summary = sentences.slice(0, 2).join(". ");
    comments.push({
      // The supplier's own comment identifier stays internal; the id here is a
      // stable local key only (§9.4).
      id: "property-conditions",
      summary: summary.length > 3 ? `${summary}${summary.endsWith(".") ? "" : "."}` : raw,
      verbatim: raw,
      mandatory: Boolean(rate.hotelMandatory),
    });
  }

  if (rate.hotelMandatory && !raw) {
    comments.push({
      id: "hotel-mandatory",
      summary:
        locale === "ar"
          ? "يفرض العقار رسومًا إلزامية تُدفع محليًا. يؤكد الفندق المبلغ عند الوصول."
          : "The property applies a mandatory charge payable locally. The hotel confirms the amount on arrival.",
      verbatim: "HOTEL MANDATORY CHARGE — PAYABLE DIRECTLY AT THE PROPERTY.",
      mandatory: true,
    });
  }

  comments.push({
    id: "id-check",
    summary:
      locale === "ar"
        ? "على كل ضيف بالغ إبراز هوية سارية عند الوصول، ويجب أن يطابق الاسم الحجز."
        : "Every adult guest must present valid ID at check-in, and the lead name must match the booking.",
    verbatim: "ALL GUESTS MUST PRESENT VALID PHOTO IDENTIFICATION AT CHECK IN.",
    mandatory: true,
  });

  return comments;
}

/* ------------------------------------------------------- canonical content */

const FACILITY_GROUPS_SHOWN = new Set([10, 20, 30, 40, 50, 60, 70, 71, 74, 75, 77]);

export function buildCanonicalHotelFromContent(
  content: HbContentHotel,
  types: TypeDictionaries,
  locale: Locale,
): CanonicalHotel {
  const ar = locale === "ar";
  const code = content.code ?? 0;
  const name = content.name?.content ?? `Hotel ${code}`;
  const slug = slugify(name, code);
  const city = content.city?.content ?? content.destinationCode ?? "";
  const countryCode = content.countryCode ?? "";
  const categoryLabel = types.categories[content.categoryCode ?? ""] ?? content.categoryCode ?? "";
  const stars = Number.parseInt(String(content.categoryCode ?? "").replace(/\D/g, ""), 10);

  const amenities: Amenity[] = (content.facilities ?? [])
    .filter((facility) => FACILITY_GROUPS_SHOWN.has(facility.facilityGroupCode ?? -1))
    .slice(0, 40)
    .map((facility) => ({
      code: `${facility.facilityGroupCode}:${facility.facilityCode}`,
      label: types.facilities[`${facility.facilityGroupCode}:${facility.facilityCode}`] ?? "",
      scope: "property" as const,
      included: facility.indFee !== true,
      fee: facility.indFee ? (ar ? "برسوم إضافية" : "Additional charge") : undefined,
    }))
    .filter((amenity) => amenity.label.length > 0);

  const imageCategory = (typeCode: string | undefined): HotelImage["category"] => {
    switch (typeCode) {
      case "HAB":
        return "room";
      case "RES":
        return "dining";
      case "PIS":
        return "pool";
      case "COM":
        return "lobby";
      case "GEN":
        return "view";
      default:
        return "exterior";
    }
  };

  const images: HotelImage[] = (content.images ?? [])
    .slice()
    .sort((a, b) => (a.visualOrder ?? a.order ?? 99) - (b.visualOrder ?? b.order ?? 99))
    .slice(0, 24)
    .map((image, index) => ({
      id: `${code}-${index}`,
      url: hbImageUrl(image.path) ?? "",
      // Supplier photography is the real thing, so it is never replaced — but a
      // dead CDN path should still render as artwork rather than a grey box.
      fallbackUrl: sceneUrl(`${code}-${index}`, imageCategory(image.imageTypeCode)),
      alt: `${name} — ${image.imageTypeCode ?? "photo"}`,
      category: imageCategory(image.imageTypeCode),
      caption: image.imageTypeCode,
      credit: ar ? "محتوى مقدَّم من العقار" : "Property-supplied content",
      roomId: image.roomCode ? `${slug}::${image.roomCode}` : undefined,
    }));

  const landmarks: CanonicalHotel["landmarks"] = (content.interestPoints ?? []).slice(0, 6).map((point) => ({
    label: point.poiName ?? "",
    distanceKm: Math.round((toNumber(point.distance, 0) / 1000) * 10) / 10,
    type: "landmark",
  }));
  for (const terminal of (content.terminals ?? []).slice(0, 2)) {
    landmarks.push({
      label: terminal.terminalCode ?? "",
      distanceKm: Math.round((toNumber(terminal.distance, 0) / 1000) * 10) / 10,
      type: "airport",
    });
  }

  const description = content.description?.content ?? "";

  return {
    canonicalHotelId: `chl-${slug}`,
    slug,
    name,
    category: Number.isFinite(stars) && stars > 0 ? Math.min(5, stars) : 3,
    propertyType: categoryLabel || (ar ? "فندق" : "Hotel"),
    chain: content.chainCode,
    destinationId: `hbd-${content.destinationCode ?? "unknown"}`,
    address: {
      line1: content.address?.content ?? [content.address?.street, content.address?.number].filter(Boolean).join(" "),
      city,
      country: countryCode,
      countryCode,
      postalCode: content.postalCode,
      neighborhood: content.zoneCode ? `Zone ${content.zoneCode}` : city,
    },
    coordinates: {
      lat: content.coordinates?.latitude ?? 0,
      lng: content.coordinates?.longitude ?? 0,
    },
    landmarks: landmarks.filter((landmark) => landmark.label),
    descriptions: {
      overview: description,
      location: content.city?.content ?? "",
      family: ar
        ? "تُطبق سياسات الأعمار على السعر. تأكد من تفاصيل الأسرّة الإضافية في وصف الغرفة."
        : "Child age rules affect pricing. Check the room description for extra-bed details.",
      accessibility: ar
        ? "لم يؤكد العقار تفاصيل كاملة عن إمكانية الوصول عبر هذا المصدر. تواصل معنا قبل الحجز إذا كانت ميزة معينة ضرورية."
        : "Full accessibility detail is not confirmed through this source. Contact us before booking if a specific feature is essential.",
    },
    amenities,
    images,
    policies: {
      checkInFrom: "15:00",
      checkOutBy: "12:00",
      childPolicy: ar
        ? "تختلف سياسات الأطفال حسب الغرفة والسعر؛ تظهر التفاصيل مع كل سعر."
        : "Child policy varies by room and rate; details are shown with each rate.",
      cotPolicy: ar ? "سرير أطفال عند الطلب، حسب التوفر." : "Cot on request, subject to availability.",
      petPolicy: ar ? "تواصل مع العقار بخصوص الحيوانات الأليفة." : "Contact the property regarding pets.",
      parking: ar ? "راجع قائمة المرافق." : "See the facilities list.",
      smoking: ar ? "غرف لغير المدخنين ما لم يُذكر خلاف ذلك." : "Non-smoking rooms unless stated otherwise.",
      idRequirement: ar
        ? "يجب إبراز هوية سارية أو جواز سفر عند الوصول لجميع الضيوف البالغين."
        : "A valid ID or passport is required at check-in for every adult guest.",
      accessibility: ar ? "راجع قائمة المرافق." : "See the facilities list.",
      localFees: [],
    },
    notices: (content.issues ?? [])
      .filter((issue) => issue.dateFrom && issue.dateTo)
      .slice(0, 4)
      .map((issue, index) => ({
        id: `${slug}-issue-${index}`,
        severity: issue.alternative ? ("warning" as const) : ("info" as const),
        dateFrom: String(issue.dateFrom).slice(0, 10),
        dateTo: String(issue.dateTo).slice(0, 10),
        description: issue.issueCode
          ? ar
            ? `يوجد إشعار تشغيلي من العقار لهذه الفترة (${issue.issueCode}).`
            : `The property has an operational notice for this period (${issue.issueCode}).`
          : "",
      }))
      .filter((notice) => notice.description),
    // Guest review content requires a separately licensed source (§16.1), so it
    // is omitted rather than fabricated.
    review: undefined,
    qualityBadges: [],
    contentProvenance: ar
      ? `محتوى مُوحّد من مصدر التوريد المتعاقد، آخر تحديث ${content.lastUpdate ?? "غير معروف"}.`
      : `Normalized from the contracted supply source, last updated ${content.lastUpdate ?? "unknown"}.`,
    seo: {
      metaTitle: ar ? `${name} — أسعار وتوفر ${city}` : `${name} — ${city} rates and availability`,
      metaDescription: description.slice(0, 200),
      breadcrumbs: [countryCode, city, name].filter(Boolean),
    },
  };
}

/* ------------------------------------------------------------ availability */

export interface HotelbedsOfferContext {
  rateKey: string;
  rateTypeInternal: "BOOKABLE" | "RECHECK";
  net: number;
  supplierCurrency: CurrencyCode;
  hotelCode: number;
  roomCode: string;
  boardCode: string;
}

export interface AdaptedHotel {
  hotel: CanonicalHotel;
  rooms: CanonicalRoom[];
  offers: Offer[];
  /** offerId → supplier context, stored server-side by the caller. */
  contexts: Map<string, HotelbedsOfferContext>;
}

function buildRooms(
  hbRooms: HbRoom[],
  content: HbContentHotel | null,
  slug: string,
  locale: Locale,
  images: HotelImage[],
): CanonicalRoom[] {
  const ar = locale === "ar";
  return hbRooms.map((room) => {
    const code = room.code ?? "ROOM";
    const contentRoom = content?.rooms?.find((candidate) => candidate.roomCode === code);
    const roomImages = images.filter((image) => image.roomId === `${slug}::${code}`);
    const sample = room.rates?.[0];

    return {
      canonicalRoomId: `${slug}::${code}`,
      name: room.name ?? code,
      // A single contracted source needs no cross-source room merge, so the
      // canonical room is the supplier's own room concept at full confidence.
      mappingConfidence: 1,
      sizeSqm: undefined,
      view: undefined,
      beds: [],
      maxAdults: contentRoom?.maxAdults ?? toNumber(sample?.adults, 2),
      maxChildren: contentRoom?.maxChildren ?? toNumber(sample?.children, 0),
      maxOccupancy: contentRoom?.maxPax ?? toNumber(sample?.adults, 2) + toNumber(sample?.children, 0),
      extraBed: undefined,
      cot: undefined,
      smoking: false,
      accessible: false,
      amenities: [],
      images: roomImages.length
        ? roomImages
        : [
            {
              id: `${slug}-${code}-fallback`,
              url: "",
              alt: ar ? `صورة ${room.name ?? code}` : `Photo of ${room.name ?? code}`,
              category: "room" as const,
              roomId: `${slug}::${code}`,
            },
          ],
    };
  });
}

export async function adaptAvailability(
  hbHotel: HbHotel,
  intent: SearchIntent,
  locale: Locale,
): Promise<AdaptedHotel | null> {
  const code = hbHotel.code;
  if (!code) return null;

  const [content, types] = await Promise.all([getHotelContent(code), getTypes()]);
  const canonical = content
    ? buildCanonicalHotelFromContent(content, types, locale)
    : minimalCanonicalHotel(hbHotel, locale);

  const rooms = buildRooms(hbHotel.rooms ?? [], content, canonical.slug, locale, canonical.images);
  const offers: Offer[] = [];
  const contexts = new Map<string, HotelbedsOfferContext>();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  for (const room of hbHotel.rooms ?? []) {
    for (const rate of room.rates ?? []) {
      if (!rate.rateKey) continue;
      const pricing = buildPrice(rate, hbHotel.currency, intent, locale);
      if (!pricing) continue;

      const cancellation = buildCancellationFromPolicies(rate.cancellationPolicies, {
        checkIn: intent.checkIn,
        total: pricing.price.total,
        supplierCurrency: pricing.supplierCurrency,
        displayCurrency: intent.currency,
        countryCode: content?.countryCode,
        locale,
      });

      const offerId = `of_hb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      const boardCode = rate.boardCode ?? "RO";
      const allotment = rate.allotment ?? 0;

      const offer: Offer = {
        offerId,
        canonicalRoomId: `${canonical.slug}::${room.code ?? "ROOM"}`,
        board: {
          code: boardCode,
          label: types.boards[boardCode] ?? rate.boardName ?? boardCode,
          detail: rate.boardName ?? "",
        },
        paymentTiming: rate.paymentType === "AT_WEB" ? "payNow" : "payLater",
        cancellation,
        price: pricing.price,
        comments: buildRateComments(rate, locale),
        badges: (rate.promotions ?? [])
          .filter((promotion) => promotion.name)
          .slice(0, 2)
          .map((promotion) => ({
            code: `promo-${promotion.code ?? ""}`,
            label: promotion.name!,
            kind: "promotional" as const,
            reason:
              promotion.remark ??
              (locale === "ar"
                ? "عرض ترويجي مقدَّم من العقار لهذه التواريخ."
                : "A promotion offered by the property for these dates."),
          })),
        remainingLabel:
          allotment > 0 && allotment <= 3
            ? locale === "ar"
              ? `بقيت ${allotment} غرف بهذا السعر`
              : `${allotment} left at this price`
            : undefined,
        capabilities: {
          // The supplier's own rate type decides this — the customer never sees
          // the term itself (§9.1).
          recheckRequired: rate.rateType === "RECHECK",
          cancellationQuote: true,
          modifyAllowed: false,
          guaranteeEligible: false,
          instantConfirmation: rate.rateType === "BOOKABLE",
        },
        expiresAt,
        roomsCovered: intent.rooms.length,
        scores: {
          price: 0,
          flexibility: cancellation.refundable ? 1 : 0.15,
          quality: canonical.category / 5,
          location: 0.6,
          fit: 1,
        },
      };

      offers.push(offer);
      contexts.set(offerId, {
        rateKey: rate.rateKey,
        rateTypeInternal: rate.rateType === "RECHECK" ? "RECHECK" : "BOOKABLE",
        net: pricing.net,
        supplierCurrency: pricing.supplierCurrency,
        hotelCode: code,
        roomCode: room.code ?? "ROOM",
        boardCode,
      });
    }
  }

  if (!offers.length) return null;

  // Price score is relative within the property, matching the simulated sources.
  const cheapest = Math.min(...offers.map((offer) => offer.price.total));
  const dearest = Math.max(...offers.map((offer) => offer.price.total));
  for (const offer of offers) {
    offer.scores.price = dearest === cheapest ? 1 : 1 - (offer.price.total - cheapest) / (dearest - cheapest);
  }

  return { hotel: canonical, rooms, offers, contexts };
}

/** Used when availability returns a hotel whose content is not cached yet. */
function minimalCanonicalHotel(hbHotel: HbHotel, locale: Locale): CanonicalHotel {
  const code = hbHotel.code ?? 0;
  const name = hbHotel.name ?? `Hotel ${code}`;
  const slug = slugify(name, code);
  const stars = Number.parseInt(String(hbHotel.categoryCode ?? "").replace(/\D/g, ""), 10);
  const ar = locale === "ar";

  return {
    canonicalHotelId: `chl-${slug}`,
    slug,
    name,
    category: Number.isFinite(stars) && stars > 0 ? Math.min(5, stars) : 3,
    propertyType: hbHotel.categoryName ?? (ar ? "فندق" : "Hotel"),
    destinationId: `hbd-${hbHotel.destinationCode ?? "unknown"}`,
    address: {
      line1: hbHotel.zoneName ?? "",
      city: hbHotel.destinationName ?? "",
      country: "",
      countryCode: "",
      neighborhood: hbHotel.zoneName ?? hbHotel.destinationName ?? "",
    },
    coordinates: { lat: toNumber(hbHotel.latitude, 0), lng: toNumber(hbHotel.longitude, 0) },
    landmarks: [],
    descriptions: {
      overview: ar
        ? "تفاصيل هذا العقار قيد المزامنة من مصدر المحتوى."
        : "Full details for this property are still syncing from the content source.",
      location: hbHotel.zoneName ?? "",
      family: "",
      accessibility: "",
    },
    amenities: [],
    images: [],
    policies: {
      checkInFrom: "15:00",
      checkOutBy: "12:00",
      childPolicy: "",
      cotPolicy: "",
      petPolicy: "",
      parking: "",
      smoking: "",
      idRequirement: ar
        ? "يجب إبراز هوية سارية عند الوصول."
        : "A valid ID is required at check-in.",
      accessibility: "",
      localFees: [],
    },
    notices: [],
    qualityBadges: [],
    contentProvenance: ar ? "محتوى العقار قيد المزامنة." : "Property content is still syncing.",
    seo: {
      metaTitle: name,
      metaDescription: "",
      breadcrumbs: [hbHotel.destinationName ?? "", name].filter(Boolean),
    },
  };
}
