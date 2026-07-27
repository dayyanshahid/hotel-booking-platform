import type { Locale } from "../types";

/** Localized reference data. Content is CMS-owned in production (§5.13). */

type L = Record<Locale, string>;

export const AMENITY_CATALOG: Record<string, { label: L; scope: "property" | "room"; icon: string }> = {
  wifi: { label: { en: "Free Wi-Fi", ar: "واي فاي مجاني" }, scope: "property", icon: "wifi" },
  pool: { label: { en: "Outdoor pool", ar: "مسبح خارجي" }, scope: "property", icon: "pool" },
  indoorPool: { label: { en: "Indoor pool", ar: "مسبح داخلي" }, scope: "property", icon: "pool" },
  gym: { label: { en: "Fitness centre", ar: "نادٍ رياضي" }, scope: "property", icon: "gym" },
  spa: { label: { en: "Spa", ar: "منتجع صحي" }, scope: "property", icon: "spa" },
  parking: { label: { en: "Parking", ar: "موقف سيارات" }, scope: "property", icon: "parking" },
  valet: { label: { en: "Valet parking", ar: "خدمة صف السيارات" }, scope: "property", icon: "parking" },
  restaurant: { label: { en: "Restaurant", ar: "مطعم" }, scope: "property", icon: "dining" },
  roomService: { label: { en: "24h room service", ar: "خدمة الغرف ٢٤ ساعة" }, scope: "property", icon: "dining" },
  familyRooms: { label: { en: "Family rooms", ar: "غرف عائلية" }, scope: "property", icon: "family" },
  kidsClub: { label: { en: "Kids club", ar: "نادي الأطفال" }, scope: "property", icon: "family" },
  beach: { label: { en: "Private beach", ar: "شاطئ خاص" }, scope: "property", icon: "beach" },
  business: { label: { en: "Business centre", ar: "مركز أعمال" }, scope: "property", icon: "business" },
  meeting: { label: { en: "Meeting rooms", ar: "قاعات اجتماعات" }, scope: "property", icon: "business" },
  airportShuttle: { label: { en: "Airport shuttle", ar: "نقل من المطار" }, scope: "property", icon: "transfer" },
  laundry: { label: { en: "Laundry", ar: "خدمة غسيل" }, scope: "property", icon: "laundry" },
  prayerRoom: { label: { en: "Prayer room", ar: "مصلى" }, scope: "property", icon: "prayer" },
  evCharging: { label: { en: "EV charging", ar: "شحن السيارات الكهربائية" }, scope: "property", icon: "ev" },
  accessibleProperty: {
    label: { en: "Step-free access", ar: "مدخل بدون درجات" },
    scope: "property",
    icon: "accessible",
  },
  petFriendly: { label: { en: "Pets allowed", ar: "الحيوانات الأليفة مسموحة" }, scope: "property", icon: "pet" },
  concierge: { label: { en: "Concierge", ar: "كونسيرج" }, scope: "property", icon: "concierge" },
  lounge: { label: { en: "Executive lounge", ar: "صالة تنفيذية" }, scope: "property", icon: "lounge" },
  aircon: { label: { en: "Air conditioning", ar: "تكييف" }, scope: "room", icon: "aircon" },
  minibar: { label: { en: "Minibar", ar: "ميني بار" }, scope: "room", icon: "minibar" },
  kettle: { label: { en: "Tea & coffee", ar: "شاي وقهوة" }, scope: "room", icon: "kettle" },
  safe: { label: { en: "In-room safe", ar: "خزنة في الغرفة" }, scope: "room", icon: "safe" },
  desk: { label: { en: "Work desk", ar: "مكتب عمل" }, scope: "room", icon: "desk" },
  kitchenette: { label: { en: "Kitchenette", ar: "مطبخ صغير" }, scope: "room", icon: "kitchen" },
  balcony: { label: { en: "Balcony", ar: "شرفة" }, scope: "room", icon: "balcony" },
  bathtub: { label: { en: "Bathtub", ar: "حوض استحمام" }, scope: "room", icon: "bath" },
  rollInShower: { label: { en: "Roll-in shower", ar: "دش بدون حاجز" }, scope: "room", icon: "accessible" },
  soundproof: { label: { en: "Soundproofed", ar: "عازل للصوت" }, scope: "room", icon: "quiet" },
  smartTv: { label: { en: "Smart TV", ar: "تلفزيون ذكي" }, scope: "room", icon: "tv" },
};

export const BOARD_CATALOG: Record<string, { label: L; detail: L }> = {
  RO: {
    label: { en: "Room only", ar: "الغرفة فقط" },
    detail: { en: "No meals included.", ar: "بدون وجبات." },
  },
  BB: {
    label: { en: "Breakfast included", ar: "إفطار مشمول" },
    detail: { en: "Daily breakfast for the booked guests.", ar: "إفطار يومي للضيوف المسجلين." },
  },
  HB: {
    label: { en: "Half board", ar: "نصف إقامة" },
    detail: {
      en: "Breakfast plus one main meal daily. Drinks are usually charged separately.",
      ar: "إفطار ووجبة رئيسية يوميًا. تُحتسب المشروبات عادةً بشكل منفصل.",
    },
  },
  FB: {
    label: { en: "Full board", ar: "إقامة كاملة" },
    detail: { en: "Breakfast, lunch and dinner included.", ar: "الإفطار والغداء والعشاء مشمولة." },
  },
  AI: {
    label: { en: "All inclusive", ar: "شامل كليًا" },
    detail: {
      en: "Meals and selected drinks included as described by the property.",
      ar: "الوجبات ومشروبات محددة مشمولة حسب وصف العقار.",
    },
  },
};

