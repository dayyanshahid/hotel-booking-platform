import type { Locale } from "../types";

type L = Record<Locale, string>;

/**
 * Curated destination content.
 *
 * This is an *overlay*, not a requirement. A city is searchable the moment it
 * appears in `geo/cities.ts`; what lives here is the extra a writer adds later —
 * how the neighbourhoods differ, what the city is actually like, the questions
 * people ask about staying there.
 *
 * Splitting the two is the whole reason the catalogue can be global. When
 * content was a required field on every destination, the catalogue could only
 * ever be as large as the pile of copy somebody had found time to write.
 *
 * Cities without an entry fall back to `templatedEditorial`, which is
 * deliberately modest: it states what the platform does rather than inventing
 * local knowledge nobody here has.
 */

export interface Editorial {
  blurb: L;
  neighborhoods: { key: string; name: L; blurb: L }[];
  faqs: { q: L; a: L }[];
}

export const EDITORIAL: Record<string, Editorial> = {
  "riyadh": {
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
  "jeddah": {
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
  "makkah": {
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
  "dubai": {
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
  "doha": {
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
  "istanbul": {
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
};

/* ----------------------------------------------------------- the fallback */

/**
 * Every city has these four areas in some form, and naming them this way is
 * true everywhere rather than plausible-sounding and wrong somewhere.
 *
 * Hotels reference these keys, so the set is stable: a generated property in
 * Lima and a curated one in Riyadh both sit in a named area, and the filter
 * rail works the same in both.
 */
export const GENERIC_AREAS: { key: string; name: L; blurb: L }[] = [
  {
    key: "centre",
    name: { en: "City centre", ar: "وسط المدينة" },
    blurb: {
      en: "Closest to the main sights and transport, and usually the busiest at night.",
      ar: "الأقرب إلى المعالم الرئيسية والمواصلات، وعادةً الأكثر ازدحامًا ليلاً.",
    },
  },
  {
    key: "business",
    name: { en: "Business district", ar: "حي الأعمال" },
    blurb: {
      en: "Offices and larger hotels; quieter at weekends and often cheaper then.",
      ar: "مكاتب وفنادق أكبر؛ أهدأ في نهاية الأسبوع وغالبًا أرخص حينها.",
    },
  },
  {
    key: "waterfront",
    name: { en: "Waterfront and parks", ar: "الواجهة المائية والحدائق" },
    blurb: {
      en: "Open space and views, with a longer walk or ride to the centre.",
      ar: "مساحات مفتوحة وإطلالات، مع مسافة أطول إلى المركز.",
    },
  },
  {
    key: "airport",
    name: { en: "Near the airport", ar: "قرب المطار" },
    blurb: {
      en: "For early departures and long layovers. Check the shuttle before you book.",
      ar: "للرحلات المبكرة والتوقفات الطويلة. تحقق من خدمة النقل قبل الحجز.",
    },
  },
];

/**
 * Questions the platform can answer truthfully about anywhere, because the
 * answers come from its own policies rather than from local knowledge.
 *
 * The temptation with a global catalogue is to generate "the best time to visit
 * Lima" for 180 cities. That would be invention presented as guidance, and the
 * scope forbids exactly that kind of confident-sounding filler (§2.2). So the
 * generic set answers what we actually know instead.
 */
export function templatedEditorial(cityName: string, countryName: string): Editorial {
  return {
    blurb: {
      en: `Compare stays in ${cityName}, ${countryName}. Every price is the total for your dates and party, with taxes, fees and the cancellation deadline shown before you choose.`,
      ar: `قارن أماكن الإقامة في ${cityName}، ${countryName}. كل سعر هو الإجمالي لتواريخك وعدد الضيوف، مع عرض الضرائب والرسوم وموعد الإلغاء قبل الاختيار.`,
    },
    neighborhoods: GENERIC_AREAS,
    faqs: [
      {
        q: {
          en: `Are taxes and fees included in the prices shown for ${cityName}?`,
          ar: `هل الضرائب والرسوم مشمولة في الأسعار المعروضة في ${cityName}؟`,
        },
        a: {
          en: "The headline total includes everything we can price up front. Charges the property collects on arrival — city taxes in some countries, resort or parking fees in others — are listed separately with the amount, so the number you compare is the number you pay us.",
          ar: "الإجمالي المعروض يشمل كل ما يمكننا تسعيره مسبقًا. أما ما يحصّله العقار عند الوصول — ضرائب المدينة في بعض الدول أو رسوم المنتجع ومواقف السيارات في غيرها — فيُدرج منفصلاً مع المبلغ.",
        },
      },
      {
        q: {
          en: "Can I cancel free of charge?",
          ar: "هل يمكنني الإلغاء مجانًا؟",
        },
        a: {
          en: "It depends on the rate, so we show it on every one. Where free cancellation applies, the deadline is shown in the hotel's own time zone rather than yours — that is the deadline that actually counts.",
          ar: "يعتمد ذلك على السعر، لذا نعرضه على كل سعر. وحين ينطبق الإلغاء المجاني، يُعرض الموعد النهائي بتوقيت الفندق نفسه وليس بتوقيتك — فهو الموعد المعتد به.",
        },
      },
      {
        q: {
          en: "When am I charged?",
          ar: "متى يتم الخصم؟",
        },
        a: {
          en: "Each rate says whether it is paid now or at the property, and in which currency. If your display currency differs from the one the card is charged in, both are shown before you pay.",
          ar: "يوضّح كل سعر ما إذا كان الدفع الآن أم في العقار، وبأي عملة. وإذا اختلفت عملة العرض عن عملة الخصم، تُعرض العملتان قبل الدفع.",
        },
      },
    ],
  };
}
