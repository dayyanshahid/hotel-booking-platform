import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server/runtime";
import { bookableCountryList, DESTINATIONS } from "@/lib/data/destinations";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { LEGAL_PAGES } from "@/lib/data/content";
import { COLLECTIONS } from "@/lib/data/catalog";
import { LOCALES } from "@/lib/i18n";

const BASE = siteUrl();

/** XML sitemap by locale and content type (§12.4). Volatile search URLs are excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/deals",
    "/help",
    "/destinations",
    ...COLLECTIONS.map((c) => `/deals/${c.slug}`),
    // Country pages sit between the index and the cities, so a crawler reaches
    // every destination in two hops rather than depending on a search box.
    ...bookableCountryList().map((c) => `/countries/${c.code.toLowerCase()}`),
    ...DESTINATIONS.map((d) => `/destinations/${d.slug}`),
    ...HOTEL_SEEDS.map((h) => `/hotel/${h.slug}`),
    ...LEGAL_PAGES.map((p) => `/legal/${p.slug}`),
  ];

  return LOCALES.flatMap((locale) =>
    paths.map((path) => ({
      url: `${BASE}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: path.startsWith("/hotel") ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : path.startsWith("/hotel") ? 0.8 : 0.6,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${BASE}/${l}${path}`])),
      },
    })),
  );
}
