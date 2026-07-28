"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Spinner, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import type { Suggestion } from "@/lib/types";

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
}: {
  value: { id: string; label: string } | null;
  onSelect: (suggestion: { id: string; label: string; type: Suggestion["type"] } | null) => void;
  error?: string;
  autoFocus?: boolean;
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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(query)}&locale=${locale}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (json?.ok) {
          setItems(json.data.suggestions ?? []);
          setActive(-1);
        }
      } catch {
        /* aborted or offline — the field stays usable */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, locale]);

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
