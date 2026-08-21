import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

const BASE = siteUrl();

/** Volatile search, checkout and booking URLs are kept out of the index (§12.4). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/en/search", "/ar/search", "/en/checkout", "/ar/checkout", "/en/booking", "/ar/booking"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
