import { driver } from "./persistence";
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
 * Where a booking lives between requests.
 *
 * The volatile half — offers, checkout sessions, cancellation quotes — is
 * deliberately process-local: it is short-lived working state tied to one
 * conversation with the guest, and re-quoting is the correct behaviour when it
 * is gone. Bookings and their supplier references are not: they are the record
 * of money taken and a room held, so they go through the shared persistence
 * driver and survive whichever instance happened to create them.
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

/**
 * What a TourMind offer needs to survive from availability to booking.
 *
 * `net` is here because their prebook and create calls both require the price
 * we last saw — it is how they detect the rate moved — and because their
 * cancellation fees are a share of net, not of what the customer paid.
 */
export interface TourmindOfferBinding {
  rateCode: string;
  hotelCode: string;
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
  tourmind?: TourmindOfferBinding;
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

/**
 * A document several instances share.
 *
 * Each concern gets its own — bookings, support, sign-in codes — so recording a
 * support case does not rewrite every booking, and a busy sign-in flow does not
 * compete for the same document as the booking record.
 *
 * The discipline every caller follows is load, mutate, save. A document is
 * written whole, so an instance that mutated without reading would persist its
 * own partial view over everybody else's: the one way a shared store loses more
 * than no store at all.
 */
class SharedDoc<T> {
  private version: string | null = null;
  private everLoaded = false;

  constructor(
    private readonly key: string,
    private readonly apply: (value: T) => void,
    private readonly snapshot: () => T,
  ) {}

  /** Reads only when the stored version has moved since we last looked. */
  async load(): Promise<void> {
    const version = await driver().version(this.key);
    if (this.everLoaded && version === this.version) return;
    this.everLoaded = true;
    this.version = version;
    const parsed = await driver().read<T>(this.key);
    if (parsed) this.apply(parsed);
  }

  async save(): Promise<void> {
    await driver().write(this.key, this.snapshot());
    // Our own write must not look like someone else's change on the next read.
    this.version = await driver().version(this.key);
  }

