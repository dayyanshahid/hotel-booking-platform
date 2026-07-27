"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, cx } from "@/components/ui";
import { DestinationAutocomplete } from "./destination-autocomplete";
import { DateRangePicker } from "./date-range-picker";
import { OccupancyPicker } from "./occupancy-picker";
import { addDays, guestCount, todayIso } from "@/lib/format";
import { searchHref } from "@/lib/nav";
import { validateIntent } from "@/lib/server/validate";
import type { SearchIntent } from "@/lib/types";

/**
 * The persistent, editable search context (§2.1) used on home, results and
 * hotel pages. The same validation module runs here and in the BFF so the rules
 * cannot drift.
 */
export function SearchBar({
  initial,
  variant = "hero",
  onSubmitted,
}: {
  initial?: SearchIntent | null;
  variant?: "hero" | "compact";
  onSubmitted?: (intent: SearchIntent) => void;
}) {
  const { t, locale, currency, rememberSearch, track } = useApp();
  const router = useRouter();

  const [destination, setDestination] = useState<{ id: string; label: string; type: SearchIntent["destinationType"] } | null>(
    initial ? { id: initial.destinationId, label: initial.destinationDisplay, type: initial.destinationType } : null,
  );
  const [dates, setDates] = useState({
    checkIn: initial?.checkIn ?? addDays(todayIso(), 21),
    checkOut: initial?.checkOut ?? addDays(todayIso(), 24),
    flexibility: initial?.flexibility ?? ("exact" as SearchIntent["flexibility"]),
  });
  const [occupancy, setOccupancy] = useState({
    rooms: initial?.rooms ?? [{ adults: 2, childrenAges: [] }],
    accessibleRoom: initial?.accessibleRoom ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const intent: SearchIntent = {
      destinationId: destination?.id ?? "",
      destinationDisplay: destination?.label ?? "",
      destinationType: destination?.type ?? "city",
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      flexibility: dates.flexibility,
      rooms: occupancy.rooms,
      accessibleRoom: occupancy.accessibleRoom,
      locale,
      currency,
    };

    const result = validateIntent(intent, locale);
    if (!result.valid) {
      setErrors(result.fields);
      track("search_validation_failed", { fields: Object.keys(result.fields).join(",") });
      return;
    }
    setErrors({});
    track("search_submitted", {
      destinationType: intent.destinationType,
      nights: Math.round(
        (Date.parse(intent.checkOut) - Date.parse(intent.checkIn)) / 86400000,
      ),
      rooms: intent.rooms.length,
      guests: guestCount(intent.rooms),
      flexible: intent.flexibility,
      currency: intent.currency,
      locale: intent.locale,
    });
    rememberSearch(intent, `${intent.destinationDisplay} · ${intent.checkIn} → ${intent.checkOut}`);
    onSubmitted?.(intent);
    router.push(searchHref(locale, intent));
  }

  return (
    <form
      onSubmit={submit}
      className={cx(
        "surface rounded-[var(--radius-card)] border p-3 shadow-[var(--shadow-card)]",
        variant === "hero" ? "sm:p-4" : "p-2 sm:p-3",
      )}
      role="search"
      aria-label={t("common.searchHotels")}
    >
      <div className={cx("grid gap-3", variant === "hero" ? "lg:grid-cols-[2fr_1.6fr_1.2fr_auto]" : "lg:grid-cols-[2fr_1.6fr_1.2fr_auto]")}>
        <DestinationAutocomplete
          value={destination}
          onSelect={(next) => setDestination(next)}
          error={errors.destinationId}
          compact={variant === "compact"}
        />
        <DateRangePicker
          checkIn={dates.checkIn}
          checkOut={dates.checkOut}
          flexibility={dates.flexibility}
          onChange={setDates}
          error={errors.dates}
          compact={variant === "compact"}
        />
        <OccupancyPicker
          rooms={occupancy.rooms}
          accessibleRoom={occupancy.accessibleRoom}
          onChange={setOccupancy}
          errors={errors}
          compact={variant === "compact"}
        />
        <div className="flex items-end">
          <Button type="submit" size={variant === "hero" ? "lg" : "md"} className="w-full lg:w-auto">
            {t("common.search")}
          </Button>
        </div>
      </div>
    </form>
  );
}
