import { config as loadEnv } from "dotenv";

// Before anything reads process.env: this drives a *running* server, and it
// reads the supplier flags to decide which cases are answerable.
loadEnv({ path: ".env.local" });

/**
 * The booking flow, end to end, against a running server.
 *
 *   npm run dev                        # in another terminal
 *   npm run qa:booking
 *   npm run qa:booking -- --base=https://nazil.vercel.app
 *
 * Search stops at a price on a screen. Everything after it takes somebody's
 * money and sends an order to a wholesaler, and the failures there are not
 * cosmetic: a second order from one double-click, a charge with no booking, a
 * booking with no charge, a voucher naming a supplier we are contractually
 * forbidden to name. None of that is visible to a unit test of any single
 * module, because all of it lives in the sequence — freeze a price, take the
 * names, authorise, order, confirm, voucher, and be able to undo it.
 *
 * The verdicts mean what they mean in the search harness. FAIL is ours. WARN
 * is the supply's — a supplier that will not answer cannot be booked against,
 * and that must never read as a broken checkout. SKIP never ran, and says why.
 *
 * Nothing here is destructive to anything real: every booking it creates is
 * made against the test credentials, and it cancels what it can before it ends.
 */

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:4860").replace(/\/+$/, "");
const AGENT = process.argv.find((a) => a.startsWith("--agent="))?.slice(8) ?? "admin@skyline.example";
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
  process.stdout.write(`\n${title}\n`);
}

/** Nobody could supply this. Not a defect, never counted as one. */
class SupplyUnavailable extends Error {}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    const verdict: Verdict = detail.startsWith("SKIP:") ? "SKIP" : detail.startsWith("WARN:") ? "WARN" : "PASS";
    results.push({
      group,
      name,
      verdict,
      detail: verdict === "PASS" ? detail : detail.slice(5).trim(),
      ms: Date.now() - started,
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
  process.stdout.write(`  ${last.verdict.padEnd(4)} ${name} — ${last.detail}\n`);
}

/* ------------------------------------------------------------------ session */

const jar = new Map<string, string>();

function cookieHeader(): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

interface Reply<T> {
  status: number;
  ok: boolean;
  data?: T;
  error?: { message?: string; messageKey?: string; fields?: Record<string, string>; category?: string; recommendedAction?: string };
  raw: string;
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; scenario?: string; headers?: Record<string, string> } = {},
): Promise<Reply<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(init.scenario ? { "x-scenario": init.scenario } : {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...init.headers,
    },
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
    /* a non-JSON body is itself the finding; `raw` carries it */
  }
  return { status: res.status, ok: Boolean(body?.ok), data: body?.data, error: body?.error, raw };
}

/* -------------------------------------------------------------------- types */

interface Card {
  slug: string;
  name: string;
  offerSummary: { offerId: string; refundable: boolean; freeCancellationUntil?: string; paymentTiming: string };
  price: { total: number; currency: string; roomsCovered?: number };
}

interface SearchResponse {
  results: Card[];
  totalCount: number;
  completeness: string;
}

interface CheckoutSession {
  checkoutSessionId: string;
  expiresAt: string;
  hotelName: string;
  price: { total: number; currency: string };
  rooms: { adults: number; childrenAges: number[] }[];
  lines?: { offerId: string }[];
  paymentTiming?: string;
  requirements?: unknown;
}

interface PaymentIntent {
  intentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  allowedMethods: { code: string }[];
  threeDsRequired: boolean;
  mode: "charge" | "guarantee";
}

interface Booking {
  reference: string;
  status: string;
  hotelName: string;
  guests: { firstName: string; surname: string; lead?: boolean }[];
  price: { total: number; currency: string };
  timeline: { code: string }[];
  supplierReference?: string;
}

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function key(): string {
  return `qa_${Math.random().toString(36).slice(2, 14)}`;
}

const CONTACT = { email: "qa@example.com", phone: "+966500000000", language: "en" as const };
const LEAD = { firstName: "Qa", surname: "Tester", nationality: "SA" };
const CONSENTS = { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false };
const PAYMENT = { method: "card", token: "tok_test", threeDsStatus: "notRequired" as const };

function bookingBody(sessionId: string, over: Record<string, unknown> = {}) {
  return {
    checkoutSessionId: sessionId,
    idempotencyKey: key(),
    contact: CONTACT,
    lead: LEAD,
    guests: [],
    consents: CONSENTS,
    payment: PAYMENT,
    ...over,
  };
}

/* ------------------------------------------------------- finding live supply */

/**
 * One live, bookable offer, found once and reused.
 *
 * Every case below needs a real offer id, and searching per case would spend a
 * supplier request each time and make the run take minutes. Cached, with the
 * search rerun only when an offer has been consumed by a booking.
 */
let cachedSearch: SearchResponse | null = null;

async function liveSearch(force = false): Promise<SearchResponse> {
  if (cachedSearch && !force) return cachedSearch;
  const res = await api<SearchResponse>("/api/hotels/search", {
    body: {
      intent: {
        destinationId: "dest-dubai",
        destinationDisplay: "Dubai",
        destinationType: "city",
        checkIn: iso(30),
        checkOut: iso(33),
        flexibility: "exact",
        rooms: [{ adults: 2, childrenAges: [] }],
        accessibleRoom: false,
        locale: "en",
        currency: "USD",
      },
      supply: "live",
      pageSize: 12,
    },
  });
  if (!res.ok || !res.data) throw new SupplyUnavailable(`search failed: ${res.error?.message ?? res.status}`);
  if (!res.data.totalCount) throw new SupplyUnavailable("no live supply for Dubai on these dates");
  cachedSearch = res.data;
  return res.data;
}

/** A fresh offer id, not one a previous case has already spent. */
const spent = new Set<string>();

async function freshOffer(predicate: (card: Card) => boolean = () => true): Promise<Card> {
  for (const attempt of [false, true]) {
    const page = await liveSearch(attempt);
    const card = page.results.find((c) => predicate(c) && !spent.has(c.offerSummary.offerId));
    if (card) {
      spent.add(card.offerSummary.offerId);
      return card;
    }
  }
  throw new SupplyUnavailable("no unused offer matching what this case needs");
}

/**
 * The first non-refundable rate live supply will admit to, from anywhere.
 *
 * Returns `null` rather than throwing: "nobody is selling one today" is a fact
 * about the suppliers, not a defect in the route under test, and the caller
 * says so in its own words.
 */
