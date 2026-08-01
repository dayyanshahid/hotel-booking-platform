// Importing this module from a client component is a build error:
// Reads the credential environment variables.
import "server-only";

/**
 * Hotelbeds (HBX Group) APItude configuration.
 *
 * Credentials live in environment variables only — never in the client bundle,
 * never in a committed file (§12.3). Every value has a safe default so the app
 * runs with the simulated sources when no credentials are present.
 */

export interface HotelbedsConfig {
  apiKey: string;
  secret: string;
  baseUrl: string;
  /** Booking API root, e.g. /hotel-api/1.0 */
  bookingApi: string;
  /** Content API root, e.g. /hotel-content-api/1.0 */
  contentApi: string;
  /** Availability path under bookingApi. Overridable in case the tenant's plan differs. */
  availabilityPath: string;
  language: string;
  /** Daily request budget. Evaluation keys allow 50 requests/day. */
  dailyQuota: number;
  /**
   * Requests inside `dailyQuota` that only availability may spend.
   *
   * Content is a call per property and availability returns up to fifty of
   * them, so without a floor one search of an unsynced city can leave the key
   * with nothing to search on. Whatever else happens in a day, this many
   * searches remain possible.
   */
  availabilityReserve: number;
  /** Percentage added to the supplier's net rate to form the customer price. */
  markupPercent: number;
  /** Price tolerance sent with a booking, per the API's tolerance field. */
  tolerancePercent: number;
  /** Client reference prefix sent to the supplier for reconciliation. */
  clientReference: string;
  timeouts: { search: number; booking: number };
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The day's request ceiling, or no ceiling at all.
 *
 * `HOTELBEDS_DAILY_QUOTA=0` turns the local guard off and lets the supplier's
 * own limit be the only one. That is a deliberate setting, not a mistake to be
 * defended against: on a key with a generous allowance the guard is a second
 * limit that can only ever be wrong, and it went wrong here — set below the
 * cost of a single search, it emptied a results page on a perfectly healthy
 * account and did it intermittently, because the count is per instance.
 *
 * Zero used to mean "refuse everything", which is a poor thing for a number
 * somebody types to mean. Off is off.
 *
 * What this gives up is real and worth stating: nothing local now stops a
 * runaway loop from spending an evaluation key's allowance, and the supplier
 * answers 403 when it is gone.
 */
function dailyQuotaFrom(raw: string | undefined): number {
  const parsed = Number(raw);
  if (raw !== undefined && Number.isFinite(parsed) && parsed <= 0) return Number.POSITIVE_INFINITY;
  return num(raw, 50);
}

export function getHotelbedsConfig(): HotelbedsConfig {
  const dailyQuota = dailyQuotaFrom(process.env.HOTELBEDS_DAILY_QUOTA);
  /*
   * Three fifths of the allowance, which on an evaluation key is thirty
   * searches — enough that a day of demonstrating the portal cannot be ended
   * by a day of browsing photographs. Clamped so a hand-set reserve can never
   * exceed the quota it is carved out of and stop availability entirely.
   */
  // Nothing to carve out of an allowance that is not being counted.
  const availabilityReserve = Number.isFinite(dailyQuota)
    ? Math.min(
        dailyQuota,
        Math.max(0, num(process.env.HOTELBEDS_AVAILABILITY_RESERVE, Math.floor(dailyQuota * 0.6))),
      )
    : 0;

  return {
    dailyQuota,
    availabilityReserve,
    apiKey: process.env.HOTELBEDS_API_KEY ?? "",
    secret: process.env.HOTELBEDS_SECRET ?? "",
    baseUrl: (process.env.HOTELBEDS_BASE_URL ?? "https://api.test.hotelbeds.com").replace(/\/$/, ""),
    bookingApi: process.env.HOTELBEDS_BOOKING_API ?? "/hotel-api/1.0",
    contentApi: process.env.HOTELBEDS_CONTENT_API ?? "/hotel-content-api/1.0",
    availabilityPath: process.env.HOTELBEDS_AVAILABILITY_PATH ?? "/hotels",
    language: process.env.HOTELBEDS_LANGUAGE ?? "ENG",
    markupPercent: num(process.env.PLATFORM_MARKUP_PERCENT, 12),
    tolerancePercent: num(process.env.HOTELBEDS_TOLERANCE_PERCENT, 2),
    clientReference: process.env.HOTELBEDS_CLIENT_REFERENCE ?? "NAZIL",
    timeouts: {
      search: num(process.env.HOTELBEDS_SEARCH_TIMEOUT_MS, 20000),
      // The API's own best-practice guidance: never time a booking out below 60s.
      booking: Math.max(60000, num(process.env.HOTELBEDS_BOOKING_TIMEOUT_MS, 65000)),
    },
  };
}

/** True only when a key and secret are both present. */
export function isHotelbedsEnabled(): boolean {
  const config = getHotelbedsConfig();
  return Boolean(config.apiKey && config.secret);
}

/** Live environment guard — used to refuse destructive test-data operations. */
export function isLiveEnvironment(): boolean {
  return !getHotelbedsConfig().baseUrl.includes("api.test.");
}
