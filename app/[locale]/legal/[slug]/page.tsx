import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, SectionHeading } from "@/components/ui";
import { LEGAL_PAGES, getLegalPage } from "@/lib/data/content";
import { localized } from "@/lib/data/catalog";
import { LOCALES, isLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/types";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_PAGES.map((page) => ({ locale, slug: page.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const page = getLegalPage(slug);
  if (!page) return { title: "Not found" };
  return {
    title: localized(page.title, locale),
    description: localized(page.intro, locale),
    alternates: {
      canonical: `/${locale}/legal/${slug}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/legal/${slug}`])),
    },
  };
}

/** F-091 — trust, legal and policy pages, fully server-rendered. */
export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const page = getLegalPage(slug);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{localized(page.title, locale)}</h1>
      <p className="text-muted mt-2 text-sm">{localized(page.intro, locale)}</p>
      <p className="text-muted mt-1 text-xs">
        {locale === "ar" ? "آخر تحديث" : "Last updated"}: {formatDate(page.updated, locale)}
      </p>
      <div className="mt-6 space-y-4">
        {page.sections.map((section) => (
          <Card key={section.heading.en} className="p-5">
            <SectionHeading title={localized(section.heading, locale)} />
            <div className="space-y-3">
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm wrap-anywhere">
                  {localized(paragraph, locale)}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </article>
  );
}
