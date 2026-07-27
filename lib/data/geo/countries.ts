/**
 * Countries, as data.
 *
 * This file and `cities.ts` are the platform's geography: no prose, no
 * per-destination copy, nothing that has to be written by hand before a place
 * can be searched. Editorial content — blurbs, neighbourhoods, FAQs — is a
 * separate, optional overlay in `editorial.ts`, which is what lets the
 * catalogue cover the world instead of the handful of cities somebody found
 * time to write about.
 *
 * `currency` is the currency a traveller most likely sees quoted locally. It
 * seeds the default display currency for a destination; the guest can always
 * override it, and what the card is actually charged in is decided server-side.
 */

export type Region =
  | "africa"
  | "asia"
  | "europe"
  | "middleEast"
  | "northAmerica"
  | "oceania"
  | "southAmerica";

export const REGIONS: Region[] = [
  "europe",
  "asia",
  "middleEast",
  "northAmerica",
  "southAmerica",
  "africa",
  "oceania",
];

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** Arabic exonym where one is in common use; falls back to `name`. */
  nameAr?: string;
  region: Region;
  /** Currency usually quoted to travellers on the ground. */
  currency: string;
}

export const COUNTRIES: Country[] = [
  { code: "SA", name: "Saudi Arabia", nameAr: "السعودية", region: "middleEast", currency: "SAR" },
  { code: "AE", name: "United Arab Emirates", nameAr: "الإمارات", region: "middleEast", currency: "AED" },
  { code: "QA", name: "Qatar", nameAr: "قطر", region: "middleEast", currency: "QAR" },
  { code: "KW", name: "Kuwait", nameAr: "الكويت", region: "middleEast", currency: "KWD" },
  { code: "BH", name: "Bahrain", nameAr: "البحرين", region: "middleEast", currency: "BHD" },
  { code: "OM", name: "Oman", nameAr: "عُمان", region: "middleEast", currency: "OMR" },
  { code: "JO", name: "Jordan", nameAr: "الأردن", region: "middleEast", currency: "JOD" },
  { code: "LB", name: "Lebanon", nameAr: "لبنان", region: "middleEast", currency: "USD" },
  { code: "IL", name: "Israel", nameAr: "إسرائيل", region: "middleEast", currency: "ILS" },
  { code: "TR", name: "Türkiye", nameAr: "تركيا", region: "europe", currency: "TRY" },
  { code: "EG", name: "Egypt", nameAr: "مصر", region: "africa", currency: "EGP" },
  { code: "MA", name: "Morocco", nameAr: "المغرب", region: "africa", currency: "MAD" },
  { code: "TN", name: "Tunisia", nameAr: "تونس", region: "africa", currency: "TND" },
  { code: "DZ", name: "Algeria", nameAr: "الجزائر", region: "africa", currency: "DZD" },
  { code: "ZA", name: "South Africa", nameAr: "جنوب أفريقيا", region: "africa", currency: "ZAR" },
  { code: "KE", name: "Kenya", nameAr: "كينيا", region: "africa", currency: "KES" },
  { code: "TZ", name: "Tanzania", nameAr: "تنزانيا", region: "africa", currency: "TZS" },
  { code: "NG", name: "Nigeria", nameAr: "نيجيريا", region: "africa", currency: "NGN" },
  { code: "GH", name: "Ghana", nameAr: "غانا", region: "africa", currency: "GHS" },
  { code: "ET", name: "Ethiopia", nameAr: "إثيوبيا", region: "africa", currency: "ETB" },
  { code: "MU", name: "Mauritius", nameAr: "موريشيوس", region: "africa", currency: "MUR" },
  { code: "SC", name: "Seychelles", nameAr: "سيشل", region: "africa", currency: "SCR" },
  { code: "GB", name: "United Kingdom", nameAr: "المملكة المتحدة", region: "europe", currency: "GBP" },
  { code: "IE", name: "Ireland", nameAr: "أيرلندا", region: "europe", currency: "EUR" },
  { code: "FR", name: "France", nameAr: "فرنسا", region: "europe", currency: "EUR" },
  { code: "ES", name: "Spain", nameAr: "إسبانيا", region: "europe", currency: "EUR" },
  { code: "PT", name: "Portugal", nameAr: "البرتغال", region: "europe", currency: "EUR" },
  { code: "IT", name: "Italy", nameAr: "إيطاليا", region: "europe", currency: "EUR" },
  { code: "DE", name: "Germany", nameAr: "ألمانيا", region: "europe", currency: "EUR" },
  { code: "NL", name: "Netherlands", nameAr: "هولندا", region: "europe", currency: "EUR" },
  { code: "BE", name: "Belgium", nameAr: "بلجيكا", region: "europe", currency: "EUR" },
  { code: "AT", name: "Austria", nameAr: "النمسا", region: "europe", currency: "EUR" },
  { code: "CH", name: "Switzerland", nameAr: "سويسرا", region: "europe", currency: "CHF" },
  { code: "GR", name: "Greece", nameAr: "اليونان", region: "europe", currency: "EUR" },
  { code: "HR", name: "Croatia", nameAr: "كرواتيا", region: "europe", currency: "EUR" },
  { code: "CZ", name: "Czechia", nameAr: "التشيك", region: "europe", currency: "CZK" },
  { code: "PL", name: "Poland", nameAr: "بولندا", region: "europe", currency: "PLN" },
  { code: "HU", name: "Hungary", nameAr: "المجر", region: "europe", currency: "HUF" },
  { code: "RO", name: "Romania", nameAr: "رومانيا", region: "europe", currency: "RON" },
  { code: "SE", name: "Sweden", nameAr: "السويد", region: "europe", currency: "SEK" },
  { code: "NO", name: "Norway", nameAr: "النرويج", region: "europe", currency: "NOK" },
  { code: "DK", name: "Denmark", nameAr: "الدنمارك", region: "europe", currency: "DKK" },
  { code: "FI", name: "Finland", nameAr: "فنلندا", region: "europe", currency: "EUR" },
  { code: "IS", name: "Iceland", nameAr: "آيسلندا", region: "europe", currency: "ISK" },
  { code: "RU", name: "Russia", nameAr: "روسيا", region: "europe", currency: "RUB" },
  { code: "US", name: "United States", nameAr: "الولايات المتحدة", region: "northAmerica", currency: "USD" },
  { code: "CA", name: "Canada", nameAr: "كندا", region: "northAmerica", currency: "CAD" },
  { code: "MX", name: "Mexico", nameAr: "المكسيك", region: "northAmerica", currency: "MXN" },
  { code: "CU", name: "Cuba", nameAr: "كوبا", region: "northAmerica", currency: "USD" },
  { code: "DO", name: "Dominican Republic", nameAr: "جمهورية الدومينيكان", region: "northAmerica", currency: "DOP" },
  { code: "JM", name: "Jamaica", nameAr: "جامايكا", region: "northAmerica", currency: "JMD" },
  { code: "PA", name: "Panama", nameAr: "بنما", region: "northAmerica", currency: "USD" },
  { code: "CR", name: "Costa Rica", nameAr: "كوستاريكا", region: "northAmerica", currency: "CRC" },
  { code: "BR", name: "Brazil", nameAr: "البرازيل", region: "southAmerica", currency: "BRL" },
  { code: "AR", name: "Argentina", nameAr: "الأرجنتين", region: "southAmerica", currency: "ARS" },
  { code: "CL", name: "Chile", nameAr: "تشيلي", region: "southAmerica", currency: "CLP" },
  { code: "PE", name: "Peru", nameAr: "بيرو", region: "southAmerica", currency: "PEN" },
  { code: "CO", name: "Colombia", nameAr: "كولومبيا", region: "southAmerica", currency: "COP" },
  { code: "UY", name: "Uruguay", nameAr: "أوروغواي", region: "southAmerica", currency: "UYU" },
  { code: "CN", name: "China", nameAr: "الصين", region: "asia", currency: "CNY" },
  { code: "HK", name: "Hong Kong", nameAr: "هونغ كونغ", region: "asia", currency: "HKD" },
  { code: "JP", name: "Japan", nameAr: "اليابان", region: "asia", currency: "JPY" },
  { code: "KR", name: "South Korea", nameAr: "كوريا الجنوبية", region: "asia", currency: "KRW" },
  { code: "TW", name: "Taiwan", nameAr: "تايوان", region: "asia", currency: "TWD" },
  { code: "SG", name: "Singapore", nameAr: "سنغافورة", region: "asia", currency: "SGD" },
  { code: "MY", name: "Malaysia", nameAr: "ماليزيا", region: "asia", currency: "MYR" },
  { code: "TH", name: "Thailand", nameAr: "تايلاند", region: "asia", currency: "THB" },
  { code: "VN", name: "Vietnam", nameAr: "فيتنام", region: "asia", currency: "VND" },
  { code: "ID", name: "Indonesia", nameAr: "إندونيسيا", region: "asia", currency: "IDR" },
  { code: "PH", name: "Philippines", nameAr: "الفلبين", region: "asia", currency: "PHP" },
  { code: "IN", name: "India", nameAr: "الهند", region: "asia", currency: "INR" },
  { code: "LK", name: "Sri Lanka", nameAr: "سريلانكا", region: "asia", currency: "LKR" },
  { code: "MV", name: "Maldives", nameAr: "جزر المالديف", region: "asia", currency: "USD" },
  { code: "NP", name: "Nepal", nameAr: "نيبال", region: "asia", currency: "NPR" },
  { code: "PK", name: "Pakistan", nameAr: "باكستان", region: "asia", currency: "PKR" },
  { code: "BD", name: "Bangladesh", nameAr: "بنغلاديش", region: "asia", currency: "BDT" },
  { code: "KZ", name: "Kazakhstan", nameAr: "كازاخستان", region: "asia", currency: "KZT" },
  { code: "UZ", name: "Uzbekistan", nameAr: "أوزبكستان", region: "asia", currency: "UZS" },
  { code: "AZ", name: "Azerbaijan", nameAr: "أذربيجان", region: "asia", currency: "AZN" },
  { code: "GE", name: "Georgia", nameAr: "جورجيا", region: "asia", currency: "GEL" },
  { code: "AU", name: "Australia", nameAr: "أستراليا", region: "oceania", currency: "AUD" },
  { code: "NZ", name: "New Zealand", nameAr: "نيوزيلندا", region: "oceania", currency: "NZD" },
  { code: "FJ", name: "Fiji", nameAr: "فيجي", region: "oceania", currency: "FJD" },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function countriesInRegion(region: Region): Country[] {
  return COUNTRIES.filter((c) => c.region === region);
}

