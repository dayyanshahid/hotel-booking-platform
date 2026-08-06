import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import { resetQuota } from "@/lib/server/hotelbeds/client";
import { runSearch, type SearchProgress } from "@/lib/server/search";
import { __resetSupplyCache } from "@/lib/server/supply-cache";
import type { SearchIntent, SearchResponse } from "@/lib/types";

/**
 * Showing the first supplier's rooms without waiting for the second.
 *
 * A trade search against both live suppliers was measured at 11.6 seconds, and
 * the agent saw nothing but placeholders for all of it. They never answer
 * together, so for most of that wait a complete, bookable page was sitting in
 * memory being held back for company.
 *
 * The thing that must not break in the process is honesty about supply. A page
 * built from one supplier while the other is still being asked is short, but it
 * is not short *because a supplier failed* — and the wording for those two is
 * different, because one is worth waiting out and the other is worth acting on.
 */

const intent: SearchIntent = {
  destinationId: "dest-singapore",
  destinationDisplay: "Singapore",
  destinationType: "city",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "EUR",
};

/**
 * One supplier answers at once, the other takes its time.
 *
 * Routed by URL rather than by picking a city one of them is thin in, because
 * coverage changes and a test that depends on a gap in somebody's inventory
 * stops testing what it was written for the day they fill it.
 */
function stubSuppliers({ hotelbedsDelayMs }: { hotelbedsDelayMs: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("hotelbeds")) {
        await new Promise((resolve) => setTimeout(resolve, hotelbedsDelayMs));
        return json(availabilityFixture);
      }
      return json({ Hotels: [] });
    }),
  );
}

function enableTourmind(on: boolean) {
  if (on) {
    process.env.TOURMIND_USERNAME = "u";
    process.env.TOURMIND_PASSWORD = "p";
    process.env.TOURMIND_AGENT_CODE = "a";
  } else {
    delete process.env.TOURMIND_USERNAME;
    delete process.env.TOURMIND_PASSWORD;
    delete process.env.TOURMIND_AGENT_CODE;
  }
}

/** Every partial frame a search produced, in order. */
async function collectPartials(): Promise<{
  partials: { page: SearchResponse; progress: SearchProgress }[];
  final: SearchResponse;
}> {
  const partials: { page: SearchResponse; progress: SearchProgress }[] = [];
  const final = await runSearch(intent, {
    locale: "en",
    scenario: "normal",
    onPartial: (page, progress) => {
      partials.push({ page, progress });
    },
  });
  return { partials, final };
}

beforeEach(() => {
  resetQuota();
  __resetSupplyCache();
  process.env.HOTELBEDS_API_KEY = "test-key";
  process.env.HOTELBEDS_SECRET = "test-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  enableTourmind(false);
  delete process.env.HOTELBEDS_API_KEY;
  delete process.env.HOTELBEDS_SECRET;
});

describe("a search that arrives in pieces", () => {
  it("hands over the first supplier's page before the second answers", async () => {
    enableTourmind(true);
    stubSuppliers({ hotelbedsDelayMs: 120 });

    const { partials, final } = await collectPartials();

    expect(partials.length).toBeGreaterThan(0);
    // A partial is a page, not a progress ping: rows on it, ranked and paged.
    expect(partials[0].page.results.length).toBeGreaterThan(0);
    expect(partials[0].page.page).toBe(1);
    expect(final.results.length).toBeGreaterThan(0);
  });

  it("counts what is outstanding without naming a supplier", async () => {
    enableTourmind(true);
    stubSuppliers({ hotelbedsDelayMs: 120 });

    const { partials } = await collectPartials();
    const { progress } = partials[0];

    expect(progress.answered).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.asked).toBe(2);
    /*
     * §9.4. Which supplier is slow this afternoon is not something an agent can
     * act on, and a supplier name in a client response is the thing the rule
     * exists to prevent. The serialised page must not carry one either.
     */
    expect(JSON.stringify(progress)).not.toMatch(/tourmind|hotelbeds/i);
  });

  it("does not blame the supplier it is still waiting for", async () => {
    /*
     * The mistake worth guarding. Counting a source still in flight as a
     * failure would put "one of our supply sources did not answer" on a page
     * two seconds before that source answers — a warning the page then has to
     * take back, on the screen an agent is quoting from.
     */
    enableTourmind(true);
    stubSuppliers({ hotelbedsDelayMs: 120 });

    const { partials } = await collectPartials();

    expect(partials[0].page.sourcesUnavailable ?? 0).toBe(0);
    expect(partials[0].page.completenessMessage).toBeUndefined();
  });

  it("publishes the offers on a partial, so an agent can act on it", async () => {
    // A page nobody can book from is a progress bar with photographs. The
    // offer ids on a partial have to resolve for the quote and checkout calls
    // the agent may make before the search has even finished.
    enableTourmind(true);
    stubSuppliers({ hotelbedsDelayMs: 120 });
    const { loadOffer } = await import("@/lib/server/store");

    const { partials } = await collectPartials();
    const first = partials[0].page.results[0].offerSummary.offerId;

    expect(await loadOffer(first)).toBeDefined();
  });

  it("sends nothing early when there is only one source to wait for", async () => {
    /*
     * With one supplier configured there is no "first" answer — the first is
     * also the last, and the final response is already on its way. A partial
     * here would make the page render twice for no new information.
     */
    enableTourmind(false);
    stubSuppliers({ hotelbedsDelayMs: 0 });

    const { partials, final } = await collectPartials();

    expect(partials).toHaveLength(0);
    expect(final.results.length).toBeGreaterThan(0);
  });

  it("still returns the whole page when nobody is listening", async () => {
    // `onPartial` is optional, and the consumer site does not pass one. The
    // un-streamed path has to be the same search it always was.
    enableTourmind(true);
    stubSuppliers({ hotelbedsDelayMs: 20 });

    const response = await runSearch(intent, { locale: "en", scenario: "normal" });

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.completeness).toBe("complete");
  });
});
