import "server-only";
import type { CanonicalHotel, CurrencyCode, Locale } from "../types";

/**
 * The catalogue, read over HTTP instead of imported.
 *
 * The shop's pages used to reach straight into `lib/data`, which is why the
 * shop could not be deployed anywhere the data was not. Going through the API
 * is what makes one backend actually serve three front ends rather than merely
 * be available to them.
 *
 * Two things make that affordable. Next dedupes and caches `fetch` by URL, so a
 * page rendering the same list twice pays once and a rebuild pays nothing until
 * the window lapses. And every read here degrades to a documented fallback
 * rather than throwing: a destination index that fails is a page that should
 * render without its index, not a five-hundred.
 */

/** Long, because this is editorial content that changes on a human timescale. */
const REVALIDATE = 3600;

/**
 * Where this process reaches the API.
 *
 * Deliberately not `apiOrigin()`, which answers a different question. That one
 * is for the browser and returns an empty string for "same origin", because a
 * relative path is the URL that is correct everywhere without configuration.
 * A relative path is no URL at all to `fetch` inside Node, and the address a
 * server should use is often not the address a browser should: a service on a
 * private network, a container name, a loopback port.
 *
 * So: an internal address if one is configured, the public one if not, and the
 * local app last — which is what a developer running everything on one machine
 * has, and what the shop still is until the API is deployed apart from it.
 */
function base(): string {
  const internal = process.env.INTERNAL_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (internal) return internal.replace(/\/+$/, "");
  return `http://127.0.0.1:${process.env.PORT ?? 4860}`;
}

async function read<T>(path: string, locale: Locale, fallback: T): Promise<T> {
  const url = new URL(path, base());
  url.searchParams.set("locale", locale);
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { ok?: boolean; data?: T };
    return body.ok && body.data !== undefined ? body.data : fallback;
  } catch {
    /*
     * Unreachable at build time is the case that matters. A front end whose
     * build fails because an API was briefly down is a front end that cannot be
     * released independently, which is most of the reason for splitting them
     * up in the first place.
     */
    return fallback;
  }
}

export interface DestinationCard {
  id: string;
  slug: string;
  type: string;
  name: string;
  country: string;
  countryCode: string;
  region: string;
  currency: string;
  tier: 1 | 2 | 3;
  curated: boolean;
  coordinates: { lat: number; lng: number };
  photo: { src: string; srcSet?: string; alt?: string };
  propertyCount: number;
  fromPrice: { amount: number; currency: CurrencyCode } | null;
}

export async function fetchDestinations(
  locale: Locale,
  filter: { country?: string; region?: string; currency?: string } = {},
): Promise<DestinationCard[]> {
  const params = new URLSearchParams();
  if (filter.country) params.set("country", filter.country);
  if (filter.region) params.set("region", filter.region);
  if (filter.currency) params.set("currency", filter.currency);
  const query = params.toString() ? `?${params}` : "";
  const data = await read<{ destinations: DestinationCard[] }>(
    `/api/destinations${query}`,
    locale,
    { destinations: [] },
  );
  return data.destinations;
}

export interface CollectionCard {
  slug: string;
  title: string;
  body: string;
  tag: string;
  accent: string;
  photo: { src: string; srcSet?: string; alt?: string };
  count: number;
}

export async function fetchCollections(
  locale: Locale,
): Promise<{ collections: CollectionCard[]; propertyTypes: { key: string; label: string }[] }> {
  return read(`/api/collections`, locale, { collections: [], propertyTypes: [] });
}

/** As the API sends it — the same shape the catalogue holds. */
export interface CountrySummary {
  code: string;
  name: string;
  nameAr?: string;
  region: string;
  currency: string;
}

export async function fetchCountries(
  locale: Locale,
): Promise<{ regions: string[]; countries: CountrySummary[] }> {
  return read(`/api/countries`, locale, { regions: [], countries: [] });
}

export async function fetchSearchCriteria(locale: Locale): Promise<string[]> {
  const data = await read<{ criteria: string[] }>(`/api/search/criteria`, locale, { criteria: [] });
  return data.criteria;
}

export interface HelpArticleView {
  slug: string;
  topic: string;
  question: string;
  answer: string;
}

export async function fetchHelp(locale: Locale): Promise<HelpArticleView[]> {
  const data = await read<{ articles: HelpArticleView[] }>(`/api/content/help`, locale, { articles: [] });
  return data.articles;
}

export interface LegalPageView {
  slug: string;
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  updated: string;
}

export async function fetchLegalIndex(locale: Locale): Promise<{ slug: string; title: string }[]> {
  const data = await read<{ pages: { slug: string; title: string }[] }>(
    `/api/content/legal/_index`,
    locale,
    { pages: [] },
  );
  return data.pages;
}

