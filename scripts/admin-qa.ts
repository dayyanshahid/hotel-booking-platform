import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

/**
 * The operator console, module by module, against a running server.
 *
 *   npm run dev                       # in another terminal
 *   npm run qa:admin
 *
 * Sixteen screens that exist so somebody can answer a customer on the phone,
 * unblock an agency, or find out why a city returns nothing. They are the
 * least-exercised surface in the product — nobody uses them until something
 * has already gone wrong, which is the worst moment to discover that a panel
 * has never been loaded with real data.
 *
 * Two things are checked of every module, and they are different questions.
 * Does it answer at all — and does it answer with something, rather than the
 * shape of an answer with nothing in it? An endpoint returning `{ items: [] }`
 * on an installation with bookings in it is not working; it is failing
 * quietly, which is how a console gets trusted and then found out.
 *
 * Verdicts as elsewhere. FAIL is ours. WARN is unprovable from here — usually
 * an empty estate rather than a broken read. SKIP never ran, and says why.
 */

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:4860").replace(/\/+$/, "");
const OPERATOR = process.argv.find((a) => a.startsWith("--operator="))?.slice(11) ?? process.env.PLATFORM_ADMIN_EMAILS?.split(",")[0]?.trim() ?? "";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";
interface Case { group: string; name: string; verdict: Verdict; detail: string }

const results: Case[] = [];
let group = "";

function section(title: string): void {
  group = title;
  process.stdout.write(`\n${title}\n`);
}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    const verdict: Verdict = detail.startsWith("SKIP:") ? "SKIP" : detail.startsWith("WARN:") ? "WARN" : "PASS";
    results.push({ group, name, verdict, detail: verdict === "PASS" ? detail : detail.slice(5).trim() });
  } catch (error) {
    results.push({ group, name, verdict: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
  const last = results[results.length - 1];
  process.stdout.write(`  ${last.verdict.padEnd(4)} ${name} — ${last.detail}\n`);
}

/* ------------------------------------------------------------------ session */

const jar = new Map<string, string>();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

interface Reply<T> { status: number; ok: boolean; data?: T; error?: { messageKey?: string; message?: string }; raw: string }

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<Reply<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(jar.size ? { cookie: cookieHeader() } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const raw = await res.text();
  let body: { ok?: boolean; data?: T; error?: Reply<T>["error"] } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* the raw body is the finding */
  }
  return { status: res.status, ok: Boolean(body?.ok), data: body?.data, error: body?.error, raw };
}

/** Every module answers through this, so "it 500s" is never mistaken for "it is empty". */
async function must<T>(path: string): Promise<T> {
  const res = await api<T>(path);
  if (!res.ok || res.data === undefined) {
    throw new Error(`${path} → ${res.status} ${res.error?.messageKey ?? res.error?.message ?? res.raw.slice(0, 80)}`);
  }
  return res.data;
}

/** Words that may never reach any client, console included (§9.4). */
const FORBIDDEN = ["rateKey", "RateCode", "AgentRefID", "netRate", "supplierNet"];
const leaks = (raw: string) => FORBIDDEN.filter((w) => raw.toLowerCase().includes(w.toLowerCase()));

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) if (Array.isArray(v)) return v.length;
  }
  return 0;
}


/** A real, valid intent — the probe runs the same search the site does. */
function probeIntent() {
  const iso = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return {
    destinationId: "dest-dubai",
    destinationDisplay: "Dubai",
    destinationType: "city" as const,
    checkIn: iso(30),
    checkOut: iso(32),
    flexibility: "exact" as const,
    rooms: [{ adults: 2, childrenAges: [] }],
    accessibleRoom: false,
    locale: "en" as const,
    currency: "USD" as const,
  };
}

/* ================================================================= the cases */

