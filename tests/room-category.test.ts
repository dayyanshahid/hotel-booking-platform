import { describe, expect, it } from "vitest";
import { roomCategoryOf } from "@/lib/search/room-category";
import { conditionOf } from "@/lib/search/rate-conditions";
import type { CancellationPolicy } from "@/lib/types";

describe("reading a room category out of a supplier's room name", () => {
  it("reads the names the live suppliers actually send", () => {
    // Every one of these came off a real Hotelbeds or TourMind response.
    expect(roomCategoryOf("Deluxe, Guest room, 1 King")).toBe("deluxe");
    expect(roomCategoryOf("DOUBLE STANDARD")).toBe("standard");
    expect(roomCategoryOf("SUPERIOR TWIN")).toBe("superior");
    expect(roomCategoryOf("1 BEDROOM APARTMENT SEA VIEW")).toBe("apartment");
    expect(roomCategoryOf("EXECUTIVE KING ROOM")).toBe("executive");
  });

  it("does not let the general pattern swallow the specific one", () => {
    // "Junior Suite" reaching the suite filter is the whole reason order
    // matters: an agent who ticks Suite for a honeymoon does not want one.
    expect(roomCategoryOf("Junior Suite")).toBe("juniorSuite");
    expect(roomCategoryOf("JR SUITE CITY VIEW")).toBe("juniorSuite");
    expect(roomCategoryOf("Family Suite")).toBe("family");
    expect(roomCategoryOf("Presidential Suite")).toBe("suite");
  });

  it("ignores bed configuration, view and occupancy", () => {
    expect(roomCategoryOf("STANDARD ROOM 1 KING BED CITY VIEW")).toBe("standard");
    expect(roomCategoryOf("Deluxe Double or Twin Room with Balcony")).toBe("deluxe");
  });

  it("reads accented and non-English names", () => {
    expect(roomCategoryOf("Chambre Supérieure")).toBe("superior");
    expect(roomCategoryOf("Habitación Estándar")).toBe("standard");
    expect(roomCategoryOf("APARTAMENTO 2 DORMITORIOS")).toBe("apartment");
  });

  it("says nothing rather than guessing", () => {
    // A wrong category is worse than none: it puts the room in a filter the
    // agent then trusts.
    expect(roomCategoryOf("Room")).toBeNull();
    expect(roomCategoryOf("")).toBeNull();
    expect(roomCategoryOf("A1K")).toBeNull();
  });
});

const policy = (over: Partial<CancellationPolicy>): CancellationPolicy => ({
  refundable: true,
  timezone: "Asia/Dubai",
  steps: [],
  ...over,
});

describe("which of the three conditions a rate is", () => {
  it("calls a rate with a free window free", () => {
    expect(conditionOf(policy({ freeUntil: "2026-09-01T12:00:00" }))).toBe("free");
    expect(
      conditionOf(policy({ freeUntil: "2026-09-01T12:00:00", steps: [{ until: "2026-09-01T12:00:00", fee: 0, label: "" }] })),
    ).toBe("free");
  });

  it("calls a cancellable rate that always costs something partial", () => {
    expect(conditionOf(policy({}))).toBe("partial");
    // A deadline with a fee already attached is a partial rate wearing a free
    // rate's shape, and the steps are what settle it.
    expect(
      conditionOf(policy({ freeUntil: "2026-09-01T12:00:00", steps: [{ until: "2026-09-01T12:00:00", fee: 120, label: "" }] })),
    ).toBe("partial");
  });

  it("calls a rate that cannot be cancelled non-refundable", () => {
    expect(conditionOf(policy({ refundable: false }))).toBe("nonRefundable");
    expect(conditionOf(policy({ refundable: false, freeUntil: "2026-09-01T12:00:00" }))).toBe("nonRefundable");
  });

  it("gives the same answer whatever time it is asked", () => {
    // A filter that reclassified rates as the day wore on would give two
    // different answers to the same search an hour apart.
    const past = policy({ freeUntil: "2020-01-01T00:00:00" });
    expect(conditionOf(past)).toBe("free");
  });
});
