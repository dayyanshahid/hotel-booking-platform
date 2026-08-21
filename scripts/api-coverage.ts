import { config as loadEnv } from "dotenv";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

loadEnv({ path: ".env.local" });

/**
 * Which of the API's consumer endpoints this site actually reaches.
 *
 *   npm run qa:coverage
 *
 * The other suites ask whether what the site calls works. This asks the
 * opposite question: what does the API offer that nothing here calls? That is
 * the shape "integrated" actually has, and it is invisible from inside the
 * site — a screen that was never built and an endpoint nobody wired up both
 * look exactly like a codebase with no errors in it.
 *
 * Read from both sources rather than from a list kept by hand, because a list
 * maintained separately from the code is a list that stops being true on the
 * first commit that forgets it. Endpoints are discovered from the API's own
 * route files, down to which HTTP methods each one exports; call sites are
 * discovered from this repository's source. Anything offered and not called is
 * reported.
 *
 * Method-level, not just path-level. An endpoint reached with GET while its
 * PATCH goes unused is a half-integrated endpoint, and a path-level check
 * would call it covered and say nothing.
 */

const API_ROOT = process.argv.find((a) => a.startsWith("--api="))?.slice(6) ?? "../travel-api";
const API_DIR = path.resolve(API_ROOT, "src/api");

type Verdict = "PASS" | "FAIL" | "WARN";
const results: { name: string; verdict: Verdict; detail: string }[] = [];

function record(name: string, verdict: Verdict, detail: string): void {
  results.push({ name, verdict, detail });
  const tint = verdict === "PASS" ? "\x1b[32m" : verdict === "WARN" ? "\x1b[33m" : "\x1b[31m";
  process.stdout.write(`  ${tint}${verdict}\x1b[0m ${name.padEnd(52)} ${detail}\n`);
}

/** Every endpoint the API offers, with the methods it exports. */
function offered(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!existsSync(API_DIR)) return out;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") {
        const route = "/api/" + path.relative(API_DIR, dir).split(path.sep).join("/");
        const code = readFileSync(full, "utf8");
        const methods = new Set<string>();
        for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
          methods.add(m[1]);
        }
        if (methods.size) out.set(route.replace(/\[[^\]]+\]/g, "{p}"), methods);
      }
    }
  }
  walk(API_DIR);
  return out;
}

/** Every endpoint this site calls, with the methods it calls them by. */
function called(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  }
  for (const root of ["app", "components", "lib"]) if (existsSync(root)) walk(root);

  for (const file of files) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const match of code.matchAll(/["`](\/api\/[^"`\s]*)["`]/g)) {
      const shaped = match[1]
        .split("?")[0]
        .replace(/\$\{[^}]*\}/g, "{p}")
        .replace(/\/+$/, "")
        /*
         * A `{p}` not preceded by a slash is glued to the segment before it,
         * which makes it a suffix rather than a new path segment — almost
         * always an interpolated query string, as in `/api/destinations${query}`.
         * Left in, it produced a path no route could ever match and reported a
         * fully wired endpoint as never called. Path parameters always follow a
         * slash, so this only ever strips the other kind.
         */
        .replace(/(?<!\/)\{p\}$/, "");
      if (shaped === "/api" || shaped.includes("...")) continue;

      /*
       * The method is read from the call's own options object, within a short
       * window after the path. A call with no method is a GET, which is what
       * fetch does and what every helper here wraps.
       */
      const after = code.slice(match.index ?? 0, (match.index ?? 0) + 320);
      const declared = after.match(/method:\s*["`'](GET|POST|PUT|PATCH|DELETE)["`']/);
      const method = declared?.[1] ?? "GET";
      out.set(shaped, (out.get(shaped) ?? new Set()).add(method));
    }
  }
  return out;
}

/**
 * Endpoints whose URLs the API mints itself and hands back inside a response.
 *
 * `/api/image/supplier` is the case that matters: the supplier normalisers
 * build those URLs server-side so that a hotel photo arrives already pointed at
 * our own origin, and the browser then loads it. Nothing in this repository
 * ever types that path, and an audit looking only for literal call sites called
 * it uncovered — which was wrong, and the kind of wrong that teaches people to
 * ignore the audit.
 *
 * Read from the API's own source rather than listed here, so an endpoint that
 * starts or stops being minted this way is picked up on its own.
 */
function mintedByApi(): Set<string> {
  const found = new Set<string>();
  const libDir = path.resolve(API_ROOT, "src/lib");
  if (!existsSync(libDir)) return found;
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  }
  walk(libDir);
  for (const file of files) {
    const code = readFileSync(file, "utf8");
    for (const match of code.matchAll(/["`](\/api\/[^"`\s?]*)/g)) {
      found.add(match[1].replace(/\$\{[^}]*\}/g, "{p}").replace(/\/+$/, ""));
    }
  }
  return found;
}

