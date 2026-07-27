import Link from "next/link";
import type { Metadata } from "next";
import { HomeView } from "@/components/pages/home-view";
import { DESTINATIONS } from "@/lib/data/destinations";
import { COLLECTIONS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { createTranslator, isLocale } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(isLocale(locale) ? locale : "en");
  return { title: t("home.heroTitle"), description: t("home.heroSubtitle") };
}

/**
 * F-010 — home / explore.
 *
 * Server-rendered content (collections, destinations, value propositions) so the
 * page is indexable without live rates (§12.4); the interactive search context
 * hydrates on the client.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);

  const destinations = DESTINATIONS.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: localized(d.name, locale),
    country: localized(d.country, locale),
    blurb: localized(d.blurb, locale),
    propertyCount: HOTEL_SEEDS.filter((h) => h.destinationId === d.id).length,
  }));

  const collections = COLLECTIONS.map((c) => ({
    slug: c.slug,
    title: localized(c.title, locale),
    body: localized(c.body, locale),
    tag: c.tag,
    count: HOTEL_SEEDS.filter((h) => h.tags.includes(c.tag)).length,
  }));

  return (
    <>
      <HomeView locale={locale} destinations={destinations} collections={collections} />

      {/* Indexable destination links, rendered on the server. */}
      <section className="mt-12" aria-labelledby="destinations-heading">
        <h2 id="destinations-heading" className="text-lg font-semibold sm:text-xl">
          {t("home.destinations")}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => (
            <li key={destination.id}>
              <Link
                href={href(locale, `/destinations/${destination.slug}`)}
                className="surface hover:surface-sunken block h-full rounded-[var(--radius-card)] border p-4"
              >
                <p className="font-semibold">{destination.name}</p>
                <p className="text-muted text-xs">{destination.country}</p>
                <p className="text-muted mt-2 line-clamp-2 text-sm">{destination.blurb}</p>
                <p className="text-brand-700 mt-2 text-xs font-medium">
                  {destination.propertyCount} {t("results.count")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
