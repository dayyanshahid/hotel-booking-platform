import type { DestinationType, Locale } from "../types";
import { localized } from "./catalog";
import { EDITORIAL, templatedEditorial, type Editorial } from "./editorial";
import { CITIES, getCity, type City } from "./geo/cities";
import { COUNTRIES, getCountry, type Country, type Region } from "./geo/countries";
import { isCurrencyCode, type CurrencyCode } from "../currencies";

type L = Record<Locale, string>;

/**
 * Destinations, assembled rather than authored.
 *
 * A destination is a row in `geo/cities.ts`, joined to its country and — when
 * one exists — to curated copy in `editorial.ts`. Nothing about a place has to
 * be written before it can be searched, which is what lets this cover 180-odd
 * cities across 80-odd countries instead of the six somebody had time to write.
 *
 * The exported shape is the same one the hand-written six had, so search,
 * normalisation, the landing pages and the sitemap all kept working across the
 * change.
 */

export interface DestinationSeed {
  id: string;
  slug: string;
  type: DestinationType;
  name: L;
  country: L;
  countryCode: string;
  region: Region;
  timezone: string;
  coordinates: { lat: number; lng: number };
  /** Currency travellers are usually quoted locally — seeds the display default. */
  currency: CurrencyCode;
  /** 1 = home page, 2 = region page, 3 = search and country pages. */
  tier: 1 | 2 | 3;
  /** True when a writer has been here; false when the content is templated. */
  curated: boolean;
  blurb: L;
  neighborhoods: { key: string; name: L; blurb: L }[];
  faqs: { q: L; a: L }[];
}

/** Arabic exonyms exist for major places, not for all 183. Fall back to the endonym. */
function bilingual(name: string, arabic: string | undefined): L {
  return { en: name, ar: arabic ?? name };
}

function assemble(city: City): DestinationSeed | null {
  const country: Country | undefined = getCountry(city.countryCode);
  if (!country) return null;

  const curated = EDITORIAL[city.slug];
  const content: Editorial = curated ?? templatedEditorial(city.name, country.name);

  return {
    id: `dest-${city.slug}`,
    slug: city.slug,
    type: "city",
    name: bilingual(city.name, city.nameAr),
    country: bilingual(country.name, country.nameAr),
    countryCode: country.code,
    region: country.region,
    timezone: city.timezone,
    coordinates: city.coordinates,
    currency: isCurrencyCode(country.currency) ? country.currency : "USD",
    tier: city.tier,
    curated: Boolean(curated),
    blurb: content.blurb,
    neighborhoods: content.neighborhoods,
    faqs: content.faqs,
  };
}

export const DESTINATIONS: DestinationSeed[] = CITIES.map(assemble).filter(
  (d): d is DestinationSeed => d !== null,
);

const BY_KEY = new Map<string, DestinationSeed>();
for (const d of DESTINATIONS) {
  BY_KEY.set(d.id, d);
  BY_KEY.set(d.slug, d);
}

export function getDestination(id: string): DestinationSeed | undefined {
  return BY_KEY.get(id);
}

export function destinationLabel(d: DestinationSeed, locale: Locale): string {
  return localized(d.name, locale);
}

export function destinationsInCountry(code: string): DestinationSeed[] {
  return DESTINATIONS.filter((d) => d.countryCode === code.toUpperCase());
}

export function destinationsInRegion(region: Region): DestinationSeed[] {
  return DESTINATIONS.filter((d) => d.region === region);
}

/**
 * Headline destinations, dealt round-robin across regions so the list reads as
 * a world rather than as whichever market happens to have the most entries.
 */
export function featuredDestinations(limit = 12): DestinationSeed[] {
  const byRegion = new Map<Region, DestinationSeed[]>();
  for (const d of DESTINATIONS.filter((x) => x.tier === 1)) {
    byRegion.set(d.region, [...(byRegion.get(d.region) ?? []), d]);
  }
  const queues = [...byRegion.values()];
  const out: DestinationSeed[] = [];
  for (let i = 0; out.length < limit && queues.some((q) => q.length > i); i += 1) {
    for (const q of queues) {
      if (q[i] && out.length < limit) out.push(q[i]);
    }
  }
  return out;
}

