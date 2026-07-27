"use client";

import { useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { addDays, todayIso } from "@/lib/format";
import type { Locale } from "@/lib/types";

/** Prefills the persistent search context from an SEO landing page. */
export function DestinationSearchCta({
  locale,
  destinationId,
  label,
}: {
  locale: Locale;
  destinationId: string;
  label: string;
}) {
  const { currency } = useApp();
  return (
    <SearchBar
      variant="compact"
      initial={{
        destinationId,
        destinationDisplay: label,
        destinationType: "city",
        checkIn: addDays(todayIso(), 21),
        checkOut: addDays(todayIso(), 24),
        flexibility: "exact",
        rooms: [{ adults: 2, childrenAges: [] }],
        locale,
        currency,
      }}
    />
  );
}
