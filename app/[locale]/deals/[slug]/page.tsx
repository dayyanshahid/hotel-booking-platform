import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, Photo, SectionHeading, Stars } from "@/components/ui";
import { collectionPhoto } from "@/lib/data/photos";
import { sceneKindForTag, sceneUrl } from "@/lib/illustration/scenes";
import { COLLECTIONS, localized } from "@/lib/data/catalog";
import { HOTEL_SEEDS, buildHotel } from "@/lib/data/hotels";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => COLLECTIONS.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) return { title: "Not found" };
  return {
    title: localized(collection.title, locale),
    description: localized(collection.body, locale),
    alternates: { canonical: `/${locale}/deals/${slug}` },
  };
}

/** Campaign / collection landing page with promotion terms (§5.13). */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) notFound();
  const t = createTranslator(locale);

  const hotels = HOTEL_SEEDS.filter((h) => h.tags.includes(collection.tag)).map((seed) => {
    const hotel = buildHotel(seed, locale);
    return {
      slug: hotel.slug,
      name: hotel.name,
      city: hotel.address.city,
      neighborhood: hotel.address.neighborhood,
      category: hotel.category,
      image: hotel.images[0]?.url ?? "",
      imageSrcSet: hotel.images[0]?.srcSet,
      imageFallback: hotel.images[0]?.fallbackUrl,
    };
  });

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] border">
        <Photo
          src={collectionPhoto(collection.slug, collection.tag, 1920).src}
          srcSet={collectionPhoto(collection.slug, collection.tag, 1920).srcSet}
          sizes="100vw"
          fallbackSrc={sceneUrl(`collection-${collection.slug}`, sceneKindForTag(collection.tag))}
          alt=""
          ratio="21/6"
          priority
          fallbackLabel=""
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{localized(collection.title, locale)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/85">{localized(collection.body, locale)}</p>
        </div>
      </header>

      {/* Promotion terms are always stated, never implied (§5.13). */}
      <Alert tone="info" title={locale === "ar" ? "شروط العرض" : "Offer terms"}>
        {locale === "ar"
          ? "الأسعار المعروضة تعتمد على التوفر وقد تتغير حتى تأكيد الحجز. تُطبق الأهلية والحد الأدنى للإقامة وشروط الإلغاء الخاصة بكل سعر، وتُتحقق من جانب الخادم قبل الدفع."
          : "Prices depend on availability and can change until a booking is confirmed. Eligibility, minimum stay and each rate's own cancellation terms apply, and are validated server-side before payment."}
      </Alert>

      <section>
        <SectionHeading title={t("cms.curated")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => (
            <li key={hotel.slug}>
              <Link href={href(locale, `/hotel/${hotel.slug}`)}>
                <Card className="hover:surface-sunken h-full overflow-hidden">
                  <Photo
                    src={hotel.image}
                    srcSet={hotel.imageSrcSet}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    fallbackSrc={hotel.imageFallback}
                    alt={hotel.name}
                    ratio="16/9"
                    fallbackLabel={t("hotel.imageFallback")}
                  />
                  <div className="p-3">
                    <Stars count={hotel.category} label={t("a11y.stars", { n: hotel.category })} />
                    <p className="mt-1 font-semibold wrap-anywhere">{hotel.name}</p>
                    <p className="text-muted text-xs">
                      {hotel.neighborhood}, {hotel.city}
                    </p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {!hotels.length && <Badge tone="neutral">{t("results.empty")}</Badge>}
      </section>
    </div>
  );
}
