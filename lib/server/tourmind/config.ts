// Importing this module from a client component is a build error:
// Reads the credential environment variables.
import "server-only";

/**
 * TourMind (TMS) Hotel Distribution API configuration.
 *
 * The second live supplier. It exists to prove the point the canonical contract
 * was built for: a second bed bank with a completely different wire format —
 * credentials in the body rather than a signature header, integer hotel codes
 * rather than strings, a numeric meal enum rather than board codes — should
 * reach the UI as the same `Offer` the first one does, and no screen should be
 * able to tell them apart.
 *
 * Credentials live in environment variables only, never in the client bundle
 * and never in a committed file (§12.3). Every value has a safe default so the
 * app runs on the simulated sources when nothing is configured.
 */

export interface TourmindConfig {
  agentCode: string;
  userName: string;
  password: string;
  baseUrl: string;
  /** Guest nationality sent with availability — rates are nationality-priced. */
  nationality: string;
  /** Percentage added to the supplier's net rate to form the customer price. */
  markupPercent: number;
  /** Prefix for the AgentRefID we send, so bookings are traceable to this app. */
  agentRefPrefix: string;
  timeouts: { search: number; prebook: number; booking: number; catalogue: number };
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getTourmindConfig(): TourmindConfig {
  return {
    agentCode: process.env.TOURMIND_AGENT_CODE ?? "",
    userName: process.env.TOURMIND_USERNAME ?? "",
    password: process.env.TOURMIND_PASSWORD ?? "",
    /*
     * The published test host is plain HTTP, and this API puts the password in
     * the request body — so HTTPS is the default here and downgrading is an
     * explicit, deliberate act rather than something inherited from the docs.
     */
    baseUrl: process.env.TOURMIND_BASE_URL ?? "https://developers.tourmind.cn",
    nationality: process.env.TOURMIND_NATIONALITY ?? "PK",
    markupPercent: num(process.env.PLATFORM_MARKUP_PERCENT, 12),
    agentRefPrefix: process.env.TOURMIND_AGENT_REF_PREFIX ?? "SPT",
    timeouts: {
      search: num(process.env.TOURMIND_SEARCH_TIMEOUT_MS, 8000),
      /*
       * The re-check is not a browse call and must not share its budget.
       *
       * Measured at six seconds and over against their server, which meant it
       * regularly lost a race with the eight-second search timeout — and losing
       * it fails the one step that confirms the price before money moves. A
       * customer waiting on a confirmation will wait longer than one skimming
       * results, and the alternative is booking an unverified rate.
       */
      prebook: num(process.env.TOURMIND_PREBOOK_TIMEOUT_MS, 25000),
      // A booking that times out is never retried, so this is generous.
      booking: num(process.env.TOURMIND_BOOKING_TIMEOUT_MS, 60000),
      // The static catalogue is synced deliberately, never on a request path.
      catalogue: num(process.env.TOURMIND_CATALOGUE_TIMEOUT_MS, 60000),
    },
  };
}

/** True only when every credential is present. Partial config is not enabled. */
export function isTourmindEnabled(): boolean {
  const c = getTourmindConfig();
  return Boolean(c.agentCode && c.userName && c.password);
}
