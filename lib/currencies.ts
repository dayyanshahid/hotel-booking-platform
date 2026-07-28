/**
 * Currencies the platform can quote in.
 *
 * A traveller in São Paulo should not be shown a Riyadh price list. Every
 * country in `data/geo/countries.ts` names the currency usually quoted to
 * travellers there, and every one of those appears below — the two files are
 * checked against each other by a test, so a new country cannot ship a currency
 * the platform has no rate for.
 *
 * Totals are whole amounts throughout the product, so every currency carries
 * `decimals: 0`: a hotel total is never quoted to the cent, and rounding it
 * once, server-side, is what keeps the total on the card equal to the total in
 * the breakdown.
 */

export interface CurrencyMeta {
  label: string;
  symbol: string;
  decimals: number;
  /** Units of this currency per 1 SAR — indicative only. See FX_FROM_SAR. */
  rateFromSar: number;
}

export const CURRENCY_TABLE = {
  SAR: { label: "Saudi riyal", symbol: "SAR", decimals: 0, rateFromSar: 1.0 },
  USD: { label: "US dollar", symbol: "$", decimals: 0, rateFromSar: 0.266667 },
  EUR: { label: "Euro", symbol: "€", decimals: 0, rateFromSar: 0.245333 },
  GBP: { label: "British pound", symbol: "£", decimals: 0, rateFromSar: 0.209333 },
  AED: { label: "UAE dirham", symbol: "AED", decimals: 0, rateFromSar: 0.979333 },
  QAR: { label: "Qatari riyal", symbol: "QAR", decimals: 0, rateFromSar: 0.970667 },
  KWD: { label: "Kuwaiti dinar", symbol: "KWD", decimals: 0, rateFromSar: 0.081867 },
  BHD: { label: "Bahraini dinar", symbol: "BHD", decimals: 0, rateFromSar: 0.100267 },
  OMR: { label: "Omani rial", symbol: "OMR", decimals: 0, rateFromSar: 0.102667 },
  JOD: { label: "Jordanian dinar", symbol: "JOD", decimals: 0, rateFromSar: 0.189067 },
  ILS: { label: "Israeli shekel", symbol: "₪", decimals: 0, rateFromSar: 0.986667 },
  TRY: { label: "Turkish lira", symbol: "₺", decimals: 0, rateFromSar: 9.066667 },
  EGP: { label: "Egyptian pound", symbol: "EGP", decimals: 0, rateFromSar: 12.933333 },
  MAD: { label: "Moroccan dirham", symbol: "MAD", decimals: 0, rateFromSar: 2.64 },
  TND: { label: "Tunisian dinar", symbol: "TND", decimals: 0, rateFromSar: 0.826667 },
  DZD: { label: "Algerian dinar", symbol: "DZD", decimals: 0, rateFromSar: 35.466667 },
  ZAR: { label: "South African rand", symbol: "R", decimals: 0, rateFromSar: 4.853333 },
  KES: { label: "Kenyan shilling", symbol: "KES", decimals: 0, rateFromSar: 34.4 },
  TZS: { label: "Tanzanian shilling", symbol: "TZS", decimals: 0, rateFromSar: 720.0 },
  NGN: { label: "Nigerian naira", symbol: "₦", decimals: 0, rateFromSar: 413.333333 },
  GHS: { label: "Ghanaian cedi", symbol: "GHS", decimals: 0, rateFromSar: 4.133333 },
  ETB: { label: "Ethiopian birr", symbol: "ETB", decimals: 0, rateFromSar: 32.533333 },
  MUR: { label: "Mauritian rupee", symbol: "MUR", decimals: 0, rateFromSar: 12.4 },
  SCR: { label: "Seychellois rupee", symbol: "SCR", decimals: 0, rateFromSar: 3.786667 },
  CHF: { label: "Swiss franc", symbol: "CHF", decimals: 0, rateFromSar: 0.234667 },
  CZK: { label: "Czech koruna", symbol: "Kč", decimals: 0, rateFromSar: 6.266667 },
  PLN: { label: "Polish złoty", symbol: "zł", decimals: 0, rateFromSar: 1.066667 },
  HUF: { label: "Hungarian forint", symbol: "Ft", decimals: 0, rateFromSar: 101.333333 },
  RON: { label: "Romanian leu", symbol: "lei", decimals: 0, rateFromSar: 1.226667 },
  SEK: { label: "Swedish krona", symbol: "kr", decimals: 0, rateFromSar: 2.826667 },
  NOK: { label: "Norwegian krone", symbol: "kr", decimals: 0, rateFromSar: 2.88 },
  DKK: { label: "Danish krone", symbol: "kr", decimals: 0, rateFromSar: 1.84 },
  ISK: { label: "Icelandic króna", symbol: "kr", decimals: 0, rateFromSar: 36.8 },
  RUB: { label: "Russian rouble", symbol: "₽", decimals: 0, rateFromSar: 25.6 },
  CAD: { label: "Canadian dollar", symbol: "C$", decimals: 0, rateFromSar: 0.368 },
  MXN: { label: "Mexican peso", symbol: "MX$", decimals: 0, rateFromSar: 5.28 },
  DOP: { label: "Dominican peso", symbol: "DOP", decimals: 0, rateFromSar: 16.0 },
  JMD: { label: "Jamaican dollar", symbol: "JMD", decimals: 0, rateFromSar: 41.6 },
  CRC: { label: "Costa Rican colón", symbol: "CRC", decimals: 0, rateFromSar: 138.666667 },
  BRL: { label: "Brazilian real", symbol: "R$", decimals: 0, rateFromSar: 1.52 },
  ARS: { label: "Argentine peso", symbol: "ARS", decimals: 0, rateFromSar: 258.666667 },
  CLP: { label: "Chilean peso", symbol: "CLP", decimals: 0, rateFromSar: 253.333333 },
  PEN: { label: "Peruvian sol", symbol: "PEN", decimals: 0, rateFromSar: 1.0 },
  COP: { label: "Colombian peso", symbol: "COP", decimals: 0, rateFromSar: 1120.0 },
  UYU: { label: "Uruguayan peso", symbol: "UYU", decimals: 0, rateFromSar: 10.933333 },
  CNY: { label: "Chinese yuan", symbol: "¥", decimals: 0, rateFromSar: 1.906667 },
  HKD: { label: "Hong Kong dollar", symbol: "HK$", decimals: 0, rateFromSar: 2.077333 },
  JPY: { label: "Japanese yen", symbol: "¥", decimals: 0, rateFromSar: 40.0 },
  KRW: { label: "South Korean won", symbol: "₩", decimals: 0, rateFromSar: 360.0 },
  TWD: { label: "New Taiwan dollar", symbol: "NT$", decimals: 0, rateFromSar: 8.613333 },
  SGD: { label: "Singapore dollar", symbol: "S$", decimals: 0, rateFromSar: 0.352 },
  MYR: { label: "Malaysian ringgit", symbol: "RM", decimals: 0, rateFromSar: 1.16 },
  THB: { label: "Thai baht", symbol: "฿", decimals: 0, rateFromSar: 9.2 },
  VND: { label: "Vietnamese dong", symbol: "₫", decimals: 0, rateFromSar: 6666.666667 },
  IDR: { label: "Indonesian rupiah", symbol: "Rp", decimals: 0, rateFromSar: 4160.0 },
  PHP: { label: "Philippine peso", symbol: "₱", decimals: 0, rateFromSar: 15.333333 },
  INR: { label: "Indian rupee", symbol: "₹", decimals: 0, rateFromSar: 22.4 },
  LKR: { label: "Sri Lankan rupee", symbol: "LKR", decimals: 0, rateFromSar: 77.866667 },
  NPR: { label: "Nepalese rupee", symbol: "NPR", decimals: 0, rateFromSar: 35.733333 },
  PKR: { label: "Pakistani rupee", symbol: "PKR", decimals: 0, rateFromSar: 74.133333 },
  BDT: { label: "Bangladeshi taka", symbol: "৳", decimals: 0, rateFromSar: 31.733333 },
  KZT: { label: "Kazakhstani tenge", symbol: "₸", decimals: 0, rateFromSar: 128.0 },
  UZS: { label: "Uzbekistani sum", symbol: "UZS", decimals: 0, rateFromSar: 3413.333333 },
  AZN: { label: "Azerbaijani manat", symbol: "₼", decimals: 0, rateFromSar: 0.453333 },
  GEL: { label: "Georgian lari", symbol: "₾", decimals: 0, rateFromSar: 0.725333 },
  AUD: { label: "Australian dollar", symbol: "A$", decimals: 0, rateFromSar: 0.4 },
  NZD: { label: "New Zealand dollar", symbol: "NZ$", decimals: 0, rateFromSar: 0.442667 },
  FJD: { label: "Fijian dollar", symbol: "FJ$", decimals: 0, rateFromSar: 0.6 },
} as const satisfies Record<string, CurrencyMeta>;

export type CurrencyCode = keyof typeof CURRENCY_TABLE;

export const CURRENCY_CODES = Object.keys(CURRENCY_TABLE) as CurrencyCode[];

/**
 * Offered in the currency switcher. The full table is far too long for a
 * dropdown, so the switcher shows the majors plus whatever the destination is
 * priced in locally — see `currencyChoicesFor`.
 */
export const MAJOR_CURRENCIES: CurrencyCode[] = [
  "PKR",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "JPY",
  "CNY",
  "INR",
  "AUD",
  "CAD",
];

export function isCurrencyCode(code: string | undefined): code is CurrencyCode {
  return Boolean(code && code in CURRENCY_TABLE);
}

/** Majors, plus the destination's own currency when it is not already there. */
export function currencyChoicesFor(local?: string): CurrencyCode[] {
  if (local && isCurrencyCode(local) && !MAJOR_CURRENCIES.includes(local)) {
    return [local, ...MAJOR_CURRENCIES];
  }
  return MAJOR_CURRENCIES;
}

