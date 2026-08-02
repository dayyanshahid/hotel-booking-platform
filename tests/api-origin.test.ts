import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the browser may call the API by a bare path.
 *
 * The portals are separate deployments on their own origins, so a relative
 * `/api/...` in client code resolves to whichever front end is rendering —
 * which, on the portal, serves no API at all. The failure is never a clean
 * error: the response is a redirect or an HTML page, `res.json()` throws, and
 * the screen shows something generic about an unexpected response over data
 * that was simply never asked for.
 *
 * This has now been the same bug four times — the destination lookup, the
 * property photographs, the voucher, and `useApi`, which is the helper sixteen
 * screens go through and was the last one holding a bare path. Each was found
 * by someone looking at a broken screen rather than by anything here.
 *
 * So it is checked instead. Client files may reach the network only through
 * `apiUrl`, which is a no-op when the API is same-origin and correct when it
 * is not.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Only files that run in the browser.
 *
 * A route handler calling `fetch` is talking to a supplier, not to us, and
 * `apiUrl` would be meaningless there. `lib/server` is server-only by
 * construction and `app/api` is the API itself.
 */
function clientFiles(): string[] {
  return [...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "lib"))].filter(
    (file) => !file.includes(`${path.sep}server${path.sep}`),
  );
}

describe("calling our own API from the browser", () => {
  it("always goes through apiUrl", () => {
    const offenders: string[] = [];

    for (const file of clientFiles()) {
      const source = readFileSync(file, "utf8");
      // `fetch(` followed by anything other than `apiUrl(` — allowing for the
      // argument to sit on the next line, which is how two of these are
      // formatted and how a naive grep misses them.
      for (const match of source.matchAll(/\bfetch\(\s*([^\s)]+)/g)) {
        const argument = match[1];
        if (argument.startsWith("apiUrl(")) continue;
        // A variable already built with apiUrl, or a full URL, is fine; a
        // string literal beginning with a slash is exactly the bug.
        if (/^["'`]\//.test(argument)) {
          offenders.push(`${path.relative(ROOT, file)}: fetch(${argument}…`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("sends credentials when the API is somewhere else", () => {
    /*
     * The other half, and the quieter one. A cross-origin request sends no
     * cookie under the default, so a call with the right address still arrives
     * anonymous — the portal then shows its sign-in screen to somebody who has
     * just signed in.
     */
    const offenders: string[] = [];

    for (const file of clientFiles()) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("apiUrl(")) continue;
      // Every file that reaches the API has to have thought about it, either
      // by passing credentials or by going through a helper that does.
      const reachesApi = /\bfetch\(\s*apiUrl\(/.test(source);
      if (reachesApi && !source.includes("apiCredentials()")) {
        offenders.push(path.relative(ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("turns an unreachable API into an answer, not an exception", () => {
    /*
     * `useApi` is the helper sixteen screens go through, and its `try` used to
     * begin after the fetch — so it caught a malformed body and nothing else.
     * A request that never completes at all (no network, DNS gone, the origin
     * refusing a cross-site call) rejected straight out of the helper, and
     * every loader awaiting it was left on a skeleton that would never
     * resolve. Slow and broken looked the same, and only one of them ends.
     *
     * Read from the source rather than exercised, because the failure is a
     * missing `try` around one statement: the shape of the code is the whole
     * of the bug.
     */
    const source = readFileSync(path.join(ROOT, "components/providers/app-provider.tsx"), "utf8");
    const helper = source.slice(source.indexOf("export function useApi()"));
    const fetchAt = helper.indexOf("await fetch(apiUrl(input)");
    const tryAt = helper.lastIndexOf("try {", fetchAt);
    const catchBetween = helper.slice(tryAt, fetchAt).includes("catch");

    expect(fetchAt, "useApi no longer fetches the way this guard expects").toBeGreaterThan(-1);
    expect(tryAt, "the fetch in useApi is not inside a try").toBeGreaterThan(-1);
    expect(catchBetween, "the nearest try closes before the fetch, so a rejection escapes").toBe(false);
  });

  it("keeps the number of hand-rolled API calls from growing", () => {
    /*
     * `apiFetch` exists because eighty-four call sites wrote the same three
     * lines and got the third wrong every time: the address, the cookie, and
     * the failure. Every read is converted — those were the ones that left a
     * screen on a skeleton for ever. What is left are writes whose shape
     * resisted a mechanical rewrite, plus the two helpers that are allowed to
     * hand-roll because they *are* the plumbing. The point of this number is
     * that it only ever goes down.
     *
     * A budget rather than a ban, because a `fetch` that wants the Response
     * itself — a blob, a status code — is legitimate and should not have to
     * fight the suite. Lower the number when you convert one; if you find
     * yourself raising it, you are adding a loader that cannot fail safely.
     */
    const BUDGET = 32;

    let found = 0;
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const source = readFileSync(file, "utf8");
      const hits = (source.match(/\bfetch\(\s*apiUrl\(/g) ?? []).length;
      if (hits) {
        found += hits;
        offenders.push(`${path.relative(ROOT, file)}:${hits}`);
      }
    }
    expect(found, `hand-rolled API calls — ${offenders.join(", ")}`).toBeLessThanOrEqual(BUDGET);
  });
});
