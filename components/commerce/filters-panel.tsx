"use client";

import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Checkbox, Select, cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { CurrencyCode, SearchFacets, SearchFilters, SortKey } from "@/lib/types";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";

/** Filter set from §5.4, rendered as a sidebar on desktop and a sheet on mobile. */
export function FiltersPanel({
  facets,
  filters,
  onChange,
  currency,
}: {
  facets: SearchFacets;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  currency: CurrencyCode;
}) {
  const { t, locale } = useApp();

  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const toggleIn = <T,>(list: T[] | undefined, value: T): T[] => {
    const current = list ?? [];
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.price")}</legend>
        <div className="mt-2">
          <label htmlFor="max-price" className="text-muted text-xs">
            {formatMoney(facets.priceRange.min, currency, locale)} –{" "}
            {formatMoney(filters.maxPrice ?? facets.priceRange.max, currency, locale)}
          </label>
          <input
            id="max-price"
            type="range"
            min={facets.priceRange.min}
            max={facets.priceRange.max}
            step={50}
            value={filters.maxPrice ?? facets.priceRange.max}
            onChange={(e) => set({ maxPrice: Number(e.target.value) })}
            className="mt-1 w-full accent-[var(--focus)]"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.stars")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {facets.categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              aria-pressed={filters.categories?.includes(cat.value) ?? false}
              onClick={() => set({ categories: toggleIn(filters.categories, cat.value) })}
              className={cx(
                "min-h-9 rounded-[var(--radius-pill)] border px-3.5 text-xs font-medium",
                "transition-[background-color,border-color,color] duration-200 ease-[var(--ease-out)]",
                filters.categories?.includes(cat.value)
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "surface hover:border-brand-300",
              )}
            >
              {cat.value}★ ({cat.count})
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.rating")}</legend>
        <Select
          className="mt-2"
          value={String(filters.minRating ?? "")}
          onChange={(e) => set({ minRating: e.target.value ? Number(e.target.value) : undefined })}
          aria-label={t("filters.rating")}
        >
          <option value="">{t("common.clear")}</option>
          <option value="9">9+</option>
          <option value="8">8+</option>
          <option value="7">7+</option>
        </Select>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.neighborhood")}</legend>
        <div className="mt-2 space-y-1">
          {facets.neighborhoods.map((hood) => (
            <Checkbox
              key={hood.value}
              checked={filters.neighborhoods?.includes(hood.value) ?? false}
              onChange={() => set({ neighborhoods: toggleIn(filters.neighborhoods, hood.value) })}
              label={
                <span className="flex items-center gap-2">
                  {hood.value} <Badge tone="neutral">{hood.count}</Badge>
                </span>
              }
            />
          ))}
        </div>
      </fieldset>

      {/*
        Property type is a different product, not a cheaper hotel: someone
        filtering for a hostel in Lisbon or a villa in Bali wants a different
        thing entirely. The backend already faceted on this — nothing surfaced
        it while the catalogue was six cities of hotels.
      */}
      {facets.propertyTypes.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.propertyType")}</legend>
          <div className="mt-2 space-y-1">
            {facets.propertyTypes.map((type) => (
              <Checkbox
                key={type.value}
                checked={filters.propertyTypes?.includes(type.value) ?? false}
                onChange={() => set({ propertyTypes: toggleIn(filters.propertyTypes, type.value) })}
                label={
                  <span className="flex items-center gap-2">
                    {type.value} <Badge tone="neutral">{type.count}</Badge>
                  </span>
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.amenities")}</legend>
        <div className="mt-2 space-y-1">
          {facets.amenities.map((amenity) => (
            <Checkbox
              key={amenity.code}
              checked={filters.amenities?.includes(amenity.code) ?? false}
              onChange={() => set({ amenities: toggleIn(filters.amenities, amenity.code) })}
              label={
                <span className="flex items-center gap-2">
                  {amenity.label} <Badge tone="neutral">{amenity.count}</Badge>
                </span>
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("common.filters")}</legend>
        <Checkbox
          checked={filters.refundableOnly ?? false}
          onChange={(e) => set({ refundableOnly: e.target.checked })}
          label={t("filters.cancellation")}
        />
        <Checkbox
          checked={filters.payLaterOnly ?? false}
          onChange={(e) => set({ payLaterOnly: e.target.checked })}
          label={t("filters.payment")}
        />
        <Checkbox
          checked={filters.accessibleOnly ?? false}
          onChange={(e) => set({ accessibleOnly: e.target.checked })}
          label={t("filters.accessible")}
        />
        <Checkbox
          checked={filters.dealsOnly ?? false}
          onChange={(e) => set({ dealsOnly: e.target.checked })}
          label={t("filters.deals")}
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.propertyType")}</legend>
        <div className="mt-2 space-y-1">
          {facets.propertyTypes.map((type) => (
            <Checkbox
              key={type.value}
              checked={filters.propertyTypes?.includes(type.value) ?? false}
              onChange={() => set({ propertyTypes: toggleIn(filters.propertyTypes, type.value) })}
              label={`${type.value} (${type.count})`}
            />
          ))}
        </div>
      </fieldset>

      <Button variant="secondary" className="w-full" onClick={() => onChange({})}>
        {t("common.reset")}
      </Button>
    </div>
  );
}

export function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const { t } = useApp();
  const options: { id: SortKey; label: string }[] = [
    { id: "recommended", label: t("results.sortRecommended") },
    { id: "priceAsc", label: t("results.sortPriceAsc") },
    { id: "priceDesc", label: t("results.sortPriceDesc") },
    { id: "rating", label: t("results.sortRating") },
    { id: "distance", label: t("results.sortDistance") },
    { id: "flexible", label: t("results.sortFlexible") },
    { id: "bestValue", label: t("results.sortBestValue") },
  ];
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap">{t("common.sort")}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value as SortKey)} className="!min-h-10">
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Active filter chips, always visible and individually removable (§5.4). */
export function ActiveFilterChips({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
}) {
  const { t, locale } = useApp();
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (filters.maxPrice) {
    chips.push({ key: "maxPrice", label: `≤ ${filters.maxPrice}`, clear: () => onChange({ ...filters, maxPrice: undefined }) });
  }
  for (const cat of filters.categories ?? []) {
    chips.push({
      key: `cat-${cat}`,
      label: `${cat}★`,
      clear: () => onChange({ ...filters, categories: filters.categories?.filter((c) => c !== cat) }),
    });
  }
  for (const type of filters.propertyTypes ?? []) {
    chips.push({
      key: `type-${type}`,
      label: type,
      clear: () =>
        onChange({ ...filters, propertyTypes: filters.propertyTypes?.filter((t) => t !== type) }),
    });
  }
  for (const hood of filters.neighborhoods ?? []) {
    chips.push({
      key: `hood-${hood}`,
      label: hood,
      clear: () => onChange({ ...filters, neighborhoods: filters.neighborhoods?.filter((h) => h !== hood) }),
    });
  }
  for (const amenity of filters.amenities ?? []) {
    chips.push({
      key: `am-${amenity}`,
      label: amenity,
      clear: () => onChange({ ...filters, amenities: filters.amenities?.filter((a) => a !== amenity) }),
    });
  }
  /*
   * Board and a lower price bound had no chip, so applying either — which the
   * trip interpreter does whenever someone says "with breakfast" — left a
   * filter narrowing the results with nothing on screen to say so and no way
   * to lift it. A filter you cannot see is a filter you cannot remove.
   */
  for (const board of filters.boards ?? []) {
    chips.push({
      key: `board-${board}`,
      label: localized(BOARD_CATALOG[board]?.label, locale) || board,
      clear: () => onChange({ ...filters, boards: filters.boards?.filter((b) => b !== board) }),
    });
  }
  if (filters.minPrice) {
    chips.push({
      key: "minPrice",
      label: `≥ ${filters.minPrice}`,
      clear: () => onChange({ ...filters, minPrice: undefined }),
    });
  }
  if (filters.minRating) {
    chips.push({
      key: "minRating",
      label: `${filters.minRating}+`,
      clear: () => onChange({ ...filters, minRating: undefined }),
    });
  }
  if (filters.refundableOnly) {
    chips.push({ key: "refundable", label: t("filters.cancellation"), clear: () => onChange({ ...filters, refundableOnly: undefined }) });
  }
  if (filters.payLaterOnly) {
    chips.push({ key: "payLater", label: t("filters.payment"), clear: () => onChange({ ...filters, payLaterOnly: undefined }) });
  }
  if (filters.accessibleOnly) {
    chips.push({ key: "accessible", label: t("filters.accessible"), clear: () => onChange({ ...filters, accessibleOnly: undefined }) });
  }
  if (filters.dealsOnly) {
    chips.push({ key: "deals", label: t("filters.deals"), clear: () => onChange({ ...filters, dealsOnly: undefined }) });
  }
  if (filters.bounds) {
    chips.push({ key: "bounds", label: t("results.searchArea"), clear: () => onChange({ ...filters, bounds: undefined }) });
  }

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted text-xs font-semibold">{t("results.activeFilters")}:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className="surface hover:border-brand-300 inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-pill)] border px-3 text-xs transition-colors duration-150"
        >
          {chip.label}
          <span aria-hidden>✕</span>
          <span className="sr-only">{t("common.remove")}</span>
        </button>
      ))}
      <Button size="sm" variant="quiet" onClick={() => onChange({})}>
        {t("common.clear")}
      </Button>
    </div>
  );
}