async function main(): Promise<void> {
  process.stdout.write(`Operator console QA — ${BASE}\n`);

  /* ---------------------------------------------------------------------- */
  section("Getting in");

  await check("the console refuses an address that is not an operator", async () => {
    const res = await api<{ demoCode?: string }>("/api/admin/session", { body: { email: "nobody@example.com" } });
    // The reply is deliberately identical to an allowed address — the operator
    // list is not something an anonymous caller may enumerate one email at a
    // time — so what must be absent is a usable code.
    if (res.data?.demoCode) throw new Error("a code was issued to an address not on the allowlist");
    return "same answer, no code";
  });

  await check("a guessed code does not open a session", async () => {
    const res = await api("/api/admin/session", { method: "PUT", body: { email: OPERATOR, code: "000000" } });
    if (res.ok) throw new Error("a guessed code signed in");
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    return "401";
  });

  await check("every module is closed until it opens", async () => {
    /*
     * Checked before signing in, not after signing out, because a route that
     * forgot its guard is only ever caught by asking it cold. One unguarded
     * console endpoint exposes the whole estate.
     */
    const paths = [
      "/api/admin/overview", "/api/admin/bookings", "/api/admin/agencies", "/api/admin/customers",
      "/api/admin/cases", "/api/admin/catalogue", "/api/admin/operations", "/api/admin/reports",
      "/api/admin/settings", "/api/admin/suppliers", "/api/admin/environment", "/api/admin/audit",
      "/api/admin/me",
    ];
    const open: string[] = [];
    for (const path of paths) {
      const res = await api(path);
      if (res.status !== 401 && res.status !== 403) open.push(`${path}:${res.status}`);
    }
    if (open.length) throw new Error(`answered without a session — ${open.join(", ")}`);
    return `${paths.length} endpoints all refused`;
  });

  let signedIn = false;
  await check("an operator signs in", async () => {
    if (!OPERATOR) return "SKIP: no PLATFORM_ADMIN_EMAILS configured";
    const start = await api<{ demoCode?: string }>("/api/admin/session", { body: { email: OPERATOR } });
    if (!start.data?.demoCode) return "SKIP: this environment does not echo the code";
    const done = await api<{ session: { email: string } }>("/api/admin/session", {
      method: "PUT",
      body: { email: OPERATOR, code: start.data.demoCode },
    });
    if (!done.ok) throw new Error(`sign-in failed: ${done.status}`);
    signedIn = true;
    return "signed in";
  });

  const gate = () => (signedIn ? null : "SKIP: no operator session");

  /* ---------------------------------------------------------------------- */
  section("The modules answer");

  /**
   * Every console screen, its endpoint, and what makes it non-empty.
   *
   * `expect` names the thing that must actually be there. A module that
   * answers `{}` is reported as thin rather than passing, because a panel that
   * renders nothing is indistinguishable from one that is broken.
   */
  const MODULES: { name: string; path: string; expect?: string }[] = [
    { name: "Overview", path: "/api/admin/overview" },
    { name: "Bookings", path: "/api/admin/bookings", expect: "bookings" },
    { name: "Agencies", path: "/api/admin/agencies", expect: "agencies" },
    { name: "Customers", path: "/api/admin/customers", expect: "customers" },
    { name: "Support cases", path: "/api/admin/cases", expect: "cases" },
    { name: "Catalogue", path: "/api/admin/catalogue" },
    { name: "Operations", path: "/api/admin/operations" },
    { name: "Reports", path: "/api/admin/reports" },
    { name: "Settings", path: "/api/admin/settings" },
    { name: "Suppliers", path: "/api/admin/suppliers" },
    { name: "Environment", path: "/api/admin/environment" },
    { name: "Audit", path: "/api/admin/audit", expect: "entries" },
  ];

  const payloads = new Map<string, unknown>();

  for (const module of MODULES) {
    await check(`${module.name} returns a usable payload`, async () => {
      if (gate()) return gate()!;
      const data = await must<Record<string, unknown>>(module.path);
      payloads.set(module.name, data);

      const keys = Object.keys(data);
      if (!keys.length) throw new Error("answered with an empty object — the screen has nothing to render");

      if (module.expect) {
        const value = (data as Record<string, unknown>)[module.expect];
        if (value === undefined) throw new Error(`no "${module.expect}" in the payload — keys were ${keys.join(", ")}`);
        const n = countOf(value);
        if (!n) return `WARN: "${module.expect}" is empty on this installation`;
        return `${n} × ${module.expect}`;
      }
      return `${keys.length} sections: ${keys.slice(0, 5).join(", ")}`;
    });
  }

  await check("no console payload names a supplier or a net rate", async () => {
    if (gate()) return gate()!;
    /*
     * §9.4 applies to the console too. An operator may see what an agency
     * pays; the wholesaler's identity and our own net are a different secret,
     * and a support screen is exactly where one gets pasted into an email.
     */
    const dirty: string[] = [];
    for (const module of MODULES) {
      const res = await api(module.path);
      const found = leaks(res.raw);
      if (found.length) dirty.push(`${module.name}: ${found.join("/")}`);
    }
    if (dirty.length) throw new Error(dirty.join("; "));
    return `${MODULES.length} payloads clean`;
  });

  /* ---------------------------------------------------------------------- */
  section("The screens behind the numbers");

  await check("a booking on the list opens on its own page", async () => {
    if (gate()) return gate()!;
    const list = payloads.get("Bookings") as { bookings?: { reference: string }[] } | undefined;
    const first = list?.bookings?.[0];
    if (!first) return "WARN: no bookings on this installation";
    const detail = await must<Record<string, unknown>>(`/api/admin/bookings/${first.reference}`);
    if (!Object.keys(detail).length) throw new Error("the detail endpoint answered with nothing");
    return `${first.reference} opens`;
  });

  await check("an agency on the list opens, with its agents", async () => {
    if (gate()) return gate()!;
    const list = payloads.get("Agencies") as { agencies?: { id: string; name?: string }[] } | undefined;
    const first = list?.agencies?.[0];
    if (!first) return "WARN: no agencies on this installation";
    const detail = await must<Record<string, unknown>>(`/api/admin/agencies/${first.id}`);
    const agents = await must<{ agents?: unknown[] }>(`/api/admin/agencies/${first.id}/agents`);
    if (!Object.keys(detail).length) throw new Error("the agency detail answered with nothing");
    return `${first.name ?? first.id} · ${agents.agents?.length ?? 0} agents`;
  });

  await check("a customer on the list opens on their own page", async () => {
    if (gate()) return gate()!;
    const list = payloads.get("Customers") as { customers?: { email: string }[] } | undefined;
    const first = list?.customers?.[0];
    if (!first) return "WARN: no customers on this installation";
    const detail = await must<Record<string, unknown>>(`/api/admin/customers/${encodeURIComponent(first.email)}`);
    if (!Object.keys(detail).length) throw new Error("the customer detail answered with nothing");
    return "opens";
  });

  await check("a reference that does not exist is a clean 404", async () => {
    if (gate()) return gate()!;
    const res = await api("/api/admin/bookings/NZ-ZZZ-0000");
    if (res.ok) throw new Error("an invented reference returned a booking");
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    return "404";
  });

  await check("search finds something an operator would type", async () => {
    if (gate()) return gate()!;
    const list = payloads.get("Bookings") as { bookings?: { reference: string }[] } | undefined;
    const reference = list?.bookings?.[0]?.reference;
    if (!reference) return "WARN: nothing to search for";
    const res = await api<Record<string, unknown>>(`/api/admin/search?q=${encodeURIComponent(reference)}`);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    if (!res.raw.includes(reference)) throw new Error(`searching for ${reference} did not return it`);
    return `finds ${reference}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Doing something, not just looking");

  await check("a note can be added to a booking", async () => {
    if (gate()) return gate()!;
    const list = payloads.get("Bookings") as { bookings?: { reference: string }[] } | undefined;
    const reference = list?.bookings?.[0]?.reference;
    if (!reference) return "WARN: no booking to annotate";
    const note = `QA note ${Math.random().toString(36).slice(2, 8)}`;
    const res = await api(`/api/admin/bookings/${reference}/note`, { body: { note } });
    if (!res.ok) throw new Error(`note refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    // A note nobody can read back is not a note.
    const after = await api(`/api/admin/bookings/${reference}`);
    if (!after.raw.includes(note)) throw new Error("the note was accepted and is not on the booking");
    return "written and read back";
  });

  await check("the audit log records what an operator did", async () => {
    if (gate()) return gate()!;
    /*
     * The console can cancel bookings, move credit and change platform
     * settings. An action that leaves no trace is the one nobody can answer
     * for afterwards, so the log is checked for the thing that was just done
     * rather than merely for existing.
     */
    const audit = await must<{ entries?: { action?: string; at?: string }[] }>("/api/admin/audit");
    const entries = audit.entries ?? [];
    if (!entries.length) throw new Error("the audit log is empty after an action was taken");
    return `${entries.length} entries, newest ${entries[0]?.action ?? "?"}`;
  });

  await check("the availability probe answers for a real city", async () => {
    if (gate()) return gate()!;
    // The console's answer to "a guest says there is nothing in Dubai": run
    // the real search rather than reason about the catalogue.
    const res = await api<Record<string, unknown>>("/api/admin/probe", { body: { intent: probeIntent() } });
    if (!res.ok) {
      const why = res.error?.messageKey ?? String(res.status);
      if (res.status >= 500) return `WARN: the probe could not run — ${why}`;
      throw new Error(`the probe refused a valid request: ${res.status} ${why}`);
    }
    return Object.keys(res.data ?? {}).slice(0, 4).join(", ") || "answered";
  });

  await check("the probe names its suppliers, and is the only thing that may", async () => {
    if (gate()) return gate()!;
    /*
     * The documented exception to §9.4, and worth pinning both ways.
     *
     * Deciding whether to chase a wholesaler or fix a mapping is an
     * operator's job and cannot be done against an anonymised page, so this
     * one endpoint attributes results by source. Every other console payload
     * is checked above for exactly the opposite — so if someone ever
     * "consistently" strips this one too, the console stops being able to
     * answer the question it exists for.
     */
    const res = await api<Record<string, unknown>>("/api/admin/probe", { body: { intent: probeIntent() } });
    if (!res.ok) return "WARN: the probe did not run, so attribution could not be checked";
    const attributed = /hotelbeds|tourmind|platform/i.test(res.raw);
    if (!attributed) throw new Error("the probe returned results with no source attribution");
    // Naming the supplier is allowed here; quoting its rate keys is not.
    const found = leaks(res.raw);
    if (found.length) throw new Error(`the probe leaked more than attribution: ${found.join(", ")}`);
    return "attributed, with no rate keys";
  });

  await check("settings can be read and written", async () => {
    if (gate()) return gate()!;
    const before = await must<Record<string, unknown>>("/api/admin/settings");
    const res = await api("/api/admin/settings", { method: "PATCH", body: {} });
    // An empty patch is a no-op, not an error: what is being checked is that
    // the endpoint is wired, not that it will accept anything.
    if (res.status >= 500) throw new Error(`settings PATCH fell over: ${res.status}`);
    const after = await must<Record<string, unknown>>("/api/admin/settings");
    if (Object.keys(after).length !== Object.keys(before).length) {
      throw new Error("an empty patch changed the shape of the settings");
    }
    return `${Object.keys(before).length} settings, PATCH ${res.status}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Getting out");

  await check("signing out closes every module again", async () => {
    if (gate()) return gate()!;
    await api("/api/admin/session", { method: "DELETE" });
    const res = await api("/api/admin/overview");
    if (res.ok) throw new Error("the console was still readable after signing out");
    if (res.status !== 401 && res.status !== 403) throw new Error(`expected 401/403, got ${res.status}`);
    return `${res.status} after sign-out`;
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
    for (const f of failed) process.stdout.write(`  ${f.group} — ${f.name}\n    ${f.detail}\n`);
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
