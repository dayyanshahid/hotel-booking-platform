import type { Locale, SearchFilters, SearchIntent } from "./types";

/** Locale-prefixed href helper — every internal link keeps the language. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

/**
 * The trade portal, which is the one part of the app that does not wear the
 * consumer chrome. An agent working a counter needs their own navigation, not
 * a traveller's — and the guest header would put "Saved" and "Trips" next to a
 * credit balance.
 */
export function isPortalPath(pathname: string): boolean {
  return /^\/(en|ar)\/(agency|admin)(\/|$)/.test(pathname);
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

/**
 * A readable name for a destination we only have the id of.
 *
 * Links built by `searchParamsFromIntent` always carry `label`, so this is for
 * the ones that are not: a hand-edited URL, a truncated share, a bookmark from
 * before the parameter existed. The fallback used to be the id itself, and it
 * surfaced — "dest-cairo" sat in the recent-searches list where a city name
 * belongs, which is an internal identifier shown to a customer-facing user.
 *
 * Derived rather than looked up. The catalogue lives on the server and this
 * runs in the browser; a slug turned back into words is not the editorial name
 * — "dest-new-york" gives "New York" and `hbd-PMI` gives "PMI" — but it is
 * always a great deal better than the slug, and it needs no round trip to say
 * so. The moment a real label is available it wins.
 */
export function humanDestination(destinationId: string): string {
  if (!destinationId) return "";
  return destinationId
    .replace(/^(dest|hbd|tmd)-/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => (word === word.toUpperCase() ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
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
    destinationDisplay: get("label") || humanDestination(destinationId),
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

/**
 * Reads filters back out of a search URL.
 *
 * The trip interpreter puts what it understood into the link it navigates to,
 * so the results page opens already narrowed rather than showing everything and
 * asking the guest to re-apply what they just described. Only the filters that
 * survive a paste into a chat window are here — anything unrecognised is
 * ignored rather than trusted.
 */
export function filtersFromSearchParams(
  query: Record<string, string | string[] | undefined>,
): SearchFilters {
  const one = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filters: SearchFilters = {};

  if (one("refundableOnly") === "true") filters.refundableOnly = true;
  if (one("payLaterOnly") === "true") filters.payLaterOnly = true;
  if (one("accessibleOnly") === "true") filters.accessibleOnly = true;
  if (one("dealsOnly") === "true") filters.dealsOnly = true;

  const maxPrice = Number(one("maxPrice"));
  if (Number.isFinite(maxPrice) && maxPrice > 0) filters.maxPrice = maxPrice;

  const boards = one("boards");
  if (boards) filters.boards = boards.split(",").filter(Boolean);

  const categories = (one("categories") ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => value >= 1 && value <= 5);
  if (categories.length) filters.categories = categories;

  return filters;
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