/** Whether a called path matches an offered pattern, `{p}` standing for any segment. */
function matches(callPath: string, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern.split("{p}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+")}$`,
  );
  return re.test(callPath);
}

async function main(): Promise<void> {
  process.stdout.write("\nWhat the API offers, and what this site reaches\n");

  const api = offered();
  if (!api.size) {
    process.stdout.write(`\n  Could not read the API at ${API_DIR}.\n  Pass --api=<path> if it lives elsewhere.\n\n`);
    process.exit(1);
  }

  const site = called();
  const minted = mintedByApi();

  /*
   * Operator and agency endpoints are not this site's to call, and the two
   * scheduled jobs are called by a scheduler. Counting them as gaps would make
   * the audit permanently red and therefore permanently ignored.
   */
  const mine = [...api.keys()].filter(
    (route) => !route.startsWith("/api/admin/") && !route.startsWith("/api/agency/") && !route.startsWith("/api/cron/"),
  );

  /*
   * Methods this site knowingly does not call, and why.
   *
   * A warning with no explanation gets read once and ignored afterwards, and
   * the honest fix for an unused method is sometimes "nothing" — making a
   * pointless request so an audit turns green is worse than the warning.
   * Anything not listed here is unexplained and stays loud.
   */
  const explained = new Map<string, string>([
    [
      "/api/support/cases/{p} GET",
      "the list already returns whole cases, and a reply uses the answer it gets back rather than refetching, which would collapse the thread being read",
    ],
  ]);

  const uncalled: string[] = [];
  const partial: string[] = [];
  const knowing: string[] = [];

  for (const route of mine.sort()) {
    const wanted = api.get(route)!;
    const hits = new Set<string>();
    for (const [callPath, methods] of site) {
      if (matches(callPath, route) || matches(route, callPath)) for (const m of methods) hits.add(m);
    }
    if (!hits.size) {
      // Reached at runtime through a URL the API put in a response, so the
      // browser does fetch it even though nothing here names it.
      if ([...minted].some((m) => matches(m, route) || m === route)) continue;
      uncalled.push(route);
      continue;
    }
    for (const method of [...wanted].filter((m) => !hits.has(m))) {
      const reason = explained.get(`${route} ${method}`);
      if (reason) knowing.push(`${route} ${method} — ${reason}`);
      else partial.push(`${route} — ${method} never called`);
    }
  }

  record(
    "every consumer endpoint is reached from a screen",
    uncalled.length ? "FAIL" : "PASS",
    uncalled.length ? `${uncalled.length} never called` : `all ${mine.length} reached`,
  );
  for (const route of uncalled) process.stdout.write(`         ${route}\n`);

  record(
    "and reached by every method it offers",
    partial.length ? "WARN" : "PASS",
    partial.length ? `${partial.length} partly wired` : "no unused methods",
  );
  for (const line of partial) process.stdout.write(`         ${line}\n`);

  if (knowing.length) {
    process.stdout.write(`\n  Deliberately not called\n`);
    for (const line of knowing) process.stdout.write(`       ${line}\n`);
  }

  const failed = results.filter((r) => r.verdict === "FAIL").length;
  const warned = results.filter((r) => r.verdict === "WARN").length;
  process.stdout.write(`\n${"─".repeat(76)}\n`);
  process.stdout.write(
    `${results.length - failed - warned} passed · ${warned} warned · ${failed} failed · ${mine.length} consumer endpoints\n\n`,
  );
  process.exit(failed ? 1 : 0);
}

void main();
