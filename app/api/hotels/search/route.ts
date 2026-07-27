import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { runSearch } from "@/lib/server/search";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { validateIntent } from "@/lib/server/validate";
import type { SearchFilters, SearchIntent, SortKey } from "@/lib/types";

interface Body {
  intent: Partial<SearchIntent>;
  filters?: SearchFilters;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

/** POST /api/hotels/search — normalized canonical hotels and offer summaries. */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const scenario = scenarioFromRequest(req);
  const body = await readJson<Body>(req);
  if (!body?.intent) return fail("validation", "error.validation", locale, { status: 400 });

  const validation = validateIntent(body.intent, locale);
  if (!validation.valid || !validation.intent) {
    return fail("validation", "error.validation", locale, { status: 422, fields: validation.fields });
  }

  const response = await runSearch(validation.intent, {
    filters: body.filters,
    sort: body.sort,
    page: body.page,
    pageSize: body.pageSize,
    scenario,
    locale,
  });

  if (response.completeness === "empty") {
    return fail("temporaryService", "results.allFailed", locale, {
      status: 503,
      retryable: true,
      action: "retry",
    });
  }

  return ok(response);
}
