import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, isServerless } from "./runtime";

/**
 * Where the platform's state actually lives.
 *
 * Every store here — bookings, agency credit, the operator audit log — kept its
 * data in the process that happened to serve the request, with a file on disk
 * as a best-effort backup. On a single machine that is fine. On a serverless
 * deployment it is not a store at all: a booking made on one instance is
 * invisible to the next request on another, a credit balance disagrees with
 * itself depending on which lambda answers, and everything is gone on a cold
 * start. The console has been reporting `durable: false` about itself for a
 * while, which was honest but not a fix.
 *
 * This puts one driver behind all three. The filesystem driver is what has
 * always happened and stays the default for local work. The KV driver stores
 * documents in Redis over its REST API, which is reachable from a lambda and
 * shared between them, and turns on by itself when the connection details are
 * present — so a deployment becomes durable by adding two environment
 * variables rather than by changing code.
 *
 * What this deliberately does not do is solve concurrent writes. A document is
 * read, changed and written whole, so two instances writing the same document
 * in the same instant leave the second one's version. Under the traffic this
 * platform is built for that is vanishingly rare, and the honest fix is a real
 * database with row-level writes rather than a lock bolted onto a key-value
 * store. It is stated here and surfaced on the console rather than left for
 * someone to discover.
 */

export type DriverKind = "filesystem" | "kv";

interface Driver {
  kind: DriverKind;
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  /**
   * A token that changes when the document changes.
   *
   * The stores use it to avoid re-parsing state they already hold, which is
   * what the file-modification check used to do. Cheaper than reading the
   * document and, on KV, the difference between one small round trip and
   * pulling every booking on every request.
   */
  version(key: string): Promise<string | null>;
}

/* ------------------------------------------------------------- filesystem */

const filesystemDriver: Driver = {
  kind: "filesystem",

  async read<T>(key: string): Promise<T | null> {
    // Outside the catch: a bad key is a bug in our code, and swallowing it
    // would turn it into a store that quietly holds nothing.
    const file = filePath(key);
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  },

  async write<T>(key: string, value: T): Promise<void> {
    const file = filePath(key);
    try {
      await fs.mkdir(dataDir(), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
    } catch {
      // Best effort, as it always was: on a read-only filesystem the process
      // copy stays authoritative and the caller carries on.
    }
  },

  async version(key: string): Promise<string | null> {
    const file = filePath(key);
    try {
      return String((await fs.stat(file)).mtimeMs);
    } catch {
      return null;
    }
  },
};

function filePath(key: string): string {
  // Keys are ours, not user input, but a key that escaped the data directory
  // would be a bug worth failing loudly on rather than writing outside it.
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return path.join(dataDir(), `${key}.json`);
}

/* --------------------------------------------------------------------- kv */

/**
 * Redis over REST, which is what both Vercel KV and Upstash expose.
 *
 * REST rather than a socket client because a lambda's connection pool is not
 * worth the dependency for documents this size, and because it needs no
 * package: `fetch` is already here.
 */
function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvCommand<T>(command: string[]): Promise<T | null> {
  const config = kvConfig();
  if (!config) return null;
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      // A store that hangs must not hold a request open; the caller falls back
      // to whatever it already has rather than timing out the customer.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  } catch {
    return null;
  }
}

const kvDriver: Driver = {
  kind: "kv",

  async read<T>(key: string): Promise<T | null> {
    const raw = await kvCommand<string>(["GET", documentKey(key)]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async write<T>(key: string, value: T): Promise<void> {
    await kvCommand(["SET", documentKey(key), JSON.stringify(value)]);
    // A counter beside the document, so instances can tell it moved without
    // reading it back.
    await kvCommand(["INCR", versionKey(key)]);
  },

  async version(key: string): Promise<string | null> {
    const value = await kvCommand<string | number>(["GET", versionKey(key)]);
    return value === null ? null : String(value);
  },
};

/**
 * A counter every instance shares, for things that must be counted once.
 *
 * A supplier's daily request allowance is the case this exists for. It was
 * being counted in `globalThis`, which on one machine is exactly right and on a
 * serverless platform is a budget *per lambda*: ten warm instances meant ten
 * separate allowances and a guard that could not do the one thing it was for.
 * The overrun lands on the supplier's side as a rate-limited or suspended
 * account, which is not a failure mode anyone would connect back to a counter.
 *
 * `INCR` is atomic, so two instances asking at the same moment get different
 * numbers — a read-modify-write over the document store could not promise
 * that. Returns null when there is no shared store, and the caller falls back
 * to counting in the process, which is correct for the single machine that
 * situation implies.
 *
 * The key carries the day and the entry expires, so nothing has to sweep it.
 */
export async function bumpSharedCounter(
  name: string,
  ttlSeconds: number,
): Promise<number | null> {
  if (!kvConfig()) return null;
  const key = `tm:count:${name}`;
  const next = await kvCommand<number>(["INCR", key]);
  if (next === null) return null;
  // Only the first writer needs to set the expiry; re-setting it on every
  // increment would slide the window forward and the count would never reset.
  if (next === 1) await kvCommand(["EXPIRE", key, String(ttlSeconds)]);
  return next;
}

/** Namespaced so a shared Redis is not a collision waiting to happen. */
function documentKey(key: string): string {
  return `tm:doc:${key}`;
}
function versionKey(key: string): string {
  return `tm:ver:${key}`;
}

/* ------------------------------------------------------------------ choose */

let active: Driver | null = null;

export function driver(): Driver {
  if (!active) active = kvConfig() ? kvDriver : filesystemDriver;
  return active;
}

/**
 * Whether what is written here survives the instance that wrote it.
 *
 * The filesystem is durable on a machine with a disk and a lie on a lambda,
 * where it is a scratch directory that dies with the container. The console
 * reports this, so an operator reading a revenue figure knows whether it is
 * everything that happened or only what this instance saw.
 */
export function isDurable(): boolean {
  return driver().kind === "kv" || !isServerless;
}

export function driverKind(): DriverKind {
  return driver().kind;
}

/** Test seam: forget the chosen driver so environment changes take effect. */
export function __resetDriver(): void {
  active = null;
}
