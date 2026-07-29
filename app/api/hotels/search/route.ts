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
  /**
   * `live` searches only the contracted suppliers, which is what the trade
   * portal asks for — an agent cannot sell a demonstration property. It only
   * ever narrows the result set, so there is nothing to guard here.
   */
  supply?: "all" | "live";
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
    supply: body.supply === "live" ? "live" : "all",
  });

  /*
   * `unconfigured` is deliberately not an error. There is nothing wrong with
   * the request, retrying cannot change the answer, and a 503 would put a
   * "try again" toast in front of an agent who needs to be told that no
   * supplier is connected. It returns a normal, empty page carrying its own
   * explanation.
   */
  if (response.completeness === "empty") {
    return fail("temporaryService", "results.allFailed", locale, {
      status: 503,
      retryable: true,
      action: "retry",
    });
  }

  return ok(response);
}
