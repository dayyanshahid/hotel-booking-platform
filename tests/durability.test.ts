import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Booking } from "@/lib/types";

/**
 * Does a booking survive the instance that took it?
 *
 * This is the question the whole persistence layer exists to answer, so it is
 * tested the way it fails in production: one process writes, a completely cold
 * one reads. `freshInstance()` throws away both the module registry and the
 * global the store hangs its maps on, which is as close to a second lambda as a
 * single test process gets.
 */

let tempDir = "";

async function freshInstance() {
  vi.resetModules();
  delete (globalThis as { __nazilStore?: unknown }).__nazilStore;
  return import("@/lib/server/store");
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tm-durable-"));
  process.env.NAZIL_DATA_DIR = tempDir;
});

afterEach(async () => {
  vi.resetModules();
  delete (globalThis as { __nazilStore?: unknown }).__nazilStore;
  await fs.rm(tempDir, { recursive: true, force: true });
});

function booking(reference: string): Booking {
  return {
    reference,
    status: "confirmed",
    createdAt: "2026-07-20T10:00:00.000Z",
    hotel: { id: "h1", name: "Test Hotel", city: "Zurich", country: "CH" },
    checkIn: "2026-08-01",
    checkOut: "2026-08-04",
    rooms: [],
    contact: { firstName: "A", lastName: "B", email: "guest@example.com", phone: "+1" },
    price: { total: 900, currency: "USD" },
  } as unknown as Booking;
}

describe("a booking outlives its instance", () => {
  it("is readable by a process that never saw it made", async () => {
    const first = await freshInstance();
    await first.saveBooking(booking("NZ-AAA-0001"), "guest@example.com");

    const second = await freshInstance();
    expect((await second.getBooking("NZ-AAA-0001"))?.reference).toBe("NZ-AAA-0001");
    expect(await second.listBookings("guest@example.com")).toHaveLength(1);
  });

  it("does not lose the other instance's bookings when a cold one writes", async () => {
    /*
     * The failure mode a shared store introduces if nobody guards for it: a
     * document is written whole, so an instance that mutates without reading
     * persists its own single booking over everyone else's. Losing bookings is
     * worse than not storing them at all.
     */
    const first = await freshInstance();
    await first.saveBooking(booking("NZ-AAA-0001"), "guest@example.com");

    const second = await freshInstance();
    await second.saveBooking(booking("NZ-BBB-0002"), "other@example.com");

    const third = await freshInstance();
    expect(await third.listBookings()).toHaveLength(2);
  });

  it("carries the supplier reference, which is the only way to cancel", async () => {
    const first = await freshInstance();
    await first.saveBooking(booking("NZ-AAA-0001"), "guest@example.com");
    await first.linkSupplierReference("NZ-AAA-0001", "123-4567890", "hotelbeds");

    const second = await freshInstance();
    await second.getBooking("NZ-AAA-0001");
    expect(second.getSupplierReference("NZ-AAA-0001")).toEqual({
      reference: "123-4567890",
      source: "hotelbeds",
    });
  });
});

describe("support work outlives its instance", () => {
  it("shows an operator a case a guest raised elsewhere", async () => {
    const guestSide = await freshInstance();
    await guestSide.saveCase({
      caseId: "case_1",
      category: "amendment",
      channel: "web",
      status: "open",
      slaHours: 24,
      createdAt: "2026-07-20T10:00:00.000Z",
      messages: [],
    } as never);

    const operatorSide = await freshInstance();
    const cases = await operatorSide.listCases();
    expect(cases.map((item) => item.caseId)).toEqual(["case_1"]);
  });

  it("keeps a saved traveller and a sent notification", async () => {
    const first = await freshInstance();
    await first.saveTravelers("guest@example.com", [{ firstName: "A", lastName: "B" } as never]);
    await first.pushNotification("guest@example.com", {
      id: "nt_1",
      kind: "confirmation",
      title: "Booked",
      body: "",
      createdAt: "2026-07-20T10:00:00.000Z",
      read: false,
    } as never);

    const second = await freshInstance();
    expect(await second.listTravelers("guest@example.com")).toHaveLength(1);
    expect(await second.listNotifications("guest@example.com")).toHaveLength(1);
  });
});
