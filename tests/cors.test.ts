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

describe("every call to the API asks for its cookie", () => {
  /*
   * The failure this catches is invisible in development and total in
   * production. `fetch` defaults to `same-origin` credentials, which sends
   * nothing to another origin and — worse — discards the `Set-Cookie` that
   * comes back. Combined and local builds are same-origin, so the default is
   * correct there and the omission cannot be noticed; on a separated portal it
   * means sign-in succeeds, the session is dropped on the floor, and the agent
   * is returned to the sign-in screen they just completed, with no error in the
   * console and a 200 in the network tab.
   *
   * It was found by signing in to a deployed portal, and only because the
   * symptom was strange enough to chase. A grep is a poor kind of test, but the
   * alternative here is a browser against two real origins, and this catches
   * the whole class in the place it actually gets introduced: someone adding a
   * fetch and not thinking about an origin they cannot see locally.
   */
  it("passes credentials on every fetch through apiUrl", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
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

    const offenders: string[] = [];
    for (const file of await walk(process.cwd())) {
      const source = await readFile(file, "utf8");
      if (!source.includes("apiUrl(")) continue;

      for (const match of source.matchAll(/fetch\(\s*apiUrl\(/g)) {
        // Walk to the matching paren so the whole call is examined, not a
        // fixed window that a long URL or a multi-line body would outrun.
        let depth = 0;
        let end = match.index + "fetch".length;
        while (end < source.length) {
          if (source[end] === "(") depth += 1;
          else if (source[end] === ")" && --depth === 0) break;
          end += 1;
        }
        if (!source.slice(match.index, end + 1).includes("credentials")) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
