import { describe, expect, it } from "vitest";
import { roomCategoryOf } from "@/lib/search/room-category";
import { conditionsOf } from "@/lib/search/rate-conditions";
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

describe("which conditions a rate carries", () => {
  /*
   * The shapes below are the ones the live suppliers actually send, counted
   * over 195 rates in four cities: 90 were free-until-a-deadline and then a
   * part-charge, 67 non-refundable, 38 free and then the full stay. The first
   * group is what the client means by "partial cancellation", and the first
   * version of this classifier filed every one of them as plain "free".
   */
  it("calls a free window free", () => {
    const p = policy({ freeUntil: "2026-09-01T12:00:00", steps: [{ until: "2026-09-01T12:00:00", fee: 0, label: "" }] });
    expect(conditionsOf(p, 300)).toContain("free");
  });

  it("also calls it partial when missing the deadline costs less than the stay", () => {
    // Free until the 1st, then 106 on a 300 stay: cancellable late for a third
    // of the booking, which is the rate an agent is looking for.
    const p = policy({
      freeUntil: "2026-09-01T12:00:00",
      steps: [
        { until: "2026-09-01T12:00:00", fee: 0, label: "Free cancellation" },
        { until: "2026-09-04T12:00:00", fee: 106, label: "One night" },
      ],
    });
    expect(conditionsOf(p, 300)).toEqual(["free", "partial"]);
  });

  it("does not call it partial when missing the deadline costs the lot", () => {
    const p = policy({
      freeUntil: "2026-09-01T12:00:00",
      steps: [
        { until: "2026-09-01T12:00:00", fee: 0, label: "Free cancellation" },
        { until: "2026-09-04T12:00:00", fee: 300, label: "No refund" },
      ],
    });
    expect(conditionsOf(p, 300)).toEqual(["free"]);
  });

  it("forgives a supplier rounding the full charge", () => {
    // Penalties are rounded to nights and to the supplier's currency, so an
    // exact comparison would file half the market as partial.
    const p = policy({
      freeUntil: "2026-09-01T12:00:00",
      steps: [
        { until: "2026-09-01T12:00:00", fee: 0, label: "" },
        { until: "2026-09-04T12:00:00", fee: 299, label: "" },
      ],
    });
    expect(conditionsOf(p, 300)).toEqual(["free"]);
  });

  it("calls a rate that costs something from the outset partial, not free", () => {
    expect(conditionsOf(policy({}), 300)).toEqual(["partial"]);
    expect(
      conditionsOf(policy({ freeUntil: "2026-09-01T12:00:00", steps: [{ until: "2026-09-01T12:00:00", fee: 120, label: "" }] }), 300),
    ).toEqual(["partial"]);
  });

  it("calls a rate that cannot be cancelled non-refundable, and only that", () => {
    expect(conditionsOf(policy({ refundable: false }), 300)).toEqual(["nonRefundable"]);
    expect(conditionsOf(policy({ refundable: false, freeUntil: "2026-09-01T12:00:00" }), 300)).toEqual(["nonRefundable"]);
  });

  it("gives the same answer whatever time it is asked", () => {
    // A filter that reclassified rates as the day wore on would give two
    // different answers to the same search an hour apart.
    expect(conditionsOf(policy({ freeUntil: "2020-01-01T00:00:00" }), 300)).toContain("free");
  });

  it("does not fall over when the stay total is unknown", () => {
    const p = policy({ freeUntil: "2026-09-01T12:00:00", steps: [
      { until: "2026-09-01T12:00:00", fee: 0, label: "" },
      { until: "2026-09-04T12:00:00", fee: 106, label: "" },
    ] });
    expect(conditionsOf(p, 0)).toEqual(["free", "partial"]);
  });
});
