import { config as loadEnv } from "dotenv";

// Before anything reads process.env: this drives a *running* server, but it
// also reads the supplier flags to decide which cases are answerable.
loadEnv({ path: ".env.local" });

import { isConfident, matchDestination } from "@/lib/destination-match";

/**
 * The search-a-stay flow, end to end, against a running server.
 *
 *   npm run dev                       # in another terminal
 *   npm run qa:search
 *   npm run qa:search -- --base=https://nazil.vercel.app
 *
 * The unit suite proves each piece in isolation and the conformance script
 * proves the suppliers answer. Neither of them walks the path an agent walks:
 * type a city, pick it, choose dates, search, filter, sort, page, and read a
 * cost and a margin off the row. That path crosses six modules and two origins,
 * and every failure it has produced so far — the destination that resolved to
 * nothing, the prices that shimmered for ever, the second page that repeated
 * the first — lived in the joins rather than in any of the parts.
 *
 * Three verdicts, and the difference between two of them is the whole point.
 * FAIL is ours: the flow did something wrong. WARN is the supply's: a supplier
 * did not answer, so the case could not be judged. Running these together is
 * how a suite this slow gets ignored — a supplier having a bad afternoon must
 * not read as a broken app, and a broken app must not hide behind one.
 *
 * SKIP is neither: the case never ran, and says why.
 */

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:4860").replace(/\/+$/, "");
const AGENT = process.argv.find((a) => a.startsWith("--agent="))?.slice(8) ?? "admin@skyline.example";
/**
 * The agent portal, which is a separate deployment on its own origin.
 *
 * Everything the portal does, it does by calling `BASE` from another site. That
 * one fact is the source of every portal-only failure so far — a relative URL
 * that resolved to the portal itself, a cookie the browser would not send, a
 * sign-in screen shown to somebody who had just signed in — and none of them
 * can be reproduced by testing the backend alone. Pass `--portal=` to point at
 * a deployed one; empty skips the section rather than guessing.
 */
const PORTAL = (process.argv.find((a) => a.startsWith("--portal="))?.slice(9) ?? "http://localhost:4861").replace(/\/+$/, "");

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";

interface Case {
  group: string;
  name: string;
  verdict: Verdict;
  detail: string;
  ms: number;
}

const results: Case[] = [];
let group = "";

function section(title: string): void {
  group = title;
}

/**
 * Nobody could supply this search.
 *
 * Thrown rather than returned so a case can call the search on its first line
 * and stop, instead of every case carrying the same four-line guard. It is not
 * a defect and is never counted as one.
 */
class SupplyUnavailable extends Error {}

/** A case may also decline itself with "SKIP: …" or qualify itself with "WARN: …". */
async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    const verdict: Verdict = detail.startsWith("SKIP:") ? "SKIP" : detail.startsWith("WARN:") ? "WARN" : "PASS";
    results.push({
      group,
      name,
      verdict,
      detail: verdict === "PASS" ? detail : detail.slice(5).trim(),
      ms,
    });
  } catch (error) {
    results.push({
      group,
      name,
      verdict: error instanceof SupplyUnavailable ? "WARN" : "FAIL",
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    });
  }
  const last = results[results.length - 1];
  process.stdout.write(`  ${pad(last.verdict)} ${name} — ${last.detail}\n`);
}

function pad(verdict: Verdict): string {
  return verdict.padEnd(4);
}

/* ------------------------------------------------------------------ session */

/**
 * One cookie jar for the run.
 *
 * The agent's session is the whole point: an anonymous search returns public
 * prices, and every trade case below is about the numbers only a signed-in
 * agency sees. Held here rather than passed around so a case cannot forget it.
 */
const jar = new Map<string, string>();

function cookieHeader(): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; ok: boolean; data?: T; error?: { message?: string; fields?: Record<string, string> } }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(jar.size ? { cookie: cookieHeader() } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const body = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: T; error?: { message?: string; fields?: Record<string, string> } }
    | null;
  return { status: res.status, ok: Boolean(body?.ok), data: body?.data, error: body?.error };
}

/* -------------------------------------------------------------------- types */

interface Suggestion {
  id: string;
  label: string;
  type: string;
  context?: string;
  countryCode?: string;
}

interface Card {
  canonicalHotelId: string;
  slug: string;
  name: string;
  offerSummary: { offerId: string; total: number; currency: string };
  price: { total: number; currency: string; roomsCovered?: number; roomsRequested?: number };
  starRating?: number;
}

interface SearchResponse {
  searchToken: string;
  results: Card[];
  totalCount: number;
  facets: Record<string, unknown>;
  completeness: string;
  completenessMessage?: string;
  sourcesUnavailable?: number;
  page: number;
  pageSize: number;
  recovery?: {
    nearbyDates: { checkIn: string; checkOut: string; fromTotal: number }[];
    nearbyDestinations: { id: string; label: string; propertyCount: number }[];
  };
}

interface Quote {
  offerId: string;
  cost: number;
  sell: number;
  margin: number;
  currency: string;
}

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function intentFor(
  destinationId: string,
  over: Partial<{
    checkIn: string;
    checkOut: string;
    rooms: { adults: number; childrenAges: number[] }[];
    currency: string;
    destinationDisplay: string;
  }> = {},
) {
  return {
    destinationId,
    destinationDisplay: over.destinationDisplay ?? "",
    destinationType: "city",
    checkIn: over.checkIn ?? iso(30),
    checkOut: over.checkOut ?? iso(32),
    flexibility: "exact",
    rooms: over.rooms ?? [{ adults: 2, childrenAges: [] }],
    locale: "en",
    currency: over.currency ?? "USD",
  };
}

