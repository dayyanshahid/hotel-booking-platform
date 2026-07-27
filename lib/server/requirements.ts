import type { Locale, RequirementField, RoomAllocation } from "../types";

/**
 * Dynamic requirement schema (§8.5). Required guest fields are driven by the
 * destination market and the offer, not hard-coded in the frontend, so a new
 * supplier or market cannot break checkout validation.
 */
export function buildRequirements(options: {
  locale: Locale;
  countryCode: string;
  rooms: RoomAllocation[];
  paymentTiming: "payNow" | "payLater" | "payAtProperty";
  nationalityRequired: boolean;
}): RequirementField[] {
  const { locale, countryCode, rooms, paymentTiming, nationalityRequired } = options;
  const ar = locale === "ar";
  const fields: RequirementField[] = [
    {
      name: "email",
      label: ar ? "البريد الإلكتروني" : "Email address",
      type: "email",
      required: true,
      group: "contact",
      helper: ar ? "نرسل التأكيد والقسيمة إلى هنا." : "We send the confirmation and voucher here.",
    },
    {
      name: "phone",
      label: ar ? "رقم الجوال" : "Mobile number",
      type: "tel",
      required: true,
      group: "contact",
      helper: ar ? "يُستخدم للتحديثات العاجلة فقط." : "Used only for urgent updates about this booking.",
    },
    {
      name: "contactLanguage",
      label: ar ? "لغة التواصل" : "Contact language",
      type: "select",
      required: true,
      group: "contact",
      options: [
        { value: "en", label: "English" },
        { value: "ar", label: "العربية" },
      ],
    },
    {
      name: "leadFirstName",
      label: ar ? "الاسم الأول للضيف الرئيسي" : "Lead guest first name",
      type: "text",
      required: true,
      group: "lead",
      maxLength: 40,
      helper: ar ? "كما يظهر في الهوية أو جواز السفر." : "Exactly as printed on the ID or passport.",
    },
    {
      name: "leadSurname",
      label: ar ? "اسم العائلة للضيف الرئيسي" : "Lead guest surname",
      type: "text",
      required: true,
      group: "lead",
      maxLength: 40,
    },
  ];

  if (nationalityRequired) {
    fields.push({
      name: "leadNationality",
      label: ar ? "جنسية الضيف الرئيسي" : "Lead guest nationality",
      type: "select",
      required: true,
      group: "lead",
      helper: ar
        ? "هذا السعر مُسعّر حسب الجنسية أو الإقامة."
        : "This rate is priced by nationality or residency.",
      options: [
        { value: "SA", label: ar ? "السعودية" : "Saudi Arabia" },
        { value: "AE", label: ar ? "الإمارات" : "United Arab Emirates" },
        { value: "QA", label: ar ? "قطر" : "Qatar" },
        { value: "EG", label: ar ? "مصر" : "Egypt" },
        { value: "GB", label: ar ? "المملكة المتحدة" : "United Kingdom" },
        { value: "US", label: ar ? "الولايات المتحدة" : "United States" },
        { value: "OTHER", label: ar ? "أخرى" : "Other" },
      ],
    });
  }

  rooms.forEach((room, index) => {
    for (let a = 1; a < room.adults; a++) {
      fields.push(
        {
          name: `room${index}_adult${a}_firstName`,
          label: ar ? `الاسم الأول — بالغ ${a + 1}، غرفة ${index + 1}` : `First name — adult ${a + 1}, room ${index + 1}`,
          type: "text",
          required: true,
          group: "guest",
          maxLength: 40,
        },
        {
          name: `room${index}_adult${a}_surname`,
          label: ar ? `اسم العائلة — بالغ ${a + 1}، غرفة ${index + 1}` : `Surname — adult ${a + 1}, room ${index + 1}`,
          type: "text",
          required: true,
          group: "guest",
          maxLength: 40,
        },
      );
    }
    room.childrenAges.forEach((age, c) => {
      fields.push({
        name: `room${index}_child${c}_firstName`,
        label: ar
          ? `اسم الطفل ${c + 1} (${age} سنة) — غرفة ${index + 1}`
          : `Child ${c + 1} first name (age ${age}) — room ${index + 1}`,
        type: "text",
        required: true,
        group: "guest",
        maxLength: 40,
      });
    });
  });

  fields.push(
    {
      name: "arrivalTime",
      label: ar ? "وقت الوصول التقريبي" : "Estimated arrival time",
      type: "select",
      required: false,
      group: "request",
      options: ["14:00", "16:00", "18:00", "20:00", "22:00", "after-midnight"].map((v) => ({
        value: v,
        label: v === "after-midnight" ? (ar ? "بعد منتصف الليل" : "After midnight") : v,
      })),
    },
    {
      name: "bedPreference",
      label: ar ? "تفضيل السرير" : "Bed preference",
      type: "select",
      required: false,
      group: "request",
      helper: ar ? "طلب غير مضمون." : "A request — not guaranteed.",
      options: [
        { value: "", label: ar ? "بدون تفضيل" : "No preference" },
        { value: "large", label: ar ? "سرير كبير" : "One large bed" },
        { value: "twin", label: ar ? "سريران منفصلان" : "Two separate beds" },
      ],
    },
    {
      name: "accessibilityRequest",
      label: ar ? "طلب يتعلق بإمكانية الوصول" : "Accessibility request",
      type: "text",
      required: false,
      group: "request",
      maxLength: 200,
    },
    {
      name: "remarks",
      label: ar ? "أي شيء آخر" : "Anything else",
      type: "text",
      required: false,
      group: "request",
      maxLength: 300,
    },
  );

  // Billing is only requested where the payment model or market invoice requires it.
  if (paymentTiming === "payNow") {
    fields.push(
      {
        name: "billingCountry",
        label: ar ? "دولة الفوترة" : "Billing country",
        type: "select",
        required: true,
        group: "billing",
        options: [
          { value: "SA", label: ar ? "السعودية" : "Saudi Arabia" },
          { value: "AE", label: ar ? "الإمارات" : "United Arab Emirates" },
          { value: "QA", label: ar ? "قطر" : "Qatar" },
          { value: "TR", label: ar ? "تركيا" : "Türkiye" },
          { value: "GB", label: ar ? "المملكة المتحدة" : "United Kingdom" },
          { value: "OTHER", label: ar ? "أخرى" : "Other" },
        ],
      },
      {
        name: "billingCity",
        label: ar ? "المدينة" : "City",
        type: "text",
        required: false,
        group: "billing",
        maxLength: 60,
      },
      {
        name: "companyName",
        label: ar ? "اسم الشركة (للفاتورة)" : "Company name (for invoice)",
        type: "text",
        required: false,
        group: "billing",
        maxLength: 80,
      },
      {
        name: "taxId",
        label: countryCode === "SA" ? (ar ? "الرقم الضريبي" : "VAT number") : ar ? "الرقم الضريبي" : "Tax / VAT ID",
        type: "text",
        required: false,
        group: "billing",
        maxLength: 30,
      },
    );
  }

  return fields;
}
