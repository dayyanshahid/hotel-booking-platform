"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Checkbox, Input, Select, cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { CurrencyCode, SearchFacets, SearchFilters, SortKey } from "@/lib/types";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";

/** Filter set from §5.4, rendered as a sidebar on desktop and a sheet on mobile. */
/**
 * Which filters a surface offers.
 *
 * Not every filter can be answered by every source. The public site sells a
 * catalogue that carries guest review scores and accessible-room flags; our two
 * contracted suppliers publish neither, so offering those controls on a trade
 * screen would be offering a filter that silently matches nothing — worse than
 * omitting it, because an agent reads an empty result as "no availability".
 */
export type FilterKey =
  | "price"
  | "stars"
  | "rating"
  | "neighborhood"
  | "propertyType"
  | "amenities"
  | "refundable"
  | "payLater"
  | "accessible"
  | "deals"
  | "board"
  | "hotelName"
  | "roomCategory"
  | "rateConditions"
  | "distance";

/*
 * `refundable` is not here, and that is not an oversight: "rate conditions"
 * answers the same question with three answers instead of one, and offering
 * both would put two controls on the same field. It stays in the type because
 * a URL or the trip interpreter can still carry the old boolean, and the chip
 * above knows how to lift it.
 */
const ALL_FILTERS: FilterKey[] = [
  "price",
  "stars",
  "rating",
  "neighborhood",
  "propertyType",
  "amenities",
  "payLater",
  "accessible",
  "deals",
  "board",
  "hotelName",
  "roomCategory",
  "rateConditions",
  "distance",
];

/**
 * What Hotelbeds and TourMind between them can actually answer.
 *
 * Star rating, board, price and cancellation come from both. Zone, property
 * type, facilities and promotions come from Hotelbeds, and amenities now come
 * from TourMind's static list too. Guest rating, accessible rooms and payment
 * timing are not in either contract as data we hold, so they are not offered.
 *
 * Room category and rate conditions are read out of what the suppliers do send
 * — the room's own name and its cancellation policy — so both are answerable
 * here. `refundable` is deliberately absent: "rate conditions" asks the same
 * question with three answers instead of one, and shipping both would be two
 * controls competing over one field.
 */
export const LIVE_SUPPLY_FILTERS: FilterKey[] = [
  "hotelName",
  "price",
  "stars",
  "board",
  "roomCategory",
  "rateConditions",
  "distance",
  "amenities",
  "neighborhood",
  "propertyType",
  "deals",
];

/**
 * The type-ahead, which types faster than it searches.
 *
 * Every other control here changes one thing per click, so committing on
 * change is right for them. This one changes on every keystroke, and each
 * commit re-reads the page — so "hilton" fired six of them, the result count
 * flickered through six values, and the six answers raced each other home.
 *
 * The box therefore keeps its own value and hands it over once the agent stops
 * typing. Two hundred milliseconds is below the threshold where a pause
 * registers as waiting and well above the gap between keystrokes.
 *
 * The prop still wins when it changes from outside — clearing the chip above,
 * or resetting the panel, has to empty the box — but not while the agent is
 * mid-word, which is what a naive sync would do.
 */
