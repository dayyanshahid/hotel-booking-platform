import { LOCALE_META } from "./i18n";
import { CURRENCY_CODES, CURRENCY_TABLE, isCurrencyCode } from "./currencies";
import type { CurrencyCode, Locale } from "./types";

/**
 * Presentation only. §9.4: the frontend formats and explains server values,
 * it never recomputes commercial totals.
 */

/**
 * Presentation metadata for every currency the platform quotes in. The table
 * itself lives in `currencies.ts` so the `CurrencyCode` type can be derived
 * from it — a currency cannot be referenced anywhere without having a rate.
 */
export const CURRENCIES = CURRENCY_TABLE;

/**
 * Indicative conversion basis relative to SAR — always labelled as indicative
 * in the UI, and always shown alongside the currency the card is actually
 * charged in (§8.4, E-20). A production build replaces this with the rates the
 * payment provider will actually apply; nothing here is a quote.
 */
export const FX_FROM_SAR: Record<CurrencyCode, number> = Object.fromEntries(
  CURRENCY_CODES.map((code) => [code, CURRENCY_TABLE[code].rateFromSar]),
) as Record<CurrencyCode, number>;

/**
 * Where a rate actually comes from.
 *
 * The built-in table is the floor, not the authority: an operator maintains the
 * rates the platform charges on, and those live in a server-only module this
 * file cannot import — it is shared with client components. So the server
 * injects a resolver instead, and anything that has not been told otherwise
 * keeps using the table exactly as before.
 */
let rateResolver: (currency: CurrencyCode) => number = (currency) => FX_FROM_SAR[currency];

/** Server-side only. Called when the operator's rates are loaded. */
export function __setRateResolver(resolver: ((currency: CurrencyCode) => number) | null): void {
  rateResolver = resolver ?? ((currency) => FX_FROM_SAR[currency]);
}

/** Units of `currency` per one SAR, as currently in force. */
export function rateFromSar(currency: CurrencyCode): number {
  const rate = rateResolver(currency);
  // A resolver that returns nonsense must not zero every price on the site.
  return Number.isFinite(rate) && rate > 0 ? rate : FX_FROM_SAR[currency];
}

export function convertFromSar(amountSar: number, currency: CurrencyCode): number {
  return Math.round(amountSar * rateFromSar(currency));
}

export const isSupportedCurrency = isCurrencyCode;

/**
 * Convert between any two supported currencies. Suppliers quote in their own
 * contracted currency (commonly EUR), so amounts arrive in a currency the
 * customer may not be browsing in.
 */
export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return Math.round(amount);
  const inSar = amount / rateFromSar(from);
  return Math.round(inSar * rateFromSar(to));
}

export function formatMoney(amount: number, currency: CurrencyCode, locale: Locale): string {
  const intl = LOCALE_META[locale].intl;
  try {
    return new Intl.NumberFormat(intl, {
      style: "currency",
      currency,
      maximumFractionDigits: CURRENCIES[currency]?.decimals ?? 0,
      minimumFractionDigits: 0,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_META[locale].intl).format(value);
}

/** Date-only formatting; input is an ISO local date (no time zone shifting). */
export function formatDate(
  iso: string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { ...opts, timeZone: "UTC" }).format(date);
}

export function formatDateRange(from: string, to: string, locale: Locale): string {
  return `${formatDate(from, locale, { day: "numeric", month: "short" })} – ${formatDate(to, locale)}`;
}

/**
 * Deadlines always render in the destination time zone. §12.5 — never the device zone.
 */
export function formatDeadline(iso: string, timezone: string, locale: Locale): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

export function formatDateTime(iso: string, locale: Locale, timezone?: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

export function formatRelative(iso: string, locale: Locale): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_META[locale].intl, { numeric: "auto" });
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export function countdown(toIso: string): { minutes: number; seconds: number; expired: boolean } {
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return { minutes: 0, seconds: 0, expired: true };
  return { minutes: Math.floor(ms / 60000), seconds: Math.floor((ms % 60000) / 1000), expired: false };
}

export function formatDuration(minutes: number, seconds: number): string {
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function guestCount(rooms: { adults: number; childrenAges: number[] }[]): number {
  return rooms.reduce((sum, r) => sum + r.adults + r.childrenAges.length, 0);
}

export function distanceLabel(km: number, locale: Locale): string {
  if (km < 1) return `${formatNumber(Math.round(km * 1000), locale)} m`;
  return `${formatNumber(Math.round(km * 10) / 10, locale)} km`;
}

/**
 * The figure two rates from different suppliers can be ranked against.
 *
 * Hotelbeds prices a rate per room; TourMind and the simulated source price the
 * whole party. Sorting on `total` therefore compared one room against three and
 * put every Hotelbeds property at the cheap end of a group search — the ranking
 * was reliably wrong, in one supplier's favour, and nothing on the page said so.
 *
 * Per room is the common denominator both can be reduced to without inventing a
 * number. Multiplying the other way would mean quoting three rooms at a rate
 * that may only have one left.
 */
export function comparableTotal(price: { total: number; roomsCovered?: number }): number {
  return price.total / Math.max(1, price.roomsCovered ?? 1);
}

/** True when a total buys fewer rooms than the search asked for. */
export function isPerRoomTotal(price: { roomsCovered?: number; roomsRequested?: number }): boolean {
  return (price.roomsRequested ?? 1) > (price.roomsCovered ?? 1);
}

/**
 * What the whole party would cost at this rate — an estimate, and labelled as
 * one wherever it is shown.
 *
 * It is arithmetic on a price the supplier quoted for fewer rooms, so it is
 * exactly as true as the assumption that the remaining rooms are available at
 * the same rate. Often they are; a rate with two left cannot fill three rooms,
 * and the last room of an allocation is routinely the expensive one. So this
 * never appears as *the* price — only beside the per-room total that is real,
 * with the condition attached.
 */
export function partyEstimate(price: {
  total: number;
  roomsCovered?: number;
  roomsRequested?: number;
}): number {
  return Math.round(comparableTotal(price) * Math.max(1, price.roomsRequested ?? 1));
}
