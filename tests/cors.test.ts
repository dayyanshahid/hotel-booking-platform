import { afterEach, describe, expect, it } from "vitest";
import { allowedOrigins, corsHeaders, crossSiteSessions, preflight } from "@/lib/server/cors";

/**
 * Who may call this backend from a browser.
 *
 * Splitting the portals turns every portal request into a cross-site one, which
 * is the same shape as a request forgery. The only thing separating the two is
 * being specific about origins — so these assert the specificity rather than
 * the happy path.
 */
const ALLOWED = "https://agents.example,https://admin.example";

afterEach(() => {
  delete process.env.PORTAL_ORIGINS;
});

function request(origin?: string, method = "GET"): Request {
  return new Request("https://api.example/api/agency/me", {
    method,
    headers: origin ? { origin } : {},
  });
}

describe("allowed origins", () => {
  it("is empty until configured, which keeps the combined app same-origin", () => {
    expect(allowedOrigins()).toEqual([]);
    expect(crossSiteSessions()).toBe(false);
  });

  it("reads the configured list and tolerates spacing and trailing slashes", () => {
    process.env.PORTAL_ORIGINS = " https://agents.example/ , https://admin.example ";
    expect(allowedOrigins()).toEqual(["https://agents.example", "https://admin.example"]);
  });
});

describe("cors headers", () => {
  it("echoes a known origin and allows credentials", () => {
    process.env.PORTAL_ORIGINS = ALLOWED;
    const headers = corsHeaders(request("https://agents.example"));
    expect(headers["access-control-allow-origin"]).toBe("https://agents.example");
    expect(headers["access-control-allow-credentials"]).toBe("true");
    // The answer differs per caller, so it must not be cached as one response.
    expect(headers.vary).toBe("Origin");
  });

  it("gives an unknown origin nothing at all", () => {
    /*
     * Not a 403 with headers, not a wildcard — nothing. The browser blocks the
     * read on its own, and a prober is told nothing about what exists here.
     */
    process.env.PORTAL_ORIGINS = ALLOWED;
    expect(corsHeaders(request("https://evil.example"))).toEqual({});
  });

  it("never answers with a wildcard", () => {
    // A browser refuses to send credentials to `*`, so a wildcard would be
    // both unsafe in principle and broken in practice.
    process.env.PORTAL_ORIGINS = ALLOWED;
    const headers = corsHeaders(request("https://agents.example"));
    expect(headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("stays silent when nothing is configured", () => {
    expect(corsHeaders(request("https://agents.example"))).toEqual({});
  });
});

describe("preflight", () => {
  it("answers a known origin with the methods and headers a portal needs", () => {
    process.env.PORTAL_ORIGINS = ALLOWED;
    const response = preflight(request("https://admin.example", "OPTIONS"));
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("refuses a preflight from an unknown origin", () => {
    process.env.PORTAL_ORIGINS = ALLOWED;
    expect(preflight(request("https://evil.example", "OPTIONS"))?.status).toBe(403);
  });

  it("ignores anything that is not a preflight", () => {
    process.env.PORTAL_ORIGINS = ALLOWED;
    expect(preflight(request("https://admin.example"))).toBeNull();
  });
});
