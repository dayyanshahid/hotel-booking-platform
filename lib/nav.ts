import type { Locale, SearchIntent } from "./types";

/** Locale-prefixed href helper — every internal link keeps the language. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

/**
 * Readable, shareable search URLs (§5.3). Canonical destination ID plus display
 * name; no member, promo or eligibility flags are ever placed in the URL.
 */
export function searchParamsFromIntent(intent: SearchIntent): URLSearchParams {
  const params = new URLSearchParams();
  params.set("destination", intent.destinationId);
  params.set("label", intent.destinationDisplay);
  params.set("type", intent.destinationType);
  params.set("checkIn", intent.checkIn);
  params.set("checkOut", intent.checkOut);
  params.set("flex", intent.flexibility);
  params.set(
    "rooms",
    intent.rooms.map((r) => `${r.adults}${r.childrenAges.length ? `-${r.childrenAges.join(".")}` : ""}`).join("_"),
  );
  if (intent.accessibleRoom) params.set("accessible", "1");
  if (intent.nationality) params.set("nat", intent.nationality);
  params.set("currency", intent.currency);
  return params;
}

export function intentFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  locale: Locale,
): SearchIntent | null {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const destinationId = get("destination");
  const checkIn = get("checkIn");
  const checkOut = get("checkOut");
  if (!destinationId || !checkIn || !checkOut) return null;

  const rooms = (get("rooms") ?? "2")
    .split("_")
    .filter(Boolean)
    .map((chunk) => {
      const [adults, children] = chunk.split("-");
      return {
        adults: Math.max(1, Number(adults) || 2),
        childrenAges: children ? children.split(".").map((a) => Number(a) || 0) : [],
      };
    });

  return {
    destinationId,
    destinationDisplay: get("label") ?? "",
    destinationType: (get("type") as SearchIntent["destinationType"]) ?? "city",
    checkIn,
    checkOut,
    flexibility: (get("flex") as SearchIntent["flexibility"]) ?? "exact",
    rooms: rooms.length ? rooms : [{ adults: 2, childrenAges: [] }],
    accessibleRoom: get("accessible") === "1",
    nationality: get("nat"),
    locale,
    currency: (get("currency") as SearchIntent["currency"]) ?? "USD",
  };
}

export function searchHref(locale: Locale, intent: SearchIntent): string {
  return `${href(locale, "/search")}?${searchParamsFromIntent(intent).toString()}`;
}

/**
 * The one filter that is addressable in the URL.
 *
 * Property type is how people arrive from a "browse by type" tile, so a link
 * that says "Hostels" has to actually produce hostels. The rest of the filter
 * state stays client-side; making all of it addressable is worth doing, but a
 * link that silently does nothing is worse than no link, and this is the one
 * that gets linked.
 */
export const PROPERTY_TYPE_PARAM = "propertyType";

export function typedSearchHref(
  locale: Locale,
  intent: SearchIntent,
  propertyType: string,
): string {
  const params = searchParamsFromIntent(intent);
  params.set(PROPERTY_TYPE_PARAM, propertyType);
  return `${href(locale, "/search")}?${params.toString()}`;
}

/** Reads the addressable property-type filter back out of a query. */
export function propertyTypeFromSearchParams(
  query: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = query[PROPERTY_TYPE_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

export function hotelHref(locale: Locale, slug: string, intent?: SearchIntent | null): string {
  const base = href(locale, `/hotel/${slug}`);
  return intent ? `${base}?${searchParamsFromIntent(intent).toString()}` : base;
}
