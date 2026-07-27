import type { HotelSeed } from "./hotels";
import { CITIES, type City } from "./geo/cities";
import { getCountry } from "./geo/countries";
import type { Region } from "./geo/countries";

/**
 * Demo inventory for every city the platform lists.
 *
 * Twenty properties were written by hand, which was fine while the catalogue
 * was six cities. It is not a way to cover a hundred and eighty. These are
 * generated from the city record instead: same shape, same room templates, same
 * pricing pipeline, so a stay in Lima behaves exactly like a stay in Riyadh
 * everywhere downstream.
 *
 * Two things this deliberately does not do.
 *
 * It does not invent brands. Every generated property is named for its city and
 * its type — "Lisbon Riverside Aparthotel" — because a plausible-looking
 * invented chain name is the kind of thing that later gets mistaken for real
 * inventory.
 *
 * It does not invent local knowledge. Landmarks and neighbourhood character
 * come from the curated overlay or not at all; a generated property in a city
 * nobody has written about gets the generic areas from `editorial.ts`, which
 * are true anywhere.
 *
 * Real inventory comes from Hotelbeds, which is worldwide already. This is what
 * fills the catalogue when the supplier is not configured, so the product can
 * be demonstrated end to end in any market.
 */

/* --------------------------------------------------------- price levels */

/**
 * Roughly what a mid-market night costs, in SAR, before board and taxes.
 * Regional baselines with per-country overrides where the region average would
 * be badly wrong — Switzerland is not Romania, Japan is not Nepal.
 */
const REGION_BASE: Record<Region, number> = {
  europe: 620,
  northAmerica: 720,
  middleEast: 560,
  asia: 380,
  oceania: 640,
  southAmerica: 330,
  africa: 340,
};

const COUNTRY_BASE: Record<string, number> = {
  CH: 1100, NO: 950, IS: 950, DK: 880, GB: 820, IE: 720, NL: 780, SE: 700, FI: 680,
  FR: 780, IT: 700, DE: 700, AT: 680, ES: 600, PT: 520, GR: 540, HR: 520,
  CZ: 430, PL: 380, HU: 380, RO: 320, RU: 380,
  US: 780, CA: 640, MX: 420, CU: 300, DO: 480, JM: 520, PA: 380, CR: 430,
  BR: 380, AR: 300, CL: 360, PE: 300, CO: 300, UY: 380,
  JP: 620, KR: 520, CN: 430, HK: 620, TW: 430, SG: 780, MY: 340, TH: 340,
  VN: 260, ID: 340, PH: 300, IN: 280, LK: 280, MV: 1600, NP: 200,
  PK: 220, BD: 220, KZ: 300, UZ: 260, AZ: 300, GE: 280,
  AU: 680, NZ: 600, FJ: 620,
  AE: 700, QA: 640, KW: 520, BH: 480, OM: 480, SA: 560, JO: 420, LB: 380, IL: 700,
  TR: 400, EG: 300, MA: 380, TN: 280, DZ: 260,
  ZA: 380, KE: 380, TZ: 420, NG: 340, GH: 340, ET: 260, MU: 700, SC: 900,
};

function baseNightly(city: City): number {
  const country = getCountry(city.countryCode);
  const base = COUNTRY_BASE[city.countryCode] ?? REGION_BASE[country?.region ?? "asia"];
  // Headline cities carry a premium over the country's other listings.
  const tierMultiplier = city.tier === 1 ? 1.25 : city.tier === 2 ? 1.05 : 0.9;
  return Math.round(base * tierMultiplier);
}

/* ---------------------------------------------------------- archetypes */

/**
 * The spread a city's results page needs to be useful: something central and
 * expensive, something for business, something for families, something cheap,
 * and something that is not a hotel at all.
 */
interface Archetype {
  key: string;
  /** English descriptor; the Arabic name is assembled from the type instead. */
  label: string;
  propertyType: string;
  area: string;
  category: number;
  /** Multiplier on the city's mid-market base. */
  price: number;
  amenities: string[];
  rooms: string[];
  tags: string[];
  review: { score: number; count: number };
  sourceCount: 1 | 2;
  qualityBadges?: string[];
  localFeeSar?: number;
  depositSar?: number;
}

