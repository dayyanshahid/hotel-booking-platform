import type { CanonicalHotel, CanonicalRoom, HotelImage, Locale } from "../types";
import { AMENITY_CATALOG, PROPERTY_TYPES, VIEW_CATALOG, BED_CATALOG, localized } from "./catalog";
import { DESTINATIONS, getDestination } from "./destinations";
import { ROOM_TEMPLATES } from "./rooms";

type L = Record<Locale, string>;

export interface HotelSeed {
  slug: string;
  name: L;
  destinationId: string;
  neighborhood: string;
  category: number;
  propertyType: keyof typeof PROPERTY_TYPES;
  chain?: string;
  /** Offset in degrees from the destination centre. */
  offset: { lat: number; lng: number };
  /** Base nightly price in SAR before board, taxes and occupancy. */
  baseNightlySar: number;
  review?: { score: number; count: number };
  amenities: string[];
  rooms: string[];
  tags: string[];
  landmarks: { label: L; distanceKm: number; type: "landmark" | "airport" | "transit" }[];
  /** How many internal supply sources list this property (drives dedupe messaging). */
  sourceCount: 1 | 2;
  qualityBadges?: string[];
  notice?: { severity: "info" | "warning" | "critical"; from: string; to: string; text: L; alt?: L };
  localFeeSar?: number;
  depositSar?: number;
}

