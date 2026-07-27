import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, Photo, SectionHeading } from "@/components/ui";
import { collectionPhoto, PHOTO_SHAPE } from "@/lib/data/photos";
import { sceneKindForTag, sceneUrl } from "@/lib/illustration/scenes";
import { COLLECTIONS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { createTranslator, isLocale } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(isLocale(locale) ? locale : "en");
  return { title: t("nav.deals"), description: t("home.collections") };
}

/** Intent-led collections, CMS-managed (§5.2). */
export default async function DealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("home.collections")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COLLECTIONS.map((collection) => (
          <li key={collection.slug}>
            <Link href={href(locale, `/deals/${collection.slug}`)} className="block h-full">
              <Card className="hover:surface-sunken h-full overflow-hidden">
                <Photo
                  src={collectionPhoto(collection.slug, collection.tag, { shape: PHOTO_SHAPE.strip }).src}
                  srcSet={collectionPhoto(collection.slug, collection.tag, { shape: PHOTO_SHAPE.strip }).srcSet}
                  sizes="(min-width: 1024px) 25vw, 100vw"
                  fallbackSrc={sceneUrl(`collection-${collection.slug}`, sceneKindForTag(collection.tag))}
                  alt=""
                  ratio="16/7"
                  fallbackLabel=""
                />
                <div className="p-4">
                  <p className="font-semibold">{localized(collection.title, locale)}</p>
                  <p className="text-muted mt-1 text-sm">{localized(collection.body, locale)}</p>
                  <Badge tone="brand" className="mt-3">
                    {HOTEL_SEEDS.filter((h) => h.tags.includes(collection.tag)).length} {t("results.count")}
                  </Badge>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <SectionHeading title={t("cms.legal")} description={t("value.total.body")} />
    </div>
  );
}
