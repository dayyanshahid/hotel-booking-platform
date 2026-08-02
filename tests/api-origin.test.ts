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
});