const HOTELS: HotelSeed[] = [
  /* ------------------------------------------------------------- Riyadh */
  {
    slug: "olaya-grand-riyadh",
    name: { en: "Olaya Grand Riyadh", ar: "العليا جراند الرياض" },
    destinationId: "dest-riyadh",
    neighborhood: "olaya",
    category: 5,
    propertyType: "hotel",
    chain: "Grand Collection",
    offset: { lat: 0.004, lng: -0.002 },
    baseNightlySar: 940,
    review: { score: 8.9, count: 2140 },
    amenities: ["wifi", "pool", "gym", "spa", "valet", "restaurant", "roomService", "business", "meeting", "lounge", "prayerRoom", "accessibleProperty", "concierge"],
    rooms: ["std-king", "std-twin", "deluxe-city", "junior-suite", "accessible-king"],
    tags: ["business", "luxury", "city"],
    landmarks: [
      { label: { en: "Kingdom Centre", ar: "مركز المملكة" }, distanceKm: 0.6, type: "landmark" },
      { label: { en: "Olaya Metro Station", ar: "محطة مترو العليا" }, distanceKm: 0.4, type: "transit" },
      { label: { en: "King Khalid International Airport", ar: "مطار الملك خالد الدولي" }, distanceKm: 33, type: "airport" },
    ],
    sourceCount: 2,
    qualityBadges: ["verifiedQuality", "businessReady"],
    localFeeSar: 0,
  },
  {
    slug: "kafd-signature-suites",
    name: { en: "KAFD Signature Suites", ar: "أجنحة كافد سيجنتشر" },
    destinationId: "dest-riyadh",
    neighborhood: "kafd",
    category: 5,
    propertyType: "serviced",
    offset: { lat: 0.09, lng: -0.03 },
    baseNightlySar: 1180,
    review: { score: 9.1, count: 640 },
    amenities: ["wifi", "indoorPool", "gym", "business", "meeting", "restaurant", "valet", "evCharging", "laundry", "accessibleProperty"],
    rooms: ["deluxe-city", "junior-suite", "one-bed-apartment", "accessible-king"],
    tags: ["business", "luxury"],
    landmarks: [
      { label: { en: "KAFD Metro Station", ar: "محطة مترو كافد" }, distanceKm: 0.3, type: "transit" },
      { label: { en: "King Khalid International Airport", ar: "مطار الملك خالد الدولي" }, distanceKm: 26, type: "airport" },
    ],
    sourceCount: 1,
    qualityBadges: ["newProperty"],
  },
  {
    slug: "diriyah-heritage-lodge",
    name: { en: "Diriyah Heritage Lodge", ar: "نزل الدرعية التراثي" },
    destinationId: "dest-riyadh",
    neighborhood: "diriyah",
    category: 4,
    propertyType: "boutique",
    offset: { lat: 0.022, lng: -0.098 },
    baseNightlySar: 690,
    review: { score: 8.6, count: 410 },
    amenities: ["wifi", "restaurant", "parking", "spa", "prayerRoom", "familyRooms", "concierge"],
    rooms: ["std-king", "family-suite", "garden-villa"],
    tags: ["city", "luxury", "family"],
    landmarks: [
      { label: { en: "At-Turaif UNESCO site", ar: "موقع الطريف" }, distanceKm: 0.8, type: "landmark" },
      { label: { en: "King Khalid International Airport", ar: "مطار الملك خالد الدولي" }, distanceKm: 42, type: "airport" },
    ],
    sourceCount: 1,
    notice: {
      severity: "warning",
      from: "2026-08-01",
      to: "2026-12-20",
      text: {
        en: "The main outdoor pool is closed for refurbishment. The spa and restaurant remain open.",
        ar: "المسبح الخارجي الرئيسي مغلق للتجديد. المنتجع الصحي والمطعم يعملان كالمعتاد.",
      },
      alt: {
        en: "Guests may use the partner club pool 900 m away at no charge.",
        ar: "يمكن للنزلاء استخدام مسبح النادي الشريك على بُعد ٩٠٠ متر مجانًا.",
      },
    },
  },
  {
    slug: "riyadh-metro-inn",
    name: { en: "Riyadh Metro Inn", ar: "نزل مترو الرياض" },
    destinationId: "dest-riyadh",
    neighborhood: "sulaimaniyah",
    category: 3,
    propertyType: "hotel",
    offset: { lat: 0.016, lng: 0.011 },
    baseNightlySar: 320,
    review: { score: 7.8, count: 1290 },
    amenities: ["wifi", "parking", "restaurant", "laundry", "prayerRoom"],
    rooms: ["std-king", "std-twin", "superior-ambiguous"],
    tags: ["value", "city", "lastminute"],
    landmarks: [
      { label: { en: "Sulaimaniyah Park", ar: "حديقة السليمانية" }, distanceKm: 0.5, type: "landmark" },
      { label: { en: "King Khalid International Airport", ar: "مطار الملك خالد الدولي" }, distanceKm: 30, type: "airport" },
    ],
    sourceCount: 2,
    localFeeSar: 25,
  },
  {
    slug: "northern-ring-residences",
    name: { en: "Northern Ring Residences", ar: "أجنحة الدائري الشمالي" },
    destinationId: "dest-riyadh",
    neighborhood: "olaya",
    category: 4,
    propertyType: "apartment",
    offset: { lat: 0.031, lng: 0.014 },
    baseNightlySar: 520,
    review: { score: 8.2, count: 870 },
    amenities: ["wifi", "gym", "parking", "familyRooms", "laundry", "kidsClub", "accessibleProperty"],
    rooms: ["one-bed-apartment", "family-suite", "accessible-king"],
    tags: ["family", "value"],
    landmarks: [
      { label: { en: "Panorama Mall", ar: "بانوراما مول" }, distanceKm: 1.2, type: "landmark" },
      { label: { en: "King Khalid International Airport", ar: "مطار الملك خالد الدولي" }, distanceKm: 28, type: "airport" },
    ],
    sourceCount: 1,
    depositSar: 300,
  },

  /* ------------------------------------------------------------- Jeddah */
  {
    slug: "corniche-pearl-jeddah",
    name: { en: "Corniche Pearl Jeddah", ar: "لؤلؤة الكورنيش جدة" },
    destinationId: "dest-jeddah",
    neighborhood: "corniche",
    category: 5,
    propertyType: "resort",
    offset: { lat: 0.021, lng: -0.026 },
    baseNightlySar: 1090,
    review: { score: 9.0, count: 1830 },
    amenities: ["wifi", "pool", "beach", "spa", "gym", "restaurant", "roomService", "kidsClub", "familyRooms", "valet", "prayerRoom", "accessibleProperty"],
    rooms: ["deluxe-sea", "deluxe-city", "family-suite", "junior-suite", "accessible-king"],
    tags: ["beach", "luxury", "family"],
    landmarks: [
      { label: { en: "Jeddah Corniche", ar: "كورنيش جدة" }, distanceKm: 0.2, type: "landmark" },
      { label: { en: "King Abdulaziz International Airport", ar: "مطار الملك عبدالعزيز الدولي" }, distanceKm: 22, type: "airport" },
    ],
    sourceCount: 2,
    qualityBadges: ["verifiedQuality", "guestFavourite"],
    localFeeSar: 0,
  },
  {
    slug: "albalad-coral-house",
    name: { en: "Al-Balad Coral House", ar: "بيت البلد المرجاني" },
    destinationId: "dest-jeddah",
    neighborhood: "albalad",
    category: 4,
    propertyType: "boutique",
    offset: { lat: -0.004, lng: -0.006 },
    baseNightlySar: 610,
    review: { score: 8.7, count: 520 },
    amenities: ["wifi", "restaurant", "concierge", "prayerRoom", "laundry"],
    rooms: ["std-king", "std-twin", "junior-suite"],
    tags: ["city", "luxury"],
    landmarks: [
      { label: { en: "Al-Balad Historic District", ar: "منطقة البلد التاريخية" }, distanceKm: 0.1, type: "landmark" },
      { label: { en: "King Abdulaziz International Airport", ar: "مطار الملك عبدالعزيز الدولي" }, distanceKm: 27, type: "airport" },
    ],
    sourceCount: 1,
    qualityBadges: ["guestFavourite"],
  },
  {
    slug: "obhur-bay-resort",
    name: { en: "Obhur Bay Resort", ar: "منتجع خليج أبحر" },
    destinationId: "dest-jeddah",
    neighborhood: "obhur",
    category: 4,
    propertyType: "resort",
    offset: { lat: 0.19, lng: -0.05 },
    baseNightlySar: 780,
    review: { score: 8.4, count: 960 },
    amenities: ["wifi", "pool", "beach", "restaurant", "kidsClub", "familyRooms", "parking", "airportShuttle"],
    rooms: ["deluxe-sea", "family-suite", "garden-villa"],
    tags: ["beach", "family"],
    landmarks: [
      { label: { en: "Obhur Creek", ar: "خور أبحر" }, distanceKm: 0.4, type: "landmark" },
      { label: { en: "King Abdulaziz International Airport", ar: "مطار الملك عبدالعزيز الدولي" }, distanceKm: 18, type: "airport" },
    ],
    sourceCount: 2,
    depositSar: 400,
  },
  {
    slug: "hamra-business-hotel",
    name: { en: "Al Hamra Business Hotel", ar: "فندق الحمراء للأعمال" },
    destinationId: "dest-jeddah",
    neighborhood: "alhamra",
    category: 4,
    propertyType: "hotel",
    offset: { lat: 0.008, lng: -0.012 },
    baseNightlySar: 560,
    review: { score: 8.1, count: 1430 },
    amenities: ["wifi", "gym", "business", "meeting", "restaurant", "parking", "laundry", "accessibleProperty"],
    rooms: ["std-king", "std-twin", "deluxe-city", "accessible-king"],
    tags: ["business", "value", "city"],
    landmarks: [
      { label: { en: "Jeddah Corniche", ar: "كورنيش جدة" }, distanceKm: 1.1, type: "landmark" },
      { label: { en: "King Abdulaziz International Airport", ar: "مطار الملك عبدالعزيز الدولي" }, distanceKm: 24, type: "airport" },
    ],
    sourceCount: 1,
    localFeeSar: 30,
  },
  {
    slug: "red-sea-value-stay",
    name: { en: "Red Sea Value Stay", ar: "ريد سي فاليو ستاي" },
    destinationId: "dest-jeddah",
    neighborhood: "alhamra",
    category: 3,
    propertyType: "apartment",
    offset: { lat: 0.013, lng: 0.004 },
    baseNightlySar: 290,
    review: { score: 7.5, count: 2210 },
    amenities: ["wifi", "parking", "laundry", "familyRooms"],
    rooms: ["std-twin", "one-bed-apartment", "superior-ambiguous"],
    tags: ["value", "lastminute", "family"],
    landmarks: [
      { label: { en: "Jeddah Corniche", ar: "كورنيش جدة" }, distanceKm: 2.3, type: "landmark" },
      { label: { en: "King Abdulaziz International Airport", ar: "مطار الملك عبدالعزيز الدولي" }, distanceKm: 25, type: "airport" },
    ],
    sourceCount: 2,
    depositSar: 200,
  },

  /* ------------------------------------------------------------- Makkah */
  {
    slug: "ajyad-haram-tower",
    name: { en: "Ajyad Haram Tower", ar: "برج أجياد الحرم" },
    destinationId: "dest-makkah",
    neighborhood: "ajyad",
    category: 5,
    propertyType: "hotel",
    offset: { lat: -0.003, lng: 0.002 },
    baseNightlySar: 1350,
    review: { score: 8.8, count: 3120 },
    amenities: ["wifi", "restaurant", "roomService", "prayerRoom", "laundry", "concierge", "accessibleProperty", "familyRooms"],
    rooms: ["haram-view", "std-twin", "family-suite", "accessible-king"],
    tags: ["luxury", "family"],
    landmarks: [
      { label: { en: "Masjid al-Haram — King Abdulaziz Gate", ar: "المسجد الحرام — بوابة الملك عبدالعزيز" }, distanceKm: 0.25, type: "landmark" },
    ],
    sourceCount: 2,
    qualityBadges: ["verifiedQuality"],
  },
  {
    slug: "jabal-omar-residences",
    name: { en: "Jabal Omar Residences", ar: "أجنحة جبل عمر" },
    destinationId: "dest-makkah",
    neighborhood: "jabalomar",
    category: 5,
    propertyType: "serviced",
    offset: { lat: 0.002, lng: -0.006 },
    baseNightlySar: 1150,
    review: { score: 8.5, count: 1740 },
    amenities: ["wifi", "restaurant", "prayerRoom", "laundry", "familyRooms", "airportShuttle", "accessibleProperty"],
    rooms: ["haram-view", "family-suite", "one-bed-apartment"],
    tags: ["family", "luxury"],
    landmarks: [
      { label: { en: "Masjid al-Haram", ar: "المسجد الحرام" }, distanceKm: 0.5, type: "landmark" },
    ],
    sourceCount: 1,
  },
  {
    slug: "aziziyah-comfort-hotel",
    name: { en: "Al Aziziyah Comfort Hotel", ar: "فندق العزيزية كومفورت" },
    destinationId: "dest-makkah",
    neighborhood: "aziziyah",
    category: 3,
    propertyType: "hotel",
    offset: { lat: -0.028, lng: 0.036 },
    baseNightlySar: 380,
    review: { score: 7.6, count: 2680 },
    amenities: ["wifi", "restaurant", "prayerRoom", "parking", "airportShuttle", "laundry"],
    rooms: ["std-twin", "family-suite", "superior-ambiguous"],
    tags: ["value", "family"],
    landmarks: [
      { label: { en: "Masjid al-Haram (shuttle)", ar: "المسجد الحرام (حافلة)" }, distanceKm: 4.2, type: "landmark" },
    ],
    sourceCount: 2,
    localFeeSar: 20,
  },

  /* -------------------------------------------------------------- Dubai */
  {
    slug: "downtown-skyline-dubai",
    name: { en: "Downtown Skyline Dubai", ar: "داون تاون سكاي لاين دبي" },
    destinationId: "dest-dubai",
    neighborhood: "downtown",
    category: 5,
    propertyType: "hotel",
    chain: "Skyline Hotels",
    offset: { lat: -0.006, lng: 0.005 },
    baseNightlySar: 1290,
    review: { score: 9.0, count: 4210 },
    amenities: ["wifi", "pool", "gym", "spa", "restaurant", "roomService", "valet", "business", "lounge", "concierge", "accessibleProperty"],
    rooms: ["deluxe-city", "junior-suite", "std-king", "accessible-king"],
    tags: ["luxury", "city", "business"],
    landmarks: [
      { label: { en: "Burj Khalifa", ar: "برج خليفة" }, distanceKm: 0.7, type: "landmark" },
      { label: { en: "Burj Khalifa/Dubai Mall Metro", ar: "مترو برج خليفة/دبي مول" }, distanceKm: 0.9, type: "transit" },
      { label: { en: "Dubai International Airport", ar: "مطار دبي الدولي" }, distanceKm: 14, type: "airport" },
    ],
    sourceCount: 2,
    qualityBadges: ["verifiedQuality", "guestFavourite"],
    localFeeSar: 20,
  },
  {
    slug: "marina-walk-hotel",
    name: { en: "Marina Walk Hotel", ar: "فندق مارينا ووك" },
    destinationId: "dest-dubai",
    neighborhood: "marina",
    category: 4,
    propertyType: "hotel",
    offset: { lat: -0.13, lng: -0.13 },
    baseNightlySar: 720,
    review: { score: 8.5, count: 3390 },
    amenities: ["wifi", "pool", "gym", "restaurant", "parking", "familyRooms", "accessibleProperty"],
    rooms: ["std-king", "std-twin", "deluxe-city", "accessible-king"],
    tags: ["city", "value", "family"],
    landmarks: [
      { label: { en: "Dubai Marina Walk", ar: "ممشى مرسى دبي" }, distanceKm: 0.2, type: "landmark" },
      { label: { en: "Dubai International Airport", ar: "مطار دبي الدولي" }, distanceKm: 32, type: "airport" },
    ],
    sourceCount: 1,
    localFeeSar: 15,
  },
  {
    slug: "jbr-beach-resort",
    name: { en: "JBR Beach Resort", ar: "منتجع جي بي آر الشاطئي" },
    destinationId: "dest-dubai",
    neighborhood: "jbr",
    category: 5,
    propertyType: "resort",
    offset: { lat: -0.128, lng: -0.145 },
    baseNightlySar: 1420,
    review: { score: 8.9, count: 2870 },
    amenities: ["wifi", "pool", "beach", "spa", "gym", "kidsClub", "restaurant", "roomService", "familyRooms", "valet"],
    rooms: ["deluxe-sea", "family-suite", "junior-suite", "garden-villa"],
    tags: ["beach", "luxury", "family"],
    landmarks: [
      { label: { en: "The Beach at JBR", ar: "شاطئ جي بي آر" }, distanceKm: 0.1, type: "landmark" },
      { label: { en: "Dubai International Airport", ar: "مطار دبي الدولي" }, distanceKm: 34, type: "airport" },
    ],
    sourceCount: 2,
    localFeeSar: 20,
    notice: {
      severity: "info",
      from: "2026-07-20",
      to: "2026-09-15",
      text: {
        en: "Beach access is via the pool deck while the promenade entrance is resurfaced.",
        ar: "الوصول إلى الشاطئ عبر سطح المسبح أثناء إعادة ترميم مدخل الممشى.",
      },
    },
  },
  {
    slug: "deira-creek-value",
    name: { en: "Deira Creek Value Hotel", ar: "فندق ديرة كريك" },
    destinationId: "dest-dubai",
    neighborhood: "deira",
    category: 3,
    propertyType: "hotel",
    offset: { lat: 0.06, lng: 0.08 },
    baseNightlySar: 340,
    review: { score: 7.4, count: 5120 },
    amenities: ["wifi", "restaurant", "parking", "laundry", "airportShuttle"],
    rooms: ["std-king", "std-twin", "superior-ambiguous"],
    tags: ["value", "lastminute", "city"],
    landmarks: [
      { label: { en: "Dubai Creek", ar: "خور دبي" }, distanceKm: 0.6, type: "landmark" },
      { label: { en: "Dubai International Airport", ar: "مطار دبي الدولي" }, distanceKm: 5, type: "airport" },
    ],
    sourceCount: 2,
    localFeeSar: 10,
  },

  /* --------------------------------------------------------------- Doha */
  {
    slug: "west-bay-corniche-hotel",
    name: { en: "West Bay Corniche Hotel", ar: "فندق كورنيش الخليج الغربي" },
    destinationId: "dest-doha",
    neighborhood: "westbay",
    category: 5,
    propertyType: "hotel",
    offset: { lat: 0.024, lng: 0.001 },
    baseNightlySar: 880,
    review: { score: 8.8, count: 1560 },
    amenities: ["wifi", "pool", "gym", "spa", "restaurant", "business", "meeting", "valet", "lounge", "accessibleProperty"],
    rooms: ["deluxe-sea", "deluxe-city", "junior-suite", "accessible-king"],
    tags: ["business", "luxury", "city"],
    landmarks: [
      { label: { en: "Doha Corniche", ar: "كورنيش الدوحة" }, distanceKm: 0.3, type: "landmark" },
      { label: { en: "Hamad International Airport", ar: "مطار حمد الدولي" }, distanceKm: 12, type: "airport" },
    ],
    sourceCount: 1,
    qualityBadges: ["businessReady"],
  },
  {
    slug: "msheireb-downtown-stay",
    name: { en: "Msheireb Downtown Stay", ar: "مشيرب داون تاون ستاي" },
    destinationId: "dest-doha",
    neighborhood: "msheireb",
    category: 4,
    propertyType: "hotel",
    offset: { lat: 0.001, lng: 0.002 },
    baseNightlySar: 590,
    review: { score: 8.3, count: 720 },
    amenities: ["wifi", "gym", "restaurant", "parking", "evCharging", "accessibleProperty", "prayerRoom"],
    rooms: ["std-king", "deluxe-city", "accessible-king"],
    tags: ["city", "business", "value"],
    landmarks: [
      { label: { en: "Souq Waqif", ar: "سوق واقف" }, distanceKm: 0.8, type: "landmark" },
      { label: { en: "Msheireb Metro Station", ar: "محطة مترو مشيرب" }, distanceKm: 0.2, type: "transit" },
      { label: { en: "Hamad International Airport", ar: "مطار حمد الدولي" }, distanceKm: 10, type: "airport" },
    ],
    sourceCount: 2,
  },
  {
    slug: "pearl-marina-suites",
    name: { en: "Pearl Marina Suites", ar: "أجنحة مارينا اللؤلؤة" },
    destinationId: "dest-doha",
    neighborhood: "pearl",
    category: 5,
    propertyType: "serviced",
    offset: { lat: 0.088, lng: 0.019 },
    baseNightlySar: 940,
    review: { score: 8.6, count: 480 },
    amenities: ["wifi", "pool", "gym", "beach", "restaurant", "familyRooms", "parking", "kidsClub"],
    rooms: ["one-bed-apartment", "family-suite", "deluxe-sea"],
    tags: ["family", "beach", "luxury"],
    landmarks: [
      { label: { en: "Porto Arabia promenade", ar: "ممشى بورتو أرابيا" }, distanceKm: 0.3, type: "landmark" },
      { label: { en: "Hamad International Airport", ar: "مطار حمد الدولي" }, distanceKm: 21, type: "airport" },
    ],
    sourceCount: 1,
  },

  /* ----------------------------------------------------------- Istanbul */
  {
    slug: "sultanahmet-old-city-hotel",
    name: { en: "Sultanahmet Old City Hotel", ar: "فندق السلطان أحمد المدينة القديمة" },
    destinationId: "dest-istanbul",
    neighborhood: "sultanahmet",
    category: 4,
    propertyType: "boutique",
    offset: { lat: 0.001, lng: -0.005 },
    baseNightlySar: 430,
    review: { score: 8.7, count: 3980 },
    amenities: ["wifi", "restaurant", "concierge", "laundry", "familyRooms"],
    rooms: ["std-king", "std-twin", "family-suite"],
    tags: ["city", "value", "family"],
    landmarks: [
      { label: { en: "Hagia Sophia", ar: "آيا صوفيا" }, distanceKm: 0.3, type: "landmark" },
      { label: { en: "Istanbul Airport", ar: "مطار إسطنبول" }, distanceKm: 46, type: "airport" },
    ],
    sourceCount: 2,
    qualityBadges: ["guestFavourite"],
    localFeeSar: 0,
  },
  {
    slug: "bosphorus-view-besiktas",
    name: { en: "Bosphorus View Beşiktaş", ar: "بوسفور فيو بشكتاش" },
    destinationId: "dest-istanbul",
    neighborhood: "besiktas",
    category: 5,
    propertyType: "hotel",
    offset: { lat: 0.037, lng: 0.014 },
    baseNightlySar: 810,
    review: { score: 9.2, count: 1120 },
    amenities: ["wifi", "spa", "gym", "restaurant", "roomService", "valet", "lounge", "indoorPool", "accessibleProperty"],
    rooms: ["deluxe-sea", "junior-suite", "std-king", "accessible-king"],
    tags: ["luxury", "city"],
    landmarks: [
      { label: { en: "Dolmabahçe Palace", ar: "قصر دولمة بهجة" }, distanceKm: 0.9, type: "landmark" },
      { label: { en: "Istanbul Airport", ar: "مطار إسطنبول" }, distanceKm: 41, type: "airport" },
    ],
    sourceCount: 1,
    qualityBadges: ["verifiedQuality"],
  },
  {
    slug: "taksim-central-apartments",
    name: { en: "Taksim Central Apartments", ar: "شقق تقسيم المركزية" },
    destinationId: "dest-istanbul",
    neighborhood: "taksim",
    category: 3,
    propertyType: "apartment",
    offset: { lat: 0.028, lng: -0.005 },
    baseNightlySar: 300,
    review: { score: 7.9, count: 2440 },
    amenities: ["wifi", "laundry", "familyRooms", "parking"],
    rooms: ["one-bed-apartment", "std-twin", "superior-ambiguous"],
    tags: ["value", "family", "lastminute"],
    landmarks: [
      { label: { en: "Taksim Square", ar: "ميدان تقسيم" }, distanceKm: 0.4, type: "landmark" },
      { label: { en: "Istanbul Airport", ar: "مطار إسطنبول" }, distanceKm: 44, type: "airport" },
    ],
    sourceCount: 2,
    depositSar: 250,
  },
];