const ARCHETYPES: Archetype[] = [
  {
    key: "grand",
    label: "Grand Hotel",
    propertyType: "hotel",
    area: "centre",
    category: 5,
    price: 1.7,
    amenities: ["wifi", "pool", "gym", "spa", "restaurant", "roomService", "valet", "concierge", "lounge", "business", "meeting", "accessibleProperty"],
    rooms: ["std-king", "std-twin", "deluxe-city", "junior-suite", "accessible-king"],
    tags: ["luxury", "city", "business"],
    review: { score: 8.8, count: 1840 },
    sourceCount: 2,
    qualityBadges: ["verifiedQuality"],
  },
  {
    key: "central",
    label: "Central Hotel",
    propertyType: "hotel",
    area: "centre",
    category: 4,
    price: 1.0,
    amenities: ["wifi", "gym", "restaurant", "laundry", "parking", "accessibleProperty"],
    rooms: ["std-king", "std-twin", "deluxe-city", "accessible-king"],
    tags: ["city", "value"],
    review: { score: 8.2, count: 1260 },
    sourceCount: 2,
  },
  {
    key: "business",
    label: "Business Tower",
    propertyType: "serviced",
    area: "business",
    category: 4,
    price: 1.25,
    amenities: ["wifi", "gym", "business", "meeting", "restaurant", "laundry", "evCharging", "indoorPool"],
    rooms: ["deluxe-city", "junior-suite", "one-bed-apartment"],
    tags: ["business", "city"],
    review: { score: 8.5, count: 690 },
    sourceCount: 1,
    qualityBadges: ["businessReady"],
  },
  {
    key: "residences",
    label: "Park Residences",
    propertyType: "aparthotel",
    area: "waterfront",
    category: 4,
    price: 0.95,
    amenities: ["wifi", "gym", "parking", "familyRooms", "laundry", "kidsClub", "accessibleProperty"],
    rooms: ["one-bed-apartment", "family-suite", "accessible-king"],
    tags: ["family", "value"],
    review: { score: 8.3, count: 540 },
    sourceCount: 1,
    depositSar: 300,
  },
  {
    key: "boutique",
    label: "Old Town Boutique",
    propertyType: "boutique",
    area: "centre",
    category: 4,
    price: 1.15,
    amenities: ["wifi", "restaurant", "concierge", "lounge", "petFriendly"],
    rooms: ["std-king", "deluxe-city", "junior-suite"],
    tags: ["city", "luxury"],
    review: { score: 8.9, count: 410 },
    sourceCount: 1,
  },
  {
    key: "inn",
    label: "Station Inn",
    propertyType: "guesthouse",
    area: "centre",
    category: 3,
    price: 0.6,
    amenities: ["wifi", "laundry", "restaurant"],
    rooms: ["std-king", "std-twin", "superior-ambiguous"],
    tags: ["value", "lastminute", "city"],
    review: { score: 7.7, count: 980 },
    sourceCount: 2,
    localFeeSar: 25,
  },
  {
    key: "hostel",
    label: "Traveller Hostel",
    propertyType: "hostel",
    area: "centre",
    category: 2,
    price: 0.35,
    amenities: ["wifi", "laundry"],
    rooms: ["std-twin", "superior-ambiguous"],
    tags: ["value", "lastminute"],
    review: { score: 7.9, count: 1420 },
    sourceCount: 1,
  },
  {
    key: "airport",
    label: "Airport Hotel",
    propertyType: "hotel",
    area: "airport",
    category: 4,
    price: 0.85,
    amenities: ["wifi", "airportShuttle", "gym", "restaurant", "parking", "accessibleProperty", "business"],
    rooms: ["std-king", "std-twin", "accessible-king"],
    tags: ["business", "value", "lastminute"],
    review: { score: 8.0, count: 2100 },
    sourceCount: 2,
  },
];

/** Coastal and island cities get a resort instead of a park residence. */
const RESORT: Archetype = {
  key: "resort",
  label: "Beach Resort",
  propertyType: "resort",
  area: "waterfront",
  category: 5,
  price: 1.55,
  amenities: ["wifi", "pool", "beach", "spa", "gym", "restaurant", "roomService", "kidsClub", "familyRooms", "valet", "accessibleProperty"],
  rooms: ["deluxe-sea", "family-suite", "junior-suite", "garden-villa", "accessible-king"],
  tags: ["beach", "luxury", "family"],
  review: { score: 8.7, count: 1520 },
  sourceCount: 2,
  qualityBadges: ["guestFavourite"],
};

/**
 * Cities where a beach resort is a real product rather than a fiction. Kept as
 * an explicit list because guessing from coordinates would put a beach resort
 * in cities that have a coastline and no beach trade.
 */
