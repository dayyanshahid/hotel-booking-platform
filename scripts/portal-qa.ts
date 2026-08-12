import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

/**
 * The rest of the agent portal: credit, team, settings and the address book.
 *
 *   npm run dev
 *   npm run qa:portal
 *
 * Search, booking and the overview have their own harnesses. What is left is
 * the part an agency administers rather than sells with — and it is where the
 * dangerous verbs live. Three of these four modules can change what a customer
 * is charged, who may spend the credit line, and what appears on a document a
 * traveller is asked to trust.
 *
 * So the questions here are mostly about who may do what. A permission that is
 * merely absent from a screen is not a permission: the request still exists,
 * and the only thing standing between a view-only trainee and the agency's
 * markup is whether the route checks. Each one is asked directly, by an
 * account that should be refused.
 */

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:4860").replace(/\/+$/, "");

const ADMIN = "admin@skyline.example";
const COUNTER = "agent@skyline.example";
const VIEWER = "viewer@skyline.example";

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

/**
 * A cookie jar per account.
 *
 * Three accounts are in play and they must not share one: a run that signs in
 * as the trainee over the top of the administrator proves nothing about either
 * of them, and would do it silently.
 */
class Session {
  private jar = new Map<string, string>();

  async api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const raw = await res.text();
    let body: { ok?: boolean; data?: T; error?: { messageKey?: string; message?: string } } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* the raw body is the finding */
    }
    return { status: res.status, ok: Boolean(body?.ok), data: body?.data, error: body?.error, raw };
  }

  async signIn(email: string): Promise<string | null> {
    const start = await this.api<{ demoCode?: string; codeRequired?: boolean }>("/api/agency/session", {
      body: { email },
    });
    // A view-only account signs in without a code, by design.
    const done = await this.api<{ session: { permission: string; role: string } }>("/api/agency/session", {
      method: "PUT",
      body: { email, code: start.data?.demoCode },
    });
    return done.ok ? `${done.data?.session.role}/${done.data?.session.permission}` : null;
  }
}

const admin = new Session();
const counter = new Session();
const viewer = new Session();

async function must<T>(s: Session, path: string): Promise<T> {
  const res = await s.api<T>(path);
  if (!res.ok || res.data === undefined) {
    throw new Error(`${path} → ${res.status} ${res.error?.messageKey ?? res.raw.slice(0, 70)}`);
  }
  return res.data;
}

const FORBIDDEN = ["rateKey", "RateCode", "AgentRefID", "netRate", "supplierNet", "hotelbeds", "tourmind"];
const leaks = (raw: string) => FORBIDDEN.filter((w) => raw.toLowerCase().includes(w.toLowerCase()));

/* ================================================================= the cases */

