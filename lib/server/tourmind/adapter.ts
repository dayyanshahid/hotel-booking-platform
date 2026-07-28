import { addDays, convertCurrency, isSupportedCurrency, nightsBetween } from "@/lib/format";
import { applyMarkup } from "../markup";
import { timezoneForCountry } from "../timezones";
import { TM_MEAL_TO_BOARD, type TmCancelPolicyInfo, type TmRateInfo } from "./types";
import type {
  CancellationPolicy,
  ChargeLine,
  CurrencyCode,
  Locale,
  PriceStack,
  SearchIntent,
} from "@/lib/types";

/**
 * Supplier → canonical adapter for TourMind.
 *
 * Everything TourMind-shaped stops here. The output uses exactly the same
 * canonical types as Hotelbeds and the simulated sources, so no screen, route
 * or test can tell which supplier an offer came from (§9.1, §9.4).
 *
 * Three of their conventions need translating rather than copying.
 *
 * `TotalPrice` is already the full stay total, not a nightly rate — unlike
 * Hotelbeds' `net`, which is per-rate. Treating it as nightly would divide
 * every price by the number of nights.
 *
 * Cancellation windows are open-ended in the other direction from ours. They
 * describe *when a charge applies*; our steps describe *what it costs to
 * cancel before a deadline*. Reading one as the other inverts the policy.
 *
 * And there is no free-cancellation flag beyond `Refundable` — the deadline has
 * to be derived from the earliest charging window, or we would show "free
 * cancellation" with no date, which is worse than showing none.
 */

/** Their date-times are hotel-local and space-separated; ours are ISO. */
function toIsoLocal(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // "2026-09-10 14:00:00" → "2026-09-10T14:00:00"; a bare date gets midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00`;
  return trimmed.replace(" ", "T");
}

export interface TourmindPricing {
  price: PriceStack;
  /** Supplier net — server-side only, never serialised to the client. */
  net: number;
  supplierCurrency: CurrencyCode;
}

export function buildPrice(
  rate: TmRateInfo,
  intent: SearchIntent,
  locale: Locale,
): TourmindPricing | null {
  const netRaw = Number(rate.TotalPrice);
  if (!Number.isFinite(netRaw) || netRaw <= 0) return null;

  const supplierCurrency: CurrencyCode = isSupportedCurrency(rate.CurrencyCode)
    ? rate.CurrencyCode
    : "USD";
  const display: CurrencyCode = intent.currency;
  const ar = locale === "ar";
  const nights = Math.max(1, nightsBetween(intent.checkIn, intent.checkOut));
  const guests = intent.rooms.reduce((sum, room) => sum + room.adults + room.childrenAges.length, 0);

  // TotalPrice is the whole stay, so it is marked up once and never multiplied.
  const { total: markedUp } = applyMarkup(netRaw);
  const total = convertCurrency(markedUp, supplierCurrency, display);

  /*
   * TMS quotes one all-in figure with no tax breakdown, so we must not invent
   * line items. Saying "taxes included" without being able to show them is the
   * honest limit of what this supplier tells us.
   */
  const included: ChargeLine[] = [
    {
      code: "netInclusive",
      label: ar ? "الضرائب والرسوم المشمولة" : "Included taxes and charges",
      amount: 0,
      basis: "included",
    },
  ];

  return {
    net: netRaw,
    supplierCurrency,
    price: {
      currency: display,
      total,
      nightlyAverage: Math.round(total / nights),
      base: total,
      includedCharges: included,
      payAtProperty: [],
      chargeCurrency: display === supplierCurrency ? undefined : supplierCurrency,
      fxBasis:
        display === supplierCurrency
          ? undefined
          : ar
            ? "التحويل تقديري ويُثبّت عند الدفع."
            : "Conversion is indicative and fixed at payment.",
      nights,
      guests,
    },
  };
}

/**
 * Their charging windows to our cancellation ladder.
 *
 * A `CancelPolicyInfo` says "between these two moments, cancelling costs this".
 * Our model says "until this moment, cancelling costs this". So the deadline
 * for a step is the *start* of the window that begins charging, and free
 * cancellation runs until the earliest such start.
 */
