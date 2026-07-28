import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../server/runtime";
import { policyFrom } from "./pricing";
import type {
  Agency,
  Agent,
  AgencyBalance,
  AgencyBooking,
  AgencyCustomer,
  AgencyQuote,
  LedgerEntry,
  MarkupRule,
} from "./types";

/**
 * Process-local persistence for the B2B side, matching the consumer store's
 * approach: a production BFF owns these in a database, and the shapes here are
 * what the portal contract needs.
 *
 * The credit ledger is append-only. Balances are derived from it rather than
 * stored, so a figure on screen can always be traced to the entries behind it —
 * and a bug can never leave a stored total disagreeing with its own history.
 */

const FILE = path.join(dataDir(), "agencies.json");

interface Shape {
  agencies: Agency[];
  agents: Agent[];
  ledger: LedgerEntry[];
  bookings: AgencyBooking[];
  quotes: AgencyQuote[];
  customers: AgencyCustomer[];
}

const state: Shape = { agencies: [], agents: [], ledger: [], bookings: [], quotes: [], customers: [] };
let loaded = false;

/**
 * The file's modification time as of our last read.
 *
 * The consumer store can get away with loading once, because the same request
 * that writes a booking is the one that reads it back. This store cannot: the
 * booking route commits credit and the portal routes display it, and those are
 * separate handlers — in dev each with its own module instance, in production
 * potentially separate instances entirely. Loading once meant an agent watched
 * their balance stay at the full limit after a booking that had demonstrably
 * been recorded.
 *
 * A stat per read is cheap and makes the file, not whichever copy happened to
 * load first, the source of truth.
 */
let seenMtimeMs = 0;

/** Set by the test seam, which owns its state outright and must not re-read. */
let pinned = false;

/**
 * A demo agency, so the portal can be opened and understood before anybody has
 * been onboarded. Created only when the store is genuinely empty — it must
 * never appear alongside real agencies.
 */
function seed(): void {
  const now = new Date().toISOString();
  const agency: Agency = {
    id: "agc_demo",
    name: "Skyline Travel",
    slug: "skyline",
    countryCode: "PK",
    status: "active",
    commissionPercent: 12,
    markup: { default: { mode: "percent", value: 10 }, overrides: [{ countryCode: "SA", rule: { mode: "percent", value: 6 } }] },
    credit: { limit: 25_000, currency: "USD", paymentDays: 30 },
    profile: {
      legalName: "Skyline Tours and Travels",
      address: "Shahrah-e-Faisal",
      city: "Karachi",
      taxNumber: "",
      email: "hotels@skyline.example",
      phone: "+92 21 111 000 000",
    },
    createdAt: now,
  };
  state.agencies.push(agency);
  state.agents.push(
    {
      id: "agt_demo_admin",
      agencyId: agency.id,
      email: "admin@skyline.example",
      name: "Agency admin",
      role: "admin",
      active: true,
      createdAt: now,
    },
    {
      id: "agt_demo_agent",
      agencyId: agency.id,
      email: "agent@skyline.example",
      name: "Counter agent",
      role: "agent",
      active: true,
      createdAt: now,
    },
  );
}

export async function loadAgencies(): Promise<void> {
  if (pinned) return;

  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(FILE)).mtimeMs;
  } catch {
    // No file yet — fall through to the seed on a first load.
  }
  if (loaded && mtimeMs === seenMtimeMs) return;

  loaded = true;
  seenMtimeMs = mtimeMs;
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<Shape>;
    state.agencies = parsed.agencies ?? [];
    state.agents = parsed.agents ?? [];
    state.ledger = parsed.ledger ?? [];
    state.bookings = parsed.bookings ?? [];
    state.quotes = parsed.quotes ?? [];
    state.customers = parsed.customers ?? [];
    state.agencies = state.agencies.map(migrate);
  } catch {
    // No file yet.
  }
  if (!state.agencies.length) seed();
}

async function persist(): Promise<void> {
  if (pinned) return;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
    // Our own write is not a change to react to; recording it here stops the
    // next read from discarding state we already hold.
    seenMtimeMs = (await fs.stat(FILE)).mtimeMs;
  } catch {
    // Persistence is best-effort; the process-local copy stays authoritative.
  }
}