export const BED_CATALOG: Record<string, L> = {
  king: { en: "King bed", ar: "سرير كينج" },
  queen: { en: "Queen bed", ar: "سرير كوين" },
  twin: { en: "Twin bed", ar: "سرير مفرد" },
  sofa: { en: "Sofa bed", ar: "أريكة سرير" },
  bunk: { en: "Bunk bed", ar: "سرير بطابقين" },
};

export const VIEW_CATALOG: Record<string, L> = {
  city: { en: "City view", ar: "إطلالة على المدينة" },
  sea: { en: "Sea view", ar: "إطلالة بحرية" },
  garden: { en: "Garden view", ar: "إطلالة على الحديقة" },
  haram: { en: "Haram view", ar: "إطلالة على الحرم" },
  pool: { en: "Pool view", ar: "إطلالة على المسبح" },
  courtyard: { en: "Courtyard view", ar: "إطلالة على الفناء" },
  none: { en: "No specific view", ar: "بدون إطلالة محددة" },
};

/**
 * The property-type spread a global catalogue needs. A traveller filtering for
 * a hostel in Lisbon or a villa in Bali is filtering for a different product,
 * not a cheaper hotel, so each is its own type rather than a star rating.
 */
export const PROPERTY_TYPES: Record<string, L> = {
  hotel: { en: "Hotel", ar: "فندق" },
  resort: { en: "Resort", ar: "منتجع" },
  apartment: { en: "Hotel apartment", ar: "شقق فندقية" },
  boutique: { en: "Boutique hotel", ar: "فندق بوتيك" },
  serviced: { en: "Serviced residence", ar: "أجنحة فندقية" },
  hostel: { en: "Hostel", ar: "بيت شباب" },
  guesthouse: { en: "Guest house", ar: "بيت ضيافة" },
  bnb: { en: "Bed and breakfast", ar: "مبيت وإفطار" },
  villa: { en: "Villa", ar: "فيلا" },
  aparthotel: { en: "Aparthotel", ar: "شقق فندقية مخدومة" },
};

/** Filterable property types, in the order the filter rail lists them. */
export const PROPERTY_TYPE_KEYS = Object.keys(PROPERTY_TYPES);

export const COLLECTIONS: {
  slug: string;
  title: L;
  body: L;
  tag: string;
  accent: string;
}[] = [
  {
    slug: "family-stays",
    title: { en: "Family stays", ar: "إقامات عائلية" },
    body: { en: "Connecting rooms, kids clubs and generous cancellation.", ar: "غرف متصلة ونوادي أطفال وسياسات إلغاء مريحة." },
    tag: "family",
    accent: "amber",
  },
  {
    slug: "business-ready",
    title: { en: "Business ready", ar: "جاهز للأعمال" },
    body: { en: "Fast Wi-Fi, desks, late checkout and invoices.", ar: "إنترنت سريع ومكاتب ومغادرة متأخرة وفواتير." },
    tag: "business",
    accent: "slate",
  },
  {
    slug: "beachfront",
    title: { en: "Beachfront", ar: "على الشاطئ" },
    body: { en: "Sea views and private beach access.", ar: "إطلالات بحرية ووصول لشاطئ خاص." },
    tag: "beach",
    accent: "sky",
  },
  {
    slug: "city-breaks",
    title: { en: "City breaks", ar: "عطلات المدن" },
    body: { en: "Walkable districts, dining and transit at the door.", ar: "أحياء يسهل التجول فيها ومطاعم ومواصلات قريبة." },
    tag: "city",
    accent: "violet",
  },
  {
    slug: "luxury",
    title: { en: "Luxury", ar: "فخامة" },
    body: { en: "Five-star service, spas and suites.", ar: "خدمة خمس نجوم ومنتجعات صحية وأجنحة." },
    tag: "luxury",
    accent: "emerald",
  },
  {
    slug: "smart-value",
    title: { en: "Smart value", ar: "قيمة ذكية" },
    body: { en: "Well-rated stays under a sensible total.", ar: "إقامات عالية التقييم بإجمالي معقول." },
    tag: "value",
    accent: "orange",
  },
  {
    slug: "last-minute",
    title: { en: "Last minute", ar: "اللحظة الأخيرة" },
    body: { en: "Available tonight and tomorrow.", ar: "متاح الليلة وغدًا." },
    tag: "lastminute",
    accent: "rose",
  },
  {
    slug: "accessible-stays",
    title: { en: "Accessible stays", ar: "إقامات مهيأة" },
    body: { en: "Step-free access and roll-in showers, verified in room data.", ar: "مداخل بدون درجات ودشات بدون حواجز، مؤكدة في بيانات الغرف." },
    tag: "accessible",
    accent: "teal",
  },
];

export function localized(value: L | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] || value.en;
}
