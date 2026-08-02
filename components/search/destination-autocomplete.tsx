"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Spinner, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { isConfident, matchDestination } from "@/lib/destination-match";
import type { Suggestion } from "@/lib/types";

/**
 * What the search bar may ask this field on submit.
 *
 * The field owns the typed text and the suggestions fetched for it, and the
 * button that needs both lives in the parent. Handing over a resolver rather
 * than lifting the state keeps the combobox's own behaviour in one place.
 */
export interface DestinationResolver {
  /**
   * Settle the typed text into a destination, if it names one unambiguously.
   *
   * Returns the place it settled on, or null — in which case the list is left
   * open on what it did find, so the agent picks rather than being told off.
   */
  resolve: () => Promise<Suggestion | null>;
}

/**
 * F-020 — destination and property autocomplete.
 *
 * ARIA combobox pattern with full keyboard support, debounced and cancellable
 * requests, labeled suggestion types and country context so similarly named
 * places are never mixed (§5.3).
 */
export function DestinationAutocomplete({
  value,
  onSelect,
  error,
  autoFocus,
  resolverRef,
}: {
  value: { id: string; label: string } | null;
  onSelect: (suggestion: { id: string; label: string; type: Suggestion["type"] } | null) => void;
  error?: string;
  autoFocus?: boolean;
  /** Filled in with a resolver the submitting form can call. */
  resolverRef?: React.MutableRefObject<DestinationResolver | null>;
}) {
  const { t, locale, recent } = useApp();
  // Derived: the typed value wins once the customer edits, otherwise the
  // selected suggestion's label is shown. No prop-to-state sync effect needed.
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? value?.label ?? "";
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Which query the suggestions in `items` were fetched for.
   *
   * The field debounces, so at the instant the agent presses Search the list on
   * screen may still be the answer to a shorter prefix. Resolving against that
   * would settle "Singapore" onto whatever "Singa" had matched.
   */
  const itemsFor = useRef("");

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  /** One request shape, whether it was typed towards or submitted against. */
  async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
    const res = await fetch(
      apiUrl(`/api/search/suggestions?q=${encodeURIComponent(q)}&locale=${locale}`),
      { signal, credentials: apiCredentials() },
    );
    const json = await res.json();
    return json?.ok ? ((json.data.suggestions ?? []) as Suggestion[]) : [];
  }

  useEffect(() => {
    // Reading from an external system (the suggestions service); the early exit
    // clears stale results before the request is issued.
    if (query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        setItems(await fetchSuggestions(query, controller.signal));
        itemsFor.current = query;
        setActive(-1);
      } catch {
        /* aborted or offline — the field stays usable */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSuggestions is re-created per render and depends only on `locale`
  }, [query, locale]);

  /*
   * Let the form settle the field on the way past.
   *
   * Re-assigned every render so the resolver closes over the text and the
   * suggestions as they are *now*, rather than as they were when the field
   * first mounted. Nulled on the way out so a submit cannot reach into a field
   * that has been unmounted.
   */
  useEffect(() => {
    if (!resolverRef) return;
    resolverRef.current = {
      resolve: async () => {
        const text = query.trim();
        if (text.length < 2) return null;

        // The debounce may still be in flight, or may have answered a shorter
        // prefix; either way the list on screen is not an answer to this text.
        let candidates = items;
        if (itemsFor.current.trim() !== text) {
          setLoading(true);
          try {
            candidates = await fetchSuggestions(text);
            setItems(candidates);
            itemsFor.current = text;
          } catch {
            candidates = [];
          } finally {
            setLoading(false);
          }
        }

        const match = matchDestination(text, candidates);
        if (isConfident(match) && match.suggestion) {
          choose(match.suggestion);
          return match.suggestion;
        }

        /*
         * Not sure enough to choose for them. Rather than the old refusal —
         * an error under a field containing a correctly spelled city — the
         * list is opened on what was actually found, so the answer is one
         * click away instead of a puzzle.
         */
        setOpen(candidates.length > 0);
        setActive(candidates.length ? 0 : -1);
        return null;
      },
    };
    return () => {
      if (resolverRef) resolverRef.current = null;
    };
  });

  const typeLabel: Record<string, string> = {
    city: locale === "ar" ? "مدينة" : "City",
    region: locale === "ar" ? "منطقة" : "Region",
    country: locale === "ar" ? "دولة" : "Country",
    neighborhood: locale === "ar" ? "حي" : "Area",
    airport: locale === "ar" ? "مطار" : "Airport",
    landmark: locale === "ar" ? "معلم" : "Landmark",
    hotel: locale === "ar" ? "فندق" : "Property",
  };

  const recentItems: Suggestion[] = recent.slice(0, 4).map((r) => ({
    id: r.intent.destinationId,
    type: r.intent.destinationType,
    label: r.intent.destinationDisplay,
    context: r.label,
    countryCode: "",
    recent: true,
  }));

  const list = query.trim().length >= 2 ? items : recentItems;

  function choose(item: Suggestion) {
    onSelect({ id: item.id, label: item.label, type: item.type });
    setTyped(null);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0 && list[active]) {
      e.preventDefault();
      choose(list[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      {/* The label lives inside the control, above the value, with the icon
          leading — see `.search-field` for why. */}
      <label htmlFor={id} className="sr-only">
        {t("common.destination")}
      </label>
      <div className="search-field relative">
        <Icon name="pin" size={20} className="search-field-icon" />
        <span className="search-field-body">
          <span aria-hidden className="search-field-label">
            {t("common.destination")}
          </span>
          <input
            id={id}
            className="search-field-value"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            value={query}
            placeholder={t("search.placeholder")}
            onChange={(e) => {
            setTyped(e.target.value);
            setOpen(true);
            if (value) onSelect(null);
          }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </span>
        {loading && (
          <span className="text-muted flex items-center">
            <Spinner label={t("common.loading")} />
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-critical-700 mt-1 text-xs font-medium">
          {error}
        </p>
      )}

      {open && (
        <div className="surface hairline rise absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-[var(--radius-card)] border shadow-[var(--shadow-float)]">
          {query.trim().length < 2 && recentItems.length > 0 && (
            <p className="text-muted px-3 pt-2 text-xs font-semibold uppercase">{t("search.recent")}</p>
          )}
          <ul id={`${id}-listbox`} role="listbox" aria-label={t("search.suggestions")}>
            {list.map((item, i) => (
              <li
                key={`${item.id}-${i}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                className={cx(
                  "flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                  i === active && "surface-sunken",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="text-muted block truncate text-xs">{item.context}</span>
                </span>
                <Badge tone={item.type === "hotel" ? "sand" : "neutral"}>
                  {item.recent ? t("search.recent") : typeLabel[item.type]}
                </Badge>
              </li>
            ))}
          </ul>
          {!list.length && query.trim().length >= 2 && !loading && (
            <p className="text-muted p-3 text-sm">{t("search.noSuggestions")}</p>
          )}
        </div>
      )}
    </div>
  );
}
