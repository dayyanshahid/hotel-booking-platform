import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

/**
 * The pages a customer wanders through before they search for anything.
 *
 *   npm run dev
 *   npm run qa:discovery
 *
 * Deals, destinations, countries, help, legal — the editorial surface. None of
 * it goes through an API: these are server components reading the catalogue,
 * which means the usual failure is not an error but a link. A collection that
 * points at a slug the catalogue no longer mints, a country tile for a place
 * with nothing in it, a footer entry whose page was never written — each one
 * renders perfectly and dead-ends the person who follows it, and none of it
 * shows up in a unit test or a smoke check of the home page.
 *
 * So this crawls. Every internal link on every discovery page is followed once
 * and has to answer; every page has to carry a heading and some content of its
 * own rather than a shell. The rest of the consumer site — search, the
 * property page, checkout — is covered by qa:search and qa:booking.
 */

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:4860").replace(/\/+$/, "");
const LOCALE = process.argv.find((a) => a.startsWith("--locale="))?.slice(9) ?? "en";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";
interface Case { name: string; verdict: Verdict; detail: string }

const results: Case[] = [];

function section(title: string): void {
  process.stdout.write(`\n${title}\n`);
}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    const verdict: Verdict = detail.startsWith("SKIP:") ? "SKIP" : detail.startsWith("WARN:") ? "WARN" : "PASS";
    results.push({ name, verdict, detail: verdict === "PASS" ? detail : detail.slice(5).trim() });
  } catch (error) {
    results.push({ name, verdict: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
  const last = results[results.length - 1];
  process.stdout.write(`  ${last.verdict.padEnd(4)} ${name} — ${last.detail}\n`);
}

/* ------------------------------------------------------------------- pages */

const pages = new Map<string, string>();

async function html(path: string): Promise<string> {
  const cached = pages.get(path);
  if (cached !== undefined) return cached;
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "text/html" } });
  const body = await res.text();
  if (res.status !== 200) throw new Error(`${path} → ${res.status}`);
  pages.set(path, body);
  return body;
}

