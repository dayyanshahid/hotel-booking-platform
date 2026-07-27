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

export function getHotelbedsConfig(): HotelbedsConfig {
  return {
    apiKey: process.env.HOTELBEDS_API_KEY ?? "",
    secret: process.env.HOTELBEDS_SECRET ?? "",
    baseUrl: (process.env.HOTELBEDS_BASE_URL ?? "https://api.test.hotelbeds.com").replace(/\/$/, ""),
    bookingApi: process.env.HOTELBEDS_BOOKING_API ?? "/hotel-api/1.0",
    contentApi: process.env.HOTELBEDS_CONTENT_API ?? "/hotel-content-api/1.0",
    availabilityPath: process.env.HOTELBEDS_AVAILABILITY_PATH ?? "/hotels",
    language: process.env.HOTELBEDS_LANGUAGE ?? "ENG",
    dailyQuota: num(process.env.HOTELBEDS_DAILY_QUOTA, 50),
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