function HotelNameFilter({ value, onCommit }: { value?: string; onCommit: (next: string | undefined) => void }) {
  const { t } = useApp();
  const [typed, setTyped] = useState(value ?? "");
  const committed = useRef(value ?? "");

  useEffect(() => {
    if ((value ?? "") === committed.current) return;
    committed.current = value ?? "";
    setTyped(value ?? "");
  }, [value]);

  useEffect(() => {
    if (typed === committed.current) return;
    const id = window.setTimeout(() => {
      committed.current = typed;
      onCommit(typed.trim() || undefined);
    }, 200);
    return () => window.clearTimeout(id);
    // `onCommit` is rebuilt every render by the caller and is not worth chasing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  return (
    <fieldset>
      <legend className="text-sm font-semibold">{t("filters.hotelName")}</legend>
      <Input
        className="mt-2"
        type="search"
        value={typed}
        placeholder={t("filters.hotelNamePlaceholder")}
        aria-label={t("filters.hotelName")}
        onChange={(e) => setTyped(e.target.value)}
      />
    </fieldset>
  );
}

/**
 * Five down to one, then the properties nobody rated.
 *
 * Descending because that is how a customer says it — "four star or better" —
 * and unrated last because it is the exception rather than a step below one
 * star. A supplier that publishes no rating is not saying the hotel is bad.
 */
const STAR_CLASSES = [5, 4, 3, 2, 1, 0];

export function FiltersPanel({
  facets,
  filters,
  onChange,
  currency,
  supported = ALL_FILTERS,
}: {
  facets: SearchFacets;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  currency: CurrencyCode;
  supported?: FilterKey[];
}) {
  const { t, locale } = useApp();
  const shows = (key: FilterKey) => supported.includes(key);

  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const toggleIn = <T,>(list: T[] | undefined, value: T): T[] => {
    const current = list ?? [];
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  };

  return (
    <div className="space-y-6">
      {/*
        Find one property among a hundred.
        An agent who has been asked for the Hilton does not want to narrow by
        star and board until it surfaces — they want to type "hilton". Cheap
        enough to run on every keystroke now that a filter change re-reads
        cached supply instead of calling both suppliers again.
      */}
      {shows("hotelName") && (
        <HotelNameFilter value={filters.hotelName} onCommit={(hotelName) => set({ hotelName })} />
      )}

      {/*
        A range needs two different ends to be a range. With nothing to price,
        the facet collapses to zero and this rendered "$0 – $0" over a slider
        that could not move — a control offering to narrow a set that is already
        empty, on the one screen where the reason matters and is stated above.
      */}
      {shows("price") && facets.priceRange.typicalMax > facets.priceRange.min && (
      <fieldset>
        <legend className="text-sm font-semibold">{t("filters.price")}</legend>
        <div className="mt-2">
          <label htmlFor="max-price" className="text-muted text-xs">
            {formatMoney(facets.priceRange.min, currency, locale)} –{" "}
            {/*
              The top stop is "no maximum", not the 95th percentile it sits at.
              The track stops there because one suite at $107,058 otherwise
              squeezed every price anyone would filter by into the first pixel —
              but the filter itself must never hide the results above it, so the
              last position clears the cap rather than applying it.
            */}
            {filters.maxPrice == null
              ? t("filters.anyPrice")
              : formatMoney(filters.maxPrice, currency, locale)}
          </label>
          <input
            id="max-price"
            type="range"
            min={facets.priceRange.min}
            max={facets.priceRange.typicalMax}
            step={Math.max(1, Math.round((facets.priceRange.typicalMax - facets.priceRange.min) / 40))}
            value={filters.maxPrice ?? facets.priceRange.typicalMax}
            onChange={(e) => {
              const value = Number(e.target.value);
              set({ maxPrice: value >= facets.priceRange.typicalMax ? undefined : value });
            }}
            className="mt-1 w-full accent-[var(--focus)]"
          />
          {/*
            Typed bounds beside the slider.
            A slider is quick for "roughly under two hundred" and useless for
            "between 180 and 220", which is what a customer with a budget
            actually says. The server has always accepted a floor; nothing
            offered one.
          */}
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              className="!min-h-9"
              aria-label={t("filters.priceMin")}
              placeholder={t("filters.priceMin")}
              value={filters.minPrice == null ? "" : String(filters.minPrice)}
              onChange={(e) => set({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
            />
            <span className="text-muted text-xs">–</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              className="!min-h-9"
              aria-label={t("filters.priceMax")}
              placeholder={t("filters.priceMax")}
              value={filters.maxPrice == null ? "" : String(filters.maxPrice)}
              onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </div>
      </fieldset>
      )}

      {/*
        Every class, not only the ones that came back.
        These were pills built from the facet, so a search with nothing above
        three stars simply had no four- or five-star control — and an agent
        cannot tell "there are none" from "the filter is missing". Showing the
        full range answers the question; the count says which are worth
        ticking, and an empty one cannot be ticked at all.
      */}
      {shows("stars") && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.stars")}</legend>
          <div className="mt-2 space-y-1">
            {STAR_CLASSES.map((value) => {
              const count = facets.categories.find((cat) => cat.value === value)?.count ?? 0;
              return (
                <Checkbox
                  key={value}
                  checked={filters.categories?.includes(value) ?? false}
                  disabled={count === 0}
                  onChange={() => set({ categories: toggleIn(filters.categories, value) })}
                  label={
                    <span className={cx("flex items-center gap-2", count === 0 && "text-muted")}>
                      {value > 0 ? `${value}★` : t("filters.unrated")}
                      <Badge tone="neutral">{count}</Badge>
                    </span>
                  }
                />
              );
            })}
          </div>
        </fieldset>
      )}

      {shows("rating") && (
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
      )}

      {shows("neighborhood") && (
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
      )}

      {/*
        Property type is a different product, not a cheaper hotel: someone
        filtering for a hostel in Lisbon or a villa in Bali wants a different
        thing entirely. The backend already faceted on this — nothing surfaced
        it while the catalogue was six cities of hotels.
      */}
      {shows("propertyType") && facets.propertyTypes.length > 1 && (
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

      {/*
        Board is one of the few things every supplier states, and the panel has
        never offered it — the facet was computed and thrown away. On a trade
        screen it is among the first questions a customer asks.
      */}
      {shows("board") && facets.boards.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.board")}</legend>
          <div className="mt-2 space-y-1">
            {facets.boards.map((board) => (
              <Checkbox
                key={board.code}
                checked={filters.boards?.includes(board.code) ?? false}
                onChange={() => set({ boards: toggleIn(filters.boards, board.code) })}
                label={
                  <span className="flex items-center gap-2">
                    {board.label} <Badge tone="neutral">{board.count}</Badge>
                  </span>
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      {/*
        Room category, read out of the room's own name.
        No supplier publishes one, so this is derived — which is why the list is
        built from the facet rather than hard-coded: a category nobody in these
        results offers is not a choice, it is a dead end that returns nothing.
      */}
      {shows("roomCategory") && facets.roomCategories.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.roomCategory")}</legend>
          <div className="mt-2 space-y-1">
            {facets.roomCategories.map((kind) => (
              <Checkbox
                key={kind.value}
                checked={filters.roomCategories?.includes(kind.value) ?? false}
                onChange={() => set({ roomCategories: toggleIn(filters.roomCategories, kind.value) })}
                label={
                  <span className="flex items-center gap-2">
                    {t(`room.category.${kind.value}`)} <Badge tone="neutral">{kind.count}</Badge>
                  </span>
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      {/*
        Three answers, not one checkbox.
        A rate that can be cancelled for the price of a night is neither free
        nor non-refundable, and an agent quoting a family who may move their
        dates has to be able to see the difference before they quote.
      */}
      {shows("rateConditions") && facets.rateConditions.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.rateConditions")}</legend>
          <div className="mt-2 space-y-1">
            {facets.rateConditions.map((condition) => (
              <Checkbox
                key={condition.value}
                checked={filters.rateConditions?.includes(condition.value) ?? false}
                onChange={() => set({ rateConditions: toggleIn(filters.rateConditions, condition.value) })}
                label={
                  <span className="flex items-center gap-2">
                    {t(`filters.rate.${condition.value}`)} <Badge tone="neutral">{condition.count}</Badge>
                  </span>
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      {/*
        A radius is not a filter until it says what it is a radius around.
        A transit guest wants the airport and a pilgrim wants the Haram, and in
        most cities those are nowhere near each other or the centre — so the
        anchor comes first and the distance reads off it.
      */}
      {shows("distance") && facets.distanceAnchors.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("filters.distanceFrom")}</legend>
          <Select
            className="mt-2"
            value={filters.distanceFrom ?? "centre"}
            aria-label={t("filters.distanceFrom")}
            onChange={(e) => set({ distanceFrom: e.target.value === "centre" ? undefined : e.target.value })}
          >
            {facets.distanceAnchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.type === "centre" ? t("filters.cityCentre", { city: anchor.label }) : anchor.label}
              </option>
            ))}
          </Select>
          <label htmlFor="max-distance" className="text-muted mt-2 block text-xs">
            {filters.maxDistanceKm == null
              ? t("filters.anyDistance")
              : t("filters.withinKm", { n: filters.maxDistanceKm })}
          </label>
          <input
            id="max-distance"
            type="range"
            min={1}
            max={30}
            step={1}
            value={filters.maxDistanceKm ?? 30}
            onChange={(e) => {
              const value = Number(e.target.value);
              // The last stop is "anywhere", not thirty kilometres — a radius
              // filter must never hide results beyond its own top end.
              set({ maxDistanceKm: value >= 30 ? undefined : value });
            }}
            className="mt-1 w-full accent-[var(--focus)]"
          />
        </fieldset>
      )}

      {shows("amenities") && (
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
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("common.filters")}</legend>
        {shows("refundable") && (
          <Checkbox
            checked={filters.refundableOnly ?? false}
            onChange={(e) => set({ refundableOnly: e.target.checked })}
            label={t("filters.cancellation")}
          />
        )}
        {shows("payLater") && (
          <Checkbox
            checked={filters.payLaterOnly ?? false}
            onChange={(e) => set({ payLaterOnly: e.target.checked })}
            label={t("filters.payment")}
          />
        )}
        {shows("accessible") && (
          <Checkbox
            checked={filters.accessibleOnly ?? false}
            onChange={(e) => set({ accessibleOnly: e.target.checked })}
            label={t("filters.accessible")}
          />
        )}
        {shows("deals") && (
          <Checkbox
            checked={filters.dealsOnly ?? false}
            onChange={(e) => set({ dealsOnly: e.target.checked })}
            label={t("filters.deals")}
          />
        )}
      </fieldset>

      {/* Property type is rendered once, above. This block was a second copy
          of the same control that shipped with the panel. */}

      <Button variant="secondary" className="w-full" onClick={() => onChange({})}>
        {t("common.reset")}
      </Button>
    </div>
  );
}

/**
 * One sort control, with room for a sort that only one audience has.
 *
 * The trade portal ranks by margin, which is not a thing the public site can
 * offer and not a thing the server knows how to order by. Rather than the
 * portal growing a second select beside this one — two controls answering the
 * same question — extra options are appended here and handled by the caller.
 */
export function SortControl<T extends string = SortKey>({
  value,
  onChange,
  extra = [],
  omit = [],
}: {
  value: T;
  onChange: (next: T) => void;
  extra?: { id: T; label: string }[];
  /**
   * Sorts this surface cannot honour. Guest rating orders by a review score,
   * and neither contracted supplier publishes one — the control would look
   * like it worked and change nothing.
   */
  omit?: string[];
}) {
  const { t } = useApp();
  const options: { id: string; label: string }[] = [
    { id: "recommended", label: t("results.sortRecommended") },
    { id: "priceAsc", label: t("results.sortPriceAsc") },
    { id: "priceDesc", label: t("results.sortPriceDesc") },
    { id: "rating", label: t("results.sortRating") },
    { id: "distance", label: t("results.sortDistance") },
    { id: "flexible", label: t("results.sortFlexible") },
    { id: "bestValue", label: t("results.sortBestValue") },
    ...extra,
  ].filter((option) => !omit.includes(option.id));
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap">{t("common.sort")}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value as T)} className="!min-h-10">
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
  /*
   * The new filters need chips for the same reason the old ones do: a filter
   * you cannot see is a filter you cannot remove, and these are the ones most
   * likely to be left on by accident — a hotel name typed to check something,
   * a radius dragged and forgotten.
   */
  if (filters.hotelName?.trim()) {
    chips.push({
      key: "hotelName",
      label: `"${filters.hotelName.trim()}"`,
      clear: () => onChange({ ...filters, hotelName: undefined }),
    });
  }
  for (const kind of filters.roomCategories ?? []) {
    chips.push({
      key: `room-${kind}`,
      label: t(`room.category.${kind}`),
      clear: () => onChange({ ...filters, roomCategories: filters.roomCategories?.filter((k) => k !== kind) }),
    });
  }
  for (const condition of filters.rateConditions ?? []) {
    chips.push({
      key: `rate-${condition}`,
      label: t(`filters.rate.${condition}`),
      clear: () => onChange({ ...filters, rateConditions: filters.rateConditions?.filter((c) => c !== condition) }),
    });
  }
  if (filters.maxDistanceKm != null) {
    chips.push({
      key: "distance",
      label: t("filters.withinKm", { n: filters.maxDistanceKm }),
      // The anchor goes with it: a radius is the only thing it qualifies, so
      // leaving "from the airport" set with no radius says nothing.
      clear: () => onChange({ ...filters, maxDistanceKm: undefined, distanceFrom: undefined }),
    });
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
