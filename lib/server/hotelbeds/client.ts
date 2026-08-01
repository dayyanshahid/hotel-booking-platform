// Importing this module from a client component is a build error:
// Holds the API key, the secret and the signature.
import "server-only";

import { createHash } from "node:crypto";
import { bumpSharedCounter } from "../persistence";
import { getHotelbedsConfig, isHotelbedsEnabled, type HotelbedsConfig } from "./config";

/**
 * Signed HTTP client for the APItude family.
 *
 * Authentication (per the Getting Started guide): every request carries an
 * `Api-key` header and an `X-Signature` header containing
 * SHA256(apiKey + secret + unixTimestampSeconds) in lower-case hex.
 *
 * Nothing in this module is importable from a client component: the key, the
 * secret, the signature and every raw supplier payload stay on the server
 * (§9.4). Callers receive typed data or a normalized `HotelbedsError`.
 */

export type HotelbedsErrorKind =
  | "auth"
  | "quotaExceeded"
  | "rateLimited"
  | "invalidRequest"
  | "noAvailability"
  | "timeout"
  | "network"
  | "supplierError";

export class HotelbedsError extends Error {
  readonly kind: HotelbedsErrorKind;
  readonly status?: number;
  /** Supplier's own code, kept for logs and support only — never shown to a customer. */
  readonly supplierCode?: string;
  readonly retryable: boolean;