async function nonRefundableCard(): Promise<Card | null> {
  for (const [destinationId, destinationDisplay] of [
    ["dest-dubai", "Dubai"],
    ["dest-london", "London"],
    ["dest-cairo", "Cairo"],
  ] as const) {
    const res = await api<SearchResponse>("/api/hotels/search", {
      body: {
        intent: {
          destinationId,
          destinationDisplay,
          destinationType: "city",
          checkIn: iso(30),
          checkOut: iso(33),
          flexibility: "exact",
          rooms: [{ adults: 2, childrenAges: [] }],
          accessibleRoom: false,
          locale: "en",
          currency: "USD",
        },
        supply: "live",
        pageSize: 12,
      },
    });
    const card = res.data?.results.find((c) => !c.offerSummary.refundable && !spent.has(c.offerSummary.offerId));
    if (card) {
      spent.add(card.offerSummary.offerId);
      return card;
    }
  }
  return null;
}

async function sessionFor(card: Card, over: Record<string, unknown> = {}): Promise<CheckoutSession> {
  const res = await api<CheckoutSession>("/api/checkout/sessions", {
    body: { offerId: card.offerSummary.offerId, ...over },
  });
  if (!res.ok || !res.data) throw new Error(`checkout session refused: ${res.status} ${res.error?.messageKey ?? res.error?.message ?? ""}`);
  return res.data;
}

/**
 * Words that may never leave the server (§9.4).
 *
 * Supplier identity, supplier pricing and supplier-side references. Checked
 * against the raw response text rather than a parsed field, because the point
 * is that it is nowhere in the payload — not in a nested object nobody
 * remembered to strip, not in an error message, not in a debug echo.
 */
const FORBIDDEN = [
  "rateKey",
  "RateCode",
  "AgentRefID",
  "hotelbeds",
  "tourmind",
  "netRate",
  "net_rate",
  "supplierNet",
];

function leaks(raw: string): string[] {
  const lower = raw.toLowerCase();
  return FORBIDDEN.filter((word) => lower.includes(word.toLowerCase()));
}

/* ================================================================= the cases */

