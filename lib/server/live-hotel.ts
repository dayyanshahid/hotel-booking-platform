import "server-only";
import { getHotelBySlug, getTypes } from "./hotelbeds/content";
import { isHotelbedsEnabled } from "./hotelbeds/config";
import { buildCanonicalHotelFromContent } from "./hotelbeds/adapter";
import { isTourmindSlug, tourmindSlug } from "./tourmind/search";
import { tourmindHotels } from "./tourmind/catalogue";
import { getDestination } from "../data/destinations";
import { localized } from "../data/catalog";
import type { CanonicalHotel, Locale } from "../types";

/**
 * A property page for something we do not hold a seed for.
 *
 * Search has always returned live supply, and every one of those results led to
 * a "page not found" — the detail route only knew the demo catalogue. A result
 * you cannot open is worse than a result you never saw, because the traveller
 * has already decided they want it.
 *
 * The content is the supplier's own, read from the local cache rather than
 * fetched: a property page must render for a crawler and for a visitor who
 * never searched, and neither is a good reason to spend a rate-limited request.
 * That also means an unsynced property is honestly absent rather than slow.
 */
export async function liveHotelBySlug(slug: string, locale: Locale): Promise<CanonicalHotel | null> {
  if (isTourmindSlug(slug)) return tourmindHotelBySlug(slug, locale);
  if (slug.startsWith("hb-")) return hotelbedsHotelBySlug(slug, locale);
  return null;
}

async function hotelbedsHotelBySlug(slug: string, locale: Locale): Promise<CanonicalHotel | null> {
  if (!isHotelbedsEnabled()) return null;
  const [content, types] = await Promise.all([getHotelBySlug(slug), getTypes()]);
  if (!content) return null;
  return buildCanonicalHotelFromContent(content, types, locale);
}

/**
 * TourMind gives a catalogue row rather than rich content: a name, a city, a
 * star count and a point on a map. That is enough for a page that is honest
 * about what it knows, and nothing here invents the rest.
 */
async function tourmindHotelBySlug(slug: string, locale: Locale): Promise<CanonicalHotel | null> {
  const records = await tourmindHotels().catch(() => []);
  const record = records.find((candidate) => tourmindSlug(candidate.hotelId) === slug);
  if (!record) return null;

  const destination = record.citySlug ? getDestination(record.citySlug) : undefined;
  const ar = locale === "ar";

  return {
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
      neighborhood: destination ? localized(destination.neighborhoods[0].name, locale) : record.cityName,
    },
    coordinates: { lat: record.lat, lng: record.lng },
    landmarks: [],
    descriptions: { overview: "", location: "", family: "", accessibility: "" },
    amenities: [],
    images: [],
    /*
     * Blank rather than invented. The supplier's catalogue carries no policy
     * text, and a plausible-sounding check-in time on a page a guest will plan
     * around is worse than an empty field they can ask about.
     */
    policies: {
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
    contentProvenance: ar ? "محتوى مقدَّم من العقار" : "Property-supplied content",
    seo: {
      metaTitle: `${record.name} — ${record.cityName}`,
      metaDescription: `${record.name}, ${record.cityName}`,
      breadcrumbs: [record.countryCode, record.cityName, record.name],
    },
  };
}