  /** Test seam: behave like a process that has never read this document. */
  forget(): void {
    this.everLoaded = false;
    this.version = null;
  }
}

/* The record of money taken and a room held. */
interface BookingsDoc {
  bookings: Booking[];
  byEmail: [string, string[]][];
}

const bookingsDoc = new SharedDoc<BookingsDoc>(
  "bookings",
  (value) => {
    store.bookings.clear();
    store.bookingsByEmail.clear();
    for (const booking of value.bookings ?? []) store.bookings.set(booking.reference, booking);
    for (const [email, refs] of value.byEmail ?? []) store.bookingsByEmail.set(email, refs);
  },
  () => ({
    bookings: [...store.bookings.values()],
    byEmail: [...store.bookingsByEmail.entries()],
  }),
);

/* Kept apart from the booking document so it can never be serialised with it. */
type SupplierRefsDoc = [string, { reference: string; source: string }][];

const supplierRefsDoc = new SharedDoc<SupplierRefsDoc>(
  "supplier-refs",
  (value) => {
    store.supplierRefs.clear();
    for (const [key, ref] of value) store.supplierRefs.set(key, ref);
  },
  () => [...store.supplierRefs.entries()],
);

/*
 * Everything a guest leaves behind that someone else has to answer.
 *
 * A support case raised on one instance and an operator working the queue on
 * another is the ordinary case, not the edge one — without this the console
 * shows whatever its own instance happened to see.
 */
interface SupportDoc {
  cases: SupportCase[];
  alerts: PriceAlert[];
  travelers: [string, TravelerProfile[]][];
  notifications: [string, AppNotification[]][];
}

const supportDoc = new SharedDoc<SupportDoc>(
  "support",
  (value) => {
    store.cases.clear();
    store.alerts.clear();
    store.travelers.clear();
    store.notifications.clear();
    for (const item of value.cases ?? []) store.cases.set(item.caseId, item);
    for (const alert of value.alerts ?? []) store.alerts.set(alert.id, alert);
    for (const [email, profiles] of value.travelers ?? []) store.travelers.set(email, profiles);
    for (const [channel, list] of value.notifications ?? []) store.notifications.set(channel, list);
  },
  () => ({
    cases: [...store.cases.values()],
    alerts: [...store.alerts.values()],
    travelers: [...store.travelers.entries()],
    notifications: [...store.notifications.entries()],
  }),
);

/*
 * Sign-in codes.
 *
 * The instance that issues a code is rarely the one that checks it, so holding
 * them in process meant sign-in worked only when a lambda happened to be
 * reused. `DEMO_OTP` papered over that; this removes the need for it.
 */
type OtpDoc = [string, { code: string; expiresAt: number; purpose: string }][];

const otpDoc = new SharedDoc<OtpDoc>(
  "otps",
  (value) => {
    store.otps.clear();
    const now = Date.now();
    for (const [key, entry] of value) if (entry.expiresAt > now) store.otps.set(key, entry);
  },
  // Expired codes are dropped on the way out rather than accumulating forever.
  () => [...store.otps.entries()].filter(([, entry]) => entry.expiresAt > Date.now()),
);

/**
 * Test seam: forget the sign-in codes this process is holding, which is what a
 * cold instance sees.
 */
export function __resetOtpCache(): void {
  store.otps.clear();
  otpDoc.forget();
}

/** Bookings and the supplier references that belong to them. */
export async function loadPersisted(): Promise<void> {
  await bookingsDoc.load();
  await supplierRefsDoc.load();
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
  // Read before writing. A document is written whole, so an instance that has
  // never read would otherwise persist its own single booking over everyone
  // else's — the one way a shared store loses more data than no store at all.
  await loadPersisted();
  store.bookings.set(booking.reference, booking);
  if (email) {
    const key = email.trim().toLowerCase();
    const list = store.bookingsByEmail.get(key) ?? [];
    if (!list.includes(booking.reference)) list.push(booking.reference);
    store.bookingsByEmail.set(key, list);
  }
  await bookingsDoc.save();
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
export async function linkSupplierReference(
  platformReference: string,
  reference: string,
  source: string,
): Promise<void> {
  // Awaited rather than fired and forgotten: a lambda is frozen the moment it
  // responds, and losing this link means a real supplier booking nobody can
  // cancel.
  await loadPersisted();
  store.supplierRefs.set(platformReference, { reference, source });
  await supplierRefsDoc.save();
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

export async function saveAlert(alert: PriceAlert): Promise<void> {
  await supportDoc.load();
  store.alerts.set(alert.id, alert);
  await supportDoc.save();
}

export async function listAlerts(): Promise<PriceAlert[]> {
  await supportDoc.load();
  return [...store.alerts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removeAlert(id: string): Promise<void> {
  await supportDoc.load();
  const alert = store.alerts.get(id);
  if (!alert) return;
  store.alerts.set(id, { ...alert, status: "unsubscribed" });
  await supportDoc.save();
}

export async function saveCase(supportCase: SupportCase): Promise<void> {
  await supportDoc.load();
  store.cases.set(supportCase.caseId, supportCase);
  await supportDoc.save();
}

export async function listCases(): Promise<SupportCase[]> {
  await supportDoc.load();
  return [...store.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCase(id: string): Promise<SupportCase | undefined> {
  await supportDoc.load();
  return store.cases.get(id);
}

export async function pushNotification(channel: string, notification: AppNotification): Promise<void> {
  await supportDoc.load();
  const list = store.notifications.get(channel) ?? [];
  list.unshift(notification);
  store.notifications.set(channel, list.slice(0, 50));
  await supportDoc.save();
}

export async function listNotifications(channel: string): Promise<AppNotification[]> {
  await supportDoc.load();
  return store.notifications.get(channel) ?? [];
}

export async function markNotificationsRead(channel: string): Promise<void> {
  await supportDoc.load();
  const list = store.notifications.get(channel) ?? [];
  store.notifications.set(
    channel,
    list.map((n) => ({ ...n, read: true })),
  );
  await supportDoc.save();
}

/* ---------------------------------------------------------------- OTP */

/**
 * A fixed sign-in code, when one is configured.
 *
 * Set `DEMO_OTP` and every sign-in accepts that code. It exists so a demo can
 * be handed to someone with credentials that still work tomorrow — a random
 * code that expires in ten minutes cannot be written in an email.
 *
 * It is, by design, a shared secret that is not secret. Never set it on a
 * deployment holding real bookings or real money: with it set, knowing an
 * address is the whole of signing in as that person.
 */
function fixedOtp(): string | null {
  const value = process.env.DEMO_OTP?.trim();
  return value && /^\d{4,8}$/.test(value) ? value : null;
}

export async function issueOtp(key: string, purpose: string): Promise<string> {
  // Demo environment: the code is surfaced in the response so the flow can be
  // exercised. A real deployment sends it out-of-band only.
  const code = fixedOtp() ?? String(100000 + Math.floor(Math.random() * 899999));
  await otpDoc.load();
  store.otps.set(`${purpose}:${key.toLowerCase()}`, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    purpose,
  });
  await otpDoc.save();
  return code;
}

export async function verifyOtp(key: string, purpose: string, code: string): Promise<boolean> {
  // A configured code verifies without consulting the store at all.
  const fixed = fixedOtp();
  if (fixed && code.trim() === fixed) return true;

  await otpDoc.load();
  const entry = store.otps.get(`${purpose}:${key.toLowerCase()}`);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) return false;
  if (entry.code !== code.trim()) return false;
  // Single use, and the deletion has to be visible to the next instance too.
  store.otps.delete(`${purpose}:${key.toLowerCase()}`);
  await otpDoc.save();
  return true;
}

/* --------------------------------------------------------- travelers */

export async function saveTravelers(email: string, profiles: TravelerProfile[]): Promise<void> {
  await supportDoc.load();
  store.travelers.set(email.toLowerCase(), profiles);
  await supportDoc.save();
}

export async function listTravelers(email: string): Promise<TravelerProfile[]> {
  await supportDoc.load();
  return store.travelers.get(email.toLowerCase()) ?? [];
}
