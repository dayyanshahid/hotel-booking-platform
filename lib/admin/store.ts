import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../server/runtime";

/**
 * Platform state the console owns: what we charge, and what operators did.
 *
 * Kept apart from both the consumer store and the agency store because it
 * belongs to neither. An agency must never be able to read it, and a traveller
 * has no concept of it.
 */

const FILE = path.join(dataDir(), "platform.json");

/**
 * One operator action.
 *
 * Append-only, and written for anything that changes money, access or a
 * customer's booking. The point is not to catch anyone — it is that when an
 * agency asks why their commission changed in March, the answer exists and
 * names a person. An audit trail that is written selectively is not one.
 */
export interface AuditEntry {
  id: string;
  at: string;
  /**
   * Monotonic within this store, so entries written inside the same
   * millisecond still have an order.
   *
   * Sorting on the timestamp alone was not enough: two actions a few
   * microseconds apart share an ISO string to the millisecond, and the sort
   * then returned them in whichever order the array happened to hold. An audit
   * log that cannot say which change came last fails at the one question it
   * exists to answer.
   */
  seq: number;
  actor: string;
  action: string;
  /** What was acted on: an agency id, a booking reference, a setting key. */
  subject: string;
  /** Human-readable summary, already localised to English for the log. */
  detail: string;
  /** Before/after for value changes, so a reversal does not need a guess. */
  before?: string;
  after?: string;
}

/**
 * Commercial policy that used to live only in environment variables.
 *
 * Markup is the platform's margin over supplier net (§D-03). Holding it here
 * makes it changeable without a deploy, which is what an operator needs — but
 * every change is audited, because it silently moves every price on the site.
 */
export interface PlatformSettings {
  /** Percent added to supplier net to reach the public price. */
  markupPercent: number;
  /** Set when an operator has overridden the deployed default. */
  updatedAt?: string;
  updatedBy?: string;
}

interface Shape {
  settings: PlatformSettings | null;
  audit: AuditEntry[];
}

const state: Shape = { settings: null, audit: [] };
let loaded = false;
let seenMtimeMs = 0;
let pinned = false;

async function load(): Promise<void> {
  if (pinned) return;
  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(FILE)).mtimeMs;
  } catch {
    // No file yet.
  }
  if (loaded && mtimeMs === seenMtimeMs) return;

  loaded = true;
  seenMtimeMs = mtimeMs;
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<Shape>;
    state.settings = parsed.settings ?? null;
    state.audit = parsed.audit ?? [];
  } catch {
    state.settings = state.settings ?? null;
  }
}

async function persist(): Promise<void> {
  if (pinned) return;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
    seenMtimeMs = (await fs.stat(FILE)).mtimeMs;
  } catch {
    // Best effort; the in-memory copy stays authoritative for this instance.
  }
}

/** The stored override, or null when the deployed default still stands. */
export async function storedSettings(): Promise<PlatformSettings | null> {
  await load();
  return state.settings;
}

export async function saveSettings(settings: PlatformSettings): Promise<void> {
  await load();
  state.settings = settings;
  await persist();
}

export async function appendAudit(entry: Omit<AuditEntry, "id" | "at" | "seq">): Promise<AuditEntry> {
  await load();
  // Derived from what is already stored rather than a module counter, so the
  // sequence survives a reload and a cold start.
  const seq = state.audit.reduce((max, existing) => Math.max(max, existing.seq ?? 0), 0) + 1;
  const full: AuditEntry = {
    ...entry,
    id: `aud_${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    seq,
  };
  state.audit.push(full);
  await persist();
  return full;
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  await load();
  return [...state.audit]
    .sort((a, b) => b.at.localeCompare(a.at) || (b.seq ?? 0) - (a.seq ?? 0))
    .slice(0, limit);
}

/** Test seam. */
export function __resetPlatform(next?: Partial<Shape>): void {
  state.settings = next?.settings ?? null;
  state.audit = next?.audit ?? [];
  loaded = true;
  pinned = true;
}
