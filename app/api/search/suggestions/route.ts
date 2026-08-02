import { localeFrom, ok, sanitize } from "@/lib/server/api";
import { suggestAll } from "@/lib/server/search";

/** GET /api/search/suggestions — localized typed results with stable canonical IDs. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  /*
   * Bounded and stripped of angle brackets before it is used or echoed.
   *
   * The endpoint returns JSON and the browser will not execute a script tag in
   * an `application/json` body, so this was never a live cross-site scripting
   * hole. It was a habit worth not having: the one thing standing between a
   * reflected `<script>` and a rendered one is a response header, and the query
   * is also a cache key, a log line and a search index probe. The neighbouring
   * interpret endpoint has always sanitized its input, and an unbounded `q`
   * fanning out across the whole catalogue is its own small denial of service.
   */
  const q = sanitize(url.searchParams.get("q"), 120);
  const locale = localeFrom(req);
  const results = await suggestAll(q, locale, 8);
  return ok({ query: q, suggestions: results });
}
