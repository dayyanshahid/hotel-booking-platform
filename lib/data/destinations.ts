import type { DestinationType, Locale } from "../types";
import { localized } from "./catalog";

type L = Record<Locale, string>;

export interface DestinationSeed {
  id: string;
  slug: string;
  type: DestinationType;
  name: L;
  country: L;
  countryCode: string;
  timezone: string;
  coordinates: { lat: number; lng: number };
  blurb: L;
  neighborhoods: { key: string; name: L; blurb: L }[];
  faqs: { q: L; a: L }[];
}

export const DESTINATIONS: DestinationSeed[] = [
  {
    id: "dest-riyadh",
    slug: "riyadh",
    type: "city",
    name: { en: "Riyadh", ar: "الرياض" },
    country: { en: "Saudi Arabia", ar: "السعودية" },
    countryCode: "SA",
    timezone: "Asia/Riyadh",
    coordinates: { lat: 24.7136, lng: 46.6753 },
    blurb: {
      en: "Saudi Arabia's capital pairs a fast-growing business district with heritage quarters, large parks and a dining scene that runs late.",
      ar: "عاصمة السعودية تجمع بين حي أعمال سريع النمو وأحياء تراثية وحدائق واسعة ومشهد مطاعم يمتد حتى وقت متأخر.",
    },
    neighborhoods: [
      {
        key: "olaya",
        name: { en: "Olaya", ar: "العليا" },
        blurb: { en: "Towers, malls and the metro spine — the default choice for business stays.", ar: "أبراج ومراكز تسوق ومحور المترو — الخيار الافتراضي لرحلات الأعمال." },
      },
      {
        key: "kafd",
        name: { en: "King Abdullah Financial District", ar: "مركز الملك عبدالله المالي" },
        blurb: { en: "Newest towers, quiet evenings, quick access to the north ring.", ar: "أحدث الأبراج وأمسيات هادئة ووصول سريع للطريق الدائري الشمالي." },
      },
      {
        key: "diriyah",
        name: { en: "Diriyah", ar: "الدرعية" },
        blurb: { en: "Mud-brick heritage, walkable dining and weekend crowds.", ar: "تراث الطين ومطاعم يمكن الوصول إليها مشيًا وزحام نهاية الأسبوع." },
      },
      {
        key: "sulaimaniyah",
        name: { en: "Al Sulaimaniyah", ar: "السليمانية" },
        blurb: { en: "Residential streets, cafés and easier parking.", ar: "شوارع سكنية ومقاهٍ ومواقف أسهل." },
      },
    ],
    faqs: [
      {
        q: { en: "When is the best time to visit Riyadh?", ar: "ما أفضل وقت لزيارة الرياض؟" },
        a: {
          en: "November to March is mild and busiest. Hotel totals in Olaya rise around large conferences, so flexible dates often save money.",
          ar: "من نوفمبر إلى مارس الطقس معتدل والحركة في ذروتها. ترتفع الأسعار في العليا خلال المؤتمرات الكبرى، لذا تساعد التواريخ المرنة على التوفير.",
        },
      },
      {
        q: { en: "Do Riyadh hotels charge a city fee at the property?", ar: "هل تفرض فنادق الرياض رسومًا محلية عند الوصول؟" },
        a: {
          en: "Some properties collect a municipality fee or refundable deposit at check-in. Any amount we know about is shown as 'Pay at the property' before you book.",
          ar: "تحصّل بعض العقارات رسوم بلدية أو تأمينًا مستردًا عند الوصول. أي مبلغ نعرفه يظهر كـ«يُدفع في الفندق» قبل الحجز.",
        },
      },
    ],
  },
  {
    id: "dest-jeddah",
    slug: "jeddah",
    type: "city",
    name: { en: "Jeddah", ar: "جدة" },
    country: { en: "Saudi Arabia", ar: "السعودية" },
    countryCode: "SA",
    timezone: "Asia/Riyadh",
    coordinates: { lat: 21.4858, lng: 39.1925 },
    blurb: {
      en: "The Red Sea gateway: a long corniche, the historic Al-Balad district and the main entry point for Makkah pilgrims.",
      ar: "بوابة البحر الأحمر: كورنيش طويل وحي البلد التاريخي والمدخل الرئيسي لقاصدي مكة.",
    },
    neighborhoods: [
      {
        key: "corniche",
        name: { en: "Corniche", ar: "الكورنيش" },
        blurb: { en: "Waterfront hotels, running paths and sunset dining.", ar: "فنادق على الواجهة البحرية ومسارات جري ومطاعم عند الغروب." },
      },
      {
        key: "albalad",
        name: { en: "Al-Balad", ar: "البلد" },
        blurb: { en: "UNESCO-listed old town, coral houses and souqs.", ar: "البلدة القديمة المدرجة باليونسكو وبيوت المرجان والأسواق." },
      },
      {
        key: "alhamra",
        name: { en: "Al Hamra", ar: "الحمراء" },
        blurb: { en: "Central, close to the corniche and business towers.", ar: "موقع مركزي قريب من الكورنيش وأبراج الأعمال." },
      },
      {
        key: "obhur",
        name: { en: "Obhur", ar: "أبحر" },
        blurb: { en: "Beach resorts north of the city, best with a car.", ar: "منتجعات شاطئية شمال المدينة، يفضّل وجود سيارة." },
      },
    ],
    faqs: [
      {
        q: { en: "How far is Jeddah airport from the corniche?", ar: "كم تبعد مطار جدة عن الكورنيش؟" },
        a: {
          en: "King Abdulaziz International is roughly 25–35 minutes from most corniche hotels outside peak traffic.",
          ar: "مطار الملك عبدالعزيز الدولي يبعد نحو ٢٥–٣٥ دقيقة عن معظم فنادق الكورنيش خارج أوقات الذروة.",
        },
      },
      {
        q: { en: "Which area suits an Umrah trip?", ar: "أي منطقة تناسب رحلة عمرة؟" },
        a: {
          en: "Al Hamra and the corniche keep you close to the Makkah highway; hotels there often list private transfer options at the property.",
          ar: "الحمراء والكورنيش قريبان من طريق مكة السريع، وغالبًا ما توفر الفنادق هناك خدمات نقل خاصة.",
        },
      },
    ],
  },
  {
    id: "dest-makkah",
    slug: "makkah",
    type: "city",
    name: { en: "Makkah", ar: "مكة المكرمة" },
    country: { en: "Saudi Arabia", ar: "السعودية" },
    countryCode: "SA",
    timezone: "Asia/Riyadh",
    coordinates: { lat: 21.4225, lng: 39.8262 },
    blurb: {
      en: "Stays are chosen by walking distance to the Haram, shuttle frequency and check-in flexibility around prayer times.",
      ar: "تُختار الإقامة حسب مسافة المشي إلى الحرم وتكرار الحافلات ومرونة تسجيل الوصول حول أوقات الصلاة.",
    },
    neighborhoods: [
      {
        key: "ajyad",
        name: { en: "Ajyad", ar: "أجياد" },
        blurb: { en: "Short walk to King Abdulaziz Gate.", ar: "مسافة قصيرة سيرًا إلى بوابة الملك عبدالعزيز." },
      },
      {
        key: "jabalomar",
        name: { en: "Jabal Omar", ar: "جبل عمر" },
        blurb: { en: "Newer towers with covered walkways to the Haram.", ar: "أبراج حديثة بممرات مغطاة نحو الحرم." },
      },
      {
        key: "aziziyah",
        name: { en: "Al Aziziyah", ar: "العزيزية" },
        blurb: { en: "Better totals, shuttle-dependent.", ar: "أسعار أفضل مع الاعتماد على الحافلات." },
      },
    ],
    faqs: [
      {
        q: { en: "Do Makkah hotels guarantee a Haram view?", ar: "هل تضمن فنادق مكة إطلالة على الحرم؟" },
        a: {
          en: "Only when the rate you book explicitly includes it. We show the view as part of the room, and never promise it as a request.",
          ar: "فقط عندما يتضمنها السعر الذي تحجزه صراحةً. نعرض الإطلالة ضمن وصف الغرفة ولا نَعِد بها كطلب.",
        },
      },
    ],
  },
  {
    id: "dest-dubai",
    slug: "dubai",
    type: "city",
    name: { en: "Dubai", ar: "دبي" },
    country: { en: "United Arab Emirates", ar: "الإمارات" },
    countryCode: "AE",
    timezone: "Asia/Dubai",
    coordinates: { lat: 25.2048, lng: 55.2708 },
    blurb: {
      en: "Beach, downtown and airport clusters behave like different cities — pick the cluster before the property.",
      ar: "الشاطئ ووسط المدينة ومنطقة المطار تعمل كمدن مختلفة — اختر المنطقة قبل الفندق.",
    },
    neighborhoods: [
      {
        key: "downtown",
        name: { en: "Downtown Dubai", ar: "وسط مدينة دبي" },
        blurb: { en: "Burj Khalifa, the mall and the fountain.", ar: "برج خليفة والدبي مول والنافورة." },
      },
      {
        key: "marina",
        name: { en: "Dubai Marina", ar: "مرسى دبي" },
        blurb: { en: "Waterfront towers, tram and the beach walk.", ar: "أبراج على الواجهة المائية والترام وممشى الشاطئ." },
      },
      {
        key: "jbr",
        name: { en: "JBR Beach", ar: "شاطئ جي بي آر" },
        blurb: { en: "Beach-first stays, busy in the evenings.", ar: "إقامات شاطئية أولًا، مزدحمة مساءً." },
      },
      {
        key: "deira",
        name: { en: "Deira", ar: "ديرة" },
        blurb: { en: "Older Dubai, souqs, best totals near the creek.", ar: "دبي القديمة والأسواق وأفضل الأسعار قرب الخور." },
      },
    ],
    faqs: [
      {
        q: { en: "What is the Dubai tourism dirham?", ar: "ما هو درهم السياحة في دبي؟" },
        a: {
          en: "A per-room, per-night fee collected by the hotel at check-in. Where we know the amount we show it under 'Pay at the property'.",
          ar: "رسم لكل غرفة لكل ليلة يحصّله الفندق عند الوصول. نعرضه ضمن «يُدفع في الفندق» عندما نعرف قيمته.",
        },
      },
    ],
  },
  {
    id: "dest-doha",
    slug: "doha",
    type: "city",
    name: { en: "Doha", ar: "الدوحة" },
    country: { en: "Qatar", ar: "قطر" },
    countryCode: "QA",
    timezone: "Asia/Qatar",
    coordinates: { lat: 25.2854, lng: 51.531 },
    blurb: {
      en: "Compact and walkable around the Corniche, with museum-grade culture and a short airport run.",
      ar: "مدينة مدمجة يسهل التجول فيها حول الكورنيش، بثقافة متحفية ومسافة قصيرة إلى المطار.",
    },
    neighborhoods: [
      {
        key: "westbay",
        name: { en: "West Bay", ar: "الخليج الغربي" },
        blurb: { en: "Business towers and the Corniche promenade.", ar: "أبراج الأعمال وممشى الكورنيش." },
      },
      {
        key: "msheireb",
        name: { en: "Msheireb", ar: "مشيرب" },
        blurb: { en: "Walkable downtown regeneration and the tram.", ar: "وسط المدينة المتجدد والترام." },
      },
      {
        key: "pearl",
        name: { en: "The Pearl", ar: "اللؤلؤة" },
        blurb: { en: "Marina dining and quieter evenings.", ar: "مطاعم المارينا وأمسيات أهدأ." },
      },
    ],
    faqs: [
      {
        q: { en: "Is Doha suitable for a short stopover?", ar: "هل الدوحة مناسبة لتوقف قصير؟" },
        a: {
          en: "Yes — most West Bay hotels are 20–25 minutes from Hamad International, and many offer flexible late check-in.",
          ar: "نعم — معظم فنادق الخليج الغربي تبعد ٢٠–٢٥ دقيقة عن مطار حمد الدولي، ويوفر كثير منها تسجيل وصول متأخر مرن.",
        },
      },
    ],
  },
  {
    id: "dest-istanbul",
    slug: "istanbul",
    type: "city",
    name: { en: "Istanbul", ar: "إسطنبول" },
    country: { en: "Türkiye", ar: "تركيا" },
    countryCode: "TR",
    timezone: "Europe/Istanbul",
    coordinates: { lat: 41.0082, lng: 28.9784 },
    blurb: {
      en: "Two continents, three very different hotel districts and a wide price spread between them.",
      ar: "قارتان وثلاث مناطق فندقية مختلفة تمامًا وفارق سعري واسع بينها.",
    },
    neighborhoods: [
      {
        key: "sultanahmet",
        name: { en: "Sultanahmet", ar: "السلطان أحمد" },
        blurb: { en: "Old city sights within walking distance.", ar: "معالم المدينة القديمة على مسافة المشي." },
      },
      {
        key: "taksim",
        name: { en: "Taksim & Beyoğlu", ar: "تقسيم وبي أوغلو" },
        blurb: { en: "Nightlife, shopping and the funicular.", ar: "الحياة الليلية والتسوق والقطار المائل." },
      },
      {
        key: "besiktas",
        name: { en: "Beşiktaş", ar: "بشكتاش" },
        blurb: { en: "Bosphorus views and ferry connections.", ar: "إطلالات البوسفور وخطوط العبّارات." },
      },
    ],
    faqs: [
      {
        q: { en: "Which side should I stay on?", ar: "في أي جانب أقيم؟" },
        a: {
          en: "Sultanahmet for first-time sightseeing, Beşiktaş or Taksim for dining and the Bosphorus. Check the travel time to your plans before price.",
          ar: "السلطان أحمد لأول زيارة سياحية، وبشكتاش أو تقسيم للمطاعم والبوسفور. تحقق من زمن التنقل قبل السعر.",
        },
      },
    ],
  },
];