export function buildCancellation(
  policies: TmCancelPolicyInfo[] | undefined,
  options: {
    refundable: boolean;
    checkIn: string;
    /** The customer's total, markup included. */
    total: number;
    /** The supplier's net for the same stay, which their fees are a share of. */
    net: number;
    supplierCurrency: CurrencyCode;
    displayCurrency: CurrencyCode;
    countryCode?: string;
    locale: Locale;
  },
): CancellationPolicy {
  const ar = options.locale === "ar";
  const timezone = timezoneForCountry(options.countryCode);

  const windows = (policies ?? [])
    .map((policy) => ({
      from: toIsoLocal(policy.From ?? policy.StartDateTime),
      fee: Number(policy.Amount),
      currency: policy.CurrencyCode,
    }))
    .filter((w): w is { from: string; fee: number; currency: string | undefined } =>
      typeof w.from === "string",
    )
    .sort((a, b) => a.from.localeCompare(b.from));

  // No policy block, or a rate flagged non-refundable, is charged from booking.
  if (!options.refundable || !windows.length) {
    return {
      refundable: false,
      timezone,
      steps: [
        {
          until: `${options.checkIn}T23:59:00`,
          fee: options.total,
          label: ar ? "غير قابل للاسترداد" : "Non-refundable",
        },
      ],
    };
  }

  const freeUntil = windows[0].from;
  const stillFree = new Date(freeUntil).getTime() > Date.now();

  /*
   * Their fee is a share of the supplier net, so it is applied as a share of
   * the customer's total rather than converted straight across.
   *
   * Converting directly understates it: a 100% penalty on a CNY 691 net came
   * out as $97 against a $108 total, which reads as an $11 refund the guest
   * would never receive. A full penalty must forfeit the full amount paid.
   */
  const steps = windows.map((window, index) => {
    const feeRaw = Number.isFinite(window.fee) ? window.fee : options.net;
    const share = options.net > 0 ? Math.min(1, feeRaw / options.net) : 1;
    const fee = Math.min(Math.round(options.total * share), options.total);
    const next = windows[index + 1]?.from;
    return {
      until: next ?? `${addDays(options.checkIn, 1)}T12:00:00`,
      fee,
      label:
        fee >= options.total
          ? ar
            ? "لا يوجد استرداد"
            : "No refund"
          : ar
            ? "رسوم إلغاء جزئية"
            : "Partial cancellation fee",
    };
  });

  return {
    refundable: stillFree,
    freeUntil: stillFree ? freeUntil : undefined,
    timezone,
    steps: stillFree
      ? [{ until: freeUntil, fee: 0, label: ar ? "إلغاء مجاني" : "Free cancellation" }, ...steps]
      : steps,
  };
}

/**
 * Their meal enum to the board vocabulary the UI already speaks.
 *
 * Reads `MealType` first because that is what the live API sends, and falls
 * back to the documented `MealCode`. Both arrive as strings in practice, so the
 * value is coerced rather than compared — `"2"` and `2` must mean breakfast.
 */
export function boardCodeFor(rate: TmRateInfo): string {
  const raw = rate.MealInfo?.MealType ?? rate.MealInfo?.MealCode;
  const code = Number(raw);
  if (!Number.isFinite(code)) return "RO";
  return TM_MEAL_TO_BOARD[code] ?? "RO";
}

/**
 * "2 left at this price" — but only when the number is small enough to be
 * true and useful. A large allotment is inventory data, not urgency, and
 * dressing it as scarcity is the pressure tactic the scope forbids (§8.2).
 */
export function remainingLabel(rate: TmRateInfo, locale: Locale): string | undefined {
  const left = Number(rate.Allotment);
  if (!Number.isFinite(left) || left <= 0 || left > 5) return undefined;
  return locale === "ar" ? `بقيت ${left} غرف بهذا السعر` : `${left} left at this price`;
}
