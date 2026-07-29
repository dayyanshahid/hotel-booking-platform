"use client";

import { useEffect, useState } from "react";
import { canAtLeast } from "@/lib/agency/types";
import type {
  Agency,
  AgencyBalance,
  AgencyOfferView,
  AgencySession,
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

type Listener = (value: AgencyContext | null) => void;

/**
 * One fetch per page load, shared.
 *
 * Several components ask independently — the header, the rate rows, the credit
 * strip — and each mounting its own request would put four identical calls on
 * every navigation.
 */
let cached: AgencyContext | null | undefined;
let inflight: Promise<AgencyContext | null> | null = null;
const listeners = new Set<Listener>();

async function load(): Promise<AgencyContext | null> {
  if (cached !== undefined) return cached;
  if (!inflight) {
    inflight = fetch("/api/agency/me", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { ok: boolean; data?: AgencyContext };
        return body.ok && body.data ? body.data : null;
      })
      .catch(() => null)
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

export function useAgency(): { context: AgencyContext | null; loading: boolean } {
  const [context, setContext] = useState<AgencyContext | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let alive = true;
    const listener: Listener = (value) => {
      if (alive) setContext(value);
    };
    listeners.add(listener);
    void load().then((value) => {
      if (!alive) return;
      setContext(value);
      setLoading(false);
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return { context, loading };
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
        const res = await fetch("/api/agency/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
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
