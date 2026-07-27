import type { Locale } from "../types";

type L = Record<Locale, string>;

/** CMS-managed static content (§5.13). Trust, legal and help articles. */

export interface ContentPage {
  slug: string;
  title: L;
  intro: L;
  sections: { heading: L; body: L[] }[];
  updated: string;
}

export const LEGAL_PAGES: ContentPage[] = [
  {
    slug: "price-promise",
    updated: "2026-07-01",
    title: { en: "Price transparency promise", ar: "وعد شفافية الأسعار" },
    intro: {
      en: "The price you see for your dates and guests is the price we charge. Anything the hotel collects separately is labelled before you pay.",
      ar: "السعر الذي تراه لتواريخك وعدد ضيوفك هو ما نحصّله. أي مبلغ يحصّله الفندق بشكل منفصل يظهر موضحًا قبل الدفع.",
    },
    sections: [
      {
        heading: { en: "What the total includes", ar: "ما يشمله الإجمالي" },
        body: [
          {
            en: "Every price is the complete stay total for the exact dates, rooms and guests you searched, including VAT, government charges and any service charge that forms part of the rate.",
            ar: "كل سعر هو إجمالي الإقامة الكامل للتواريخ والغرف والضيوف الذين بحثت عنهم، شاملًا ضريبة القيمة المضافة والرسوم الحكومية وأي رسوم خدمة تشكل جزءًا من السعر.",
          },
          {
            en: "The nightly average is shown as a secondary figure only. We never present a nightly rate as the headline price.",
            ar: "يُعرض متوسط الليلة كرقم ثانوي فقط. لا نعرض سعر الليلة كسعر رئيسي.",
          },
        ],
      },
      {
        heading: { en: "Charges collected at the property", ar: "الرسوم التي تُحصَّل في الفندق" },
        body: [
          {
            en: "Municipality or tourism fees, refundable deposits and optional extras are collected by the hotel. We show the amount we hold for these, and mark it as an estimate when the property has not confirmed a fixed figure.",
            ar: "تحصّل الفنادق الرسوم البلدية أو السياحية والتأمينات المستردة والإضافات الاختيارية. نعرض المبلغ المتوفر لدينا ونوضح أنه تقديري عندما لا يؤكد العقار قيمة ثابتة.",
          },
        ],
      },
      {
        heading: { en: "Currency and conversion", ar: "العملة والتحويل" },
        body: [
          {
            en: "When you view a price in a currency other than the currency the property charges in, the converted amount is indicative and is fixed at the moment of payment. The charge currency is always stated.",
            ar: "عند عرض السعر بعملة مختلفة عن عملة العقار، يكون المبلغ المحوّل تقديريًا ويُثبَّت لحظة الدفع. تُذكر عملة الخصم دائمًا.",
          },
        ],
      },
      {
        heading: { en: "Price changes before booking", ar: "تغيّر السعر قبل الحجز" },
        body: [
          {
            en: "Live inventory can change between selection and payment. If the final price is lower we apply it automatically. If it is higher, or the cancellation terms change, we show the old and new values side by side and you must accept before anything is charged.",
            ar: "قد يتغير المخزون الحي بين الاختيار والدفع. إذا انخفض السعر النهائي نطبّقه تلقائيًا. وإذا ارتفع أو تغيّرت شروط الإلغاء، نعرض القيم السابقة والجديدة جنبًا إلى جنب ويجب أن توافق قبل أي خصم.",
          },
        ],
      },
    ],
  },
  {
    slug: "guarantee",
    updated: "2026-07-01",
    title: { en: "Booking guarantee", ar: "ضمان الحجز" },
    intro: {
      en: "What we commit to when something goes wrong between your payment and your arrival.",
      ar: "ما نلتزم به عندما يحدث خلل بين دفعك ووصولك.",
    },
    sections: [
      {
        heading: { en: "If your booking cannot be confirmed", ar: "إذا تعذّر تأكيد حجزك" },
        body: [
          {
            en: "Where a payment succeeds but a confirmation is not returned, the booking enters a protected pending state. We reconcile it with the property and tell you the outcome. You are never asked to pay a second time, and any authorisation that cannot be honoured is released.",
            ar: "عند نجاح الدفع دون استلام تأكيد، ينتقل الحجز إلى حالة انتظار محمية. نطابقه مع العقار ونبلغك بالنتيجة. لن يُطلب منك الدفع مرة أخرى، ويُفرج عن أي تفويض لا يمكن تنفيذه.",
          },
        ],
      },
      {
        heading: { en: "Eligible offers", ar: "العروض المؤهلة" },
        body: [
          {
            en: "Some offers carry a contracted re-accommodation guarantee from the supply partner. Those offers are labelled in the rate card, and the terms are shown before you book. Where an offer is not eligible, no guarantee badge is displayed.",
            ar: "تحمل بعض العروض ضمان إعادة حجز تعاقديًا من شريك التوريد. تظهر هذه العروض موسومة في بطاقة السعر وتُعرض شروطها قبل الحجز. وعندما لا يكون العرض مؤهلًا لا تظهر أي علامة ضمان.",
          },
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    updated: "2026-07-01",
    title: { en: "Accessibility statement", ar: "بيان إمكانية الوصول" },
    intro: {
      en: "We target WCAG 2.2 Level AA across the booking journey and treat accessibility defects as functional defects.",
      ar: "نستهدف مستوى WCAG 2.2 AA عبر رحلة الحجز ونتعامل مع عيوب الوصول كعيوب وظيفية.",
    },
    sections: [
      {
        heading: { en: "What is covered", ar: "ما الذي يشمله" },
        body: [
          {
            en: "Keyboard access for autocomplete, the calendar, occupancy, filters, the map's list alternative, galleries, rate selection, payment and cancellation. Visible focus, logical order, landmarks, form labels, error association and live announcements for result, price and status changes.",
            ar: "الوصول بلوحة المفاتيح للإكمال التلقائي والتقويم وعدد الضيوف وعوامل التصفية وبديل الخريطة والمعارض واختيار السعر والدفع والإلغاء. تركيز واضح وترتيب منطقي ومعالم وتسميات الحقول وربط الأخطاء وإعلانات حية لتغيّر النتائج والأسعار والحالة.",
          },
          {
            en: "Text scales to 200%, layouts reflow at narrow widths, status is never conveyed by colour alone and reduced motion is honoured.",
            ar: "يتكبر النص حتى ٢٠٠٪، وتتكيّف التخطيطات مع العرض الضيق، ولا تُنقل الحالة باللون وحده، ويُحترم تقليل الحركة.",
          },
        ],
      },
      {
        heading: { en: "Accessible rooms", ar: "الغرف المهيأة" },
        body: [
          {
            en: "Accessible rooms are matched from room-level data, never inferred from a room name. We do not present an accessible room as the headline offer unless you asked for one, and we never guarantee a specific feature that the confirmed rate does not include.",
            ar: "تُطابق الغرف المهيأة من بيانات الغرف، ولا تُستنتج من اسم الغرفة. لا نعرض غرفة مهيأة كعرض رئيسي ما لم تطلبها، ولا نضمن ميزة لا يشملها السعر المؤكد.",
          },
        ],
      },
      {
        heading: { en: "Feedback", ar: "الملاحظات" },
        body: [
          {
            en: "If any part of this site prevents you from completing a booking, contact support and we will complete it with you and log the defect.",
            ar: "إذا منعك أي جزء من هذا الموقع من إكمال الحجز، تواصل مع الدعم وسنكمله معك ونسجّل العيب.",
          },
        ],
      },
    ],
  },
  {
    slug: "privacy",
    updated: "2026-07-01",
    title: { en: "Privacy policy", ar: "سياسة الخصوصية" },
    intro: {
      en: "What we collect to complete a booking, what we never collect, and the controls you have.",
      ar: "ما نجمعه لإتمام الحجز، وما لا نجمعه أبدًا، والتحكم المتاح لك.",
    },
    sections: [
      {
        heading: { en: "Payment data", ar: "بيانات الدفع" },
        body: [
          {
            en: "Card numbers and security codes are entered directly into our payment provider's hosted fields. They never reach our servers, our logs, our analytics or a support transcript. We store only a provider token and the last four digits where the provider returns them.",
            ar: "تُدخل أرقام البطاقات ورموز الأمان مباشرة في حقول مزوّد الدفع. لا تصل إلى خوادمنا أو سجلاتنا أو تحليلاتنا أو محادثات الدعم. نخزّن رمزًا من المزوّد وآخر أربعة أرقام فقط عند توفرها.",
          },
        ],
      },
      {
        heading: { en: "Analytics", ar: "التحليلات" },
        body: [
          {
            en: "Funnel events carry no names, contact details, card data or free-text you typed. Analytics and marketing cookies stay off until you accept them, and you can change that at any time in your account.",
            ar: "لا تحمل أحداث القياس أسماء أو بيانات تواصل أو بيانات بطاقات أو نصًا حرًا كتبته. تبقى ملفات التحليلات والتسويق معطّلة حتى توافق، ويمكنك تغيير ذلك في أي وقت من حسابك.",
          },
        ],
      },
      {
        heading: { en: "Booking retrieval", ar: "استرجاع الحجز" },
        body: [
          {
            en: "A booking reference alone never reveals a booking. Retrieval requires the email used at checkout and a one-time code, and the response is identical whether or not a match exists.",
            ar: "رقم الحجز وحده لا يكشف أي حجز. يتطلب الاسترجاع البريد المستخدم عند الحجز ورمزًا لمرة واحدة، والاستجابة متطابقة سواء وُجد تطابق أم لا.",
          },
        ],
      },
    ],
  },
  {
    slug: "terms",
    updated: "2026-07-01",
    title: { en: "Terms of use", ar: "شروط الاستخدام" },
    intro: {
      en: "The agreement between you and the platform when you search, book and manage a stay.",
      ar: "الاتفاق بينك وبين المنصة عند البحث والحجز وإدارة الإقامة.",
    },
    sections: [
      {
        heading: { en: "Our role", ar: "دورنا" },
        body: [
          {
            en: "We aggregate hotel inventory from contracted supply partners, normalise it into one consistent presentation, and process your booking and payment. The accommodation itself is provided by the property.",
            ar: "نجمع مخزون الفنادق من شركاء توريد متعاقدين، ونوحّده في عرض متسق، ونعالج حجزك ودفعك. أما الإقامة نفسها فيقدّمها العقار.",
          },
        ],
      },
      {
        heading: { en: "Rate conditions", ar: "شروط الأسعار" },
        body: [
          {
            en: "Each rate carries its own cancellation, payment and occupancy conditions. Mandatory conditions supplied by the property are shown in full before you book and reproduced on your voucher.",
            ar: "لكل سعر شروط إلغاء ودفع وإشغال خاصة به. تُعرض الشروط الإلزامية من العقار كاملة قبل الحجز وتظهر في قسيمتك.",
          },
        ],
      },
      {
        heading: { en: "Requests", ar: "الطلبات" },
        body: [
          {
            en: "Bed preferences, early check-in, room location and similar requests are passed to the property and are not guaranteed unless the confirmed booking states them explicitly.",
            ar: "تُمرَّر تفضيلات الأسرّة والوصول المبكر وموقع الغرفة والطلبات المشابهة إلى العقار وهي غير مضمونة ما لم ينص الحجز المؤكد عليها صراحة.",
          },
        ],
      },
    ],
  },
  {
    slug: "security",
    updated: "2026-07-01",
    title: { en: "Secure payment", ar: "الدفع الآمن" },
    intro: {
      en: "How payment is handled and what protects you at checkout.",
      ar: "كيف تتم معالجة الدفع وما الذي يحميك عند إتمام الحجز.",
    },
    sections: [
      {
        heading: { en: "Hosted fields and SCA", ar: "الحقول المستضافة والتحقق البنكي" },
        body: [
          {
            en: "Payment fields are served by a PCI-validated provider inside an isolated frame. Strong customer authentication (3-D Secure) is requested where the card issuer or market requires it.",
            ar: "تُقدَّم حقول الدفع من مزوّد معتمد PCI داخل إطار معزول. ويُطلب التحقق القوي من العميل (3-D Secure) حيثما يشترطه المصدر أو السوق.",
          },
        ],
      },
      {
        heading: { en: "Duplicate protection", ar: "الحماية من التكرار" },
        body: [
          {
            en: "Every booking and cancellation carries an idempotency key. Pressing back, refreshing or double-clicking cannot create a second booking or a second charge.",
            ar: "يحمل كل حجز وإلغاء مفتاح تفرّد. الضغط على رجوع أو التحديث أو النقر المزدوج لا يمكن أن ينشئ حجزًا ثانيًا أو خصمًا ثانيًا.",
          },
        ],
      },
    ],
  },
  {
    slug: "about",
    updated: "2026-07-01",
    title: { en: "About us", ar: "من نحن" },
    intro: {
      en: "A hotel marketplace built so the real total, the room differences and the cancellation exposure are unmistakably clear.",
      ar: "سوق فنادق مبني ليكون الإجمالي الحقيقي والفروق بين الغرف وتكلفة الإلغاء واضحة تمامًا.",
    },
    sections: [
      {
        heading: { en: "Supplier-agnostic by design", ar: "مستقل عن المورّدين بالتصميم" },
        body: [
          {
            en: "Inventory comes from multiple supply partners, but the customer experience does not change when a partner is added or removed. Hotels are merged into one canonical property, rooms are grouped only when their material attributes match, and no supplier identifier, code or raw error is ever shown to a customer.",
            ar: "يأتي المخزون من عدة شركاء، لكن تجربة العميل لا تتغير عند إضافة شريك أو إزالته. تُدمج الفنادق في عقار واحد موحّد، وتُجمع الغرف فقط عند تطابق سماتها الجوهرية، ولا يُعرض أي معرّف أو رمز أو خطأ خام من المورّد للعميل.",
          },
        ],
      },
    ],
  },
];

export interface HelpArticle {
  slug: string;
  topic: L;
  question: L;
  answer: L;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "find-booking",
    topic: { en: "Bookings", ar: "الحجوزات" },
    question: { en: "I booked as a guest — how do I find my booking?", ar: "حجزت كضيف — كيف أجد حجزي؟" },
    answer: {
      en: "Open Trips → Find a booking made as a guest, enter your reference and the email you used at checkout, then confirm the one-time code we send you.",
      ar: "افتح رحلاتي ← ابحث عن حجز تم كضيف، وأدخل رقم الحجز والبريد المستخدم، ثم أكّد الرمز الذي نرسله لك.",
    },
  },
  {
    slug: "price-changed",
    topic: { en: "Pricing", ar: "الأسعار" },
    question: { en: "The price changed at checkout. Why?", ar: "تغيّر السعر عند الدفع. لماذا؟" },
    answer: {
      en: "Hotel inventory is live. We re-check your exact rate before payment. A lower price is applied automatically; a higher price or a changed cancellation deadline is shown side by side and needs your explicit acceptance.",
      ar: "مخزون الفنادق حي. نتحقق من سعرك قبل الدفع مباشرة. يُطبَّق السعر الأقل تلقائيًا، أما السعر الأعلى أو تغيّر موعد الإلغاء فيُعرض جنبًا إلى جنب ويحتاج موافقتك الصريحة.",
    },
  },
  {
    slug: "pending-booking",
    topic: { en: "Bookings", ar: "الحجوزات" },
    question: { en: "My booking says pending. Should I book again?", ar: "حجزي قيد التأكيد. هل أحجز مرة أخرى؟" },
    answer: {
      en: "No. A pending booking means your payment is authorised and we are verifying the confirmation with the property. Booking again risks a duplicate. We reconcile it and email you the outcome; the status page updates automatically.",
      ar: "لا. الحجز قيد التأكيد يعني أن دفعك مفوَّض ونتحقق من التأكيد مع العقار. إعادة الحجز قد تسبب تكرارًا. نطابق الحالة ونرسل النتيجة بالبريد، وتتحدث صفحة الحالة تلقائيًا.",
    },
  },
  {
    slug: "cancellation-fee",
    topic: { en: "Cancellation", ar: "الإلغاء" },
    question: { en: "How is my cancellation fee calculated?", ar: "كيف تُحتسب رسوم الإلغاء؟" },
    answer: {
      en: "From the rate's cancellation timeline, using the property's local time zone. We request a live quote at the moment you cancel and show the fee, the refundable amount and the refund method before you confirm.",
      ar: "من الجدول الزمني لإلغاء السعر، بتوقيت العقار المحلي. نطلب عرضًا حيًا لحظة الإلغاء ونعرض الرسوم والمبلغ المسترد وطريقة الاسترداد قبل التأكيد.",
    },
  },
  {
    slug: "local-fees",
    topic: { en: "Pricing", ar: "الأسعار" },
    question: { en: "What is 'pay at the property'?", ar: "ما معنى «يُدفع في الفندق»؟" },
    answer: {
      en: "Charges the hotel collects directly, such as tourism fees or a refundable deposit. They are not part of the amount we charge, and are listed separately on the rate card, at checkout and on your voucher.",
      ar: "رسوم يحصّلها الفندق مباشرة، مثل الرسوم السياحية أو التأمين المسترد. ليست جزءًا من المبلغ الذي نحصّله، وتظهر منفصلة في بطاقة السعر وعند الدفع وفي القسيمة.",
    },
  },
  {
    slug: "child-ages",
    topic: { en: "Search", ar: "البحث" },
    question: { en: "Why do you ask for each child's age?", ar: "لماذا تسألون عن عمر كل طفل؟" },
    answer: {
      en: "Child age changes both eligibility and price at most properties, and it decides whether an extra bed or cot is needed. Asking per room lets us show only rooms that genuinely fit your party.",
      ar: "يؤثر عمر الطفل على الأهلية والسعر في معظم العقارات، ويحدد الحاجة إلى سرير إضافي. السؤال لكل غرفة يتيح عرض الغرف المناسبة فعلًا لمجموعتك.",
    },
  },
  {
    slug: "refund-timing",
    topic: { en: "Payments", ar: "المدفوعات" },
    question: { en: "When will my refund arrive?", ar: "متى يصل المبلغ المسترد؟" },
    answer: {
      en: "We initiate the refund as soon as the cancellation is confirmed. Banks typically take 5–10 business days to display it. We show the stage, amount, method and reference in your booking so you can follow it.",
      ar: "نبدأ الاسترداد فور تأكيد الإلغاء. تستغرق البنوك عادة ٥–١٠ أيام عمل لإظهاره. نعرض المرحلة والمبلغ والطريقة والمرجع في حجزك لتتابعه.",
    },
  },
  {
    slug: "accessible-rooms",
    topic: { en: "Accessibility", ar: "إمكانية الوصول" },
    question: { en: "Can I book a guaranteed accessible room?", ar: "هل يمكنني حجز غرفة مهيأة مضمونة؟" },
    answer: {
      en: "Where a rate is explicitly for an accessible room, the features are part of what you book. Where accessibility is only a request, we say so and never present it as guaranteed. Contact support before booking if a specific feature is essential.",
      ar: "عندما يكون السعر مخصصًا لغرفة مهيأة، تكون التجهيزات جزءًا مما تحجزه. وعندما تكون طلبًا فقط، نوضح ذلك ولا نقدّمها كمضمونة. تواصل مع الدعم قبل الحجز إذا كانت ميزة معينة ضرورية.",
    },
  },
];

export function getLegalPage(slug: string): ContentPage | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}
