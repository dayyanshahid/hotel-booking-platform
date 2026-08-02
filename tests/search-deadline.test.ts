import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import { resetQuota } from "@/lib/server/hotelbeds/client";
import { runSearch } from "@/lib/server/search";
import type { SearchIntent } from "@/lib/types";

/**
 * A search has to come back while the customer is still on the phone.
 *
 * Nothing used to bound one. Each supplier call carried its own timeout and its
 * own retry, so an availability request that timed out cost twenty seconds,
 * backed off, and cost twenty more before the page gave up — a measured search
 * took thirty-seven seconds and the caller abandoned it first.
 *
 * The deadline is only worth having if it holds when a supplier stops
 * answering, which is exactly the case no unit test reaches by accident: the
 * stub here never resolves, so without the bound this file would hang rather
 * than fail, and hanging is what the agent experienced.
 */

const intent: SearchIntent = {
  destinationId: "hbd-PMI",
  destinationDisplay: "Mallorca",
  destinationType: "city",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "EUR",
};

/** Resolves only when the test says so, so nothing leaks between cases. */
let release: (() => void) | undefined;

function stubTransport(mode: "hangs" | "answers") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (mode === "answers") {
        return new Response(JSON.stringify(availabilityFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

beforeEach(() => {
  resetQuota();
  process.env.HOTELBEDS_API_KEY = "test-key";
  process.env.HOTELBEDS_SECRET = "test-secret";
});

afterEach(() => {
  // Let the abandoned request finish, or vitest waits on the open handle it
  // was deliberately given.
  release?.();
  release = undefined;
  vi.unstubAllGlobals();
  delete process.env.HOTELBEDS_API_KEY;
  delete process.env.HOTELBEDS_SECRET;
  delete process.env.SEARCH_DEADLINE_MS;
});

describe("the search deadline", () => {
  it("answers even when a supplier never does", async () => {
    process.env.SEARCH_DEADLINE_MS = "400";
    stubTransport("hangs");

    const started = Date.now();
    const response = await runSearch(intent, { locale: "en", supply: "live", scenario: "normal" });
    const took = Date.now() - started;

    // Generously bounded: the point is that it returns at all, close to the
    // deadline, rather than after two twenty-second supplier timeouts.
    expect(took).toBeLessThan(4_000);
    expect(response.page).toBe(1);
  });

  it("says the page is short rather than claiming it is whole", async () => {
    process.env.SEARCH_DEADLINE_MS = "400";
    stubTransport("hangs");

    const response = await runSearch(intent, { locale: "en", supply: "live", scenario: "normal" });

    /*
     * The distinction the whole feature rests on. A page that gave up waiting
     * has less supply on it than the city has, and describing that as
     * "complete" would quietly hide a supplier outage from an agent who is
     * about to quote from it.
     */
    expect(response.completeness).not.toBe("complete");
    expect(response.sourcesUnavailable ?? 0).toBeGreaterThan(0);
    expect(response.completenessMessage).toBeTruthy();
  });

  it("does not cut off a supplier that answers in time", async () => {
    process.env.SEARCH_DEADLINE_MS = "15000";
    stubTransport("answers");

    const response = await runSearch(intent, { locale: "en", supply: "live", scenario: "normal" });

    // The deadline must not be a tax on the ordinary case: a supplier that
    // answers immediately is still a complete page.
    expect(response.completeness).toBe("complete");
    expect(response.totalCount).toBeGreaterThan(0);
  });

  it("can be switched off", async () => {
    // `0` means wait indefinitely — the behaviour before the deadline existed,
    // kept because an operator may prefer completeness on a bad supplier day.
    process.env.SEARCH_DEADLINE_MS = "0";
    stubTransport("answers");

    const response = await runSearch(intent, { locale: "en", supply: "live", scenario: "normal" });
    expect(response.completeness).toBe("complete");
  });
});
