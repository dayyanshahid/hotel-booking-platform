import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir } from "./runtime";
import type {
  Booking,
  CancellationPolicy,
  CancellationQuote,
  CheckoutSession,
  PriceAlert,
  PriceStack,
  SearchIntent,
  SupportCase,
  AppNotification,
  RateComment,
  TravelerProfile,
} from "../types";
import type { BoardCode, RateClass } from "./pricing";
import type { SourceCode } from "./suppliers";

/**
 * Process-local persistence. A production BFF owns these in a database; the
 * shapes here mirror what the frontend contract needs (§8.5, §8.6).
 */

/**
 * Supplier context for a live Hotelbeds offer.
 *
 * The rateKey is opaque and must be copied between operations untouched, per
 * the supplier's own integration rules. It is held here, server-side, and never
 * placed in a response, a URL or an analytics event (§9.4, §13.1).
 */
export interface HotelbedsOfferBinding {
  rateKey: string;
  hotelCode: number;
  roomCode: string;
  boardCode: string;
  net: number;
  supplierCurrency: string;
}

export interface StoredOffer {
  offerId: string;
  hotelSlug: string;
  roomKey: string;
  canonicalRoomKey: string;
  board: BoardCode;
  rateClass: RateClass;
  sourceCode: SourceCode | "HB";
  rateTypeInternal: "BOOKABLE" | "RECHECK";
  conditionCodes: string[];
  memberRate: boolean;
  guaranteeEligible: boolean;
  modifiable: boolean;
  allotment: number;
  intent: SearchIntent;
  price: PriceStack;
  cancellation: CancellationPolicy;
  expiresAt: string;
  supplierRoomLabel: string;
  /** Present only for offers that came from the live supplier. */
  hotelbeds?: HotelbedsOfferBinding;
  /**
   * Canonical labels captured at availability time, so checkout never has to
   * re-derive them from a catalogue that may not be synced yet.
   */
  hotelName?: string;
  roomLabel?: string;
  boardLabel?: string;
  /** Structured conditions already built by the adapter (live supply). */
  comments?: RateComment[];
}

interface StoreShape {
  offers: Map<string, StoredOffer>;
  sessions: Map<string, CheckoutSession & { accepted?: boolean; idempotencyKeys: string[] }>;
  bookings: Map<string, Booking>;
  /** idempotency key → booking reference (E-16: one order per intent). */
  idempotency: Map<string, string>;
  quotes: Map<string, CancellationQuote>;
  alerts: Map<string, PriceAlert>;
  cases: Map<string, SupportCase>;
  notifications: Map<string, AppNotification[]>;
  otps: Map<string, { code: string; expiresAt: number; purpose: string }>;
  travelers: Map<string, TravelerProfile[]>;
  /** email → booking references, for guest lookup and account merge (E-22). */
  bookingsByEmail: Map<string, string[]>;
  /**
   * Platform reference → supplier reference. Held apart from the Booking record
   * so the supplier's own confirmation number can never be serialised into a
   * customer response (§8.5: the platform reference is the customer primary).
   */
  supplierRefs: Map<string, { reference: string; source: string }>;
}

declare global {
  var __nazilStore: StoreShape | undefined;
}

const store: StoreShape =
  globalThis.__nazilStore ??
  (globalThis.__nazilStore = {
    offers: new Map(),
    sessions: new Map(),
    bookings: new Map(),
    idempotency: new Map(),
    quotes: new Map(),
    alerts: new Map(),
    cases: new Map(),
    notifications: new Map(),
    otps: new Map(),
    travelers: new Map(),
    bookingsByEmail: new Map(),
    supplierRefs: new Map(),
  });

const DATA_DIR = dataDir();
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
let loaded = false;

/** Bookings are the only records worth surviving a dev-server restart. */
export async function loadPersisted(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as { bookings: Booking[]; byEmail: [string, string[]][] };
    for (const b of parsed.bookings ?? []) store.bookings.set(b.reference, b);
    for (const [email, refs] of parsed.byEmail ?? []) store.bookingsByEmail.set(email, refs);
  } catch {
    /* first run */
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "supplier-refs.json"), "utf8");
    for (const [key, value] of JSON.parse(raw) as [string, { reference: string; source: string }][]) {
      store.supplierRefs.set(key, value);
    }
  } catch {
    /* no live bookings yet */
  }
}

async function persistSupplierRefs(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, "supplier-refs.json"),
      JSON.stringify([...store.supplierRefs.entries()], null, 2),
      "utf8",
    );
  } catch {
    /* best effort */
  }
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify(
        {
          bookings: [...store.bookings.values()],
          byEmail: [...store.bookingsByEmail.entries()],
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* persistence is best-effort in the demo environment */
  }
}

/* ------------------------------------------------------------- offers */

