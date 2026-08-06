import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { runSearch, type SearchProgress } from "@/lib/server/search";
import { scenarioFromRequest } from "@/lib/server/scenarios";
import { validateIntent } from "@/lib/server/validate";
import type { SearchFilters, SearchIntent, SearchResponse, SortKey } from "@/lib/types";

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
  /**
   * Send each supplier's inventory as it lands instead of all of it at the end.
   *
   * Opt-in, and on the same endpoint rather than a second one: the answer is
   * the same answer, delivered in pieces. A separate route would be another
   * serverless function, another entry in the CORS surface, and a second place
   * for the two to drift apart.
   */
  stream?: boolean;
}

/**
 * One line of NDJSON per frame.
 *
 * Chosen over server-sent events because both ends are ours and SSE's framing
 * buys nothing here: no reconnection semantics to inherit, no event types to
 * name, and `EventSource` cannot POST a search intent anyway.
 */
type Frame =
  | { type: "partial"; data: SearchResponse; progress: SearchProgress }
  | { type: "final"; data: SearchResponse }
  | { type: "error"; error: unknown };

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

  const intent = validation.intent;
  const options = {
    filters: body.filters,
    sort: body.sort,
    page: body.page,
    pageSize: body.pageSize,
    scenario,
    locale,
    supply: body.supply === "live" ? ("live" as const) : ("all" as const),
  };

  /*
   * `unconfigured` is deliberately not an error. There is nothing wrong with
   * the request, retrying cannot change the answer, and a 503 would put a
   * "try again" toast in front of an agent who needs to be told that no
   * supplier is connected. It returns a normal, empty page carrying its own
   * explanation.
   */
  const everythingFailed = () =>
    fail("temporaryService", "results.allFailed", locale, {
      status: 503,
      retryable: true,
      action: "retry",
    });

  if (!body.stream) {
    const response = await runSearch(intent, options);
    if (response.completeness === "empty") return everythingFailed();
    return ok(response);
  }

  /*
   * The streamed form.
   *
   * A search against both live suppliers was measured at 11.6 seconds, and the
   * agent spent all of it looking at placeholder rectangles with a customer on
   * the phone. The suppliers are asked in parallel and never answer together,
   * so the first one's inventory is a real, complete, bookable page several
   * seconds before the second one's arrives — there was never a reason to sit
   * on it.
   *
   * Failures keep the transport they had. The status code is already 200 by the
   * time anything is known, so an error becomes a final frame rather than a
   * response code; the client treats the two identically because the error body
   * is the same envelope `fail` would have sent.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (frame: Frame) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        } catch {
          // The agent navigated away or ran a new search. Nothing to do: the
          // supplier work is already in flight and its rates land in the offer
          // store either way, where the next search finds them warm.
          open = false;
        }
      };

      try {
        const response = await runSearch(intent, {
          ...options,
          onPartial: (data, progress) => write({ type: "partial", data, progress }),
        });
        if (response.completeness === "empty") {
          write({ type: "error", error: (await everythingFailed().json()).error });
        } else {
          write({ type: "final", data: response });
        }
      } catch {
        write({ type: "error", error: (await everythingFailed().json()).error });
      } finally {
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Proxies that buffer would undo the entire point of this.
      "x-accel-buffering": "no",
    },
  });
}