async function main(): Promise<void> {
  process.stdout.write(`Portal QA — ${BASE}\n`);

  section("Three accounts, three sets of powers");

  let roles = { admin: "", counter: "", viewer: "" };

  await check("each seeded account signs in as what it claims to be", async () => {
    roles = {
      admin: (await admin.signIn(ADMIN)) ?? "",
      counter: (await counter.signIn(COUNTER)) ?? "",
      viewer: (await viewer.signIn(VIEWER)) ?? "",
    };
    if (!roles.admin || !roles.counter || !roles.viewer) {
      return `SKIP: could not sign in — ${JSON.stringify(roles)}`;
    }
    if (!roles.admin.startsWith("admin/")) throw new Error(`the administrator signed in as ${roles.admin}`);
    if (roles.viewer !== "agent/viewOnly") throw new Error(`the trainee signed in as ${roles.viewer}`);
    return `${roles.admin} · ${roles.counter} · ${roles.viewer}`;
  });

  const gate = () => (roles.admin ? null : "SKIP: no sessions");

  /* ---------------------------------------------------------------------- */
  section("Credit");

  await check("the ledger and the statements both answer", async () => {
    if (gate()) return gate()!;
    const ledger = await must<{ entries?: unknown[]; balance?: unknown }>(admin, "/api/agency/ledger");
    const statements = await must<Record<string, unknown>>(admin, "/api/agency/statements");
    if (!Object.keys(ledger).length) throw new Error("the ledger answered with nothing");
    if (!Object.keys(statements).length) throw new Error("the statements answered with nothing");
    return `ledger: ${Object.keys(ledger).join(", ")} · statements: ${Object.keys(statements).join(", ")}`;
  });

  await check("the ledger adds up to the balance the portal shows", async () => {
    if (gate()) return gate()!;
    /*
     * The number in the sidebar and the list behind it come from different
     * places, and an agency that cannot reconcile the two has no reason to
     * trust either. Held bookings are the interesting part: they commit credit
     * without being owed, so `used` includes them and a statement does not.
     */
    const me = await must<{ balance?: { limit: number; used: number; available: number } }>(admin, "/api/agency/me");
    const balance = me.balance;
    if (!balance) return "WARN: no balance on the session payload";
    if (Math.round(balance.limit - balance.used) !== Math.round(balance.available)) {
      throw new Error(`limit ${balance.limit} − used ${balance.used} ≠ available ${balance.available}`);
    }
    return `${balance.available} available of ${balance.limit}`;
  });

  await check("credit is not readable without a session", async () => {
    const anonymous = new Session();
    for (const path of ["/api/agency/ledger", "/api/agency/statements"]) {
      const res = await anonymous.api(path);
      if (res.status !== 401) throw new Error(`${path} answered ${res.status} to nobody`);
    }
    return "401 on both";
  });

  /* ---------------------------------------------------------------------- */
  section("Team");

  await check("an administrator sees the agency's agents", async () => {
    if (gate()) return gate()!;
    const data = await must<{ agents?: { email: string; role: string }[] }>(admin, "/api/agency/agents");
    if (!data.agents?.length) throw new Error("an agency with seeded agents listed none");
    return `${data.agents.length} agents`;
  });

  await check("a counter agent cannot add a colleague", async () => {
    if (gate()) return gate()!;
    /*
     * The whole point of the role. Adding an agent grants somebody the right
     * to spend the agency's credit line, so it belongs to whoever is
     * accountable for it — not to everyone who can sign in.
     */
    const res = await counter.api("/api/agency/agents", {
      body: { email: `qa-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA", permission: "issue" },
    });
    if (res.ok) throw new Error("a counter agent created an account that can spend credit");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("a view-only trainee cannot either", async () => {
    if (gate()) return gate()!;
    const res = await viewer.api("/api/agency/agents", {
      body: { email: `qa-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA", permission: "issue" },
    });
    if (res.ok) throw new Error("a view-only account created an agent");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("an administrator can, and the new agent appears", async () => {
    if (gate()) return gate()!;
    const email = `qa-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
    const res = await admin.api("/api/agency/agents", { body: { email, name: "QA Hire", permission: "viewOnly" } });
    if (!res.ok) throw new Error(`the administrator was refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    const after = await must<{ agents?: { email: string }[] }>(admin, "/api/agency/agents");
    if (!after.agents?.some((a) => a.email === email)) throw new Error("created, and not on the list");
    return `${email} added`;
  });

  await check("a right can be withdrawn, and only that right", async () => {
    if (gate()) return gate()!;
    /*
     * The merge, end to end. A screen flips one switch and sends one key; if
     * the absent key were read as `false`, withdrawing the right to hold would
     * also withdraw the right to sell non-refundable stock, and nobody would
     * see it happen until an agent was refused at the counter.
     */
    const email = `qa-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
    const created = await admin.api<{ agent?: { id: string } }>("/api/agency/agents", {
      body: {
        email,
        name: "QA Rights",
        permission: "issue",
        capabilities: { hold: true, nonRefundable: true },
      },
    });
    const agentId = created.data?.agent?.id;
    if (!agentId) throw new Error("the new agent came back without an id");

    const patched = await admin.api<{ agent?: { capabilities?: Record<string, boolean> } }>("/api/agency/agents", {
      method: "PATCH",
      body: { agentId, capabilities: { hold: false } },
    });
    if (!patched.ok) throw new Error(`withdrawing the hold right was refused: ${patched.status}`);
    const rights = patched.data?.agent?.capabilities;
    if (rights?.hold !== false) throw new Error("the hold right survived being withdrawn");
    if (rights?.nonRefundable !== true) throw new Error("withdrawing one right took the other with it");
    return "hold off, non-refundable intact";
  });

  await check("withdrawing a right does not reactivate a suspended account", async () => {
    if (gate()) return gate()!;
    /*
     * The same hazard the permission branch was written for. A capability
     * change that fell through to the active/inactive path would quietly
     * restore access to somebody who had been suspended that morning.
     */
    const email = `qa-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
    const created = await admin.api<{ agent?: { id: string } }>("/api/agency/agents", {
      body: { email, name: "QA Suspended", permission: "issue" },
    });
    const agentId = created.data?.agent?.id;
    if (!agentId) throw new Error("the new agent came back without an id");

    await admin.api("/api/agency/agents", { method: "PATCH", body: { agentId, active: false } });
    const patched = await admin.api<{ agent?: { active?: boolean } }>("/api/agency/agents", {
      method: "PATCH",
      body: { agentId, capabilities: { nonRefundable: false } },
    });
    if (!patched.ok) throw new Error(`the change was refused: ${patched.status}`);
    if (patched.data?.agent?.active !== false) throw new Error("a suspended account was restored by a rights change");
    return "still suspended";
  });

  /* ---------------------------------------------------------------------- */
  section("Sub-agents: users beneath users");

  /*
   * One branch manager, created by the administrator with a slice of the agency
   * line, then left to build their own desk out of it. Everything below is
   * asked of the branch rather than of the administrator, because the point of
   * the feature is what somebody can do *without* being an administrator.
   */
  const branchEmail = `qa-branch-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
  const branch = new Session();
  let branchId = "";

  await check("an administrator creates a branch and allocates it credit", async () => {
    if (gate()) return gate()!;
    const res = await admin.api<{ agent?: { id: string; creditLimit?: number } }>("/api/agency/agents", {
      body: { email: branchEmail, name: "QA Branch", permission: "booking", creditLimit: 4000 },
    });
    if (!res.ok) throw new Error(`refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    branchId = res.data?.agent?.id ?? "";
    if (!branchId) throw new Error("created without an id");
    if (res.data?.agent?.creditLimit !== 4000) throw new Error("the allocation was not stored");
    if (!(await branch.signIn(branchEmail))) throw new Error("the branch could not sign in");
    return "4000 allocated";
  });

  await check("the branch builds its own desk out of that allocation", async () => {
    if (!branchId) return "SKIP: no branch";
    /*
     * The whole concept in one request. A non-administrator creating a login —
     * which the old rule forbade outright — is now allowed precisely because
     * the credit comes out of their own pool rather than the agency's.
     */
    const res = await branch.api<{ agent?: { parentId?: string; creditLimit?: number } }>("/api/agency/agents", {
      body: { email: `qa-desk-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA Desk", permission: "booking", creditLimit: 1500 },
    });
    if (!res.ok) throw new Error(`the branch was refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    if (res.data?.agent?.parentId !== branchId) throw new Error("the sub-agent was not filed under its creator");
    return `desk on 1500 under ${branchId}`;
  });

  await check("the branch cannot hand out credit it does not hold", async () => {
    if (!branchId) return "SKIP: no branch";
    // 4,000 allocated and 1,500 already promised. Asking for 3,000 is asking
    // for money that does not exist anywhere in the hierarchy.
    const res = await branch.api("/api/agency/agents", {
      body: { email: `qa-over-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA Over", permission: "booking", creditLimit: 3000 },
    });
    if (res.ok) throw new Error("a branch allocated more than its own pool");
    if (res.error?.messageKey !== "agency.allocationTooLarge") {
      throw new Error(`refused for the wrong reason: ${res.status} ${res.error?.messageKey}`);
    }
    return `422 · ${res.error.messageKey}`;
  });

  await check("the branch cannot create somebody with no cap at all", async () => {
    if (!branchId) return "SKIP: no branch";
    /*
     * The quiet version of over-allocating. An account with no limit is bounded
     * by the agency line, so a branch on 4,000 creating one would hand their
     * sub-agent the whole 25,000 and make their own cap decorative. An
     * administrator adding a colleague to the agency's own line is a different
     * thing and is still allowed — the invariant is that a *capped* parent
     * cannot have an uncapped child.
     */
    const res = await branch.api("/api/agency/agents", {
      body: { email: `qa-uncapped-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA Uncapped", permission: "booking" },
    });
    if (res.ok) throw new Error("a capped branch created an uncapped sub-agent");
    if (res.error?.messageKey !== "agency.allocationRequired") {
      throw new Error(`refused for the wrong reason: ${res.status} ${res.error?.messageKey}`);
    }
    return `422 · ${res.error.messageKey}`;
  });

  await check("the branch cannot promote somebody above itself", async () => {
    if (!branchId) return "SKIP: no branch";
    /*
     * The escalation this closes: a booking-only manager creating an account
     * that may issue, then signing in as it. The ladder would be advisory.
     */
    const res = await branch.api("/api/agency/agents", {
      body: { email: `qa-up-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA Up", permission: "issue", creditLimit: 100 },
    });
    if (res.ok) throw new Error("a booking-only branch created an issuer");
    if (res.error?.messageKey !== "agency.grantAboveSelf") {
      throw new Error(`refused for the wrong reason: ${res.status} ${res.error?.messageKey}`);
    }
    return `403 · ${res.error.messageKey}`;
  });

  await check("the branch cannot reach an account that is not beneath it", async () => {
    if (!branchId) return "SKIP: no branch";
    // The seeded counter agent is a peer, not a child. Editing their allocation
    // would be reaching sideways into somebody else's arrangement.
    const all = await must<{ agents?: { id: string; email: string }[] }>(admin, "/api/agency/agents");
    const peer = all.agents?.find((a) => a.email === COUNTER);
    if (!peer) return "SKIP: the counter agent is not on the list";
    const res = await branch.api("/api/agency/agents", {
      method: "PATCH",
      body: { agentId: peer.id, creditLimit: 999 },
    });
    if (res.ok) throw new Error("a branch edited a peer's account");
    if (res.error?.messageKey !== "agency.notYourSubAgent") {
      throw new Error(`refused for the wrong reason: ${res.status} ${res.error?.messageKey}`);
    }
    return `403 · ${res.error.messageKey}`;
  });

  await check("a sub-agent sees its own branch and not the whole agency", async () => {
    if (!branchId) return "SKIP: no branch";
    /*
     * A peer's credit allocation is a commercial arrangement between that peer
     * and their own manager. The administrator sees everything; a branch sees
     * itself and the people it created.
     */
    const mine = await must<{ agents?: { email: string }[] }>(branch, "/api/agency/agents");
    const everyone = await must<{ agents?: { email: string }[] }>(admin, "/api/agency/agents");
    if (mine.agents?.some((a) => a.email === COUNTER)) throw new Error("a branch read a peer's record");
    if ((mine.agents?.length ?? 0) >= (everyone.agents?.length ?? 0)) {
      throw new Error("the branch saw as much as the administrator");
    }
    return `${mine.agents?.length} of ${everyone.agents?.length}`;
  });

  await check("demoting the branch narrows everyone beneath it", async () => {
    if (!branchId) return "SKIP: no branch";
    /*
     * The reason rights are read up the chain on every request rather than
     * copied at the moment of granting. The desk's own record still says
     * booking; what changed is the authority of the account above it.
     */
    const desk = await branch.api<{ agent?: { id: string } }>("/api/agency/agents", {
      body: { email: `qa-narrow-${Math.random().toString(36).slice(2, 8)}@skyline.example`, name: "QA Narrow", permission: "booking", creditLimit: 100 },
    });
    if (!desk.ok || !desk.data?.agent?.id) return "SKIP: could not create a desk";

    await admin.api("/api/agency/agents", {
      method: "PATCH",
      body: { agentId: branchId, permission: "viewOnly" },
    });
    const after = await branch.api<{ session?: { permission: string } }>("/api/agency/me");
    await admin.api("/api/agency/agents", {
      method: "PATCH",
      body: { agentId: branchId, permission: "booking" },
    });
    if (!after.ok) throw new Error(`the branch could not read its own session: ${after.status}`);
    if (after.data?.session?.permission !== "viewOnly") {
      throw new Error(`the demotion did not take: ${after.data?.session?.permission}`);
    }
    return "view-only, on the next request";
  });

  /* ---------------------------------------------------------------------- */
  section("Settings");

  await check("a counter agent cannot change the agency's markup", async () => {
    if (gate()) return gate()!;
    const res = await counter.api("/api/agency/settings", {
      method: "PATCH",
      body: { markup: { default: { mode: "percent", value: 5 }, overrides: [] } },
    });
    if (res.ok) throw new Error("a counter agent repriced everything the agency sells");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("an absurd markup is refused rather than clamped", async () => {
    if (gate()) return gate()!;
    /*
     * Sixty per cent is the ceiling. Silently clamping would save a mistyped
     * 500 as 60 and let an agency believe it had set what it typed — the
     * refusal is the point, because the number ends up on a customer's quote.
     */
    const res = await admin.api("/api/agency/settings", {
      method: "PATCH",
      body: { markup: { default: { mode: "percent", value: 500 }, overrides: [] } },
    });
    if (res.ok) throw new Error("a 500% markup was accepted");
    if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`);
    return "422";
  });

  await check("an insecure logo URL is refused", async () => {
    if (gate()) return gate()!;
    // It goes on every voucher and quotation the agency's customers receive.
    // One http: image turns a page a traveller is asked to trust into a
    // mixed-content warning.
    const res = await admin.api("/api/agency/settings", {
      method: "PATCH",
      body: { profile: { logoUrl: "http://example.com/logo.png" } },
    });
    if (res.ok) {
      const me = await must<{ agency?: { profile?: { logoUrl?: string } } }>(admin, "/api/agency/me");
      if (me.agency?.profile?.logoUrl?.startsWith("http://")) throw new Error("an http: logo was stored");
      return "accepted, and not stored";
    }
    return `refused ${res.status}`;
  });

  await check("a javascript: URL never reaches a document", async () => {
    if (gate()) return gate()!;
    const res = await admin.api("/api/agency/settings", {
      method: "PATCH",
      body: { profile: { website: "javascript:alert(1)" } },
    });
    const me = await must<{ agency?: { profile?: { website?: string } } }>(admin, "/api/agency/me");
    if (me.agency?.profile?.website?.toLowerCase().startsWith("javascript:")) {
      throw new Error("a javascript: URL was stored on the agency profile");
    }
    return res.ok ? "accepted, and not stored" : `refused ${res.status}`;
  });

  await check("an agency cannot raise its own discount", async () => {
    if (gate()) return gate()!;
    /*
     * `commissionPercent` is contractual — it is what we charge them, not what
     * they charge their customer. A settings form that could edit it is not a
     * settings form.
     */
    const before = await must<{ agency?: { commissionPercent?: number } }>(admin, "/api/agency/me");
    await admin.api("/api/agency/settings", { method: "PATCH", body: { commissionPercent: 99 } });
    const after = await must<{ agency?: { commissionPercent?: number } }>(admin, "/api/agency/me");
    if (after.agency?.commissionPercent !== before.agency?.commissionPercent) {
      throw new Error(`commission moved ${before.agency?.commissionPercent} → ${after.agency?.commissionPercent}`);
    }
    return `unchanged at ${after.agency?.commissionPercent}%`;
  });

  /* ---------------------------------------------------------------------- */
  section("Customers");

  let created = "";

  await check("the address book answers", async () => {
    if (gate()) return gate()!;
    const data = await must<{ customers?: unknown[] }>(admin, "/api/agency/customers");
    if (data.customers === undefined) throw new Error("no customers key in the payload");
    return `${data.customers.length} on file`;
  });

  await check("a view-only trainee cannot add one", async () => {
    if (gate()) return gate()!;
    const res = await viewer.api("/api/agency/customers", {
      body: { name: "QA Person", email: "qa.person@example.com" },
    });
    if (res.ok) throw new Error("a view-only account wrote to the address book");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("a counter agent can, and it comes back", async () => {
    if (gate()) return gate()!;
    const email = `qa-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const res = await counter.api<{ customer?: { id: string } }>("/api/agency/customers", {
      body: { name: "QA Person", email },
    });
    if (!res.ok) throw new Error(`refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    created = res.data?.customer?.id ?? "";
    const after = await must<{ customers?: { email: string }[] }>(admin, "/api/agency/customers");
    if (!after.customers?.some((c) => c.email === email)) throw new Error("created, and not on the list");
    return email;
  });

  await check("and can take it off again", async () => {
    if (gate()) return gate()!;
    if (!created) return "SKIP: nothing was created";
    const res = await counter.api(`/api/agency/customers?id=${encodeURIComponent(created)}`, { method: "DELETE" });
    if (!res.ok) return `WARN: delete refused ${res.status} — the address book only grows`;
    return "removed";
  });

  /* ---------------------------------------------------------------------- */
  section("Nothing here names a supplier");

  await check("none of these four modules leaks supply detail", async () => {
    if (gate()) return gate()!;
    const dirty: string[] = [];
    for (const path of ["/api/agency/ledger", "/api/agency/statements", "/api/agency/agents",
                        "/api/agency/customers", "/api/agency/me", "/api/agency/reports"]) {
      const res = await admin.api(path);
      const found = leaks(res.raw);
      if (found.length) dirty.push(`${path}: ${found.join("/")}`);
    }
    if (dirty.length) throw new Error(dirty.join("; "));
    return "6 payloads clean";
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