/* --------------------------------------------------------------- reads */

/**
 * Brings a stored agency up to the current shape.
 *
 * Records written before markup became a policy hold a bare rule, and ones
 * written before profiles existed hold nothing at all. Reading those as-is
 * would surface `undefined` in a quote header or throw on `.overrides`, so the
 * gap is closed on the way in rather than guarded at every use.
 */
function migrate(agency: Agency): Agency {
  const stored: unknown = agency.markup;
  const markup =
    stored && typeof stored === "object" && "mode" in stored
      ? policyFrom(stored as MarkupRule)
      : ((stored as Agency["markup"]) ?? policyFrom({ mode: "percent", value: 10 }));

  return {
    ...agency,
    markup: { default: markup.default, overrides: markup.overrides ?? [] },
    profile: agency.profile ?? {
      legalName: agency.name,
      address: "",
      city: "",
      email: "",
      phone: "",
    },
  };
}

export async function getAgency(id: string): Promise<Agency | undefined> {
  await loadAgencies();
  return state.agencies.find((a) => a.id === id);
}

export async function listAgencies(): Promise<Agency[]> {
  await loadAgencies();
  return [...state.agencies];
}

export async function getAgentByEmail(email: string): Promise<Agent | undefined> {
  await loadAgencies();
  const needle = email.trim().toLowerCase();
  return state.agents.find((a) => a.email.toLowerCase() === needle);
}

export async function listAgents(agencyId: string): Promise<Agent[]> {
  await loadAgencies();
  return state.agents.filter((a) => a.agencyId === agencyId);
}

/* -------------------------------------------------------------- writes */

export async function saveAgency(agency: Agency): Promise<void> {
  await loadAgencies();
  const i = state.agencies.findIndex((a) => a.id === agency.id);
  if (i >= 0) state.agencies[i] = agency;
  else state.agencies.push(agency);
  await persist();
}

export async function saveAgent(agent: Agent): Promise<void> {
  await loadAgencies();
  const i = state.agents.findIndex((a) => a.id === agent.id);
  if (i >= 0) state.agents[i] = agent;
  else state.agents.push(agent);
  await persist();
}

/* -------------------------------------------------------------- ledger */

export async function appendLedger(entry: LedgerEntry): Promise<void> {
  await loadAgencies();
  state.ledger.push(entry);
  await persist();
}