export async function fetchLegalPage(slug: string, locale: Locale): Promise<LegalPageView | null> {
  const data = await read<{ page: LegalPageView } | null>(
    `/api/content/legal/${encodeURIComponent(slug)}`,
    locale,
    null,
  );
  return data?.page ?? null;
}

/** One destination in full: editorial copy, its properties, a from-price. */
export interface DestinationDetail {
  destination: {
    id: string;
    slug: string;
    type: string;
    name: string;
    country: string;
    countryCode: string;
    region: string;
    timezone: string;
    coordinates: { lat: number; lng: number };
    currency: string;
    curated: boolean;
    blurb: string;
    neighborhoods: { key: string; name: string; blurb: string }[];
    faqs: { q: string; a: string }[];
    photo: { src: string; srcSet?: string; alt?: string };
  };
  fromPrice: { amount: number; currency: CurrencyCode } | null;
  hotels: CanonicalHotel[];
}

export async function fetchDestination(
  id: string,
  locale: Locale,
  currency?: string,
): Promise<DestinationDetail | null> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return read<DestinationDetail | null>(`/api/destinations/${encodeURIComponent(id)}${query}`, locale, null);
}

export async function fetchCollection(
  slug: string,
  locale: Locale,
): Promise<{ collection: CollectionCard; hotels: CanonicalHotel[] } | null> {
  return read(`/api/collections/${encodeURIComponent(slug)}`, locale, null);
}

export interface CountryDetail {
  country: CountrySummary;
  fromPriceBasis: string;
  destinations: {
    id: string;
    slug: string;
    name: string;
    tier: 1 | 2 | 3;
    curated: boolean;
    coordinates: { lat: number; lng: number };
    photo: { src: string; srcSet?: string; alt?: string };
    propertyCount: number;
    fromPrice: { amount: number; currency: CurrencyCode } | null;
    highlight: CanonicalHotel | null;
  }[];
}

export async function fetchCountry(
  code: string,
  locale: Locale,
  currency?: string,
): Promise<CountryDetail | null> {
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return read(`/api/countries/${encodeURIComponent(code)}${query}`, locale, null);
}

/**
 * The shop's front page, assembled by the API.
 *
 * A view rather than a resource: the page composes five scans of the
 * catalogue, and asking for them one at a time would be twenty round trips to
 * paint one screen.
 */
export interface HomeData {
  destinations: {
    id: string;
    slug: string;
    name: string;
    country: string;
    blurb: string;
    propertyCount: number;
    fromPrice: { amount: number; currency: CurrencyCode } | null;
  }[];
  collections: { slug: string; title: string; body: string; tag: string; count: number }[];
  propertyTypes: { key: string; label: string; count: number }[];
  regions: { key: string; citySlug: string; cities: number; countries: number }[];
  loved: {
    slug: string;
    name: string;
    city: string;
    neighborhood: string;
    category: number;
    score?: number;
    scale?: number;
    image: string;
    imageSrcSet?: string;
    imageFallback?: string;
    fromPrice: { amount: number; currency: CurrencyCode };
  }[];
  fromPriceBasis: string;
  totals: { properties: number; cities: number; countries: number };
}

const EMPTY_HOME: HomeData = {
  destinations: [],
  collections: [],
  propertyTypes: [],
  regions: [],
  loved: [],
  fromPriceBasis: "",
  totals: { properties: 0, cities: 0, countries: 0 },
};

export async function fetchHome(locale: Locale, currency: string): Promise<HomeData> {
  return read(`/api/home?currency=${encodeURIComponent(currency)}`, locale, EMPTY_HOME);
}

/**
 * One property, resolved the way the API resolves it.
 *
 * Seeded inventory first, then live supply — and `similar` alongside, because
 * working that out needs the seeded catalogue this front end no longer carries.
 */
export interface HotelDetail {
  hotel: CanonicalHotel;
  similar: {
    slug: string;
    name: string;
    neighborhood: string;
    category: number;
    image: string;
    imageSrcSet?: string;
    imageFallback?: string;
  }[];
  destination: { id: string; slug: string; timezone: string } | null;
}

export async function fetchHotel(slug: string, locale: Locale): Promise<HotelDetail | null> {
  return read(`/api/hotels/${encodeURIComponent(slug)}`, locale, null);
}

/** Every seeded property slug, for pre-rendering. */
export async function fetchHotelSlugs(locale: Locale): Promise<string[]> {
  const destinations = await fetchDestinations(locale);
  const lists = await Promise.all(
    destinations.map(async (d) => {
      const detail = await fetchDestination(d.id, locale);
      return detail?.hotels.map((h) => h.slug) ?? [];
    }),
  );
  return [...new Set(lists.flat())];
}
