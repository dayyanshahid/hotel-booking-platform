import { EXTRA_PLACES, getDestination } from "@/lib/data/destinations";
import { localized } from "@/lib/data/catalog";
import { GENERATED_AIRPORTS } from "@/lib/data/airports.generated";
import { GENERATED_LANDMARKS } from "@/lib/data/landmarks.generated";
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

  const curated = EXTRA_PLACES.filter(
    (place) => place.destinationId === destinationId && place.coordinates,
  ).map((place) => ({
    id: place.id,
    label: localized(place.name, locale),
    type: place.type,
    coordinates: place.coordinates,
  }));

  /*
   * Which airports a curated entry has already spoken for.
   *
   * The two lists name the same airport differently — `poi-dxb-airport` here,
   * `air-dxb` in the generated file — so identity is the IATA code, which the
   * curated labels carry in brackets precisely so a reader can see it. Without
   * this, Dubai would offer Dubai International twice, once in Arabic and once
   * not.
   */
  const spokenFor = new Set(
    curated
      .filter((place) => place.type === "airport")
      .map((place) => place.label.match(/\(([A-Z]{3})\)/)?.[1])
      .filter(Boolean) as string[],
  );

  /*
   * Everything else comes from OurAirports. English-only, because that is how
   * the source publishes airport names — a curated entry is where a translated
   * or locally-corrected name belongs, and it wins over this.
   */
  const generated = GENERATED_AIRPORTS.filter(
    (airport) => airport.destinationId === destinationId && !spokenFor.has(airport.iata),
  ).map((airport) => ({
    id: airport.id,
    label: airport.name,
    type: "airport",
    coordinates: airport.coordinates,
  }));

  const airports = [...curated.filter((place) => place.type === "airport"), ...generated];

  /*
   * Landmarks the same way: hand-written first, then the generated ones for
   * the cities nobody has got to. Matched on the label rather than the id,
   * since the two lists name the same place differently — `poi-burj-khalifa`
   * here and `lm-burj-khalifa` there.
   */
  const curatedLandmarks = curated.filter((place) => place.type !== "airport");
  const named = new Set(curatedLandmarks.map((place) => place.label.toLowerCase()));
  const generatedLandmarks = GENERATED_LANDMARKS.filter(
    (landmark) => landmark.destinationId === destinationId && !named.has(localized(landmark.name, locale).toLowerCase()),
  ).map((landmark) => ({
    id: landmark.id,
    label: localized(landmark.name, locale),
    type: "landmark",
    coordinates: landmark.coordinates,
  }));

  const landmarks = [...curatedLandmarks, ...generatedLandmarks];

  // Airports before landmarks: it is the anchor asked for most often, and the
  // generated list already has them in the order travellers use them.
  return [centre, ...airports, ...landmarks];
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