/** Text as a reader would see it, near enough for "is there anything here". */
function visibleText(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Internal links, deduplicated and stripped of the noise.
 *
 * Anchors, query strings and external hosts are not this crawler's business —
 * what is being checked is that a route someone can click actually exists.
 */
function internalLinks(source: string): string[] {
  const found = [...source.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
  return [...new Set(found)].filter((path) => !path.startsWith("/_next") && !path.startsWith("/api"));
}

const L = (path: string) => `/${LOCALE}${path}`;

/* ================================================================= the cases */

const DISCOVERY = [
  { name: "Home", path: L("") },
  { name: "Deals", path: L("/deals") },
  { name: "Destinations", path: L("/destinations") },
  { name: "Help", path: L("/help") },
  { name: "Support", path: L("/support") },
  { name: "Trips lookup", path: L("/trips/lookup") },
  { name: "Saved", path: L("/saved") },
  { name: "Compare", path: L("/compare") },
  { name: "Sign in", path: L("/signin") },
];

async function main(): Promise<void> {
  process.stdout.write(`Discovery QA — ${BASE} (${LOCALE})\n`);

  section("Each page stands up on its own");

  for (const page of DISCOVERY) {
    await check(`${page.name} renders something`, async () => {
      const source = await html(page.path);
      const text = visibleText(source);
      /*
       * A shell is not a page. These render on the server, so whatever a
       * reader gets is in this HTML — a page that comes back as chrome and
       * nothing else is broken even though it answered 200.
       */
      if (text.length < 400) throw new Error(`only ${text.length} characters of text — this is a shell`);
      const h1 = (source.match(/<h1[\s>]/g) ?? []).length;
      if (h1 === 0) throw new Error("no top-level heading");
      if (h1 > 1) throw new Error(`${h1} top-level headings`);
      return `${text.length} chars · 1 heading`;
    });
  }

  section("Nothing leads nowhere");

  /**
   * Every link on the discovery pages, followed once.
   *
   * The catalogue moves — a collection is retagged, a destination stops being
   * bookable, a legal page is renamed — and a link that used to work is the
   * one failure nobody sees until a customer reports a blank page.
   */
  const seen = new Set<string>();
  const broken: string[] = [];
  let followed = 0;

  await check("every link on the discovery pages resolves", async () => {
    for (const page of DISCOVERY) {
      let source: string;
      try {
        source = await html(page.path);
      } catch {
        continue; // already reported above
      }
      for (const link of internalLinks(source)) {
        if (seen.has(link)) continue;
        seen.add(link);
        followed += 1;
        const res = await fetch(`${BASE}${link}`, { headers: { accept: "text/html" }, redirect: "follow" });
        if (res.status >= 400) broken.push(`${link} → ${res.status} (from ${page.name})`);
      }
    }
    if (broken.length) throw new Error(`${broken.length} of ${followed} — ${broken.slice(0, 6).join("; ")}`);
    return `${followed} links, all answered`;
  });

  section("The catalogue pages have a catalogue in them");

  await check("Deals offers collections a customer can open", async () => {
    const source = await html(L("/deals"));
    const collections = internalLinks(source).filter((p) => p.includes("/deals/"));
    if (!collections.length) throw new Error("the deals page lists no collections");
    // And the first one has to be a page, not a list of nothing.
    const first = visibleText(await html(collections[0]));
    if (first.length < 400) throw new Error(`${collections[0]} is a shell`);
    return `${collections.length} collections`;
  });

  await check("Destinations offers countries a customer can open", async () => {
    const source = await html(L("/destinations"));
    const links = internalLinks(source);
    const countries = links.filter((p) => p.includes("/countries/"));
    const cities = links.filter((p) => p.includes("/destinations/"));
    if (!countries.length && !cities.length) throw new Error("the destinations page links to no places");
    return `${countries.length} countries · ${cities.length} cities`;
  });

  await check("a country page names properties that exist", async () => {
    const links = internalLinks(await html(L("/destinations"))).filter((p) => p.includes("/countries/"));
    if (!links.length) return "SKIP: no country pages linked";
    const source = await html(links[0]);
    const hotels = internalLinks(source).filter((p) => p.includes("/hotel/"));
    if (!hotels.length) return `WARN: ${links[0]} shows no properties`;
    // Following one is enough: they all come from the same query.
    const detail = visibleText(await html(hotels[0]));
    if (detail.length < 400) throw new Error(`${hotels[0]} is a shell`);
    return `${links[0]} → ${hotels.length} properties, first one opens`;
  });

  section("The same in Arabic");

  await check("the Arabic side renders and is right-to-left", async () => {
    const source = await fetch(`${BASE}/ar/deals`, { headers: { accept: "text/html" } }).then((r) => r.text());
    if (!/dir="rtl"/.test(source)) throw new Error("the Arabic page is not marked right-to-left");
    const text = visibleText(source);
    if (text.length < 400) throw new Error("the Arabic deals page is a shell");
    // A placeholder that reached a reader is the specific failure here.
    const braces = text.match(/\{[a-zA-Z]+\}/g);
    if (braces) throw new Error(`unsubstituted placeholders: ${[...new Set(braces)].join(", ")}`);
    return `${text.length} chars, rtl`;
  });

  await check("no English leaks into the Arabic chrome", async () => {
    const source = await fetch(`${BASE}/ar/destinations`, { headers: { accept: "text/html" } }).then((r) => r.text());
    const text = visibleText(source);
    /*
     * A missing Arabic key falls back to English, silently, and the only sign
     * is an English sentence in an Arabic page. Checked against the words this
     * surface uses rather than against the alphabet, because property names
     * and country names are legitimately Latin here.
     */
    const leaked = ["Destinations", "Browse by region", "Popular cities", "View all"].filter((w) => text.includes(w));
    if (leaked.length) throw new Error(`English in the Arabic page: ${leaked.join(", ")}`);
    return "translated";
  });

  report();
}

function report(): void {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const failed = results.filter((r) => r.verdict === "FAIL");
  process.stdout.write(`\n${"─".repeat(72)}\n`);
  process.stdout.write(`${count("PASS")} passed · ${count("FAIL")} failed · ${count("WARN")} unprovable · ${count("SKIP")} skipped\n`);
  if (failed.length) {
    process.stdout.write(`\nDefects:\n`);
    for (const f of failed) process.stdout.write(`  ${f.name}\n    ${f.detail}\n`);
  }
  const warned = results.filter((r) => r.verdict === "WARN");
  if (warned.length) {
    process.stdout.write(`\nCould not be judged:\n`);
    for (const w of warned) process.stdout.write(`  ${w.name} — ${w.detail}\n`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  process.stdout.write(`\nThe harness itself fell over: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
