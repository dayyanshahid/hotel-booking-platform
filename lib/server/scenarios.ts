import type { Locale } from "../types";

/**
 * Edge-case harness. Every scenario maps to a row of scope §10 so the recovery
 * design can be demonstrated and regression-tested without waiting for a real
 * supplier to misbehave.
 */
export type ScenarioId =
  | "normal"
  | "zeroResults"
  | "supplierTimeout"
  | "allSuppliersFail"
  | "slowSearch"
  | "missingContent"
  | "priceIncrease"
  | "priceDecrease"
  | "policyChange"
  | "rateSoldOut"
  | "offerExpired"
  | "paymentDeclined"
  | "threeDsTimeout"
  | "bookingPending"
  | "bookingFailed"
  | "emailFailure"
  | "multiRoomPartial"
  | "cancelQuoteChanged"
  | "cancelUncertain";

export const SCENARIOS: { id: ScenarioId; edgeCase: string; label: Record<Locale, string> }[] = [
  { id: "normal", edgeCase: "—", label: { en: "Normal operation", ar: "تشغيل طبيعي" } },
  { id: "zeroResults", edgeCase: "E-01", label: { en: "No search results", ar: "لا توجد نتائج" } },
  { id: "supplierTimeout", edgeCase: "E-02", label: { en: "One source times out (partial results)", ar: "تأخر أحد المصادر (نتائج جزئية)" } },
  { id: "allSuppliersFail", edgeCase: "E-03", label: { en: "All sources fail", ar: "فشل جميع المصادر" } },
  { id: "slowSearch", edgeCase: "E-02", label: { en: "Slow search (progressive results)", ar: "بحث بطيء (نتائج تدريجية)" } },
  { id: "missingContent", edgeCase: "E-06", label: { en: "Missing images and content", ar: "صور ومحتوى مفقود" } },
  { id: "priceDecrease", edgeCase: "E-08", label: { en: "Price drops at recheck", ar: "انخفاض السعر عند التحقق" } },
  { id: "priceIncrease", edgeCase: "E-09", label: { en: "Price rises at recheck", ar: "ارتفاع السعر عند التحقق" } },
  { id: "policyChange", edgeCase: "E-09", label: { en: "Cancellation policy changes at recheck", ar: "تغير سياسة الإلغاء" } },
  { id: "rateSoldOut", edgeCase: "E-10", label: { en: "Selected rate sold out", ar: "نفد السعر المختار" } },
  { id: "offerExpired", edgeCase: "E-11", label: { en: "Offer expired", ar: "انتهت صلاحية العرض" } },
  { id: "paymentDeclined", edgeCase: "E-12", label: { en: "Payment declined", ar: "رُفض الدفع" } },
  { id: "threeDsTimeout", edgeCase: "E-13", label: { en: "3-D Secure abandoned", ar: "التخلي عن التحقق البنكي" } },
  { id: "bookingPending", edgeCase: "E-14", label: { en: "Paid, booking uncertain (reconciliation)", ar: "تم الدفع والحجز غير مؤكد" } },
  { id: "bookingFailed", edgeCase: "E-12", label: { en: "Booking rejected after payment authorisation", ar: "رُفض الحجز بعد تفويض الدفع" } },
  { id: "emailFailure", edgeCase: "E-15", label: { en: "Confirmation email fails", ar: "فشل بريد التأكيد" } },
  { id: "multiRoomPartial", edgeCase: "E-17", label: { en: "Multi-room partial availability", ar: "توفر جزئي لغرف متعددة" } },
  { id: "cancelQuoteChanged", edgeCase: "E-18", label: { en: "Cancellation quote changes", ar: "تغير عرض الإلغاء" } },
  { id: "cancelUncertain", edgeCase: "E-19", label: { en: "Cancellation outcome uncertain", ar: "نتيجة الإلغاء غير مؤكدة" } },
];

export const SCENARIO_COOKIE = "nz_scenario";

export function parseScenario(value: string | undefined | null): ScenarioId {
  const found = SCENARIOS.find((s) => s.id === value);
  return found ? found.id : "normal";
}

export function scenarioFromRequest(req: Request): ScenarioId {
  const header = req.headers.get("x-scenario");
  if (header) return parseScenario(header);
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SCENARIO_COOKIE}=([^;]+)`));
  return parseScenario(match?.[1]);
}