async function main(): Promise<void> {
  process.stdout.write(`Booking flow QA — ${BASE}\n`);

  /* ---------------------------------------------------------------------- */
  section("Freezing a price to book against");

  let happySession: CheckoutSession | null = null;
  let happyCard: Card | null = null;

  await check("a live offer becomes a checkout session", async () => {
    happyCard = await freshOffer();
    happySession = await sessionFor(happyCard);
    if (!happySession.checkoutSessionId) throw new Error("no sessionId returned");
    return `${happySession.checkoutSessionId} · ${happySession.hotelName} · ${happySession.price.total} ${happySession.price.currency}`;
  });

  await check("the session carries an expiry in the future", async () => {
    if (!happySession) return "SKIP: no session";
    const ms = new Date(happySession.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) throw new Error(`expiresAt is not a date: ${happySession.expiresAt}`);
    if (ms <= 0) throw new Error(`session was born expired (${happySession.expiresAt})`);
    return `${Math.round(ms / 1000)}s to complete the booking`;
  });

  await check("the frozen price matches the price that was chosen", async () => {
    if (!happySession || !happyCard) return "SKIP: no session";
    // A session that silently reprices is the single most damaging bug in this
    // flow: the customer agrees to one number and is charged another.
    if (happySession.price.total !== happyCard.price.total) {
      throw new Error(`search said ${happyCard.price.total}, session says ${happySession.price.total}`);
    }
    return `${happySession.price.total} ${happySession.price.currency} held`;
  });

  await check("the session names no supplier", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api<CheckoutSession>("/api/checkout/sessions", {
      body: { offerId: happyCard!.offerSummary.offerId },
    });
    const found = leaks(res.raw);
    if (found.length) throw new Error(`§9.4 leak: ${found.join(", ")}`);
    return "no supplier identifiers in the payload";
  });

  await check("an unknown offer cannot be checked out", async () => {
    const res = await api("/api/checkout/sessions", { body: { offerId: "of_does_not_exist" } });
    if (res.ok) throw new Error("a made-up offer produced a checkout session");
    if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
    return `refused ${res.status} · ${res.error?.recommendedAction ?? ""}`;
  });

  await check("two different hotels in one basket are refused", async () => {
    const page = await liveSearch();
    const a = page.results[0];
    const b = page.results.find((c) => c.slug !== a?.slug);
    if (!a || !b) return "SKIP: only one property came back, nothing to mix";
    const res = await api("/api/checkout/sessions", {
      body: { offerIds: [a.offerSummary.offerId, b.offerSummary.offerId] },
    });
    if (res.ok) throw new Error("two hotels were accepted into one checkout — that is two orders and two vouchers");
    if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`);
    return `refused ${res.status} · ${res.error?.messageKey ?? ""}`;
  });

  await check("an empty basket is refused", async () => {
    const res = await api("/api/checkout/sessions", { body: {} });
    if (res.ok) throw new Error("an empty basket produced a session");
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return `refused ${res.status}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Authorising the money");

  await check("a payment intent is raised for the session", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api<PaymentIntent>("/api/payments/intents", {
      body: { checkoutSessionId: happySession.checkoutSessionId },
    });
    if (!res.ok || !res.data) throw new Error(`no intent: ${res.status} ${res.error?.messageKey ?? ""}`);
    if (!res.data.clientSecret) throw new Error("no client secret — the hosted fields cannot mount");
    return `${res.data.mode} · ${res.data.amount} ${res.data.currency} · ${res.data.allowedMethods.length} methods`;
  });

  await check("no card data is ever asked of the platform", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api<PaymentIntent>("/api/payments/intents", {
      body: { checkoutSessionId: happySession.checkoutSessionId },
    });
    // §12.3: hosted fields only. A PAN-shaped field anywhere in this response
    // would mean the platform is in scope for card data it must never hold.
    const bad = ["pan", "cardnumber", "card_number", "cvv", "cvc"].filter((w) => res.raw.toLowerCase().includes(w));
    if (bad.length) throw new Error(`the intent exposes ${bad.join(", ")}`);
    return "client secret and allowed methods only";
  });

  await check("a pay-later rate guarantees rather than charges", async () => {
    const later = cachedSearch?.results.find((c) => c.offerSummary.paymentTiming !== "payNow");
    if (!later) return "SKIP: every live rate on this search is pay-now";
    const session = await sessionFor(later);
    const res = await api<PaymentIntent>("/api/payments/intents", { body: { checkoutSessionId: session.checkoutSessionId } });
    if (!res.data) throw new Error("no intent");
    if (res.data.mode !== "guarantee") throw new Error(`pay-later rate raised a ${res.data.mode}`);
    if (res.data.amount !== 0) throw new Error(`a guarantee tried to capture ${res.data.amount}`);
    return "guarantee for 0 — nothing captured";
  });

  await check("an unknown session cannot raise an intent", async () => {
    const res = await api("/api/payments/intents", { body: { checkoutSessionId: "cs_nope" } });
    if (res.ok) throw new Error("an intent was raised against a session that does not exist");
    return `refused ${res.status}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Refusing a booking that should not be made");

  await check("a bad email is refused before anything is ordered", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId, { contact: { ...CONTACT, email: "not-an-email" } }),
    });
    if (res.ok) throw new Error("booked with an unusable email — the confirmation goes nowhere");
    if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`);
    if (!res.error?.fields?.email) throw new Error("refused without saying which field was wrong");
    return `422 · ${res.error.fields.email}`;
  });

  await check("a missing lead guest is refused", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId, { lead: { firstName: "", surname: "" } }),
    });
    if (res.ok) throw new Error("booked a room with nobody's name on it");
    if (!res.error?.fields?.lead) throw new Error(`refused ${res.status} but not on the lead field`);
    return `422 · ${res.error.fields.lead}`;
  });

  await check("unaccepted terms are refused", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId, { consents: { ...CONSENTS, cancellation: false } }),
    });
    if (res.ok) throw new Error("booked without the cancellation policy being accepted");
    if (!res.error?.fields?.consents) throw new Error(`refused ${res.status} but not on consents`);
    return `422 · ${res.error.fields.consents}`;
  });

  await check("more names than beds is refused", async () => {
    if (!happySession) return "SKIP: no session";
    const beds = happySession.rooms.reduce((n, r) => n + r.adults + r.childrenAges.length, 0);
    const tooMany = Array.from({ length: beds }, (_, i) => ({
      roomIndex: 0,
      type: "adult" as const,
      firstName: `Extra${i}`,
      surname: "Guest",
    }));
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId, { guests: tooMany }),
    });
    if (res.ok) throw new Error(`${beds} beds accepted ${1 + tooMany.length} names — the supplier gets an over-occupied room`);
    if (!res.error?.fields?.guests) throw new Error(`refused ${res.status} but not on guests`);
    return `422 · at most ${beds} including the lead`;
  });

  await check("a declined card creates no booking at all", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId),
      scenario: "paymentDeclined",
    });
    if (res.ok) throw new Error("a declined payment produced a booking");
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    // The message has to say both halves out loud, because the customer's next
    // move depends on believing nothing was taken.
    const said = (res.error?.message ?? "").toLowerCase();
    if (!said.includes("no booking") || !said.includes("charged")) {
      throw new Error(`402 message does not say nothing was charged: "${res.error?.message}"`);
    }
    return `402 · ${res.error?.recommendedAction ?? ""}`;
  });

  await check("an abandoned 3-D Secure step is safe to retry", async () => {
    if (!happySession) return "SKIP: no session";
    const res = await api("/api/bookings", {
      body: bookingBody(happySession.checkoutSessionId, { payment: { ...PAYMENT, threeDsStatus: "abandoned" } }),
    });
    if (res.ok) throw new Error("an abandoned 3DS step produced a booking");
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    return `402 · retryable=${res.error?.recommendedAction === "retry"}`;
  });

  await check("a booking cannot be made against an unknown session", async () => {
    const res = await api("/api/bookings", { body: bookingBody("cs_nope") });
    if (res.ok) throw new Error("booked against a session that does not exist");
    if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
    return `refused ${res.status}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Making the booking");

  let made: Booking | null = null;
  let madeKey = "";

  await check("a complete, valid checkout confirms", async () => {
    /*
     * Several rates, not one.
     *
     * A rate that has sold out between the search and the order is a correct
     * refusal, not a defect — but giving up on the first one leaves the eight
     * cases after this with nothing to inspect, and a run that proves nothing
     * reads exactly like a run that proves everything. So it keeps asking for
     * a bookable room, and only calls it a supply problem when the whole page
     * of them says no.
     */
    const refusals: string[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      let card: Card;
      try {
        card = await freshOffer();
      } catch {
        break;
      }
      const session = await sessionFor(card).catch(() => null);
      if (!session) {
        refusals.push(`${card.name}: checkout refused`);
        continue;
      }

      const attemptKey = key();
      const res = await api<{ booking: Booking }>("/api/bookings", {
        body: bookingBody(session.checkoutSessionId, { idempotencyKey: attemptKey }),
      });

      if (res.ok && res.data) {
        made = res.data.booking;
        madeKey = attemptKey;
        if (!made.reference) throw new Error("confirmed without a reference");
        const note = refusals.length ? ` (after ${refusals.length} sold out)` : "";
        return `${made.reference} · ${made.status} · ${made.price.total} ${made.price.currency}${note}`;
      }

      const why = res.error?.messageKey ?? res.error?.message ?? String(res.status);
      // Availability and supplier outages are the supply's business. Anything
      // else is ours, and stops the run rather than being retried past.
      const supplyProblem =
        res.error?.category === "availabilityChanged" ||
        res.error?.category === "temporaryService" ||
        res.status >= 500;
      if (!supplyProblem) throw new Error(`booking refused: ${res.status} ${why}`);
      refusals.push(`${card.name}: ${why}`);
    }
    throw new SupplyUnavailable(`nothing bookable in ${refusals.length} attempts — ${refusals.join("; ")}`);
  });

  await check("the lead guest is on the booking", async () => {
    if (!made) return "SKIP: nothing was booked";
    const lead = made.guests?.find((g) => g.lead);
    if (!lead) throw new Error("no lead guest on the confirmed booking");
    if (lead.firstName !== LEAD.firstName || lead.surname !== LEAD.surname) {
      throw new Error(`lead is ${lead.firstName} ${lead.surname}, booked as ${LEAD.firstName} ${LEAD.surname}`);
    }
    return `${lead.firstName} ${lead.surname}`;
  });

  await check("the same idempotency key never books twice", async () => {
    if (!made) return "SKIP: nothing was booked";
    /*
     * The double-click case, and the reason this endpoint has a contract at
     * all. A retried intent must return the original order — not a second
     * reservation, and not an error that makes a customer try again.
     */
    const res = await api<{ booking: Booking; replay: boolean }>("/api/bookings", {
      body: bookingBody("cs_irrelevant_on_replay", { idempotencyKey: madeKey }),
    });
    if (!res.ok || !res.data) throw new Error(`a replay was refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    if (res.data.booking.reference !== made.reference) {
      throw new Error(`replay created ${res.data.booking.reference}, original was ${made.reference}`);
    }
    if (!res.data.replay) throw new Error("the replay was not flagged as one");
    return `same reference returned · replay=true`;
  });

  await check("the confirmation names no supplier", async () => {
    if (!made) return "SKIP: nothing was booked";
    const res = await api(`/api/bookings/${made.reference}`);
    const found = leaks(res.raw);
    if (found.length) throw new Error(`§9.4 leak in the booking payload: ${found.join(", ")}`);
    return "clean";
  });

  await check("the booking can be read back with the email used at checkout", async () => {
    if (!made) return "SKIP: nothing was booked";
    const res = await api<{ booking: Booking }>(
      `/api/bookings/${made.reference}?email=${encodeURIComponent(CONTACT.email)}`,
    );
    if (!res.ok || !res.data) throw new Error(`could not read it back: ${res.status}`);
    const back = res.data.booking ?? (res.data as unknown as Booking);
    if (back.reference !== made.reference) throw new Error("read back a different booking");
    return `${back.reference} · ${back.status}`;
  });

  await check("a reference on its own is not enough to read it", async () => {
    if (!made) return "SKIP: nothing was booked";
    // §12.3. References are short and guessable; the email is the proof.
    const res = await api(`/api/bookings/${made.reference}`);
    if (res.ok) throw new Error("a bare reference returned somebody's booking");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403 without the email";
  });

  await check("a guest can retrieve it with a code sent to their own email", async () => {
    if (!made) return "SKIP: nothing was booked";
    /*
     * Two steps on purpose. The first never says whether the pair matched —
     * see the case below — so the proof of ownership is the code, which only
     * reaches the address actually on the booking.
     */
    const start = await api<{ demoCode?: string }>("/api/bookings/lookup", {
      body: { reference: made.reference, email: CONTACT.email },
    });
    if (!start.data?.demoCode) return "SKIP: this environment does not echo the code";
    const done = await api<{ booking: Booking }>("/api/bookings/lookup", {
      method: "PUT",
      body: { reference: made.reference, email: CONTACT.email, code: start.data.demoCode },
    });
    if (!done.ok || !done.data) throw new Error(`the rightful owner was refused: ${done.status}`);
    if (done.data.booking.reference !== made.reference) throw new Error("retrieved a different booking");
    return `retrieved ${done.data.booking.reference}`;
  });

  await check("a stranger with the reference gets no code and no booking", async () => {
    if (!made) return "SKIP: nothing was booked";
    const start = await api<{ sent?: boolean; demoCode?: string }>("/api/bookings/lookup", {
      body: { reference: made.reference, email: "stranger@example.com" },
    });
    // The reply is deliberately identical to a match, so it cannot be used to
    // confirm a booking exists. What must not appear is a usable code.
    if (start.data?.demoCode) throw new Error("a code was issued to an address not on the booking");
    const done = await api("/api/bookings/lookup", {
      method: "PUT",
      body: { reference: made.reference, email: "stranger@example.com", code: "000000" },
    });
    if (done.ok) throw new Error("a guessed code retrieved somebody else's booking");
    if (done.status !== 401) throw new Error(`expected 401, got ${done.status}`);
    return "no code issued, and a guess is refused 401";
  });

  await check("a reference that does not exist looks exactly like one that does", async () => {
    if (!made) return "SKIP: nothing was booked";
    // Enumeration: if the two replies differ in any way, the endpoint becomes a
    // way to discover which references are real.
    const real = await api("/api/bookings/lookup", {
      body: { reference: made.reference, email: "stranger@example.com" },
    });
    const fake = await api("/api/bookings/lookup", {
      body: { reference: "NZ-ZZZ-0000", email: "stranger@example.com" },
    });
    if (real.status !== fake.status) throw new Error(`real ${real.status} vs invented ${fake.status}`);
    if (real.raw !== fake.raw) throw new Error(`the replies differ: "${real.raw}" vs "${fake.raw}"`);
    return "indistinguishable";
  });

  await check("the timeline records what happened", async () => {
    if (!made) return "SKIP: nothing was booked";
    if (!made.timeline?.length) throw new Error("a confirmed booking with an empty timeline");
    return made.timeline.map((e) => e.code).join(" → ");
  });

  /* ---------------------------------------------------------------------- */
  section("Undoing it");

  interface Quote {
    quoteId: string;
    fee: number;
    refundableAmount: number;
    currency: string;
    expiresAt: string;
  }

  let quote: Quote | null = null;
  let cancelKey = "";

  await check("a cancellation is quoted before it is taken", async () => {
    if (!made) return "SKIP: nothing was booked";
    const res = await api<Quote>(`/api/bookings/${made.reference}/cancellation-quotes`, { body: {} });
    if (!res.ok || !res.data) {
      const why = res.error?.messageKey ?? String(res.status);
      if (res.error?.category === "temporaryService") throw new SupplyUnavailable(`quote unavailable: ${why}`);
      throw new Error(`no cancellation quote: ${res.status} ${why}`);
    }
    quote = res.data;
    if (!quote.quoteId) throw new Error("a quote with no id cannot be acted on");
    if (typeof quote.fee !== "number" || typeof quote.refundableAmount !== "number") {
      throw new Error("a quote that does not say what it costs or returns");
    }
    return `fee ${quote.fee} · back ${quote.refundableAmount} ${quote.currency}`;
  });

  await check("the quote carries its own expiry", async () => {
    if (!quote) return "SKIP: no quote";
    // E-18: a fee is only true for as long as the supplier says it is, and a
    // reused quote is how somebody is charged last hour's penalty.
    const ms = new Date(quote.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) throw new Error(`expiresAt is not a date: ${quote.expiresAt}`);
    if (ms <= 0) throw new Error("the quote was born expired");
    return `${Math.round(ms / 1000)}s`;
  });

  await check("cancelling needs re-authentication", async () => {
    if (!made || !quote) return "SKIP: no quote";
    /*
     * The reference and a quote are not enough. Cancelling is destructive and
     * often costs money, so it is proved again with a code to the email on the
     * booking — otherwise anyone who saw a confirmation could cancel the trip.
     */
    const res = await api(`/api/bookings/${made.reference}/cancellations`, {
      body: { quoteId: quote.quoteId, idempotencyKey: key(), otp: "000000" },
    });
    if (res.ok) throw new Error("a booking was cancelled with a guessed code");
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    return "401 without a valid code";
  });

  await check("a quote is required, not optional", async () => {
    if (!made) return "SKIP: nothing was booked";
    const res = await api(`/api/bookings/${made.reference}/cancellations`, {
      body: { idempotencyKey: key(), otp: "000000" },
    });
    if (res.ok) throw new Error("cancelled with no quote — the customer never saw the fee");
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    return "400";
  });

  await check("cancelling actually cancels it", async () => {
    if (!made || !quote) return "SKIP: no quote";
    const otp = await api<{ demoCode?: string }>("/api/auth/otp", {
      body: { email: CONTACT.email, purpose: "cancel" },
    });
    if (!otp.data?.demoCode) return "SKIP: this environment does not echo the code";

    cancelKey = key();
    const res = await api<{ booking?: Booking }>(`/api/bookings/${made.reference}/cancellations`, {
      body: { quoteId: quote.quoteId, idempotencyKey: cancelKey, otp: otp.data.demoCode },
    });
    if (!res.ok) {
      const why = res.error?.messageKey ?? res.error?.message ?? String(res.status);
      if (res.error?.category === "temporaryService") throw new SupplyUnavailable(`supplier would not cancel: ${why}`);
      throw new Error(`cancellation refused: ${res.status} ${why}`);
    }
    const after = await api<{ booking: Booking }>(
      `/api/bookings/${made.reference}?email=${encodeURIComponent(CONTACT.email)}`,
    );
    const status = (after.data?.booking ?? (after.data as unknown as Booking))?.status;
    if (status && !/cancel|processing/i.test(status)) {
      throw new Error(`cancelled, but the booking still reads "${status}"`);
    }
    return `status is now ${status}`;
  });

  await check("replaying the cancellation does not refund twice", async () => {
    if (!made || !cancelKey) return "SKIP: nothing was cancelled";
    // The same double-click protection the booking has, on the side where a
    // repeat costs the business money rather than the customer.
    const res = await api<{ replay?: boolean }>(`/api/bookings/${made.reference}/cancellations`, {
      body: { quoteId: quote?.quoteId, idempotencyKey: cancelKey, otp: "irrelevant-on-replay" },
    });
    if (!res.ok) return `refused ${res.status} — no second refund`;
    if (!res.data?.replay) throw new Error("a repeat was processed as a fresh cancellation");
    return "returned the original outcome · replay=true";
  });

  /* ---------------------------------------------------------------------- */
  section("When the supplier misbehaves");

  await check("a pending order is reconciled, not left ambiguous", async () => {
    const card = await freshOffer();
    const session = await sessionFor(card);
    const res = await api<{ booking: Booking }>("/api/bookings", {
      body: bookingBody(session.checkoutSessionId),
      scenario: "bookingPending",
    });
    // The contract says the answer is never ambiguous: it resolves to a state,
    // and the client is told not to retry.
    if (res.ok && res.data) {
      const status = res.data.booking.status;
      if (!status) throw new Error("accepted with no status at all");
      return `resolved to ${status}`;
    }
    if (res.status === 402 || res.status === 409) return `refused cleanly · ${res.status}`;
    throw new Error(`ambiguous outcome: ${res.status} ${res.error?.messageKey ?? ""}`);
  });

  await check("a failed order leaves nothing charged", async () => {
    const card = await freshOffer();
    const session = await sessionFor(card);
    const res = await api<{ booking: Booking & { paidAmount?: number; policy?: { cancelAllowed?: boolean } } }>(
      "/api/bookings",
      { body: bookingBody(session.checkoutSessionId), scenario: "bookingFailed" },
    );
    /*
     * A supplier that answers "no" produces a record, not an HTTP error.
     *
     * The distinction the route draws, and it is the right one: a transport
     * failure is an error because there is nothing to show, while a refusal is
     * an outcome the customer needs to be able to look at — it has a timeline,
     * a reference, and a zero next to the money. What must never happen is a
     * refusal that reads as a sale.
     */
    if (!res.ok || !res.data) {
      if (!res.error?.message && !res.error?.messageKey) throw new Error("failed with nothing to tell the customer");
      return `refused ${res.status} · ${res.error.messageKey ?? res.error.message}`;
    }
    const booking = res.data.booking;
    if (booking.status !== "failed") throw new Error(`a rejected order reads as "${booking.status}"`);
    if (booking.paidAmount) throw new Error(`a rejected order shows ${booking.paidAmount} taken`);
    return `recorded as failed · nothing paid`;
  });

  await check("a sold-out rate is caught before the money", async () => {
    const card = await freshOffer();
    const session = await sessionFor(card);
    const res = await api("/api/bookings", {
      body: bookingBody(session.checkoutSessionId),
      scenario: "rateSoldOut",
    });
    if (res.ok) throw new Error("a sold-out rate was booked");
    if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
    return `409 · ${res.error?.recommendedAction ?? ""}`;
  });

  /* ---------------------------------------------------------------------- */
  section("The trade path: booking on account");

  let agentPermission = "";

  await check("an agent holds a session", async () => {
    const start = await api<{ demoCode?: string; codeRequired: boolean }>("/api/agency/session", {
      body: { email: AGENT },
    });
    if (!start.data?.demoCode) return "SKIP: this environment does not echo the code, so no session can be held";
    // POST asks for a code; PUT redeems it. Two verbs on one path, because
    // they are two steps of one thing rather than two resources.
    const done = await api<{ session: { permission: string; agencyName: string } }>("/api/agency/session", {
      method: "PUT",
      body: { email: AGENT, code: start.data.demoCode },
    });
    if (!done.ok || !done.data) throw new Error(`sign-in failed: ${done.status}`);
    agentPermission = done.data.session.permission;
    return `${done.data.session.agencyName} · ${agentPermission}`;
  });

  await check("a rate is rechecked before credit is committed", async () => {
    if (!agentPermission) return "SKIP: no agent session";
    const card = await freshOffer();
    const res = await api<{ changed?: boolean; price?: { total: number } }>("/api/rates/recheck", {
      body: { offerId: card.offerSummary.offerId },
    });
    if (!res.ok) {
      const why = res.error?.messageKey ?? String(res.status);
      if (res.error?.category === "supplier") throw new SupplyUnavailable(`recheck unavailable: ${why}`);
      throw new Error(`recheck failed: ${res.status} ${why}`);
    }
    spent.delete(card.offerSummary.offerId);
    return `changed=${res.data?.changed ?? false}`;
  });

  let tradeRef = "";
  let heldRef = "";

  await check("an agent books onto the agency account", async () => {
    if (!agentPermission) return "SKIP: no agent session";
    const card = await freshOffer();
    const session = await sessionFor(card);
    const res = await api<{ booking: Booking }>("/api/bookings", {
      body: bookingBody(session.checkoutSessionId),
    });
    if (!res.ok || !res.data) {
      const why = res.error?.messageKey ?? res.error?.message ?? String(res.status);
      if (res.error?.category === "supplier" || res.status >= 500) throw new SupplyUnavailable(`supplier refused: ${why}`);
      throw new Error(`trade booking refused: ${res.status} ${why}`);
    }
    tradeRef = res.data.booking.reference;
    return `${tradeRef} · ${res.data.booking.status}`;
  });

  await check("it shows up on the agency's own list", async () => {
    if (!tradeRef) return "SKIP: nothing was booked on account";
    const res = await api<{ bookings: { reference: string }[] }>("/api/agency/bookings");
    if (!res.ok || !res.data) throw new Error(`the agency booking list failed: ${res.status}`);
    const found = res.data.bookings?.some((b) => b.reference === tradeRef);
    if (!found) throw new Error(`${tradeRef} was booked but is not on the agency's list`);
    return `${res.data.bookings.length} bookings, including this one`;
  });

  await check("the trade booking exposes cost and margin, and no net rate", async () => {
    if (!tradeRef) return "SKIP: nothing was booked on account";
    const res = await api(`/api/agency/bookings/${tradeRef}`);
    if (!res.ok) throw new Error(`could not read the trade booking: ${res.status}`);
    const found = leaks(res.raw);
    if (found.length) throw new Error(`§9.4 leak: ${found.join(", ")}`);
    return "cost and sell only";
  });

  await check("a voucher can be issued for a confirmed booking", async () => {
    if (!tradeRef) return "SKIP: nothing was booked on account";
    const res = await api(`/api/agency/bookings/${tradeRef}/voucher`);
    if (!res.ok && res.status !== 200) throw new Error(`no voucher: ${res.status} ${res.error?.messageKey ?? ""}`);
    const found = leaks(res.raw);
    if (found.length) throw new Error(`§9.4 leak on the voucher: ${found.join(", ")}`);
    return "issued, and it names no wholesaler";
  });

  await check("another agency's reference is not readable", async () => {
    const res = await api("/api/agency/bookings/NZ-ZZZ-9999");
    if (res.ok) throw new Error("a guessed reference from another agency was returned");
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    return "404";
  });

  /* ---------------------------------------------------------------------- */
  section("More than one room in one order");

  await check("the same rate twice becomes two rooms, not two orders", async () => {
    if (!agentPermission) return "SKIP: no agent session";
    /*
     * The basket an agent actually builds. Two of the same rate is one
     * checkout with two lines against one property, and both suppliers take
     * the whole order in a single call — so it is one supplier order, one
     * reference and one voucher, not two of everything.
     */
    /*
     * Searched for two rooms, because the allocation is what governs.
     *
     * A two-room basket against a one-room search is correctly refused — the
     * occupancies, the guest form and the requirement schema all come from the
     * allocation, so a room the search never asked for has nobody to put in
     * it. Testing the basket therefore means asking for two in the first place.
     */
    const twoRooms = await api<SearchResponse>("/api/hotels/search", {
      body: {
        intent: {
          destinationId: "dest-dubai",
          destinationDisplay: "Dubai",
          destinationType: "city",
          checkIn: iso(30),
          checkOut: iso(33),
          flexibility: "exact",
          rooms: [
            { adults: 2, childrenAges: [] },
            { adults: 2, childrenAges: [] },
          ],
          accessibleRoom: false,
          locale: "en",
          currency: "USD",
        },
        supply: "live",
        pageSize: 12,
      },
    });
    if (!twoRooms.ok || !twoRooms.data?.totalCount) throw new SupplyUnavailable("no two-room supply");

    // Per-room supply only: a rate that already covers the whole party buys
    // the party twice if it is added twice, which the route refuses for the
    // same reason. `roomsCovered` is how the two are told apart.
    const card = twoRooms.data.results.find((c) => (c.price.roomsCovered ?? 1) === 1);
    if (!card) return "SKIP: every rate here is priced for the whole party";

    const res = await api<CheckoutSession>("/api/checkout/sessions", {
      body: { offerIds: [card.offerSummary.offerId, card.offerSummary.offerId] },
    });
    if (!res.ok || !res.data) {
      // A rate with one room left refusing a second is the correct answer.
      if (res.status === 409) return `WARN: the rate holds only one room — ${res.error?.messageKey ?? ""}`;
      throw new Error(`two rooms refused: ${res.status} ${res.error?.messageKey ?? ""}`);
    }
    if ((res.data.lines?.length ?? 0) !== 2) {
      throw new Error(`two offers produced ${res.data.lines?.length ?? 0} lines`);
    }
    if (res.data.price.total < card.price.total * 1.5) {
      throw new Error(`two rooms priced at ${res.data.price.total}, one was ${card.price.total}`);
    }
    return `2 lines · ${res.data.price.total} ${res.data.price.currency}`;
  });

  await check("a basket bigger than the search is refused", async () => {
    if (!agentPermission) return "SKIP: no agent session";
    /*
     * Thirteen rooms against a one-room search. Refused while the basket is
     * being built, which is the only cheap moment — the alternative is finding
     * out at the supplier with the customer's card details already taken.
     */
    const card = await freshOffer();
    const res = await api("/api/checkout/sessions", {
      body: { offerIds: Array.from({ length: 13 }, () => card.offerSummary.offerId) },
    });
    if (res.ok) throw new Error("thirteen rooms were accepted into one checkout");
    return `refused ${res.status} · ${res.error?.messageKey ?? ""}`;
  });

  /* ---------------------------------------------------------------------- */
  section("Holding rather than selling");

  await check("a booking-only agent can place a hold", async () => {
    const start = await api<{ demoCode?: string }>("/api/agency/session", { body: { email: "holds@skyline.example" } });
    if (!start.data?.demoCode) return "SKIP: no code echoed";
    const done = await api<{ session: { permission: string } }>("/api/agency/session", {
      method: "PUT",
      body: { email: "holds@skyline.example", code: start.data.demoCode },
    });
    if (!done.ok) throw new Error(`the groups desk could not sign in: ${done.status}`);
    if (done.data?.session.permission !== "booking") {
      throw new Error(`expected a booking-only account, got ${done.data?.session.permission}`);
    }

    /*
     * Fresh supply, because by now the run is minutes old.
     *
     * The first attempt at this held nothing across four properties, all of
     * them TourMind answering "No Room Available" at prebook — not a bug in
     * the hold, just rates that had gone stale while the rest of the harness
     * ran. An agent placing a hold has just searched, so this does too.
     */
    await liveSearch(true);
    spent.clear();

    // Refundable only — a hold on a rate that cannot be cancelled is a sale
    // with the invoice postponed. Several tried, for the same reason the happy
    // path tries several: one sold-out rate must not blank out the section.
    const refusals: string[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      let card: Card;
      try {
        card = await freshOffer((c) => c.offerSummary.refundable);
      } catch {
        break;
      }
      const session = await sessionFor(card).catch(() => null);
      if (!session) {
        refusals.push(`${card.name}: checkout refused`);
        continue;
      }
      const res = await api<{ booking: Booking }>("/api/bookings", {
        body: bookingBody(session.checkoutSessionId, { hold: true }),
      });
      if (res.ok && res.data) {
        heldRef = res.data.booking.reference;
        return `${heldRef} · ${res.data.booking.status}`;
      }
      const why = res.error?.messageKey ?? String(res.status);
      const supplyProblem =
        res.error?.category === "availabilityChanged" || res.error?.category === "temporaryService";
      if (!supplyProblem) throw new Error(`hold refused: ${res.status} ${why}`);
      refusals.push(`${card.name}: ${why}`);
    }
    throw new SupplyUnavailable(`nothing holdable in ${refusals.length} attempts — ${refusals.join("; ")}`);
  });

  await check("a booking-only agent cannot turn the hold into a sale", async () => {
    if (!heldRef) return "SKIP: nothing is on hold";
    /*
     * The whole reason the permission exists. The room is already reserved —
     * neither supplier holds one any other way — so what Issue governs is
     * whether this account may commit the agency's money for it.
     */
    const res = await api(`/api/agency/bookings/${heldRef}/issue`, { method: "POST" });
    if (res.ok) throw new Error("a booking-only account issued a hold");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("an account without the hold right is refused, before any supplier is called", async () => {
    /*
     * The right that is not a rung.
     *
     * This account may issue — it is trusted with the credit line — and still
     * may not reserve a room it has not committed to. The ladder cannot say
     * that, which is why the capability exists, and a capability the route
     * does not check is a checkbox.
     *
     * A throwaway account rather than the seeded groups desk: a run that dies
     * between withdrawing a right and restoring it would leave the demo data
     * quietly broken for whoever looked at it next.
     */
    const admin = await api<{ demoCode?: string }>("/api/agency/session", { body: { email: AGENT } });
    if (!admin.data?.demoCode) return "SKIP: no code echoed";
    await api("/api/agency/session", { method: "PUT", body: { email: AGENT, code: admin.data.demoCode } });

    const email = `qa-nohold-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
    const made = await api("/api/agency/agents", {
      body: { email, name: "QA No Hold", permission: "issue", capabilities: { hold: false } },
    });
    if (!made.ok) return `SKIP: could not create the account (${made.status})`;

    const start = await api<{ demoCode?: string }>("/api/agency/session", { body: { email } });
    if (!start.data?.demoCode) return "SKIP: no code echoed";
    const signedIn = await api("/api/agency/session", {
      method: "PUT",
      body: { email, code: start.data.demoCode },
    });
    if (!signedIn.ok) return `SKIP: the new account could not sign in (${signedIn.status})`;

    const card = await freshOffer((c) => c.offerSummary.refundable);
    const session = await sessionFor(card).catch(() => null);
    if (!session) return "SKIP: checkout refused the offer";

    const res = await api(`/api/bookings`, {
      body: bookingBody(session.checkoutSessionId, { hold: true }),
    });
    if (res.ok) throw new Error("an account with the hold right withdrawn placed a hold");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status} ${res.error?.messageKey ?? ""}`);
    if (res.error?.messageKey !== "agency.holdNotPermitted") {
      /*
       * Told apart from "this rate cannot be held" on purpose. The two lead
       * somewhere different — one to another rate, the other to whoever can
       * grant the right — and a shared message sends half of them the wrong way.
       */
      throw new Error(`refused for the wrong reason: ${res.error?.messageKey}`);
    }
    return `403 · ${res.error.messageKey}`;
  });

  await check("an account barred from non-refundable stock cannot buy it", async () => {
    /*
     * Refused before the supplier order, not after. The check sits with the
     * credit gate rather than beside the hold window further down the route,
     * because a refusal that arrives once the room is booked is a booking with
     * an apology attached.
     */
    const admin = await api<{ demoCode?: string }>("/api/agency/session", { body: { email: AGENT } });
    if (!admin.data?.demoCode) return "SKIP: no code echoed";
    await api("/api/agency/session", { method: "PUT", body: { email: AGENT, code: admin.data.demoCode } });

    const email = `qa-nonref-${Math.random().toString(36).slice(2, 8)}@skyline.example`;
    const made = await api("/api/agency/agents", {
      body: { email, name: "QA No NonRef", permission: "issue", capabilities: { nonRefundable: false } },
    });
    if (!made.ok) return `SKIP: could not create the account (${made.status})`;

    const start = await api<{ demoCode?: string }>("/api/agency/session", { body: { email } });
    if (!start.data?.demoCode) return "SKIP: no code echoed";
    await api("/api/agency/session", { method: "PUT", body: { email, code: start.data.demoCode } });

    /*
     * Cast wider than the rest of the harness, which lives in Dubai.
     *
     * Non-refundable headline rates are genuinely scarce there — 12 cards, none
     * of them — so a check bound to that one city would report SKIP on every
     * run and quietly prove nothing at all.
     */
    const card = await nonRefundableCard();
    if (!card) return "SKIP: no non-refundable rate in live supply anywhere we looked";
    const session = await sessionFor(card).catch(() => null);
    if (!session) return "SKIP: checkout refused the offer";

    const res = await api(`/api/bookings`, { body: bookingBody(session.checkoutSessionId) });
    if (res.ok) throw new Error("an account barred from non-refundable stock bought some");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status} ${res.error?.messageKey ?? ""}`);
    if (res.error?.messageKey !== "agency.nonRefundableNotPermitted") {
      throw new Error(`refused for the wrong reason: ${res.error?.messageKey}`);
    }
    return `403 · ${res.error.messageKey}`;
  });

  await check("a view-only agent cannot book at all", async () => {
    /*
     * This one signs in without a code, on purpose: the step protects what a
     * session can *do*, and an account that can spend nothing is looking at
     * rates it could read down the phone. So the harness must not require a
     * code here either — asking for one would test a rule that does not exist
     * and skip the rule that does.
     */
    const start = await api<{ demoCode?: string; codeRequired?: boolean }>("/api/agency/session", {
      body: { email: "viewer@skyline.example" },
    });
    if (start.data?.codeRequired) throw new Error("a view-only account was asked for a code");
    const done = await api<{ session: { permission: string } }>("/api/agency/session", {
      method: "PUT",
      body: { email: "viewer@skyline.example", code: start.data?.demoCode },
    });
    if (!done.ok) throw new Error(`the view-only account could not sign in: ${done.status}`);
    if (done.data?.session.permission !== "viewOnly") {
      throw new Error(`expected viewOnly, got ${done.data?.session.permission}`);
    }
    const card = await freshOffer();
    const session = await sessionFor(card).catch(() => null);
    if (!session) return "SKIP: no session to attempt with";
    const res = await api("/api/bookings", { body: bookingBody(session.checkoutSessionId) });
    if (res.ok) throw new Error("a view-only account created a booking on the agency account");
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    return "403";
  });

  await check("an issuer can turn the hold into a sale", async () => {
    if (!heldRef) return "SKIP: nothing is on hold";
    const start = await api<{ demoCode?: string }>("/api/agency/session", { body: { email: AGENT } });
    if (!start.data?.demoCode) return "SKIP: no code echoed";
    await api("/api/agency/session", { method: "PUT", body: { email: AGENT, code: start.data.demoCode } });

    const res = await api(`/api/agency/bookings/${heldRef}/issue`, { method: "POST" });
    if (!res.ok) throw new Error(`the issuer could not issue: ${res.status} ${res.error?.messageKey ?? ""}`);

    const after = await api<{ booking: { status: string } }>(`/api/agency/bookings/${heldRef}`);
    const status = after.data?.booking?.status;
    if (status === "held") throw new Error("issued, but it is still on hold");
    return `now ${status ?? "issued"}`;
  });

  await check("a hold cannot be issued twice", async () => {
    if (!heldRef) return "SKIP: nothing is on hold";
    const res = await api(`/api/agency/bookings/${heldRef}/issue`, { method: "POST" });
    if (res.ok) throw new Error("the same hold was issued a second time");
    if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
    return "409 · already issued";
  });

  await check("signing out ends the agency session", async () => {
    if (!agentPermission) return "SKIP: no agent session";
    await api("/api/agency/session", { method: "DELETE" });
    const res = await api("/api/agency/bookings");
    if (res.ok) throw new Error("the agency list was still readable after signing out");
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    return "401 after sign-out";
  });

  /* ---------------------------------------------------------------------- */
  section("The agent portal, on its own origin");

  await check("the portal serves the booking screen", async () => {
    if (!PORTAL) return "SKIP: no portal origin given";
    const res = await fetch(`${PORTAL}/en/agency/bookings`).catch(() => null);
    if (!res) return "SKIP: nothing is listening on the portal origin";
    if (!res.ok) throw new Error(`the portal returned ${res.status} for its bookings page`);
    return `${res.status} from ${PORTAL}`;
  });

  await check("the portal never calls itself for the API", async () => {
    if (!PORTAL) return "SKIP: no portal origin given";
    const res = await fetch(`${PORTAL}/api/bookings`, { method: "POST" }).catch(() => null);
    if (!res) return "SKIP: portal not reachable";
    /*
     * The recurring bug in this codebase, four times over: a relative `/api/…`
     * in client code, which on a separated front end resolves to the portal
     * rather than the backend. The portal must not answer API paths at all.
     */
    if (res.status !== 404) {
      throw new Error(`the portal answered /api/bookings with ${res.status} — a relative URL would silently work here`);
    }
    return "404 — API paths belong to the backend only";
  });

  /* ---------------------------------------------------------------------- */
  report();
}

function report(): void {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const failed = results.filter((r) => r.verdict === "FAIL");

  process.stdout.write(`\n${"─".repeat(72)}\n`);
  process.stdout.write(
    `${count("PASS")} passed · ${count("FAIL")} failed · ${count("WARN")} unprovable · ${count("SKIP")} skipped\n`,
  );

  if (failed.length) {
    process.stdout.write(`\nDefects:\n`);
    for (const f of failed) process.stdout.write(`  ${f.group} — ${f.name}\n    ${f.detail}\n`);
  }

  const warned = results.filter((r) => r.verdict === "WARN");
  if (warned.length) {
    process.stdout.write(`\nCould not be judged (supply, not code):\n`);
    for (const w of warned) process.stdout.write(`  ${w.name} — ${w.detail}\n`);
  }

  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  process.stdout.write(`\nThe harness itself fell over: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
