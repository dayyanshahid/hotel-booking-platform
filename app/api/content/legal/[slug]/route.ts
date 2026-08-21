import { fail, localeFrom, ok } from "@/lib/server/api";
import { LEGAL_PAGES, getLegalPage } from "@/lib/data/content";

/**
 * GET /api/content/legal/:slug — one legal page, or the index at `_index`.
 *
 * Terms and privacy are the pages a traveller is told to read before agreeing
 * to something, so they are served from the same place as everything else
 * rather than being copied into whichever front end happens to render them.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = localeFrom(req);

  if (slug === "_index") {
    return ok({
      pages: LEGAL_PAGES.map((p) => ({ slug: p.slug, title: p.title[locale] || p.title.en })),
    });
  }

  const page = getLegalPage(slug);
  if (!page) return fail("validation", "error.notFound", locale, { status: 404 });

  return ok({
    page: {
      slug: page.slug,
      title: page.title[locale] || page.title.en,
      intro: page.intro[locale] || page.intro.en,
      /*
       * Flattened one level. The stored shape is a heading and an array of
       * paragraphs; sending it as-is would have every front end reimplement
       * the same join, and one of them would use a different separator.
       */
      sections: page.sections.map((section) => ({
        heading: section.heading[locale] || section.heading.en,
        paragraphs: section.body.map((b) => b[locale] || b.en),
      })),
      updated: page.updated,
    },
  });
}
