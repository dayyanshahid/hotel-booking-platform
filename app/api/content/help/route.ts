import { localeFrom, ok } from "@/lib/server/api";
import { HELP_ARTICLES } from "@/lib/data/content";

/** GET /api/content/help — the help centre, localised. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  return ok({
    articles: HELP_ARTICLES.map((a) => ({
      slug: a.slug,
      topic: a.topic[locale] || a.topic.en,
      question: a.question[locale] || a.question.en,
      answer: a.answer[locale] || a.answer.en,
    })),
  });
}