const COASTAL = new Set([
  "jeddah", "dubai", "abu-dhabi", "ras-al-khaimah", "sharjah", "doha", "muscat", "salalah",
  "manama", "kuwait-city", "beirut", "tel-aviv", "antalya", "bodrum", "izmir",
  "sharm-el-sheikh", "hurghada", "tangier", "tunis", "cape-town", "zanzibar", "port-louis",
  "mahe", "nice", "marseille", "barcelona", "palma", "malaga", "lisbon", "funchal",
  "venice", "naples", "athens", "santorini", "mykonos", "crete", "dubrovnik", "split",
  "miami", "honolulu", "cancun", "tulum", "punta-cana", "montego-bay", "havana",
  "rio-de-janeiro", "cartagena", "phuket", "krabi", "koh-samui", "langkawi", "penang",
  "da-nang", "bali", "lombok", "boracay", "cebu", "goa", "kochi", "colombo", "male",
  "gold-coast", "brisbane", "sydney", "perth", "auckland", "nadi",
]);

/* ----------------------------------------------------------- generation */

/** FNV-1a — small, stable, and enough to spread a few hundred slugs. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic jitter in [-1, 1) from a seed, so prices are not all identical. */
function jitter(seed: string): number {
  return (hash(seed) % 2000) / 1000 - 1;
}

/**
 * Which archetypes a city gets, by prominence.
 *
 * Chosen explicitly rather than by slicing the list, because the list is
 * ordered by price and slicing it cut the budget end off. Small cities ended up
 * showing only premium properties, which made a tier-3 city look *more*
 * expensive than a tier-1 one — Sapporo quoting above Tokyo.
 *
 * Every tier keeps both ends of the range.
 */
const TIER_KEYS: Record<1 | 2 | 3, string[]> = {
  1: ["grand", "central", "business", "residences", "boutique", "inn", "hostel", "airport"],
  2: ["grand", "central", "business", "residences", "inn", "hostel"],
  3: ["grand", "central", "residences", "inn", "hostel"],
};

function archetypesFor(city: City): Archetype[] {
  const base = COASTAL.has(city.slug)
    ? ARCHETYPES.map((a) => (a.key === "residences" ? RESORT : a))
    : ARCHETYPES;
  const wanted = new Set(TIER_KEYS[city.tier]);
  // The resort stands in for the residences slot, so match on either name.
  return base.filter((a) => wanted.has(a.key) || (a.key === "resort" && wanted.has("residences")));
}

function buildHotel(city: City, archetype: Archetype): HotelSeed {
  const nightly = baseNightly(city);
  const seed = `${city.slug}:${archetype.key}`;
  const price = Math.round(nightly * archetype.price * (1 + jitter(seed) * 0.12));
  const spread = 0.045;

  return {
    slug: `${city.slug}-${archetype.key}`,
    name: {
      en: `${city.name} ${archetype.label}`,
      ar: `${city.nameAr ?? city.name} — ${ARABIC_LABEL[archetype.key]}`,
    },
    destinationId: `dest-${city.slug}`,
    neighborhood: archetype.area,
    category: archetype.category,
    propertyType: archetype.propertyType as HotelSeed["propertyType"],
    // Offsets fan the pins out around the city centre so the map is readable.
    offset: {
      lat: jitter(`${seed}:lat`) * spread,
      lng: jitter(`${seed}:lng`) * spread,
    },
    baseNightlySar: price,
    review: {
      score: Math.round((archetype.review.score + jitter(`${seed}:score`) * 0.4) * 10) / 10,
      count: archetype.review.count + (hash(`${seed}:count`) % 600),
    },
    amenities: archetype.amenities,
    rooms: archetype.rooms,
    tags: archetype.tags,
    // Landmark distances are local knowledge; a generated property claims none.
    landmarks: [],
    sourceCount: archetype.sourceCount,
    qualityBadges: archetype.qualityBadges,
    localFeeSar: archetype.localFeeSar,
    depositSar: archetype.depositSar,
  };
}

const ARABIC_LABEL: Record<string, string> = {
  grand: "فندق جراند",
  central: "الفندق المركزي",
  business: "برج الأعمال",
  residences: "أجنحة الحديقة",
  resort: "منتجع الشاطئ",
  boutique: "بوتيك البلدة القديمة",
  inn: "نزل المحطة",
  hostel: "بيت الشباب",
  airport: "فندق المطار",
};

/**
 * Generated inventory for every city that has no hand-written properties.
 *
 * Curated cities are skipped entirely rather than topped up: mixing a written
 * property with a generated one in the same results list would make the written
 * detail look like an accident of which row you clicked.
 */
export function generateHotels(curatedDestinationIds: Set<string>): HotelSeed[] {
  const out: HotelSeed[] = [];
  for (const city of CITIES) {
    if (curatedDestinationIds.has(`dest-${city.slug}`)) continue;
    for (const archetype of archetypesFor(city)) {
      out.push(buildHotel(city, archetype));
    }
  }
  return out;
}
