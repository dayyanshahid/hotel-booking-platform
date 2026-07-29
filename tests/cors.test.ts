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

describe("every call to the API reaches it, and carries its cookie", () => {
  /*
   * Two mistakes with one shape: correct on a combined build, silently broken
   * on a separated one. Neither can be noticed on a laptop, because on a laptop
   * the API is on the origin serving the page.
   *
   * Both were found on a deployed portal rather than in review, which is the
   * argument for checking them mechanically. A grep is a poor kind of test, but
   * the alternative is a browser against two real origins, and this catches the
   * class where it gets introduced: someone adding a fetch without thinking
   * about an origin they cannot see from where they are working.
   */

  const sourceFiles = async () => {
    const { readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
      }
      return out;
    };

    return walk(process.cwd());
  };

  const relative = (file: string) => file.replace(process.cwd() + "/", "");

  /** The index just past the `fetch(...)` call beginning at `start`. */
  const endOfCall = (source: string, start: number) => {
    let depth = 0;
    let i = start + "fetch".length;
    while (i < source.length) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")" && --depth === 0) break;
      i += 1;
    }
    return i;
  };

  it("passes credentials on every fetch through apiUrl", async () => {
    /*
     * `fetch` defaults to `same-origin` credentials, which sends no cookie to
     * another origin and — worse — discards the `Set-Cookie` that comes back.
     * The symptom is that sign-in succeeds and the agent is returned to the
     * sign-in screen they just completed, with a 200 in the network tab and
     * nothing in the console.
     */
    const { readFile } = await import("node:fs/promises");
    const offenders: string[] = [];

    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      if (!source.includes("apiUrl(")) continue;

      for (const match of source.matchAll(/fetch\(\s*apiUrl\(/g)) {
        const call = source.slice(match.index, endOfCall(source, match.index) + 1);
        if (!call.includes("credentials")) {
          offenders.push(`${relative(file)}:${source.slice(0, match.index).split("\n").length}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("routes shared components' API calls through apiUrl, not a relative path", async () => {
    /*
     * A relative `/api/...` resolves against whatever origin is serving the
     * page. In a component shared with a separated front end that is the
     * portal, which has no API routes at all, so the call 404s against itself
     * and the feature simply does nothing.
     *
     * This is how destination autocomplete came to return no suggestions on the
     * deployed portal: the data was on the backend the whole time and the field
     * was asking the wrong host. Nothing errored, so nothing looked wrong.
     *
     * Server code under app/api is exempt — it *is* the origin.
     */
    const { readFile } = await import("node:fs/promises");
    const offenders: string[] = [];

    for (const file of await sourceFiles()) {
      const path = relative(file);
      if (!path.startsWith("components/") && !path.startsWith("lib/")) continue;
      if (path.startsWith("lib/server/")) continue;

      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/fetch\(\s*[`"']\/api\//g)) {
        offenders.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