/** Countries that have at least one bookable destination. */
export function bookableCountryList(): Country[] {
  const codes = new Set(DESTINATIONS.map((d) => d.countryCode));
  return COUNTRIES.filter((c) => codes.has(c.code)).sort((a, b) => a.name.localeCompare(b.name));
}

/** A destination's raw geography, for callers that need the city record. */
export function destinationCity(d: DestinationSeed): City | undefined {
  return getCity(d.slug);
}

/* ------------------------------------------------------------ extra places */

export interface ExtraPlace {
  id: string;
  type: DestinationType;
  name: L;
  destinationId: string;
  coordinates: { lat: number; lng: number };
}

/**
 * Airports and landmarks that resolve to a parent destination, so searching
 * "Burj Khalifa" or "JFK" lands on the right city.
 *
 * Curated, like editorial copy: a place earns an entry when somebody adds it,
 * and the city itself stays reachable by name either way.
 */
export const EXTRA_PLACES: ExtraPlace[] = [
  { id: "poi-ruh-airport", type: "airport", name: { en: "King Khalid International Airport (RUH)", ar: "مطار الملك خالد الدولي (RUH)" }, destinationId: "dest-riyadh", coordinates: { lat: 24.9576, lng: 46.6988 } },
  { id: "poi-kingdom-centre", type: "landmark", name: { en: "Kingdom Centre", ar: "مركز المملكة" }, destinationId: "dest-riyadh", coordinates: { lat: 24.7113, lng: 46.6745 } },
  { id: "poi-diriyah", type: "landmark", name: { en: "Diriyah / At-Turaif", ar: "الدرعية / الطريف" }, destinationId: "dest-riyadh", coordinates: { lat: 24.7361, lng: 46.5757 } },
  { id: "poi-jed-airport", type: "airport", name: { en: "King Abdulaziz International Airport (JED)", ar: "مطار الملك عبدالعزيز الدولي (JED)" }, destinationId: "dest-jeddah", coordinates: { lat: 21.6796, lng: 39.1565 } },
  { id: "poi-albalad", type: "landmark", name: { en: "Al-Balad Historic District", ar: "منطقة البلد التاريخية" }, destinationId: "dest-jeddah", coordinates: { lat: 21.4837, lng: 39.1867 } },
  { id: "poi-haram", type: "landmark", name: { en: "Masjid al-Haram", ar: "المسجد الحرام" }, destinationId: "dest-makkah", coordinates: { lat: 21.4225, lng: 39.8262 } },
  { id: "poi-nabawi", type: "landmark", name: { en: "Al-Masjid an-Nabawi", ar: "المسجد النبوي" }, destinationId: "dest-madinah", coordinates: { lat: 24.4672, lng: 39.6112 } },
  { id: "poi-dxb-airport", type: "airport", name: { en: "Dubai International Airport (DXB)", ar: "مطار دبي الدولي (DXB)" }, destinationId: "dest-dubai", coordinates: { lat: 25.2532, lng: 55.3657 } },
  { id: "poi-burj-khalifa", type: "landmark", name: { en: "Burj Khalifa", ar: "برج خليفة" }, destinationId: "dest-dubai", coordinates: { lat: 25.1972, lng: 55.2744 } },
  { id: "poi-doh-airport", type: "airport", name: { en: "Hamad International Airport (DOH)", ar: "مطار حمد الدولي (DOH)" }, destinationId: "dest-doha", coordinates: { lat: 25.2731, lng: 51.6081 } },
  { id: "poi-souq-waqif", type: "landmark", name: { en: "Souq Waqif", ar: "سوق واقف" }, destinationId: "dest-doha", coordinates: { lat: 25.2872, lng: 51.5333 } },
  { id: "poi-ist-airport", type: "airport", name: { en: "Istanbul Airport (IST)", ar: "مطار إسطنبول (IST)" }, destinationId: "dest-istanbul", coordinates: { lat: 41.2753, lng: 28.7519 } },
  { id: "poi-hagia-sophia", type: "landmark", name: { en: "Hagia Sophia", ar: "آيا صوفيا" }, destinationId: "dest-istanbul", coordinates: { lat: 41.0086, lng: 28.98 } },
  { id: "poi-lhr-airport", type: "airport", name: { en: "London Heathrow (LHR)", ar: "مطار هيثرو (LHR)" }, destinationId: "dest-london", coordinates: { lat: 51.47, lng: -0.4543 } },
  { id: "poi-tower-bridge", type: "landmark", name: { en: "Tower Bridge", ar: "جسر البرج" }, destinationId: "dest-london", coordinates: { lat: 51.5055, lng: -0.0754 } },
  { id: "poi-cdg-airport", type: "airport", name: { en: "Paris Charles de Gaulle (CDG)", ar: "مطار شارل ديغول (CDG)" }, destinationId: "dest-paris", coordinates: { lat: 49.0097, lng: 2.5479 } },
  { id: "poi-eiffel", type: "landmark", name: { en: "Eiffel Tower", ar: "برج إيفل" }, destinationId: "dest-paris", coordinates: { lat: 48.8584, lng: 2.2945 } },
  { id: "poi-jfk-airport", type: "airport", name: { en: "New York JFK (JFK)", ar: "مطار جون كنيدي (JFK)" }, destinationId: "dest-new-york", coordinates: { lat: 40.6413, lng: -73.7781 } },
  { id: "poi-times-square", type: "landmark", name: { en: "Times Square", ar: "تايمز سكوير" }, destinationId: "dest-new-york", coordinates: { lat: 40.758, lng: -73.9855 } },
  { id: "poi-sagrada", type: "landmark", name: { en: "Sagrada Família", ar: "ساغرادا فاميليا" }, destinationId: "dest-barcelona", coordinates: { lat: 41.4036, lng: 2.1744 } },
  { id: "poi-colosseum", type: "landmark", name: { en: "Colosseum", ar: "الكولوسيوم" }, destinationId: "dest-rome", coordinates: { lat: 41.8902, lng: 12.4922 } },
  { id: "poi-hnd-airport", type: "airport", name: { en: "Tokyo Haneda (HND)", ar: "مطار هانيدا (HND)" }, destinationId: "dest-tokyo", coordinates: { lat: 35.5494, lng: 139.7798 } },
  { id: "poi-shibuya", type: "landmark", name: { en: "Shibuya Crossing", ar: "تقاطع شيبويا" }, destinationId: "dest-tokyo", coordinates: { lat: 35.6595, lng: 139.7004 } },
  { id: "poi-sin-airport", type: "airport", name: { en: "Singapore Changi (SIN)", ar: "مطار شانغي (SIN)" }, destinationId: "dest-singapore", coordinates: { lat: 1.3644, lng: 103.9915 } },
  { id: "poi-marina-bay", type: "landmark", name: { en: "Marina Bay Sands", ar: "مارينا باي ساندز" }, destinationId: "dest-singapore", coordinates: { lat: 1.2836, lng: 103.8607 } },
  { id: "poi-bkk-airport", type: "airport", name: { en: "Bangkok Suvarnabhumi (BKK)", ar: "مطار سوفارنابومي (BKK)" }, destinationId: "dest-bangkok", coordinates: { lat: 13.69, lng: 100.7501 } },
  { id: "poi-opera-house", type: "landmark", name: { en: "Sydney Opera House", ar: "دار أوبرا سيدني" }, destinationId: "dest-sydney", coordinates: { lat: -33.8568, lng: 151.2153 } },
  { id: "poi-schiphol", type: "airport", name: { en: "Amsterdam Schiphol (AMS)", ar: "مطار سخيبول (AMS)" }, destinationId: "dest-amsterdam", coordinates: { lat: 52.3105, lng: 4.7683 } },
];
