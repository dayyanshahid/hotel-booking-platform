import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The store behind the store.
 *
 * These check the two things that actually matter: that a document written by
 * one process is readable by the next, and that the driver a deployment gets is
 * the one its environment asked for. The KV driver is exercised against a fake
 * `fetch` rather than a real Redis — what is worth testing is the command shape
 * and the namespacing, not that Redis works.
 */

const ENV_KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
let saved: Record<string, string | undefined> = {};
let tempDir = "";

beforeEach(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tm-persist-"));
  process.env.NAZIL_DATA_DIR = tempDir;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function load() {
  const persistence = await import("@/lib/server/persistence");
  persistence.__resetDriver();
  return persistence;
}

describe("storage driver selection", () => {
  it("uses the filesystem when nothing is configured", async () => {
    const { driverKind } = await load();
    expect(driverKind()).toBe("filesystem");
  });

  it("switches to KV when the connection details are present", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "token";
    const { driverKind } = await load();
    expect(driverKind()).toBe("kv");
  });

  it("accepts the Upstash names too", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const { driverKind } = await load();
    expect(driverKind()).toBe("kv");
  });

  it("does not switch on a half-configured store", async () => {
    // A URL without a token is a deployment someone is midway through setting
    // up. Failing every read is worse than staying where the data already is.
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    const { driverKind } = await load();
    expect(driverKind()).toBe("filesystem");
  });
});

describe("filesystem driver", () => {
  it("round-trips a document and moves its version", async () => {
    const { driver } = await load();

    expect(await driver().read("bookings")).toBeNull();
    expect(await driver().version("bookings")).toBeNull();

    await driver().write("bookings", { bookings: [{ reference: "NZ-AAA-0001" }] });
    const first = await driver().version("bookings");
    expect(first).not.toBeNull();
    expect(await driver().read<{ bookings: { reference: string }[] }>("bookings")).toEqual({
      bookings: [{ reference: "NZ-AAA-0001" }],
    });

    await driver().write("bookings", { bookings: [] });
    expect(await driver().version("bookings")).not.toBe(first);
  });

  it("keeps documents apart", async () => {
    const { driver } = await load();
    await driver().write("bookings", { a: 1 });
    await driver().write("support", { b: 2 });
    expect(await driver().read("bookings")).toEqual({ a: 1 });
    expect(await driver().read("support")).toEqual({ b: 2 });
  });

  it("refuses a key that would escape the data directory", async () => {
    const { driver } = await load();
    await expect(driver().read("../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });

  it("returns null rather than throwing on unreadable state", async () => {
    const { driver } = await load();
    await fs.writeFile(path.join(tempDir, "bookings.json"), "{ not json", "utf8");
    expect(await driver().read("bookings")).toBeNull();
  });
});

describe("kv driver", () => {
  function stubFetch(handler: (command: string[]) => unknown) {
    const calls: string[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const command = JSON.parse(init.body) as string[];
        calls.push(command);
        return { ok: true, json: async () => ({ result: handler(command) }) } as Response;
      }),
    );
    return calls;
  }

  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://example.upstash.io/";
    process.env.KV_REST_API_TOKEN = "token";
  });

  it("stores documents and versions under separate namespaced keys", async () => {
    const { driver } = await load();
    const calls = stubFetch(() => "OK");

    await driver().write("bookings", { a: 1 });

    expect(calls[0]).toEqual(["SET", "tm:doc:bookings", JSON.stringify({ a: 1 })]);
    // A counter beside the document is what lets another instance notice the
    // change without pulling every booking back over the wire.
    expect(calls[1]).toEqual(["INCR", "tm:ver:bookings"]);
  });

  it("reads a document back", async () => {
    const { driver } = await load();
    stubFetch((command) => (command[0] === "GET" ? JSON.stringify({ a: 1 }) : null));
    expect(await driver().read("bookings")).toEqual({ a: 1 });
  });

  it("treats an unreachable store as no answer rather than an error", async () => {
    // A store that is down must not take the site down with it: the caller
    // falls back to what it already holds.
    const { driver } = await load();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await driver().read("bookings")).toBeNull();
    await expect(driver().write("bookings", { a: 1 })).resolves.toBeUndefined();
  });

  it("reports itself as durable even on serverless", async () => {
    const { isDurable } = await load();
    expect(isDurable()).toBe(true);
  });
});
