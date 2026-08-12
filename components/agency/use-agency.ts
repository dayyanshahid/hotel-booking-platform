"use client";

import { useEffect, useState } from "react";
import { canAtLeast, capabilitiesOf } from "@/lib/agency/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import type {
  Agency,
  AgencyBalance,
  AgencyOfferView,
  AgencySession,
  AgentCapabilities,
  AgentPermission,
} from "@/lib/agency/types";

/**
 * Whether a trade session is in play, and what it is entitled to see.
 *
 * The consumer app has to keep working exactly as it does for everyone else, so
 * this is additive: no session means every hook here returns nothing and the
 * screens render unchanged. That also means a leaked component never shows
 * commercial figures to a traveller — there is nothing to show without a
 * server-verified session behind it.
 */

export interface AgencyContext {
  session: AgencySession;
  agency: Pick<
    Agency,
    "id" | "name" | "slug" | "countryCode" | "commissionPercent" | "markup" | "credit" | "profile"
  >;
  balance: AgencyBalance | null;
}

/**
 * What the signed-in account may do, for the screens that decide what to show.
 *
 * The server refuses regardless — this is what stops a view-only agent being
 * offered a button that will only tell them no.
 */
export function may(context: AgencyContext | null, required: AgentPermission): boolean {
  if (!context) return false;
  return canAtLeast(context.session.permission ?? "issue", required);
}

/**
 * The rights that are not rungs on the same ladder.
 *
 * Same contract as {@link may} and the same disclaimer: the server refuses
 * regardless. Resolved through {@link capabilitiesOf} rather than read off the
 * session directly, so the screen and the route cannot disagree about what an
 * older account without the field is allowed to do.
 */
export function can(context: AgencyContext | null, right: keyof AgentCapabilities): boolean {
  if (!context) return false;
  return capabilitiesOf(context.session)[right];
}

/**
 * Three answers to "is anyone signed in", not two.
 *
 * `null` means the server said no. `"unreachable"` means we could not ask —
 * a dropped connection, an origin refusing the request — and it is a
 * different fact with a different remedy. Collapsing the second into the
 * first showed a signed-in agent the sign-in screen the moment their network
 * blinked, and invited them to re-enter an address and wait for a code they
 * did not need, quite possibly mid-booking.
 */
export type SessionState = AgencyContext | null | "unreachable";

type Listener = (value: SessionState) => void;

/**
 * One fetch per page load, shared.
 *
 * Several components ask independently — the header, the rate rows, the credit
 * strip — and each mounting its own request would put four identical calls on
 * every navigation.
 */
let cached: SessionState | undefined;
let inflight: Promise<SessionState> | null = null;
const listeners = new Set<Listener>();

async function load(): Promise<SessionState> {
  if (cached !== undefined) return cached;
  if (!inflight) {
    inflight = fetch(apiUrl("/api/agency/me"), { credentials: apiCredentials() })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { ok: boolean; data?: AgencyContext };
        return body.ok && body.data ? body.data : null;
      })
      // Not `null`: a request that never completed is not a refusal, and the
      // shell reads the difference.
      .catch((): SessionState => "unreachable")
      .then((value) => {
        cached = value;
        inflight = null;
        listeners.forEach((listener) => listener(value));
        return value;
      });
  }
  return inflight;
}

/** Drop the cache after a sign-in or sign-out, so the next read is truthful. */
export function refreshAgency(): void {
  cached = undefined;
  void load();
}

export function useAgency(): { context: AgencyContext | null; loading: boolean; unreachable: boolean } {
  const [state, setState] = useState<SessionState>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let alive = true;
    const listener: Listener = (value) => {
      if (alive) setState(value);
    };
    listeners.add(listener);
    void load().then((value) => {
      if (!alive) return;
      setState(value);
      setLoading(false);
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  /*
   * Callers that only want "is there a session" keep the shape they had —
   * `context` is null while we cannot tell, which is the safe reading for
   * anything deciding whether to show commercial figures. Only the shell
   * needs to know the difference, and it asks for it.
   */
  return { context: state === "unreachable" ? null : state, loading, unreachable: state === "unreachable" };
}

/**
 * Cost, selling price and margin for the offers on screen.
 *
 * Priced on the server every time rather than derived in the browser from a
 * commission the client happens to know: the discount is contractual, and a
 * figure a page could compute is a figure a page could change.
 */
export function useAgencyQuotes(offerIds: string[]): Record<string, AgencyOfferView> {
  const { context } = useAgency();
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  const key = offerIds.join(",");

  useEffect(() => {
    if (!context || !key) {
      setQuotes({});
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/agency/quote"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: apiCredentials(),
          body: JSON.stringify({ offerIds: key.split(",") }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
        if (!alive || !body.ok || !body.data) return;
        setQuotes(Object.fromEntries(body.data.quotes.map((q) => [q.offerId, q])));
      } catch {
        // A failed quote leaves the consumer price standing on its own, which
        // is the right degradation: no number is better than a stale one.
      }
    })();
    return () => {
      alive = false;
    };
  }, [context, key]);

  return quotes;
}
