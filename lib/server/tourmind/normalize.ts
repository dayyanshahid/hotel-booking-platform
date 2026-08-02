import { getDestination } from "@/lib/data/destinations";
import { localized, BOARD_CATALOG } from "@/lib/data/catalog";
import type { TourmindOfferBinding } from "../store";
import type { TourmindHotelRecord } from "./catalogue";
import { AMENITY_CATALOG } from "@/lib/data/catalog";
import { sceneUrl } from "@/lib/illustration/scenes";
import type { TourmindResult } from "./search";
import type {
  Amenity,
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
 * Their photography, served through our own proxy.
 *
 * A TourMind property used to borrow the illustrative set the demo catalogue
 * uses — stand-in pictures of somewhere else, on the page of a real hotel an
 * agent was about to sell. Their static list has carried the real images all
 * along; the sync simply threw them away.
 *
 * The proxy is not decoration: their host is plain HTTP and naming a supplier's
 * CDN in an image tag tells every visitor who our wholesaler is (§9.4).
 */
function tmImageUrl(path: string | undefined): string | undefined {
  return path ? `/api/image/supplier?s=tm&p=${encodeURIComponent(path)}` : undefined;
}

/** Their captions are the only category signal, and only sometimes. */
function categoryFor(caption: string | undefined): HotelImage["category"] {
  const text = (caption ?? "").toLowerCase();
  if (/room|suite|bed/.test(text)) return "room";
  if (/lobby|reception|interior/.test(text)) return "lobby";
  if (/restaurant|dining|breakfast|bar/.test(text)) return "dining";
  if (/pool|beach|garden|view|terrace/.test(text)) return "view";
  return "exterior";
}

function images(record: TourmindHotelRecord, slug: string, locale: Locale): HotelImage[] {
  const supplied = (record.images ?? [])
    .map((image, index) => {
      const url = tmImageUrl(image.large ?? image.small);
      if (!url) return null;
      const entry: HotelImage = {
        id: `${slug}-${index}`,
        url,
        fallbackUrl: sceneUrl(`${slug}-${index}`, categoryFor(image.caption)),
        alt: image.caption ? `${record.name} — ${image.caption}` : record.name,
        caption: image.caption,
        category: categoryFor(image.caption),
      };
      return entry;
    })
    .filter((image): image is HotelImage => image !== null);

  if (supplied.length) return supplied;

  /*
   * No photography from the supplier: a drawing, plainly labelled, rather than
   * a photograph of a different building. An empty frame is more honest than a
   * borrowed one.
   */
  const categories: HotelImage["category"][] = ["exterior", "lobby", "room", "dining"];
  return categories.map((category, index) => ({
    id: `${slug}-${category}-${index}`,
    url: sceneUrl(`${slug}-${index}`, category),
    fallbackUrl: sceneUrl(`${slug}-${index}`, category),
    alt: record.name,
    category,
    credit: locale === "ar" ? "رسم توضيحي" : "Illustration",
  }));
}

/**
 * Their amenity names onto ours, where the two plainly mean the same thing.
 *
 * Matching lets a TourMind property be counted by the same facet as a Hotelbeds
 * one; anything unmatched keeps the supplier's own words rather than being
 * dropped or forced into a category it does not belong in.
 */
const AMENITY_KEYWORDS: [RegExp, string][] = [
  [/wi-?fi|internet/i, "wifi"],
  [/indoor pool/i, "indoorPool"],
  [/pool/i, "pool"],
  [/fitness|gym/i, "gym"],
  [/spa|massage/i, "spa"],
  [/valet/i, "valet"],
  [/parking/i, "parking"],
  [/restaurant|dining/i, "restaurant"],
  [/room service/i, "roomService"],
  [/beach/i, "beach"],
  [/business cent/i, "business"],
  [/meeting|banquet|conference/i, "meeting"],
  [/airport (shuttle|transfer)/i, "airportShuttle"],
  [/laundry|dry clean/i, "laundry"],
  [/electric car|ev charg/i, "evCharging"],
  [/wheelchair|accessible/i, "accessibleProperty"],
  [/pet/i, "petFriendly"],
  [/concierge/i, "concierge"],
  [/lounge/i, "lounge"],
  [/air condition/i, "aircon"],
  [/minibar|mini bar/i, "minibar"],
  [/safe\b/i, "safe"],
  [/kitchen/i, "kitchenette"],
  [/balcony|terrace/i, "balcony"],
  [/bath ?tub/i, "bathtub"],
  [/kids|children/i, "kidsClub"],
];

function amenities(record: TourmindHotelRecord, locale: Locale): Amenity[] {
  const out: Amenity[] = [];
  const seen = new Set<string>();
  for (const name of record.amenities ?? []) {
    const matched = AMENITY_KEYWORDS.find(([pattern]) => pattern.test(name))?.[1];
    const code = matched ?? `tm:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      // Ours when we recognise it — so it counts with everyone else's — and
      // theirs verbatim when we do not.
      label: matched ? localized(AMENITY_CATALOG[matched].label, locale) : name,
      scope: "property",
      // Their list says what exists, never what it costs. Claiming "included"
      // would be inventing a commercial term.
      included: false,
    });
  }
  return out;
}

export function normalizeTourmind(
  result: TourmindResult,
  intent: SearchIntent,
  locale: Locale,
): {
  hotel: CanonicalHotel;
  rooms: CanonicalRoom[];
  offers: Offer[];
  /**
   * offerId → what booking this rate needs, server-side only.
   *
   * The same shape Hotelbeds' adapter returns, and for the same reason: the
   * browser is handed an opaque offer id, and everything needed to buy the room
   * — their rate code, the net, the currency — is looked up here rather than
   * travelling through the client (§9.4).
   */
  contexts: Map<string, TourmindOfferBinding>;
} {
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
      // Their catalogue places a property in a city, not a district. Borrowing
      // our own editorial neighbourhood would put a hotel in a part of town
      // nobody said it was in.
      neighborhood: "",
    },
    coordinates: { lat: record.lat, lng: record.lng },
    // Distances are local knowledge the supplier did not give us.
    landmarks: [],
    descriptions: {
      // Their words, verbatim. `Headline` is a one-liner and `Location` is the
      // paragraph; neither is rewritten here.
      overview: record.description?.headline ?? "",
      location: record.description?.location ?? "",
      family: "",
      accessibility: "",
    },
    amenities: amenities(record, locale),
    images: images(record, slug, locale),
    policies: {
      /*
       * Blank, because they do not tell us.
       *
       * These used to read 15:00 and 12:00 — plausible, conventional, and
       * invented. A check-in time on a voucher is the sort of detail a guest
       * plans a flight around, and this supplier has never stated one.
       */
      checkInFrom: "",
      checkOutBy: "",
      childPolicy: "",
      cotPolicy: "",
      petPolicy: "",
      parking: "",
      smoking: "",
      idRequirement: "",
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

  const contexts = new Map<string, TourmindOfferBinding>();

  const offers: Offer[] = raw.map((offer, index) => {
    const board = BOARD_CATALOG[offer.boardCode];
    contexts.set(`${slug}::o${index}`, {
      rateCode: offer.rateCode,
      hotelCode: offer.hotelCode,
      net: offer.net,
      supplierCurrency: offer.supplierCurrency,
    });
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
      allotment: offer.allotment,
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

  return { hotel, rooms, offers, contexts };
}