export function rememberOffer(id: string, offer: StoredOffer): void {
  store.offers.set(id, offer);
  if (store.offers.size > 6000) {
    const cutoff = Date.now();
    for (const [key, value] of store.offers) {
      if (new Date(value.expiresAt).getTime() < cutoff) store.offers.delete(key);
    }
  }
}

export function getOffer(id: string): StoredOffer | undefined {
  return store.offers.get(id);
}

/* ----------------------------------------------------------- sessions */

export type StoredSession = CheckoutSession & { accepted?: boolean; idempotencyKeys: string[] };

export function saveSession(session: StoredSession): void {
  store.sessions.set(session.checkoutSessionId, session);
}

export function getSession(id: string): StoredSession | undefined {
  return store.sessions.get(id);
}

/* ----------------------------------------------------------- bookings */

export async function saveBooking(booking: Booking, email?: string): Promise<void> {
  store.bookings.set(booking.reference, booking);
  if (email) {
    const key = email.trim().toLowerCase();
    const list = store.bookingsByEmail.get(key) ?? [];
    if (!list.includes(booking.reference)) list.push(booking.reference);
    store.bookingsByEmail.set(key, list);
  }
  await persist();
}

export async function getBooking(reference: string): Promise<Booking | undefined> {
  await loadPersisted();
  return store.bookings.get(reference.toUpperCase());
}

export async function listBookings(email?: string): Promise<Booking[]> {
  await loadPersisted();
  if (!email) return [...store.bookings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const refs = store.bookingsByEmail.get(email.trim().toLowerCase()) ?? [];
  return refs
    .map((r) => store.bookings.get(r))
    .filter((b): b is Booking => Boolean(b))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Returns the reference a previous submission of this key produced, if any. */
export function peekIdempotency(key: string): string | undefined {
  return store.idempotency.get(key);
}

export function setIdempotency(key: string, reference: string): void {
  store.idempotency.set(key, reference);
}

/** Supplier-side identifiers, kept out of every customer-facing payload. */
export function linkSupplierReference(platformReference: string, reference: string, source: string): void {
  store.supplierRefs.set(platformReference, { reference, source });
  void persistSupplierRefs();
}

export function getSupplierReference(platformReference: string): { reference: string; source: string } | undefined {
  return store.supplierRefs.get(platformReference);
}

/* ------------------------------------------------------------- quotes */

export function saveQuote(quote: CancellationQuote): void {
  store.quotes.set(quote.quoteId, quote);
}

export function getQuote(id: string): CancellationQuote | undefined {
  return store.quotes.get(id);
}

/* ------------------------------------------------- alerts, cases, misc */

export function saveAlert(alert: PriceAlert): void {
  store.alerts.set(alert.id, alert);
}

export function listAlerts(): PriceAlert[] {
  return [...store.alerts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function removeAlert(id: string): void {
  const alert = store.alerts.get(id);
  if (alert) store.alerts.set(id, { ...alert, status: "unsubscribed" });
}

export function saveCase(supportCase: SupportCase): void {
  store.cases.set(supportCase.caseId, supportCase);
}

export function listCases(): SupportCase[] {
  return [...store.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCase(id: string): SupportCase | undefined {
  return store.cases.get(id);
}

export function pushNotification(channel: string, notification: AppNotification): void {
  const list = store.notifications.get(channel) ?? [];
  list.unshift(notification);
  store.notifications.set(channel, list.slice(0, 50));
}

export function listNotifications(channel: string): AppNotification[] {
  return store.notifications.get(channel) ?? [];
}

export function markNotificationsRead(channel: string): void {
  const list = store.notifications.get(channel) ?? [];
  store.notifications.set(
    channel,
    list.map((n) => ({ ...n, read: true })),
  );
}

/* ---------------------------------------------------------------- OTP */

export function issueOtp(key: string, purpose: string): string {
  // Demo environment: the code is deterministic and surfaced in the response so
  // the flow can be exercised. A real deployment sends it out-of-band only.
  const code = String(100000 + Math.floor(Math.random() * 899999));
  store.otps.set(`${purpose}:${key.toLowerCase()}`, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    purpose,
  });
  return code;
}

export function verifyOtp(key: string, purpose: string, code: string): boolean {
  const entry = store.otps.get(`${purpose}:${key.toLowerCase()}`);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) return false;
  if (entry.code !== code.trim()) return false;
  store.otps.delete(`${purpose}:${key.toLowerCase()}`);
  return true;
}

/* --------------------------------------------------------- travelers */

export function saveTravelers(email: string, profiles: TravelerProfile[]): void {
  store.travelers.set(email.toLowerCase(), profiles);
}

export function listTravelers(email: string): TravelerProfile[] {
  return store.travelers.get(email.toLowerCase()) ?? [];
}