export async function listLedger(agencyId: string, limit = 50): Promise<LedgerEntry[]> {
  await loadAgencies();
  return state.ledger
    .filter((e) => e.agencyId === agencyId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/**
 * The agency's credit position, summed from the ledger.
 *
 * `used` is what current entries commit — negative entries take credit,
 * positive ones give it back — so a cancellation restores headroom without
 * anybody adjusting a stored total.
 */
export async function agencyBalance(agencyId: string): Promise<AgencyBalance | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  const entries = state.ledger.filter((e) => e.agencyId === agencyId);
  const net = entries.reduce((sum, e) => sum + e.amount, 0);
  const used = Math.max(0, -net);
  return {
    agencyId,
    currency: agency.credit.currency,
    limit: agency.credit.limit,
    used,
    available: Math.max(0, agency.credit.limit - used),
  };
}

/**
 * Whether a booking of this size can proceed.
 *
 * Checked before the supplier is called, not after: refusing a booking we have
 * already created is a cancellation and a refund, and an agent finding out
 * afterwards has already promised the room to a customer.
 */
export async function canCommit(agencyId: string, amount: number): Promise<boolean> {
  const agency = await getAgency(agencyId);
  if (!agency || agency.status !== "active") return false;
  const balance = await agencyBalance(agencyId);
  return Boolean(balance && amount <= balance.available);
}

/* ------------------------------------------------------------ bookings */

/**
 * The commercial side of a booking, kept apart from the booking itself.
 *
 * A `Booking` is what the guest holds — it is rendered on a voucher and shown
 * to a traveller. Cost and margin belong to the agency, not the guest, so they
 * live here and join on the reference rather than riding along in a record the
 * consumer routes also serve.
 */
export async function saveAgencyBooking(record: AgencyBooking): Promise<void> {
  await loadAgencies();
  const i = state.bookings.findIndex((b) => b.reference === record.reference);
  if (i >= 0) state.bookings[i] = record;
  else state.bookings.push(record);
  await persist();
}

export async function getAgencyBooking(reference: string): Promise<AgencyBooking | undefined> {
  await loadAgencies();
  return state.bookings.find((b) => b.reference === reference);
}

export async function listAgencyBookings(agencyId: string): Promise<AgencyBooking[]> {
  await loadAgencies();
  return state.bookings
    .filter((b) => b.agencyId === agencyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* -------------------------------------------------------------- quotes */

export async function saveQuote(quote: AgencyQuote): Promise<void> {
  await loadAgencies();
  const i = state.quotes.findIndex((q) => q.id === quote.id);
  if (i >= 0) state.quotes[i] = quote;
  else state.quotes.push(quote);
  await persist();
}

export async function getQuote(id: string): Promise<AgencyQuote | undefined> {
  await loadAgencies();
  return state.quotes.find((q) => q.id === id);
}

export async function listQuotes(agencyId: string): Promise<AgencyQuote[]> {
  await loadAgencies();
  return state.quotes
    .filter((q) => q.agencyId === agencyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ----------------------------------------------------------- customers */

export async function saveCustomer(customer: AgencyCustomer): Promise<void> {
  await loadAgencies();
  const i = state.customers.findIndex((c) => c.id === customer.id);
  if (i >= 0) state.customers[i] = customer;
  else state.customers.push(customer);
  await persist();
}

export async function listCustomers(agencyId: string): Promise<AgencyCustomer[]> {
  await loadAgencies();
  return state.customers
    .filter((c) => c.agencyId === agencyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomer(id: string): Promise<AgencyCustomer | undefined> {
  await loadAgencies();
  return state.customers.find((c) => c.id === id);
}

export async function removeCustomer(agencyId: string, id: string): Promise<boolean> {
  await loadAgencies();
  const i = state.customers.findIndex((c) => c.id === id && c.agencyId === agencyId);
  if (i < 0) return false;
  state.customers.splice(i, 1);
  await persist();
  return true;
}

/* ---------------------------------------------------------- statements */

/**
 * What an agency owes for a calendar month.
 *
 * Bookings and their cancellations net off within the month they happened, so a
 * stay booked and dropped in the same week does not appear as money owed.
 * Settlements are listed separately rather than folded in: an agency reading a
 * statement wants to see what it was charged and what it has paid as two
 * numbers, not one difference.
 */
export interface StatementPeriod {
  /** `YYYY-MM`. */
  month: string;
  charged: number;
  credited: number;
  settled: number;
  currency: string;
  entries: LedgerEntry[];
}

export async function statementPeriods(agencyId: string): Promise<StatementPeriod[]> {
  const agency = await getAgency(agencyId);
  if (!agency) return [];
  const byMonth = new Map<string, StatementPeriod>();

  for (const entry of state.ledger.filter((e) => e.agencyId === agencyId)) {
    const month = entry.at.slice(0, 7);
    const period =
      byMonth.get(month) ??
      ({ month, charged: 0, credited: 0, settled: 0, currency: agency.credit.currency, entries: [] } as StatementPeriod);

    if (entry.kind === "settlement") period.settled += Math.abs(entry.amount);
    else if (entry.amount < 0) period.charged += -entry.amount;
    else period.credited += entry.amount;

    period.entries.push(entry);
    byMonth.set(month, period);
  }

  return [...byMonth.values()]
    .map((p) => ({ ...p, entries: p.entries.sort((a, b) => b.at.localeCompare(a.at)) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Test seam: reset without touching the disk. */
export function __resetAgencies(next?: Partial<Shape>): void {
  state.agencies = next?.agencies ?? [];
  state.agents = next?.agents ?? [];
  state.ledger = next?.ledger ?? [];
  state.bookings = next?.bookings ?? [];
  state.quotes = next?.quotes ?? [];
  state.customers = next?.customers ?? [];
  loaded = true;
  pinned = true;
}
