import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, Photo, SectionHeading, Stars } from "@/components/ui";
import { sceneKindForTag, sceneUrl } from "@/lib/illustration/scenes";
import { fetchCollection, fetchCollections } from "@/lib/server/catalogue";
import { createTranslator, isLocale, LOCALES } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

/**
 * Pre-rendered from what the API lists at build time; an empty list means every
 * collection renders on demand rather than the build failing.
 */
export async function generateStaticParams() {
  const { collections } = await fetchCollections("en");
  return LOCALES.flatMap((locale) => collections.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const found = await fetchCollection(slug, locale);
  if (!found) return { title: "Not found" };
  const { collection } = found;
  return {
    title: collection.title,
    description: collection.body,
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
  const found = await fetchCollection(slug, locale);
  if (!found) notFound();
  const { collection } = found;
  const t = createTranslator(locale);

  // Already built by the API, so nothing here re-implements `buildHotel`.
  const hotels = found.hotels.map((hotel) => {
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
          src={collection.photo.src}
          srcSet={collection.photo.srcSet}
          sizes="100vw"
          fallbackSrc={sceneUrl(`collection-${collection.slug}`, sceneKindForTag(collection.tag))}
          alt=""
          ratio="21/6"
          priority
          fallbackLabel=""
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{collection.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/85">{collection.body}</p>
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
