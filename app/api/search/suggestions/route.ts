import { localeFrom, ok } from "@/lib/server/api";
import { suggestAll } from "@/lib/server/search";

/** GET /api/search/suggestions — localized typed results with stable canonical IDs. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const locale = localeFrom(req);
  const results = await suggestAll(q, locale, 8);
  return ok({ query: q, suggestions: results });
}
