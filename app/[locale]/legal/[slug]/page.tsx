import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, SectionHeading } from "@/components/ui";
import { fetchLegalIndex, fetchLegalPage } from "@/lib/server/catalogue";
import { LOCALES, isLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/types";

/**
 * Pre-rendered from whatever the API can list at build time.
 *
 * If it cannot be reached the list comes back empty and every page renders on
 * demand instead — slower for the first visitor and correct for all of them.
 * The alternative, importing the pages so the build always succeeds, is what
 * tied this front end to the content in the first place; a build that fails
 * because a backend blinked cannot be released independently either.
 */
export async function generateStaticParams() {
  const pages = await fetchLegalIndex("en");
  return LOCALES.flatMap((locale) => pages.map((page) => ({ locale, slug: page.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const page = await fetchLegalPage(slug, locale);
  if (!page) return { title: "Not found" };
  return {
    title: page.title,
    description: page.intro,
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
  const page = await fetchLegalPage(slug, locale);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{page.title}</h1>
      <p className="text-muted mt-2 text-sm">{page.intro}</p>
      <p className="text-muted mt-1 text-xs">
        {locale === "ar" ? "آخر تحديث" : "Last updated"}: {formatDate(page.updated, locale)}
      </p>
      <div className="mt-6 space-y-4">
        {page.sections.map((section) => (
          <Card key={section.heading} className="p-5">
            <SectionHeading title={section.heading} />
            <div className="space-y-3">
              {section.paragraphs.map((paragraph, i) => (
                <p key={i} className="text-sm wrap-anywhere">
                  {paragraph}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </article>
  );
}
