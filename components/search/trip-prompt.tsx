"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, Card, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { formatDate } from "@/lib/format";
import type { Interpretation } from "@/lib/server/interpret";
import type { CurrencyCode, SearchFilters, SearchIntent } from "@/lib/types";
import { apiUrl } from "@/lib/api-origin";

/**
 * Describe your trip.
 *
 * The point is that it *runs the search*. Interpretation happens on the server
 * against the real suggestion index, so it knows every city we sell in both
 * languages and cannot offer one we have no inventory for. What it read and
 * what it had to assume are shown apart, because a guess presented as an
 * understanding is how someone ends up on the wrong dates.
 *
 * It lives here rather than inside the home page because a sentence is a
 * faster way to state a stay than four controls on every surface that searches
 * — the agent typing what a caller just said, the operator reproducing the
 * complaint in front of them. The caller decides what "run" means: the
 * consumer site navigates, a portal searches in place.
 */
export function TripPrompt({
  currency,
  onRun,
  placeholder,
  label,
  className,
  tone = "onLight",
}: {
  /** Priced in the agency's settlement currency inside the trade portal. */
  currency?: CurrencyCode;
  onRun: (intent: SearchIntent, filters: SearchFilters) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  /** Over the hero photograph the field needs its own surface; in a card it does not. */
  tone?: "onLight" | "onMedia";
}) {
  const { t, locale, currency: browsingCurrency, track } = useApp();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Interpretation | null>(null);

  async function interpret() {
    setBusy(true);
    const res = await fetch(apiUrl("/api/search/interpret"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      credentials: "same-origin",
      body: JSON.stringify({ text: prompt, currency: currency ?? browsingCurrency }),
    });
    const body = (await res.json()) as { ok: boolean; data?: Interpretation };
    setBusy(false);
    if (!body.ok || !body.data) return;
    setResult(body.data);
    track("ai_prompt_interpreted", {
      resolved: body.data.intent ? "yes" : "no",
      assumed: body.data.assumed.length,
    });
  }

  function run() {
    if (!result?.intent) return;
    track("ai_prompt_searched", {});
    // The currency the caller asked for wins: the interpreter only ever sees
    // one, and a trade quote priced in the browsing currency would be wrong.
    onRun(currency ? { ...result.intent, currency } : result.intent, result.filters);
  }

  const guests = result?.intent
    ? result.intent.rooms.reduce((sum, room) => sum + room.adults + room.childrenAges.length, 0)
    : 0;

  return (
    <div className={cx("max-w-3xl", className)}>
      <label htmlFor="ai-prompt" className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Icon name="sparkle" size={15} />
        {label ?? t("home.aiPrompt")}
      </label>
      {/*
        Field and action are one pill rather than two floating controls: over a
        photograph, separate elements read as debris instead of a control.
      */}
      <div
        className={cx(
          "mt-2 flex flex-col gap-2 rounded-[var(--radius-card)] p-1.5 sm:flex-row sm:items-center",
          tone === "onMedia" ? "surface border" : "hairline border",
        )}
      >
        <input
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim()) void interpret();
          }}
          placeholder={placeholder ?? t("home.aiPlaceholder")}
          className="min-h-10 w-full min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        <Button type="button" onClick={interpret} loading={busy} disabled={!prompt.trim()} className="shrink-0">
          {t("home.aiInterpret")}
        </Button>
      </div>

      {result && (
        <Card className="rise mt-3 space-y-2 p-4 text-sm">
          {result.intent ? (
            <>
              <p className="font-medium">{t("home.aiInterpreted")}</p>
              <p className="wrap-anywhere">
                <strong>{result.intent.destinationDisplay}</strong> ·{" "}
                {formatDate(result.intent.checkIn, locale)} → {formatDate(result.intent.checkOut, locale)} ·{" "}
                {result.intent.rooms.length} {t("common.rooms")} · {guests} {t("common.guests")}
              </p>
              {result.understood.length > 0 && (
                <p className="text-muted text-xs">{result.understood.join(" · ")}</p>
              )}
              {/* Assumptions are set apart, not blended into what was read. */}
              {result.assumed.length > 0 && (
                <p className="text-caution-700 text-xs">
                  {t("home.aiAssumed")}: {result.assumed.join(", ")}
                </p>
              )}
              <Button size="sm" onClick={run}>
                {t("home.aiSearch")}
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">{t("home.aiNoDestination")}</p>
              <p className="text-muted text-xs">{t("home.aiNoDestinationBody")}</p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
