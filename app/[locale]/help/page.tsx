import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Card, SectionHeading } from "@/components/ui";
import { fetchHelp } from "@/lib/server/catalogue";
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

  /*
   * Read from the API rather than imported, so this page can be deployed
   * somewhere the content is not. Already localised on the way out, which is
   * why nothing here calls `localized` any more.
   */
  const articles = await fetchHelp(locale);
  const topics = [...new Set(articles.map((a) => a.topic))];

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
            items={articles
              .filter((a) => a.topic === topic)
              .map((article) => ({
                id: article.slug,
                title: article.question,
                content: <p className="wrap-anywhere">{article.answer}</p>,
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
