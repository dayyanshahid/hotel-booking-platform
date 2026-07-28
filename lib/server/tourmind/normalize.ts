import { getDestination } from "@/lib/data/destinations";
import { localized, BOARD_CATALOG } from "@/lib/data/catalog";
import { propertyPhoto, PHOTO_CREDIT, PHOTO_SHAPE } from "@/lib/data/photos";
import { sceneUrl } from "@/lib/illustration/scenes";
import type { TourmindResult } from "./search";
import type {
  CanonicalHotel,
  CanonicalRoom,
  HotelImage,
  Locale,
  Offer,
  SearchIntent,
} from "@/lib/types";

/**
 * A TourMind property as the rest of the app sees it.
 *
 * The last step of the contract: from here down, nothing knows this came from
 * TourMind. The offer ids are opaque, the rate codes stay on the server, and
 * the shape is identical to a simulated or Hotelbeds property.
 */

/**
 * Their static catalogue has images, but the sync stores only what mapping
 * needs. Until imagery is synced too, a live property borrows the illustrative
 * set — labelled as illustrative, exactly as the demo catalogue is, so a guest
 * is never shown a photograph presented as this specific hotel.
 */
function images(slug: string, name: string, locale: Locale): HotelImage[] {
  const categories: HotelImage["category"][] = ["exterior", "lobby", "room", "dining"];
  return categories.map((category, index) => {
    const photo = propertyPhoto(slug, category, index, { shape: PHOTO_SHAPE.frame });
    return {
      id: `${slug}-${category}-${index}`,
      url: photo.src,
      srcSet: photo.srcSet,
      fallbackUrl: sceneUrl(`${slug}-${index}`, category),
      alt: `${name}`,
      category,
      credit: PHOTO_CREDIT[locale],
    };
  });
}

export function normalizeTourmind(
  result: TourmindResult,
  intent: SearchIntent,
  locale: Locale,
): { hotel: CanonicalHotel; rooms: CanonicalRoom[]; offers: Offer[] } {
  const { record, slug, offers: raw } = result;
  const destination = record.citySlug ? getDestination(record.citySlug) : undefined;
  const ar = locale === "ar";

  const hotel: CanonicalHotel = {
    canonicalHotelId: slug,
    slug,
    name: record.name,
    category: record.stars ?? 0,
    propertyType: ar ? "فندق" : "Hotel",
    destinationId: destination?.id ?? "",
    address: {
      line1: record.address ?? "",
      city: destination ? localized(destination.name, locale) : record.cityName,
      country: destination ? localized(destination.country, locale) : record.countryCode,
      countryCode: record.countryCode,
      neighborhood: destination ? localized(destination.neighborhoods[0].name, locale) : "",
    },
    coordinates: { lat: record.lat, lng: record.lng },
    // Distances are local knowledge the supplier did not give us.
    landmarks: [],
    descriptions: {
      overview: "",
      location: "",
      family: "",
      accessibility: "",
    },
    amenities: [],
    images: images(slug, record.name, locale),
    policies: {
      checkInFrom: "15:00",
      checkOutBy: "12:00",
      childPolicy: "",
      cotPolicy: "",
      petPolicy: "",
      parking: "",
      smoking: "",
      idRequirement: ar
        ? "يجب إبراز الهوية أو جواز السفر عند تسجيل الوصول."
        : "Photo ID or passport is required at check-in.",
      accessibility: "",
      localFees: [],
    },
    notices: [],
    qualityBadges: [],
    contentProvenance: ar
      ? "محتوى مقدَّم من مصدر توريد مباشر."
      : "Supplied by a direct supply source.",
    seo: {
      metaTitle: record.name,
      metaDescription: "",
      breadcrumbs: destination
        ? [localized(destination.country, locale), localized(destination.name, locale), record.name]
        : [record.name],
    },
  };

  /*
   * They return rates, not rooms — a "room type" here is whatever distinct
   * room names the rates carry. Grouping by name is the only signal available,
   * and rates whose names differ stay apart rather than being merged on a
   * guess (§8.3: never claim two rooms are equivalent without evidence).
   */
  const roomIds = new Map<string, string>();
  const rooms: CanonicalRoom[] = [];
  for (const offer of raw) {
    if (roomIds.has(offer.roomName)) continue;
    const id = `${slug}::${roomIds.size}`;
    roomIds.set(offer.roomName, id);
    rooms.push({
      canonicalRoomId: id,
      name: offer.roomName,
      // The supplier gives no mapping confidence, so nothing here claims one.
      mappingConfidence: 0,
      beds: offer.bedText ? [{ type: offer.bedText, count: 1 }] : [],
      maxAdults: intent.rooms[0]?.adults ?? 2,
      maxChildren: intent.rooms[0]?.childrenAges.length ?? 0,
      maxOccupancy:
        (intent.rooms[0]?.adults ?? 2) + (intent.rooms[0]?.childrenAges.length ?? 0),
      smoking: false,
      accessible: false,
      amenities: [],
      images: [],
    });
  }

  const offers: Offer[] = raw.map((offer, index) => {
    const board = BOARD_CATALOG[offer.boardCode];
    return {
      // Opaque and positional: the supplier's RateCode never leaves the server.
      offerId: `${slug}::o${index}`,
      canonicalRoomId: roomIds.get(offer.roomName) ?? `${slug}::0`,
      board: {
        code: offer.boardCode,
        label: board ? localized(board.label, locale) : offer.boardCode,
        detail: board ? localized(board.detail, locale) : "",
      },
      paymentTiming: "payNow",
      cancellation: offer.cancellation,
      price: offer.price,
      comments: [],
      badges: [],
      remainingLabel: offer.remainingLabel,
      capabilities: {
        // Their prebook call is mandatory before booking, hence always true.
        recheckRequired: true,
        cancellationQuote: false,
        modifyAllowed: false,
        guaranteeEligible: false,
        instantConfirmation: true,
      },
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      roomsCovered: intent.rooms.length,
      scores: { price: 0, flexibility: 0, quality: 0, location: 0, fit: 0 },
    };
  });

  return { hotel, rooms, offers };
}