/**
 * Seeds are exported for the supplier simulators; the UI only sees canonical
 * output. The accessible collection is derived from actual room data rather
 * than hand-tagged, so a property can never be merchandised as accessible
 * without an accessible room to book (§12.1).
 */
export const HOTEL_SEEDS = HOTELS.filter((h) => getDestination(h.destinationId)).map((h) => ({
  ...h,
  tags: h.rooms.some((room) => ROOM_TEMPLATES[room]?.accessible) ? [...h.tags, "accessible"] : h.tags,
}));

export function getHotelSeed(slug: string): HotelSeed | undefined {
  return HOTEL_SEEDS.find((h) => h.slug === slug);
}

export function hotelsInDestination(destinationId: string): HotelSeed[] {
  return HOTEL_SEEDS.filter((h) => h.destinationId === destinationId);
}

/* ------------------------------------------------------------- builders */

function img(slug: string, index: number, category: HotelImage["category"], locale: Locale, name: string, roomId?: string): HotelImage {
  const captions: Record<HotelImage["category"], Record<Locale, string>> = {
    exterior: { en: "Property exterior", ar: "واجهة العقار" },
    room: { en: "Guest room", ar: "غرفة النزلاء" },
    dining: { en: "Restaurant", ar: "المطعم" },
    pool: { en: "Pool", ar: "المسبح" },
    lobby: { en: "Lobby", ar: "الردهة" },
    view: { en: "View from the property", ar: "الإطلالة من العقار" },
  };
  return {
    id: `${slug}-${index}`,
    url: `/api/image?seed=${encodeURIComponent(`${slug}-${index}`)}&kind=${category}`,
    alt: `${captions[category][locale]} — ${name}`,
    category,
    caption: captions[category][locale],
    credit: "Property-supplied content",
    roomId,
  };
}

