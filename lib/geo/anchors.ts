import { EXTRA_PLACES, getDestination } from "@/lib/data/destinations";
import { localized } from "@/lib/data/catalog";
import type { Locale } from "@/lib/types";

type Coordinates = { lat: number; lng: number };

/** The centre of the searched city, as an anchor id. Never a real place id. */
export const CITY_CENTRE = "centre";

export interface DistanceAnchor {
  id: string;
  label: string;
  /** `centre`, `airport` or `landmark` — the panel groups by this. */
  type: string;
  coordinates: Coordinates;
}

/**
 * The places a radius can be measured from, for one destination.
 *
 * "Within 5km" is not a filter until it says 5km of what. A conference guest
 * wants the convention centre, a transit guest wants the airport, and a family
 * doing Umrah wants the Haram — and in most cities those three are nowhere
 * near each other, so a single city-centre radius answers none of them.
 *
 * Only places we hold coordinates for are offered. A destination with no
 * landmarks in the dataset gets its centre and nothing else, which is honest:
 * a picker listing anchors we cannot measure from would filter to nothing.
 */
export function anchorsFor(destinationId: string, locale: Locale): DistanceAnchor[] {
  const destination = getDestination(destinationId);
  if (!destination?.coordinates) return [];

  const centre: DistanceAnchor = {
    id: CITY_CENTRE,
    label: localized(destination.name, locale),
    type: "centre",
    coordinates: destination.coordinates,
  };

  const places = EXTRA_PLACES.filter(
    (place) => place.destinationId === destinationId && place.coordinates,
  ).map((place) => ({
    id: place.id,
    label: localized(place.name, locale),
    type: place.type,
    coordinates: place.coordinates,
  }));

  // Airports before landmarks: there is at most one or two of them and it is
  // the anchor most often asked for by name.
  places.sort((a, b) => (a.type === b.type ? a.label.localeCompare(b.label) : a.type === "airport" ? -1 : 1));

  return [centre, ...places];
}

/** The coordinates a filter's `distanceFrom` refers to, if we know them. */
export function anchorPoint(
  destinationId: string,
  anchorId: string | undefined,
  locale: Locale,
): Coordinates | null {
  const list = anchorsFor(destinationId, locale);
  if (!list.length) return null;
  if (!anchorId || anchorId === CITY_CENTRE) return list[0].coordinates;
  return list.find((anchor) => anchor.id === anchorId)?.coordinates ?? list[0].coordinates;
}