type Extra = { filters?: Record<string, unknown>; sort?: string; page?: number; pageSize?: number };

/** The raw call, for the cases that are about a refusal. */
async function search(intent: ReturnType<typeof intentFor>, extra: Extra = {}) {
  return api<SearchResponse>("/api/hotels/search", {
    body: { intent, supply: "live", pageSize: 12, ...extra },
  });
}

/** The call every other case wants: a page, or a stated reason there is none. */
async function supplied(intent: ReturnType<typeof intentFor>, extra: Extra = {}): Promise<SearchResponse> {
  const res = await search(intent, extra);
  if (res.status === 503) throw new SupplyUnavailable("no supplier answered this search");
  if (!res.ok || !res.data) throw new Error(`→ ${res.status} ${res.error?.message ?? ""}`);
  if (res.data.completeness === "unconfigured") {
    throw new SupplyUnavailable("no supplier is connected to this environment");
  }
  return res.data;
}

/* ------------------------------------------------------- the flow, in order */

/** Resolved once and reused, so a suggestion failure is reported once. */
let city: Suggestion | null = null;

async function run(): Promise<void> {
  section("Session");

  await check("the server is up", async () => {
    const res = await fetch(`${BASE}/en/agency`, { redirect: "manual" });
    if (res.status >= 400) throw new Error(`GET /en/agency → ${res.status}`);
    return `GET /en/agency → ${res.status}`;
  });

  await check("an agent can sign in", async () => {
    const start = await api<{ demoCode?: string; codeRequired: boolean }>("/api/agency/session", {
      body: { email: AGENT },
    });
    if (!start.ok) throw new Error(`sign-in request refused: ${start.status}`);
    // Only a demo environment echoes the code. Anywhere else this run cannot
    // hold a session, and saying so beats forty misleading 401s.
    if (start.data?.codeRequired && !start.data.demoCode) {
      return "SKIP: this environment does not echo the code, so no session can be held";
    }
    const done = await api<{ session: { permission: string; agencyName: string } }>("/api/agency/session", {
      method: "PUT",
      body: { email: AGENT, code: start.data?.demoCode },
    });
    if (!done.ok) throw new Error(`code refused: ${done.status}`);
    return `${done.data!.session.agencyName} · ${done.data!.session.permission}`;
  });

  await check("the session survives the next request", async () => {
    const me = await api<{ agency: { credit: { limit: number; currency: string } } }>("/api/agency/me");
    if (!me.ok) throw new Error(`/api/agency/me → ${me.status}`);
    const credit = me.data!.agency.credit;
    return `credit ${credit.limit} ${credit.currency}`;
  });

  /* ------------------------------------------------------------ suggestions */

  section("Destination");

  await check("one letter suggests nothing", async () => {
    const res = await api<{ suggestions: Suggestion[] }>("/api/search/suggestions?q=s&locale=en");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    // The field debounces below two characters; the endpoint must agree, or a
    // paste of one character fans out across the whole catalogue.
    return `${res.data!.suggestions.length} suggestions for "s"`;
  });

  await check("a city resolves", async () => {
    const res = await api<{ suggestions: Suggestion[] }>("/api/search/suggestions?q=Singapore&locale=en");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    const hit = res.data!.suggestions.find((s) => s.type === "city");
    if (!hit) throw new Error(`no city among ${res.data!.suggestions.length} suggestions`);
    city = hit;
    return `${hit.label} (${hit.id}) — ${res.data!.suggestions.length} suggestions`;
  });

  await check("a partial word resolves", async () => {
    const res = await api<{ suggestions: Suggestion[] }>("/api/search/suggestions?q=duba&locale=en");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    const labels = res.data!.suggestions.slice(0, 3).map((s) => s.label);
    if (!labels.length) throw new Error(`"duba" suggested nothing`);
    return labels.join(", ");
  });

  await check("a misspelling still finds the city", async () => {
    const res = await api<{ suggestions: Suggestion[] }>("/api/search/suggestions?q=singapor&locale=en");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    if (!res.data!.suggestions.length) {
      return "WARN: \"singapor\" suggests nothing — a dropped last letter is the commonest typo there is";
    }
    return `${res.data!.suggestions[0].label}`;
  });

  await check("Arabic finds the same places", async () => {
    const res = await api<{ suggestions: Suggestion[] }>(
      `/api/search/suggestions?q=${encodeURIComponent("دبي")}&locale=ar`,
    );
    if (!res.ok) throw new Error(`→ ${res.status}`);
    if (!res.data!.suggestions.length) return "WARN: an Arabic query suggests nothing";
    return `${res.data!.suggestions[0].label}`;
  });

  await check("nonsense suggests nothing, and says so calmly", async () => {
    const res = await api<{ suggestions: Suggestion[] }>("/api/search/suggestions?q=zzzqqxnowhere&locale=en");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    if (res.data!.suggestions.length) throw new Error(`invented ${res.data!.suggestions.length} places`);
    return "empty list, 200";
  });

  await check("a hostile query is not reflected back", async () => {
    const q = "<script>alert(1)</script>";
    const res = await fetch(`${BASE}/api/search/suggestions?q=${encodeURIComponent(q)}&locale=en`);
    const text = await res.text();
    if (text.includes("<script>")) throw new Error("the raw script tag came back in the response");
    if (res.headers.get("x-content-type-options") !== "nosniff") {
      return "WARN: stripped, but the response does not forbid content sniffing";
    }
    return `${res.status} · stripped · nosniff`;
  });

  /* ------------------------------------------------- typing without picking */

  section("Typing a city without picking one");

  /**
   * The most common way this form is used, and until now the one it refused.
   *
   * The resolution itself happens in the browser, so what is checked here is
   * the pair the browser depends on: that the suggestions endpoint answers the
   * typed text, and that the rule settles it onto something the search will
   * then accept. If either half moves, the field goes back to scolding an agent
   * who spelled the city correctly.
   */
  for (const typed of ["Singapore", "dubai", "BANGKOK"]) {
    await check(`"${typed}" settles without a click`, async () => {
      const res = await api<{ suggestions: Suggestion[] }>(
        `/api/search/suggestions?q=${encodeURIComponent(typed)}&locale=en`,
      );
      if (!res.ok) throw new Error(`suggestions → ${res.status}`);
      const match = matchDestination(typed, res.data!.suggestions as never);
      if (!isConfident(match) || !match.suggestion) {
        throw new Error(`${match.confidence} — the agent would still be asked to pick from the list`);
      }
      const page = await supplied(intentFor(match.suggestion.id, { destinationDisplay: match.suggestion.label }));
      return `${match.confidence} → ${match.suggestion.label} · ${page.totalCount} properties`;
    });
  }

  await check("an ambiguous name is still asked about", async () => {
    // The safety half of the same rule: a name that is two different places
    // must not be settled for the agent.
    const match = matchDestination("Cairo", [
      { id: "eg", label: "Cairo", type: "city", countryCode: "EG" },
      { id: "us", label: "Cairo", type: "city", countryCode: "US" },
    ] as never);
    if (isConfident(match)) throw new Error("two cities called Cairo were resolved to one of them");
    return `${match.confidence}, as it should be`;
  });

  /* ------------------------------------------------------------- validation */

  section("What the form refuses");

  const bad: [string, Record<string, unknown>, string][] = [
    ["no destination", { ...intentFor(""), destinationId: "" }, "destinationId"],
    ["check-in in the past", intentFor("x", { checkIn: iso(-3), checkOut: iso(2) }), "dates"],
    ["check-out before check-in", intentFor("x", { checkIn: iso(30), checkOut: iso(29) }), "dates"],
    ["a zero-night stay", intentFor("x", { checkIn: iso(30), checkOut: iso(30) }), "dates"],
    ["nine rooms", intentFor("x", { rooms: Array.from({ length: 9 }, () => ({ adults: 1, childrenAges: [] })) }), "rooms"],
    ["a room with no adult", intentFor("x", { rooms: [{ adults: 0, childrenAges: [] }] }), "rooms.0.adults"],
    ["seven adults in one room", intentFor("x", { rooms: [{ adults: 7, childrenAges: [] }] }), "rooms.0.adults"],
    ["five children in one room", intentFor("x", { rooms: [{ adults: 2, childrenAges: [1, 2, 3, 4, 5] }] }), "rooms.0.children"],
    ["a child aged 30", intentFor("x", { rooms: [{ adults: 2, childrenAges: [30] }] }), "rooms.0.childrenAges.0"],
  ];

  for (const [label, intent, field] of bad) {
    await check(`refuses ${label}`, async () => {
      const res = await search(intent as ReturnType<typeof intentFor>);
      if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`);
      const fields = res.error?.fields ?? {};
      if (!(field in fields)) throw new Error(`422 but no "${field}" — got ${Object.keys(fields).join(", ") || "nothing"}`);
      return `422 · ${field}`;
    });
  }

  await check("a missing body is refused, not crashed on", async () => {
    const res = await api("/api/hotels/search", { method: "POST", body: {} });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  /* ----------------------------------------------------------------- search */

  section("The search itself");

  if (!city) {
    results.push({
      group,
      name: "search",
      verdict: "SKIP",
      detail: "no destination resolved, so nothing below could run",
      ms: 0,
    });
    return;
  }

  let firstPage: SearchResponse | null = null;

  await check("a plain two-adult search returns supply", async () => {
    const page = await supplied(intentFor(city!.id, { destinationDisplay: city!.label }));
    firstPage = page;
    const down = page.sourcesUnavailable ?? 0;
    const detail = `${page.totalCount} properties · ${page.completeness}${down ? ` · ${down} source(s) down` : ""}`;
    if (!page.totalCount) throw new SupplyUnavailable(`no supply at all — ${detail}`);
    if (down) return `WARN: ${detail}`;
    return detail;
  });

  await check("every card carries what a row needs to render", async () => {
    if (!firstPage?.results.length) return "SKIP: nothing came back to inspect";
    const missing: string[] = [];
    for (const card of firstPage.results) {
      if (!card.name?.trim()) missing.push(`${card.canonicalHotelId}: no name`);
      if (!card.slug?.trim()) missing.push(`${card.canonicalHotelId}: no slug`);
      if (!card.offerSummary?.offerId) missing.push(`${card.name}: no offerId`);
      if (!(card.price?.total > 0)) missing.push(`${card.name}: no price`);
      if (!card.price?.currency) missing.push(`${card.name}: no currency`);
    }
    if (missing.length) throw new Error(missing.slice(0, 4).join("; "));
    return `${firstPage.results.length} cards complete`;
  });

  await check("prices come back in the currency that was asked for", async () => {
    if (!firstPage?.results.length) return "SKIP: nothing came back";
    const wrong = firstPage.results.filter((c) => c.price.currency !== "USD");
    if (wrong.length) throw new Error(`${wrong.length} card(s) priced in ${wrong[0].price.currency}, not USD`);
    return "all USD";
  });

  await check("the same search twice gives the same page", async () => {
    if (!firstPage) return "SKIP: no first page";
    const again = await supplied(intentFor(city!.id, { destinationDisplay: city!.label }));
    const a = firstPage.results.map((c) => c.canonicalHotelId).join(",");
    const b = again.results.map((c) => c.canonicalHotelId).join(",");
    if (a !== b) {
      return `WARN: the order changed between two identical searches (${firstPage.totalCount} vs ${again.totalCount})`;
    }
    return `stable · ${again.totalCount} properties`;
  });

  await check("a family with children is searchable", async () => {
    const page = await supplied(
      intentFor(city!.id, { rooms: [{ adults: 2, childrenAges: [4, 9] }], destinationDisplay: city!.label }),
    );
    if (!page.totalCount) return "WARN: no supply for 2 adults + 2 children on these dates";
    return `${page.totalCount} properties for 2 adults + 2 children`;
  });

  await check("a multi-room party is searchable", async () => {
    const page = await supplied(
      intentFor(city!.id, {
        rooms: [
          { adults: 2, childrenAges: [] },
          { adults: 2, childrenAges: [] },
          { adults: 1, childrenAges: [] },
        ],
        destinationDisplay: city!.label,
      }),
    );
    if (!page.totalCount) return "WARN: no supply for a 3-room party on these dates";
    /*
     * The comparison that has bitten twice. One supplier quotes a room and the
     * other quotes the whole party, so a page that mixes them is only sortable
     * if every row says how much of the party it covers.
     */
    const uncovered = page.results.filter((c) => !c.price.roomsCovered);
    if (uncovered.length) {
      throw new Error(`${uncovered.length} row(s) do not say how many rooms they cover — the page cannot be sorted by price`);
    }
    return `${page.totalCount} properties · every row states its room coverage`;
  });

  await check("tomorrow is searchable", async () => {
    const page = await supplied(intentFor(city!.id, { checkIn: iso(1), checkOut: iso(2) }));
    if (!page.totalCount) return "WARN: nothing available for tomorrow night";
    return `${page.totalCount} properties`;
  });

  await check("a stay a year out is searchable", async () => {
    const page = await supplied(intentFor(city!.id, { checkIn: iso(360), checkOut: iso(363) }));
    if (!page.totalCount) return "WARN: nothing available 360 days out";
    return `${page.totalCount} properties`;
  });

  await check("a fortnight is searchable", async () => {
    const page = await supplied(intentFor(city!.id, { checkIn: iso(40), checkOut: iso(54) }));
    if (!page.totalCount) return "WARN: nothing available for a 14-night stay";
    return `${page.totalCount} properties · 14 nights`;
  });

  /* ---------------------------------------------------------------- facets */

  section("Filters and sort");

  await check("the star facet matches what the filter gives", async () => {
    if (!firstPage) return "SKIP: no page to read facets from";
    const facets = firstPage.facets as { categories?: { value: number; count: number }[] };
    const star = facets.categories?.find((s) => s.count > 0);
    if (!star) return "SKIP: no star facet with a count on this page";
    const page = await supplied(intentFor(city!.id), { filters: { categories: [star.value] } });
    if (page.totalCount !== star.count) {
      throw new Error(`the ${star.value}-star facet said ${star.count}, the filter gave ${page.totalCount}`);
    }
    return `${star.value}★ · facet ${star.count} = filtered ${page.totalCount}`;
  });

  await check("the board facet matches what the filter gives", async () => {
    if (!firstPage) return "SKIP: no page to read facets from";
    const facets = firstPage.facets as { boards?: { code: string; label: string; count: number }[] };
    const board = facets.boards?.find((b) => b.count > 0);
    if (!board) return "SKIP: no board facet with a count on this page";
    const page = await supplied(intentFor(city!.id), { filters: { boards: [board.code] } });
    if (page.totalCount !== board.count) {
      throw new Error(`"${board.label}" said ${board.count}, the filter gave ${page.totalCount}`);
    }
    return `${board.label} · ${board.count}`;
  });

  await check("refundable-only narrows and stays non-empty", async () => {
    if (!firstPage) return "SKIP: nothing to compare against";
    const page = await supplied(intentFor(city!.id), { filters: { refundableOnly: true } });
    if (page.totalCount > firstPage.totalCount) {
      throw new Error(`refundable-only returned MORE (${page.totalCount}) than unfiltered (${firstPage.totalCount})`);
    }
    if (!page.totalCount) return "WARN: no refundable rate in this city on these dates";
    return `${page.totalCount} of ${firstPage.totalCount}`;
  });

  await check("a price ceiling is respected", async () => {
    if (!firstPage?.results.length) return "SKIP: no page to take a price from";
    const totals = firstPage.results.map((c) => c.price.total).sort((a, b) => a - b);
    const ceiling = Math.round(totals[Math.floor(totals.length / 2)]);
    const page = await supplied(intentFor(city!.id), { filters: { maxPrice: ceiling } });
    const over = page.results.filter((c) => c.price.total > ceiling + 0.5);
    if (over.length) {
      throw new Error(`${over.length} row(s) above the ${ceiling} ceiling — highest ${Math.round(over[0].price.total)}`);
    }
    return `${page.totalCount} at or under ${ceiling} USD`;
  });

  await check("an impossible filter empties the page rather than ignoring itself", async () => {
    const page = await supplied(intentFor(city!.id), { filters: { maxPrice: 1 } });
    if (page.totalCount > 0) throw new Error(`a 1 USD ceiling still returned ${page.totalCount} properties`);
    return "0 properties, as asked";
  });

  /*
   * Per-room against per-party is the comparison the page is actually sorted
   * on: one supplier quotes a room and the other quotes the whole booking, so
   * the raw totals are not comparable and never were.
   */
  const perRoom = (c: Card) => c.price.total / Math.max(1, c.price.roomsCovered ?? 1);

  await check("cheapest-first really is cheapest-first", async () => {
    const page = await supplied(intentFor(city!.id), { sort: "priceAsc" });
    const rows = page.results;
    if (rows.length < 2) return "SKIP: fewer than two rows to order";
    for (let i = 1; i < rows.length; i++) {
      if (perRoom(rows[i]) < perRoom(rows[i - 1]) - 0.5) {
        throw new Error(
          `row ${i + 1} (${Math.round(perRoom(rows[i]))}) is cheaper than row ${i} (${Math.round(perRoom(rows[i - 1]))})`,
        );
      }
    }
    return `${rows.length} rows ascending · ${Math.round(perRoom(rows[0]))} → ${Math.round(perRoom(rows[rows.length - 1]))}`;
  });

  await check("dearest-first is the exact reverse", async () => {
    const page = await supplied(intentFor(city!.id), { sort: "priceDesc" });
    const rows = page.results;
    if (rows.length < 2) return "SKIP: fewer than two rows to order";
    for (let i = 1; i < rows.length; i++) {
      if (perRoom(rows[i]) > perRoom(rows[i - 1]) + 0.5) throw new Error(`row ${i + 1} is dearer than row ${i}`);
    }
    return `${rows.length} rows descending`;
  });

  await check("a filter and a sort together do not lose the filter", async () => {
    const sorted = await supplied(intentFor(city!.id), { filters: { refundableOnly: true }, sort: "priceAsc" });
    const plain = await supplied(intentFor(city!.id), { filters: { refundableOnly: true } });
    if (sorted.totalCount !== plain.totalCount) {
      throw new Error(`sorting changed the count: ${plain.totalCount} → ${sorted.totalCount}`);
    }
    return `${sorted.totalCount} either way`;
  });

  /* ------------------------------------------------------------------ paging */

  section("Paging");

  /*
   * Paging is cumulative: "load more" appends, so page two is page one plus
   * twelve. Asserted as the prefix property rather than as a window, because a
   * window is what this looked like from outside and the difference is the
   * whole reason the screen can append without stitching.
   */
  await check("load more extends the page rather than replacing it", async () => {
    if (!firstPage) return "SKIP: no first page";
    if (firstPage.totalCount <= firstPage.results.length) return "SKIP: everything fits on one page";
    const two = await supplied(intentFor(city!.id), { page: 2 });
    const before = firstPage.results.map((c) => c.canonicalHotelId);
    const after = two.results.map((c) => c.canonicalHotelId);
    if (after.length <= before.length) {
      throw new Error(`page 2 returned ${after.length} rows, page 1 returned ${before.length}`);
    }
    if (after.slice(0, before.length).join(",") !== before.join(",")) {
      throw new Error("the rows already read changed underneath the agent when they asked for more");
    }
    if (new Set(after).size !== after.length) throw new Error("the extended page repeats a property");
    return `${before.length} → ${after.length} rows, the first ${before.length} unchanged`;
  });

  await check("an absurd page cannot pull the whole city in one request", async () => {
    const page = await supplied(intentFor(city!.id), { page: 9_999, pageSize: 10_000 });
    // Both numbers come from the request body; unclamped, this is one call for
    // every row a large city has.
    if (page.results.length > 1_920) throw new Error(`${page.results.length} rows came back for one request`);
    if (page.pageSize > 48) throw new Error(`pageSize ${page.pageSize} was accepted`);
    return `${page.results.length} rows · pageSize clamped to ${page.pageSize}`;
  });

  /* ----------------------------------------------------------- trade prices */

  section("Cost, sell and margin");

  await check("every row on the page can be priced", async () => {
    if (!firstPage?.results.length) return "SKIP: no rows to price";
    const offerIds = firstPage.results.map((c) => c.offerSummary.offerId);
    const res = await api<{ quotes: Quote[] }>("/api/agency/quote", { body: { offerIds } });
    if (!res.ok) throw new Error(`→ ${res.status} ${res.error?.message ?? ""}`);
    const quotes = res.data!.quotes;
    if (quotes.length < offerIds.length) {
      throw new Error(`${offerIds.length} rows asked, ${quotes.length} priced — the rest would show "price unavailable"`);
    }
    const broken = quotes.filter((q) => !(q.cost > 0) || !(q.sell > 0));
    if (broken.length) throw new Error(`${broken.length} quote(s) with a zero cost or sell`);
    return `${quotes.length} priced`;
  });

  await check("the agency always makes money on the sell", async () => {
    if (!firstPage?.results.length) return "SKIP: no rows to price";
    const res = await api<{ quotes: Quote[] }>("/api/agency/quote", {
      body: { offerIds: firstPage.results.map((c) => c.offerSummary.offerId) },
    });
    if (!res.ok) return "SKIP: pricing did not answer";
    const wrong = res.data!.quotes.filter((q) => q.sell < q.cost || Math.abs(q.margin - (q.sell - q.cost)) > 0.51);
    if (wrong.length) {
      const q = wrong[0];
      throw new Error(`cost ${q.cost} sell ${q.sell} margin ${q.margin} — margin is not sell − cost`);
    }
    const margins = res.data!.quotes.map((q) => q.margin);
    return `margin ${Math.round(Math.min(...margins))}–${Math.round(Math.max(...margins))} ${res.data!.quotes[0].currency}`;
  });

  await check("an expired offer is left out rather than faked", async () => {
    const res = await api<{ quotes: Quote[] }>("/api/agency/quote", { body: { offerIds: ["off_does_not_exist"] } });
    if (!res.ok) throw new Error(`→ ${res.status}`);
    if (res.data!.quotes.length) throw new Error("an unknown offer was priced anyway");
    return "0 quotes, 200 — the caller can tell which ids are stale";
  });

  await check("pricing needs a session", async () => {
    const held = new Map(jar);
    jar.clear();
    const res = await api("/api/agency/quote", { body: { offerIds: ["anything"] } });
    for (const [k, v] of held) jar.set(k, v);
    if (res.status !== 401) throw new Error(`expected 401 without a session, got ${res.status}`);
    return "401";
  });

  /* ------------------------------------------------------------- no results */

  section("When nothing comes back");

  await check("an unknown destination gives an empty page, not a crash", async () => {
    const res = await search(intentFor("city_nowhere_at_all"));
    if (!res.ok && res.status !== 503) throw new Error(`→ ${res.status}`);
    if (res.ok && res.data!.totalCount > 0) throw new Error("an invented destination returned supply");
    return res.ok ? `0 properties · ${res.data!.completeness}` : "503 with a retry action";
  });

  await check("an empty page explains itself", async () => {
    const page = await supplied(intentFor(city!.id), { filters: { maxPrice: 1 } });
    if (page.totalCount) return "SKIP: the page was not empty";
    // Either recovery or a stated cause. An empty page with neither is the one
    // that reads as a broken screen.
    const recovery = Boolean(page.recovery?.nearbyDates.length || page.recovery?.nearbyDestinations.length);
    if (!recovery && !page.completenessMessage && page.completeness === "complete") {
      return "WARN: an empty page with no recovery options and no explanation";
    }
    return recovery
      ? `${page.recovery!.nearbyDates.length} date options, ${page.recovery!.nearbyDestinations.length} nearby places`
      : `explained: ${page.completeness}`;
  });

  /* ------------------------------------------------------------ trip prompt */

  section("Describe the trip");

  const sentences = [
    "2 rooms in Dubai for 3 nights in October",
    "family of 4 in Singapore next month, free cancellation",
    "cheap hotel in Bangkok this weekend",
  ];
  for (const text of sentences) {
    await check(`"${text}"`, async () => {
      const res = await api<{
        intent: { destinationId?: string; destinationDisplay?: string; checkIn?: string; rooms?: unknown[] } | null;
        filters: Record<string, unknown>;
        missing: string[];
      }>("/api/search/interpret", { body: { text, currency: "USD" } });
      if (!res.ok) throw new Error(`→ ${res.status}`);
      const intent = res.data!.intent;
      if (!intent?.destinationId) {
        return `WARN: no destination resolved — missing ${res.data!.missing.join(", ") || "(unstated)"}`;
      }
      const filters = Object.keys(res.data!.filters);
      return `${intent.destinationDisplay} · ${intent.checkIn} · ${intent.rooms?.length ?? 0} room(s)${filters.length ? ` · ${filters.join(", ")}` : ""}`;
    });
  }

  await check("an interpreted sentence is actually runnable", async () => {
    const res = await api<{ intent: ReturnType<typeof intentFor> | null; filters: Record<string, unknown> }>(
      "/api/search/interpret",
      { body: { text: "2 rooms in Dubai for 3 nights next month", currency: "USD" } },
    );
    if (!res.ok || !res.data!.intent) return "SKIP: the sentence did not interpret";
    const page = await supplied(res.data!.intent, { filters: res.data!.filters });
    return `${page.totalCount} properties from a typed sentence`;
  });

  /* ------------------------------------------------------ what must not leak */

  section("What the browser must never see");

  await check("no supplier identifier reaches the client (§9.4)", async () => {
    const page = await supplied(intentFor(city!.id));
    const json = JSON.stringify(page);
    /*
     * The whole response, not a spot check of the fields we remember. A field
     * added to a card six months from now is exactly how this leaks, and the
     * only test that catches that is one that reads everything.
     */
    const forbidden = [
      "rateKey",
      "rateCode",
      "RateCode",
      "hotelbeds",
      "Hotelbeds",
      "tourmind",
      "TourMind",
      "AgentRefID",
      "netRate",
      "supplierCurrency",
    ];
    const found = forbidden.filter((needle) => json.includes(needle));
    if (found.length) throw new Error(`the search response contains: ${found.join(", ")}`);
    return `${(json.length / 1024).toFixed(0)} KB scanned, clean`;
  });

  await check("a quote carries no supplier either", async () => {
    if (!firstPage?.results.length) return "SKIP: nothing to quote";
    const res = await api<{ quotes: Quote[] }>("/api/agency/quote", {
      body: { offerIds: firstPage.results.slice(0, 4).map((c) => c.offerSummary.offerId) },
    });
    if (!res.ok) return "SKIP: pricing did not answer";
    const json = JSON.stringify(res.data);
    const found = ["rateKey", "hotelbeds", "tourmind", "Hotelbeds", "TourMind", "netRate"].filter((n) => json.includes(n));
    if (found.length) throw new Error(`the quote response contains: ${found.join(", ")}`);
    return "clean";
  });

  /* -------------------------------------------------- on to the property page */

  section("Handing off to the property");

  await check("a card's slug opens a property with rooms", async () => {
    if (!firstPage?.results.length) return "SKIP: no card to follow";
    const card = firstPage.results[0];
    const detail = await api<{ hotel: { name: string } }>(`/api/hotels/${encodeURIComponent(card.slug)}`);
    if (!detail.ok) throw new Error(`GET /api/hotels/${card.slug} → ${detail.status}`);
    const avail = await api<{ offers?: unknown[] }>(`/api/hotels/${encodeURIComponent(card.slug)}/availability`, {
      body: { intent: intentFor(city!.id) },
    });
    if (avail.status >= 500) throw new SupplyUnavailable(`availability → ${avail.status}`);
    if (!avail.ok) throw new Error(`availability → ${avail.status}`);
    const count = (avail.data!.offers ?? []).length;
    if (!count) return `WARN: ${detail.data!.hotel.name} opened but offered no rooms for the same search`;
    return `${detail.data!.hotel.name} · ${count} rate(s)`;
  });

  await check("the page an agent lands on is priced for the same stay", async () => {
    if (!firstPage?.results.length) return "SKIP: no card to follow";
    const card = firstPage.results[0];
    const avail = await api<{ offers?: { price?: { total?: number }; roomsCovered?: number }[] }>(
      `/api/hotels/${encodeURIComponent(card.slug)}/availability`,
      { body: { intent: intentFor(city!.id) } },
    );
    if (avail.status >= 500) throw new SupplyUnavailable(`availability → ${avail.status}`);
    if (!avail.ok) return "SKIP: availability did not answer";
    const offers = avail.data!.offers ?? [];
    if (!offers.length) return "SKIP: no offers to compare";
    const cheapest = Math.min(
      ...offers.map((o) => (o.price?.total ?? Infinity) / Math.max(1, o.roomsCovered ?? 1)),
    );
    if (!Number.isFinite(cheapest)) return "SKIP: no totals on the offers";
    // The card advertises a "from" price; the property page must not open dearer
    // than the row the agent clicked, or the quote they just read was fiction.
    if (cheapest > card.price.total * 1.02) {
      return `WARN: the row said ${Math.round(card.price.total)} and the property opens at ${Math.round(cheapest)}`;
    }
    return `row ${Math.round(card.price.total)} · property from ${Math.round(cheapest)}`;
  });
}

/* ------------------------------------------------------- the portal itself */

/**
 * The agent portal is where an agent actually does this.
 *
 * It ships none of the backend — no route handlers, no supplier code, no
 * catalogue — so every case above reaches it only if the cross-origin path
 * holds: the preflight, the allowed origin, the cookie that has to survive a
 * cross-site request. Each of those has broken this portal once already, and
 * each of them is invisible from the backend's own origin.
 */
async function portalCases(): Promise<void> {
  section("The agent portal, on its own origin");

  if (!PORTAL) {
    results.push({ group, name: "portal", verdict: "SKIP", detail: "no --portal given", ms: 0 });
    return;
  }

  let reachable = false;

  await check("the portal is up", async () => {
    const res = await fetch(`${PORTAL}/en/agency`, { redirect: "manual" }).catch(() => null);
    if (!res) return `SKIP: nothing listening at ${PORTAL}`;
    if (res.status >= 400) throw new Error(`GET /en/agency → ${res.status}`);
    reachable = true;
    return `GET /en/agency → ${res.status}`;
  });

  if (!reachable) return;

  await check("its root goes to the portal, not to a 404", async () => {
    // The portal is only ever the portal, so `/` must land somewhere useful.
    // It did not, and the deployed site answered its own front door with 404.
    const res = await fetch(`${PORTAL}/`, { redirect: "manual" });
    const to = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400) {
      if (!to.includes("/agency")) throw new Error(`/ redirects to ${to}, which is not the portal`);
      return `${res.status} → ${to}`;
    }
    if (res.status !== 200) throw new Error(`/ → ${res.status}`);
    return "200";
  });

  await check("the search screen renders", async () => {
    const res = await fetch(`${PORTAL}/en/agency/search`);
    if (!res.ok) throw new Error(`→ ${res.status}`);
    const html = await res.text();
    // Server-rendered shell, not a blank page waiting on JavaScript.
    if (!/<\/html>/i.test(html)) throw new Error("the response is not a complete document");
    return `${res.status} · ${(html.length / 1024).toFixed(0)} KB`;
  });

  await check("no page ships an unfilled placeholder", async () => {
    /*
     * The dictionaries are checked in the suite; this checks the call sites,
     * which is where the failure actually happened. Two `generateMetadata`
     * functions asked for a string carrying `{properties}` and `{cities}` and
     * passed neither, so the home page's Google snippet read
     * "{properties} places to stay in {cities} cities" for as long as it has
     * existed. No dictionary test can see that — only a rendered page can.
     */
    const pages = [
      `${PORTAL}/en/agency`,
      `${PORTAL}/en/agency/search`,
      `${BASE}/en`,
      `${BASE}/en/destinations`,
    ];
    const found: string[] = [];
    for (const url of pages) {
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) continue;
      const html = await res.text();
      // Braces are ordinary inside the inlined script payloads a framework
      // ships; only our own `{word}` shape, in text a reader would see, counts.
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "");
      for (const match of new Set(visible.match(/\{[a-z][a-zA-Z]{2,15}\}/g) ?? [])) {
        found.push(`${new URL(url).pathname} ${match}`);
      }
    }
    if (found.length) throw new Error(found.slice(0, 6).join(", "));
    return `${pages.length} pages clean`;
  });

  await check("the portal carries no backend of its own", async () => {
    /*
     * The whole point of the split. A route handler that reached the portal
     * would bring supplier code and credentials with it, onto a deployment
     * that is meant to hold neither.
     */
    const res = await fetch(`${PORTAL}/api/hotels/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: {} }),
    });
    if (res.status !== 404) throw new Error(`the portal answered its own /api/hotels/search with ${res.status}`);
    return "404, as it should be";
  });

  await check("the backend lets the portal in", async () => {
    const res = await fetch(`${BASE}/api/hotels/search`, {
      method: "OPTIONS",
      headers: { origin: PORTAL, "access-control-request-method": "POST" },
    });
    if (res.status !== 204) throw new Error(`preflight → ${res.status}`);
    if (res.headers.get("access-control-allow-origin") !== PORTAL) {
      throw new Error(`preflight allows "${res.headers.get("access-control-allow-origin")}", not ${PORTAL}`);
    }
    if (res.headers.get("access-control-allow-credentials") !== "true") {
      throw new Error("the preflight does not allow credentials, so the session cookie will never be sent");
    }
    if (!(res.headers.get("vary") ?? "").toLowerCase().includes("origin")) {
      // Without it a shared cache can hand one front end another's answer.
      return "WARN: allowed, but the response does not vary on Origin";
    }
    return "204 · origin allowed · credentials allowed · varies on Origin";
  });

  await check("a stranger's origin is not let in", async () => {
    const res = await fetch(`${BASE}/api/hotels/search`, {
      method: "OPTIONS",
      headers: { origin: "https://not-our-portal.example", "access-control-request-method": "POST" },
    });
    if (res.headers.get("access-control-allow-origin")) {
      throw new Error(`an unknown origin was allowed: ${res.headers.get("access-control-allow-origin")}`);
    }
    return "no CORS headers, so the browser blocks the read";
  });

  await check("a search from the portal's origin answers", async () => {
    if (!city) return "SKIP: no destination resolved";
    const res = await fetch(`${BASE}/api/hotels/search`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: PORTAL, cookie: cookieHeader() },
      body: JSON.stringify({ intent: intentFor(city.id), supply: "live", pageSize: 12 }),
    });
    if (res.status === 503) throw new SupplyUnavailable("no supplier answered this search");
    if (!res.ok) throw new Error(`→ ${res.status}`);
    if (res.headers.get("access-control-allow-origin") !== PORTAL) {
      throw new Error("the answer carries no allow-origin, so the portal's browser will discard it");
    }
    const body = (await res.json()) as { data?: SearchResponse };
    return `${body.data?.totalCount ?? 0} properties, readable from ${PORTAL}`;
  });

  await check("the session cookie can survive the trip", async () => {
    // The cookie is set when the code is verified, not when it is asked for.
    const asked = await fetch(`${BASE}/api/agency/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: PORTAL },
      body: JSON.stringify({ email: AGENT }),
    });
    if (!asked.ok) throw new Error(`sign-in → ${asked.status}`);
    const start = (await asked.json()) as { data?: { demoCode?: string; codeRequired?: boolean } };
    if (start.data?.codeRequired && !start.data.demoCode) {
      return "SKIP: this environment does not echo the code, so no session can be started here";
    }

    const res = await fetch(`${BASE}/api/agency/session`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: PORTAL },
      body: JSON.stringify({ email: AGENT, code: start.data?.demoCode }),
    });
    if (!res.ok) throw new Error(`code refused: ${res.status}`);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (!setCookies.length) throw new Error("signing in set no cookie at all");
    /*
     * A cross-site request sends nothing at all under the default `Lax`, and
     * the failure is silent: sign-in succeeds, every later call arrives
     * anonymous, and the portal shows its sign-in screen to somebody who has
     * just used it.
     */
    const weak = setCookies.filter((c) => !/samesite=none/i.test(c));
    if (weak.length) {
      return `WARN: ${weak.length} cookie(s) without SameSite=None will not be sent from ${PORTAL}`;
    }
    return `${setCookies.length} cookie(s), all cross-site capable`;
  });

  await check("prices are the agency's, not the public site's", async () => {
    /*
     * The portal renders the same card as the consumer site, so the one thing
     * that must differ is the money. An agent quoting the public price makes
     * the agency nothing, and nobody would notice until the statement.
     */
    if (!city) return "SKIP: no destination resolved";
    const page = await supplied(intentFor(city.id));
    if (!page.results.length) return "SKIP: nothing came back to price";
    const first = page.results[0];
    const res = await api<{ quotes: Quote[] }>("/api/agency/quote", {
      body: { offerIds: [first.offerSummary.offerId] },
    });
    if (!res.ok || !res.data!.quotes.length) return "SKIP: pricing did not answer";
    const quote = res.data!.quotes[0];
    if (quote.sell === first.price.total && quote.cost === first.price.total) {
      throw new Error("cost, sell and the public price are all the same number — no trade pricing was applied");
    }
    return `public ${Math.round(first.price.total)} · cost ${Math.round(quote.cost)} · sell ${Math.round(quote.sell)}`;
  });
}

/* ------------------------------------------------------------------ report */

function report(): void {
  const width = Math.max(...results.map((r) => r.name.length), 10);
  let current = "";
  console.log(`\n\n  Search-a-stay QA — ${BASE}\n  ${"=".repeat(60)}`);
  for (const r of results) {
    if (r.group !== current) {
      current = r.group;
      console.log(`\n  ${current}`);
    }
    console.log(`    ${pad(r.verdict)}  ${r.name.padEnd(width)}  ${r.detail}`);
  }

  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  console.log(
    `\n  ${"=".repeat(60)}\n  ${count("PASS")} passed · ${count("WARN")} warned (supply) · ` +
      `${count("SKIP")} skipped · ${count("FAIL")} failed\n`,
  );
  // Only our own defects set the exit code. A supplier having a bad afternoon
  // must not fail a build, or the run stops being read.
  if (count("FAIL")) process.exitCode = 1;
}

void run()
  .then(portalCases)
  .catch((error) => {
    console.error("\nThe run itself failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(report);