export function buildRooms(seed: HotelSeed, locale: Locale): CanonicalRoom[] {
  return seed.rooms.map((key, idx) => {
    const t = ROOM_TEMPLATES[key];
    return {
      canonicalRoomId: `${seed.slug}::${t.key}`,
      name: localized(t.name, locale),
      mappingConfidence: t.mappingConfidence,
      sizeSqm: t.sizeSqm,
      view: localized(VIEW_CATALOG[t.view], locale),
      beds: t.beds.map((b) => ({ type: localized(BED_CATALOG[b.type], locale), count: b.count })),
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      maxOccupancy: t.maxOccupancy,
      extraBed: t.extraBed,
      cot: t.cot,
      smoking: t.smoking,
      accessible: t.accessible,
      amenities: t.amenities.map((code) => ({
        code,
        label: localized(AMENITY_CATALOG[code]?.label, locale) || code,
        scope: "room" as const,
      })),
      images: [
        img(`${seed.slug}-${t.key}`, idx * 2 + 1, "room", locale, localized(t.name, locale), `${seed.slug}::${t.key}`),
        img(`${seed.slug}-${t.key}`, idx * 2 + 2, "room", locale, localized(t.name, locale), `${seed.slug}::${t.key}`),
      ],
    };
  });
}

export function buildHotel(seed: HotelSeed, locale: Locale): CanonicalHotel {
  const dest = getDestination(seed.destinationId)!;
  const hood = dest.neighborhoods.find((n) => n.key === seed.neighborhood) ?? dest.neighborhoods[0];
  const name = localized(seed.name, locale);
  const city = localized(dest.name, locale);
  const country = localized(dest.country, locale);
  const neighborhood = localized(hood.name, locale);
  const propertyType = localized(PROPERTY_TYPES[seed.propertyType], locale);

  const rooms = buildRooms(seed, locale);
  const images: HotelImage[] = [
    img(seed.slug, 1, "exterior", locale, name),
    img(seed.slug, 2, "lobby", locale, name),
    img(seed.slug, 3, "room", locale, name),
    img(seed.slug, 4, "dining", locale, name),
    ...(seed.amenities.includes("pool") || seed.amenities.includes("indoorPool")
      ? [img(seed.slug, 5, "pool", locale, name)]
      : []),
    img(seed.slug, 6, "view", locale, name),
    ...rooms.flatMap((r) => r.images),
  ];

  const overview =
    locale === "ar"
      ? `${name} ${propertyType} فئة ${seed.category} نجوم في ${neighborhood}، ${city}. ${localized(hood.blurb, locale)} يوفر العقار ${seed.amenities.slice(0, 3).map((a) => localized(AMENITY_CATALOG[a]?.label, locale)).filter(Boolean).join("، ")} وخدمات أخرى.`
      : `${name} is a ${seed.category}-star ${propertyType.toLowerCase()} in ${neighborhood}, ${city}. ${localized(hood.blurb, locale)} The property offers ${seed.amenities.slice(0, 3).map((a) => localized(AMENITY_CATALOG[a]?.label, locale)).filter(Boolean).join(", ").toLowerCase()} among other services.`;

  const localFees = [];
  if (seed.localFeeSar) {
    localFees.push({
      code: "cityFee",
      label: locale === "ar" ? "رسوم بلدية/سياحية لكل ليلة" : "Municipality / tourism fee per night",
      amount: seed.localFeeSar,
      basis: "payAtProperty" as const,
      estimated: false,
    });
  }
  if (seed.depositSar) {
    localFees.push({
      code: "deposit",
      label: locale === "ar" ? "تأمين مسترد عند الوصول" : "Refundable damage deposit at check-in",
      amount: seed.depositSar,
      basis: "payAtProperty" as const,
      estimated: true,
    });
  }

  return {
    canonicalHotelId: `chl-${seed.slug}`,
    slug: seed.slug,
    name,
    category: seed.category,
    propertyType,
    chain: seed.chain,
    destinationId: seed.destinationId,
    address: {
      line1:
        locale === "ar"
          ? `${neighborhood}، ${city}`
          : `${neighborhood} district, ${city}`,
      city,
      country,
      countryCode: dest.countryCode,
      neighborhood,
    },
    coordinates: {
      lat: Number((dest.coordinates.lat + seed.offset.lat).toFixed(5)),
      lng: Number((dest.coordinates.lng + seed.offset.lng).toFixed(5)),
    },
    landmarks: seed.landmarks.map((l) => ({
      label: localized(l.label, locale),
      distanceKm: l.distanceKm,
      type: l.type,
    })),
    descriptions: {
      overview,
      location: localized(hood.blurb, locale),
      family:
        locale === "ar"
          ? seed.amenities.includes("familyRooms")
            ? "غرف عائلية وأسرّة أطفال متاحة عند الطلب. تُطبق سياسات الأعمار على السعر."
            : "الأطفال مرحب بهم؛ تعتمد الأسرّة الإضافية على نوع الغرفة."
          : seed.amenities.includes("familyRooms")
            ? "Family rooms and cots are available on request. Child age rules affect pricing."
            : "Children are welcome; extra beds depend on the room type.",
      accessibility:
        locale === "ar"
          ? seed.amenities.includes("accessibleProperty")
            ? "مدخل بدون درجات ومصاعد وغرف مهيأة بدش بدون حاجز."
            : "لم يؤكد العقار تجهيزات كاملة لذوي الإعاقة. تواصل معنا قبل الحجز."
          : seed.amenities.includes("accessibleProperty")
            ? "Step-free entrance, lifts and accessible rooms with roll-in showers."
            : "The property has not confirmed full accessibility features. Contact us before booking.",
    },
    amenities: seed.amenities
      .filter((code) => AMENITY_CATALOG[code])
      .map((code) => ({
        code,
        label: localized(AMENITY_CATALOG[code].label, locale),
        scope: AMENITY_CATALOG[code].scope,
        included: !["spa", "valet", "airportShuttle", "laundry"].includes(code),
        fee: ["spa", "valet", "laundry"].includes(code)
          ? locale === "ar"
            ? "برسوم إضافية"
            : "Additional charge"
          : undefined,
      })),
    images,
    policies: {
      checkInFrom: "15:00",
      checkInTo: "02:00",
      checkOutBy: "12:00",
      childPolicy:
        locale === "ar"
          ? "يقيم الأطفال حتى ٦ سنوات مجانًا في سرير موجود. تُحتسب رسوم للأعمار الأكبر."
          : "Children up to 6 stay free in an existing bed. Older children may incur a charge.",
      cotPolicy: locale === "ar" ? "سرير أطفال عند الطلب، حسب التوفر." : "Cot on request, subject to availability.",
      petPolicy: seed.amenities.includes("petFriendly")
        ? locale === "ar" ? "الحيوانات الأليفة مسموحة برسوم." : "Pets allowed with a fee."
        : locale === "ar" ? "الحيوانات الأليفة غير مسموحة." : "Pets are not allowed.",
      parking: seed.amenities.includes("parking") || seed.amenities.includes("valet")
        ? locale === "ar" ? "موقف في الموقع." : "On-site parking available."
        : locale === "ar" ? "لا يوجد موقف في الموقع." : "No on-site parking.",
      smoking: locale === "ar" ? "غرف لغير المدخنين. مناطق تدخين مخصصة." : "Non-smoking rooms. Designated smoking areas.",
      deposit: seed.depositSar
        ? locale === "ar"
          ? "تأمين مسترد يُحصّل عند الوصول."
          : "A refundable deposit is taken at check-in."
        : undefined,
      idRequirement:
        locale === "ar"
          ? "يجب إبراز هوية سارية أو جواز سفر عند الوصول لجميع الضيوف البالغين."
          : "A valid ID or passport is required at check-in for every adult guest.",
      accessibility:
        seed.amenities.includes("accessibleProperty")
          ? locale === "ar" ? "مدخل بدون درجات وغرف مهيأة متاحة." : "Step-free access and accessible rooms available."
          : locale === "ar" ? "تجهيزات محدودة لذوي الإعاقة." : "Limited accessibility features.",
      localFees,
    },
    notices: seed.notice
      ? [
          {
            id: `${seed.slug}-notice`,
            severity: seed.notice.severity,
            dateFrom: seed.notice.from,
            dateTo: seed.notice.to,
            description: localized(seed.notice.text, locale),
            alternative: seed.notice.alt ? localized(seed.notice.alt, locale) : undefined,
          },
        ]
      : [],
    review: seed.review
      ? {
          score: seed.review.score,
          scale: 10,
          count: seed.review.count,
          source: locale === "ar" ? "استبيانات ما بعد الإقامة" : "Post-stay guest surveys",
          licensed: true,
          subScores: [
            { label: locale === "ar" ? "النظافة" : "Cleanliness", score: Math.min(10, seed.review.score + 0.3) },
            { label: locale === "ar" ? "الموقع" : "Location", score: Math.min(10, seed.review.score + 0.5) },
            { label: locale === "ar" ? "الخدمة" : "Service", score: seed.review.score - 0.1 },
            { label: locale === "ar" ? "القيمة" : "Value", score: seed.review.score - 0.4 },
          ],
        }
      : undefined,
    qualityBadges: seed.qualityBadges ?? [],
    contentProvenance:
      locale === "ar"
        ? `محتوى مُوحّد من ${seed.sourceCount} ${seed.sourceCount === 1 ? "مصدر" : "مصادر"} داخلية، آخر مزامنة قبل ٢٤ ساعة.`
        : `Normalized from ${seed.sourceCount} internal content source${seed.sourceCount === 1 ? "" : "s"}, last synced within 24 hours.`,
    seo: {
      metaTitle: locale === "ar" ? `${name} — عروض وأسعار ${city}` : `${name} — ${city} rates and availability`,
      metaDescription:
        locale === "ar"
          ? `${name}، ${propertyType} ${seed.category} نجوم في ${neighborhood}. أسعار إجمالية شفافة وسياسات إلغاء واضحة.`
          : `${name}, a ${seed.category}-star ${propertyType.toLowerCase()} in ${neighborhood}. Transparent stay totals and clear cancellation policies.`,
      breadcrumbs: [country, city, neighborhood, name],
    },
  };
}

export function allHotels(locale: Locale): CanonicalHotel[] {
  return HOTEL_SEEDS.map((s) => buildHotel(s, locale));
}

export const DESTINATION_LIST = DESTINATIONS;
