import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Card, SectionHeading } from "@/components/ui";
import { HELP_ARTICLES } from "@/lib/data/content";
import { localized } from "@/lib/data/catalog";
import { createTranslator, isLocale } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { Locale } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(isLocale(locale) ? locale : "en");
  return { title: t("cms.help") };
}

/** F-091 — searchable help centre grouped by topic (§5.13). */
export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const t = createTranslator(locale);

  const topics = [...new Set(HELP_ARTICLES.map((a) => localized(a.topic, locale)))];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("cms.help")}</h1>
        <p className="text-muted mt-2 text-sm">{t("support.body")}</p>
      </div>

      {topics.map((topic) => (
        <section key={topic}>
          <SectionHeading title={topic} />
          <Accordion
            items={HELP_ARTICLES.filter((a) => localized(a.topic, locale) === topic).map((article) => ({
              id: article.slug,
              title: localized(article.question, locale),
              content: <p className="wrap-anywhere">{localized(article.answer, locale)}</p>,
            }))}
          />
        </section>
      ))}

      <Card className="p-5">
        <SectionHeading title={t("support.title")} description={t("support.body")} />
        <Link href={href(locale, "/support")} className="text-brand-700 text-sm font-medium underline">
          {t("support.chat")}
        </Link>
      </Card>
    </div>
  );
}