  constructor(
    kind: HotelbedsErrorKind,
    message: string,
    options: { status?: number; supplierCode?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "HotelbedsError";
    this.kind = kind;
    this.status = options.status;
    this.supplierCode = options.supplierCode;
    this.retryable = options.retryable ?? (kind === "network" || kind === "timeout" || kind === "rateLimited");
  }
}

/* ------------------------------------------------------------ quota guard */

interface QuotaState {
  day: string;
  used: number;
}

/**
 * What a request is for, as far as the day's allowance is concerned.
 *
 * The two are not worth the same. An availability call is the only reason a
 * property can be sold at all; a content call is its photograph and its
 * description. They were drawing on one undivided budget, and because content
 * costs a call per property a single search of a city nobody had synced spent
 * thirteen of fifty — so four searches ended the day and the trade portal, which
 * sells live supply only, had nothing left to show for any city. Rooms were
 * available the whole time. We had spent the allowance on pictures of them.
 */
export type RequestPurpose = "availability" | "content";

declare global {
  var __hotelbedsQuota: QuotaState | undefined;
  var __hotelbedsAvailabilityPath: string | undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Evaluation API keys allow only 50 requests per day and answer 403 beyond that.
 * The guard counts requests so the app degrades to its own sources before
 * burning the allowance, and so a runaway loop cannot exhaust a live quota.
 *
 * Counted in the shared store when there is one, because the allowance belongs
 * to the API key and not to a process. In `globalThis` it was a budget per
 * lambda: ten warm instances meant ten times the allowance, and the guard could
 * not do the single thing it exists for. The overrun surfaces at the supplier
 * as a rate-limited or suspended key, which nobody would trace back to a
 * counter.
 *
 * The process copy is kept either way. It is the correct answer on one machine,
 * it is what `quotaStatus` reports without a round trip, and it is the fallback
 * when the shared store is unreachable — degrading to a stricter budget rather
 * than to none.
 */
async function consumeQuota(config: HotelbedsConfig, purpose: RequestPurpose): Promise<void> {
  const state = (globalThis.__hotelbedsQuota ??= { day: today(), used: 0 });
  if (state.day !== today()) {
    state.day = today();
    state.used = 0;
  }

  /*
   * No ceiling means no counting, and no round trip to count with. The tally
   * below is still kept so the console can report what a day has cost, but
   * nothing is refused and the shared counter is not consulted.
   */
  if (!Number.isFinite(config.dailyQuota)) {
    state.used += 1;
    return;
  }

  /**
   * The ceiling this particular request has to clear.
   *
   * Availability may spend the whole allowance. Content may spend only what
   * sits above the reserve, so that however much photography a day of browsing
   * wants, there is always a known number of searches left in the key. Content
   * refused here is not a failure: the property still appears, priced and
   * bookable, with the name and stars availability itself carries.
   */
  const ceiling =
    purpose === "content" ? Math.max(0, config.dailyQuota - config.availabilityReserve) : config.dailyQuota;

  const refuse = (used: number) => {
    throw new HotelbedsError(
      "quotaExceeded",
      purpose === "content"
        ? `Content budget of ${ceiling} reached (${used} used); the remaining ${config.availabilityReserve} requests are reserved for availability.`
        : `Daily request budget of ${config.dailyQuota} reached (${used} used); not calling the supplier again today.`,
      { retryable: false },
    );
  };

  if (state.used >= ceiling) refuse(state.used);
  state.used += 1;

  // Two days of life, so a counter written just before midnight is not the one
  // read just after it while the day in the key has already rolled over.
  const shared = await bumpSharedCounter(`hotelbeds:${today()}`, 48 * 60 * 60);
  if (shared !== null && shared > ceiling) refuse(shared);
}

/**
 * Clears the local request budget.
 *
 * Operationally this is what you call after upgrading a key mid-day so the app
 * stops holding back against the old allowance. Tests use it to isolate cases
 * from one another.
 */
export function resetQuota(): void {
  globalThis.__hotelbedsQuota = { day: today(), used: 0 };
}

export function quotaStatus(): {
  used: number;
  remaining: number;
  /** What content may still spend, which is everything above the reserve. */
  contentRemaining: number;
  /**
   * Whether a local ceiling is being applied at all.
   *
   * With the guard off the two `remaining` figures are `Infinity`, which is the
   * truthful answer and a poor thing to render. A screen should read this and
   * say "not limited here" rather than print a word at a person.
   */
  limited: boolean;
  day: string;
} {
  const config = getHotelbedsConfig();
  const state = globalThis.__hotelbedsQuota ?? { day: today(), used: 0 };
  const used = state.day === today() ? state.used : 0;
  const limited = Number.isFinite(config.dailyQuota);
  const contentCeiling = Math.max(0, config.dailyQuota - config.availabilityReserve);
  return {
    used,
    remaining: limited ? Math.max(0, config.dailyQuota - used) : Number.POSITIVE_INFINITY,
    contentRemaining: limited ? Math.max(0, contentCeiling - used) : Number.POSITIVE_INFINITY,
    limited,
    day: today(),
  };
}

/* -------------------------------------------------------------- signature */

export function signature(apiKey: string, secret: string, timestampSeconds: number): string {
  return createHash("sha256").update(`${apiKey}${secret}${timestampSeconds}`).digest("hex");
}

/* ----------------------------------------------------------------- errors */

interface SupplierErrorBody {
  error?: { code?: string; message?: string };
  auditData?: unknown;
}

function classify(status: number, body: SupplierErrorBody | undefined): HotelbedsError {
  const code = body?.error?.code;
  const message = body?.error?.message ?? `Supplier responded ${status}`;

  if (status === 401 || status === 403) {
    // 403 is also what an exhausted evaluation quota returns.
    const quota = /quota|limit/i.test(message);
    return new HotelbedsError(quota ? "quotaExceeded" : "auth", message, {
      status,
      supplierCode: code,
      retryable: false,
    });
  }
  if (status === 429) return new HotelbedsError("rateLimited", message, { status, supplierCode: code });
  if (status === 400) {
    return new HotelbedsError("invalidRequest", message, { status, supplierCode: code, retryable: false });
  }
  if (status >= 500) {
    // The API's own guidance: 5xx on a booking path signals unavailable
    // inventory rather than a transient fault, so it is not auto-retried.
    return new HotelbedsError("supplierError", message, { status, supplierCode: code, retryable: false });
  }
  return new HotelbedsError("supplierError", message, { status, supplierCode: code, retryable: false });
}

/* ------------------------------------------------------------------ fetch */

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Booking-path calls get the longer timeout and are never retried. */
  kind?: "search" | "booking";
  query?: Record<string, string | number | boolean | undefined>;
  retries?: number;
  /** Which half of the day's allowance this draws on. Defaults to availability. */
  purpose?: RequestPurpose;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getHotelbedsConfig();
  if (!isHotelbedsEnabled()) {
    throw new HotelbedsError("auth", "Hotelbeds credentials are not configured.", { retryable: false });
  }

  const method = options.method ?? "GET";
  const kind = options.kind ?? "search";
  const maxAttempts = kind === "booking" ? 1 : (options.retries ?? 2);

  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let lastError: HotelbedsError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await consumeQuota(config, options.purpose ?? "availability");

    const timestamp = Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeouts[kind]);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "Api-key": config.apiKey,
          "X-Signature": signature(config.apiKey, config.secret, timestamp),
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as T & SupplierErrorBody) : ({} as T);

      if (!response.ok) {
        const error = classify(response.status, parsed as SupplierErrorBody);
        if (error.retryable && attempt < maxAttempts) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        throw error;
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof HotelbedsError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      const wrapped = new HotelbedsError(
        aborted ? "timeout" : "network",
        aborted ? "The supplier did not respond in time." : "Could not reach the supplier.",
      );
      // A booking that times out is never retried: the order may exist. It goes
      // to reconciliation instead (§6.5 / E-14).
      if (attempt < maxAttempts && kind !== "booking") {
        lastError = wrapped;
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new HotelbedsError("network", "Request failed.");
}

/* ------------------------------------------------------------ public API */

export const hotelbeds = {
  /** Booking API call, e.g. bookingApi("/checkrates", {...}). */
  booking: <T>(path: string, options: RequestOptions = {}) => {
    const { bookingApi } = getHotelbedsConfig();
    return request<T>(`${bookingApi}${path}`, options);
  },

  /** Content API call, e.g. content("/hotels", { query: {...} }). */
  content: <T>(path: string, options: RequestOptions = {}) => {
    const { contentApi } = getHotelbedsConfig();
    return request<T>(`${contentApi}${path}`, { purpose: "content", ...options });
  },

  /**
   * Availability. The path is configurable and the first 404 falls back to the
   * alternate spelling once, then remembers which one this account uses.
   */
  availability: async <T>(body: unknown): Promise<T> => {
    const config = getHotelbedsConfig();
    const candidates = [
      globalThis.__hotelbedsAvailabilityPath ?? config.availabilityPath,
      "/availability",
      "/hotels",
    ].filter((value, index, all) => all.indexOf(value) === index);

    let lastError: unknown;
    for (const path of candidates) {
      try {
        const result = await request<T>(`${config.bookingApi}${path}`, {
          method: "POST",
          body,
          kind: "search",
        });
        globalThis.__hotelbedsAvailabilityPath = path;
        return result;
      } catch (error) {
        lastError = error;
        const notFound = error instanceof HotelbedsError && error.status === 404;
        if (!notFound) throw error;
      }
    }
    throw lastError;
  },

  quotaStatus,
};
