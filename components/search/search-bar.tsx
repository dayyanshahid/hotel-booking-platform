"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, cx } from "@/components/ui";
import { DestinationAutocomplete, type DestinationResolver } from "./destination-autocomplete";
import { DateRangePicker } from "./date-range-picker";
import { OccupancyPicker } from "./occupancy-picker";
import { addDays, guestCount, todayIso } from "@/lib/format";
import { searchHref } from "@/lib/nav";
import { validateIntent } from "@/lib/server/validate";
import type { SearchIntent } from "@/lib/types";

/**
 * The persistent, editable search context (§2.1). The same validation module
 * runs here and in the BFF so the rules cannot drift.
 *
 * One bar, three surfaces. It began as consumer furniture that always pushed to
 * `/search`, which is why the trade portal grew its own version out of a
 * datalist and two date inputs — and why an agent could not search for a family
 * with children at all, on a platform whose consumer site prices them fine. A
 * search control that differs by audience does not differ in styling; it
 * differs in what can be asked for.
 *
 * `onSearch` is the whole of the difference: given one, the bar hands over the
 * validated intent and navigates nowhere, so a portal can run the search in
 * place. Without one it behaves exactly as it always has.
 */
export function SearchBar({
  initial,
  variant = "hero",
  currency: currencyOverride,
  submitLabel,
  onSubmitted,
  onSearch,
  busy,
}: {
  initial?: SearchIntent | null;
  variant?: "hero" | "compact" | "panel";
  /**
   * The trade portal prices in the agency's own settlement currency, which is
   * not the one the visitor happens to be browsing in.
   */
  currency?: SearchIntent["currency"];
  submitLabel?: string;
  onSubmitted?: (intent: SearchIntent) => void;
  /** Run the search here instead of navigating to the consumer results page. */
  onSearch?: (intent: SearchIntent) => void;
  busy?: boolean;
}) {
  const { t, locale, currency: browsingCurrency, rememberSearch, track } = useApp();
  const currency = currencyOverride ?? browsingCurrency;
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
  /** Set while the typed destination is being settled on submit. */
  const [resolving, setResolving] = useState(false);
  const resolver = useRef<DestinationResolver | null>(null);

  /**
   * Search what was typed, not only what was clicked.
   *
   * A combobox distinguishes the text from the selection, and nobody using it
   * does. Typing a city and pressing Search — the most natural thing to do with
   * a search bar — met "Choose a destination from the list", with the correctly
   * spelled city sitting in the field above the message. So before refusing,
   * the field is given the chance to settle its own text: an unambiguous name
   * becomes the destination, and only a genuinely ambiguous one still asks.
   *
   * The refusal is kept for the case it was written for. Two cities called
   * Cairo is not a formality — picking one silently would put a customer in the
   * wrong country — and there the list opens instead of the error appearing.
   */
  async function submit(e: React.FormEvent) {
    e.preventDefault();

    let picked = destination;
    if (!picked && resolver.current) {
      setResolving(true);
      try {
        const settled = await resolver.current.resolve();
        if (settled) {
          picked = { id: settled.id, label: settled.label, type: settled.type };
          setDestination(picked);
        }
      } finally {
        setResolving(false);
      }
    }

    const intent: SearchIntent = {
      destinationId: picked?.id ?? "",
      destinationDisplay: picked?.label ?? "",
      destinationType: picked?.type ?? "city",
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
    onSubmitted?.(intent);
    if (onSearch) {
      // A portal owns its own results and its own history. Remembering the
      // search here too would put trade lookups in a traveller's recent
      // searches on the consumer site, which is somebody else's screen.
      onSearch(intent);
      return;
    }
    rememberSearch(intent, `${intent.destinationDisplay} · ${intent.checkIn} → ${intent.checkOut}`);
    router.push(searchHref(locale, intent));
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={cx(
        // The hero form is framed by the yellow outline its parent draws, so it
        // carries no border of its own — two edges 3px apart reads as a mistake.
        "rounded-[6px]",
        variant === "hero" && "surface p-1.5",
        variant === "compact" && "surface border p-2",
        // Inside a console card the surface and border are already the card's.
        variant === "panel" && "bg-transparent",
      )}
      role="search"
      aria-label={t("common.searchHotels")}
    >
      <div className={cx("grid gap-1.5", "lg:grid-cols-[2fr_1.6fr_1.2fr_auto]")}>
        <DestinationAutocomplete
          value={destination}
          onSelect={(next) => setDestination(next)}
          error={errors.destinationId}
          resolverRef={resolver}
        />
        <DateRangePicker
          checkIn={dates.checkIn}
          checkOut={dates.checkOut}
          flexibility={dates.flexibility}
          onChange={setDates}
          error={errors.dates}
        />
        <OccupancyPicker
          rooms={occupancy.rooms}
          accessibleRoom={occupancy.accessibleRoom}
          onChange={setOccupancy}
          errors={errors}
        />
        <div className="flex items-end">
          <Button
            type="submit"
            variant="primary"
            size={variant === "hero" ? "lg" : "md"}
            loading={busy || resolving}
            className="h-full w-full lg:w-auto lg:px-8"
          >
            {submitLabel ?? t("common.search")}
          </Button>
        </div>
      </div>
    </form>
  );
}
