import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Two reasons a rate is not there, and only one of them is the supplier's.
 *
 * Imported inside each case rather than at the top: `isServerless` is decided
 * once when its module is first evaluated, so an environment stubbed after the
 * import has already missed its moment — and the test would pass for the wrong
 * reason on a machine that happened to look like a lambda.
 */

async function refusal(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const { offerLost } = await import("@/lib/server/api");
  const { __resetDriver } = await import("@/lib/server/persistence");
  __resetDriver();
  const res = offerLost("en");
  return (await res.json()) as { error: { messageKey: string; recommendedAction: string } };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("a rate that is not in the store", () => {
  it("blames availability when the store is shared", async () => {
    /*
     * With somewhere to publish to, an offer that is missing really is gone —
     * every instance looked in the same place. Another property is the right
     * next move.
     */
    const body = await refusal({
      VERCEL: "1",
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "token",
    });
    expect(body.error.messageKey).toBe("error.availabilityChanged");
    expect(body.error.recommendedAction).toBe("selectAlternative");
  });

  it("sends the agent back to search when there is nowhere to publish", async () => {
    /*
     * The bug this exists for. Without a shared store the offer went to
     * whichever instance ran the search, so *every* property fails the same
     * way — and "select an alternative" sends somebody with a customer on the
     * phone through four more hotels before concluding the platform is broken.
     */
    const body = await refusal({ VERCEL: "1", KV_REST_API_URL: "", KV_REST_API_TOKEN: "" });
    expect(body.error.messageKey).toBe("error.searchAgain");
    expect(body.error.recommendedAction).toBe("retry");
  });

  it("keeps the availability reading on a machine with a real disk", async () => {
    // Local development writes to `.data` and it survives; a missing offer
    // there is a missing offer, not an instance that never saw the search.
    const body = await refusal({ VERCEL: "", AWS_LAMBDA_FUNCTION_NAME: "" });
    expect(body.error.messageKey).toBe("error.availabilityChanged");
  });
});