export interface ExtraPlace {
  id: string;
  type: DestinationType;
  name: L;
  destinationId: string;
  coordinates: { lat: number; lng: number };
}

/** Airports, landmarks and neighborhoods that resolve into a parent destination. */
export const EXTRA_PLACES: ExtraPlace[] = [
  { id: "poi-ruh-airport", type: "airport", name: { en: "King Khalid International Airport (RUH)", ar: "مطار الملك خالد الدولي (RUH)" }, destinationId: "dest-riyadh", coordinates: { lat: 24.9576, lng: 46.6988 } },
  { id: "poi-kingdom-centre", type: "landmark", name: { en: "Kingdom Centre", ar: "مركز المملكة" }, destinationId: "dest-riyadh", coordinates: { lat: 24.7113, lng: 46.6745 } },
  { id: "poi-diriyah", type: "landmark", name: { en: "Diriyah / At-Turaif", ar: "الدرعية / الطريف" }, destinationId: "dest-riyadh", coordinates: { lat: 24.7361, lng: 46.5757 } },
  { id: "poi-jed-airport", type: "airport", name: { en: "King Abdulaziz International Airport (JED)", ar: "مطار الملك عبدالعزيز الدولي (JED)" }, destinationId: "dest-jeddah", coordinates: { lat: 21.6796, lng: 39.1565 } },
  { id: "poi-albalad", type: "landmark", name: { en: "Al-Balad Historic District", ar: "منطقة البلد التاريخية" }, destinationId: "dest-jeddah", coordinates: { lat: 21.4837, lng: 39.1867 } },
  { id: "poi-haram", type: "landmark", name: { en: "Masjid al-Haram", ar: "المسجد الحرام" }, destinationId: "dest-makkah", coordinates: { lat: 21.4225, lng: 39.8262 } },
  { id: "poi-dxb-airport", type: "airport", name: { en: "Dubai International Airport (DXB)", ar: "مطار دبي الدولي (DXB)" }, destinationId: "dest-dubai", coordinates: { lat: 25.2532, lng: 55.3657 } },
  { id: "poi-burj-khalifa", type: "landmark", name: { en: "Burj Khalifa", ar: "برج خليفة" }, destinationId: "dest-dubai", coordinates: { lat: 25.1972, lng: 55.2744 } },
  { id: "poi-doh-airport", type: "airport", name: { en: "Hamad International Airport (DOH)", ar: "مطار حمد الدولي (DOH)" }, destinationId: "dest-doha", coordinates: { lat: 25.2731, lng: 51.6081 } },
  { id: "poi-souq-waqif", type: "landmark", name: { en: "Souq Waqif", ar: "سوق واقف" }, destinationId: "dest-doha", coordinates: { lat: 25.2872, lng: 51.5333 } },
  { id: "poi-ist-airport", type: "airport", name: { en: "Istanbul Airport (IST)", ar: "مطار إسطنبول (IST)" }, destinationId: "dest-istanbul", coordinates: { lat: 41.2753, lng: 28.7519 } },
  { id: "poi-hagia-sophia", type: "landmark", name: { en: "Hagia Sophia", ar: "آيا صوفيا" }, destinationId: "dest-istanbul", coordinates: { lat: 41.0086, lng: 28.98 } },
];

export function getDestination(id: string): DestinationSeed | undefined {
  return DESTINATIONS.find((d) => d.id === id || d.slug === id);
}

export function destinationLabel(d: DestinationSeed, locale: Locale): string {
  return localized(d.name, locale);
}
