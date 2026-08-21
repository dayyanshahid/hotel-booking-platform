"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { apiFetch } from "@/lib/api-client";
import type { Locale } from "@/lib/types";

/**
 * Who the guest is being priced as.
 *
 * Both wholesalers filter and price on it — TourMind reads it as `Nationality`,
 * Hotelbeds as `sourceMarket` — and nothing in this portal ever sent one, so
 * every search fell back to the platform's home market. Measured against
 * TourMind's test environment on one property and one stay, the same search
 * returned 36 rates as PK and 28 as SA. Not a discount: a different set, some
 * of which the guest was not entitled to and some of which they never saw.
 *
 * Deliberately not a required field on the way in. Asking every traveller their
 * nationality before they may see a price would cost more searches than it
 * saves bookings, and most of ours are from the home market. It sits under the
 * results as a statement of what they are priced as, which a traveller from
 * elsewhere can correct — and correcting it before choosing a room is far
 * better than discovering at checkout that the rate was priced for somebody
 * else.
 */

interface Nationality {
  code: string;
  label: string;
}

/*
 * One fetch per locale for the whole app.
 *
 * Eighty-three countries, identical for every screen and every agent, and the
 * search bar remounts on each navigation. Fetching per mount would put the same
 * request on every page load for a list that changes when a country is founded.
 */
const cache = new Map<string, Nationality[]>();
const inflight = new Map<string, Promise<Nationality[]>>();

async function load(locale: Locale): Promise<Nationality[]> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const existing = inflight.get(locale);
  if (existing) return existing;

  const request = apiFetch<{ nationalities?: Nationality[] }>("/api/countries")
    .then((body) => {
      const list = body.ok && body.data?.nationalities ? body.data.nationalities : [];
      if (list.length) cache.set(locale, list);
      return list;
    })
    .finally(() => inflight.delete(locale));

  inflight.set(locale, request);
  return request;
}

export function NationalitySelect({
  locale,
  value,
  onChange,
}: {
  locale: Locale;
  value?: string;
  onChange: (nationality: string | undefined) => void;
}) {
  const { t } = useApp();
  const [options, setOptions] = useState<Nationality[]>(() => cache.get(locale) ?? []);

  useEffect(() => {
    let alive = true;
    void load(locale).then((list) => {
      if (alive) setOptions(list);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  /*
   * Nothing at all until the list arrives, rather than an empty control.
   *
   * A select showing only the placeholder invites a click that does nothing,
   * and this is a secondary control on a line an agent mostly ignores — its
   * absence for a moment costs nothing, and a broken-looking one costs trust in
   * the price beside it.
   */
  if (!options.length) return null;

  return (
    <label className="text-muted inline-flex items-center gap-1.5 text-xs">
      <span>{t("search.nationality")}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="border-line focus:border-brand-600 rounded-md border bg-transparent py-0.5 ps-1.5 pe-5 text-xs"
        title={t("search.nationalityWhy")}
      >
        {/*
          An explicit "not stated" rather than a silent default, because the two
          are genuinely different: one prices as the home market by our choice,
          the other by the agent's.
        */}
        <option value="">{t("search.nationalityAny")}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
