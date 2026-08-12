import { describe, expect, it } from "vitest";
import { canHold, holdDeadline, HOLD_SAFETY_MARGIN_MS } from "@/lib/agency/hold-policy";
import { issueHold, releaseHold, reserveForHold } from "@/lib/agency/holds";
import { agencyBalance, listLedger, __resetAgencies } from "@/lib/agency/store";
import { holdsDueWithin, sweepExpiredHolds } from "@/lib/server/holds-sweep";

/**
 * Holding a room when no supplier will hold a room.
 *
 * Neither Hotelbeds nor TourMind offers a provisional booking, so a hold is a
 * real refundable booking we intend to cancel inside the free window. Every
 * rule below exists because getting it wrong costs money: too late a deadline
 * and the cancellation is chargeable, a non-refundable rate and it never could
 * have been free at all.
 */
describe("when a rate can be held", () => {
  const now = Date.parse("2026-08-01T12:00:00Z");
  const wellAhead = "2026-08-20T18:00:00Z";

  it("holds a refundable rate whose free window is still open", () => {
    const result = canHold({ refundable: true, freeCancellationUntil: wellAhead }, now);
    expect(result.ok).toBe(true);
  });

  it("refuses a non-refundable rate", () => {
    // There is no free window to cancel inside, so a "hold" would silently
    // commit the agency to paying for a room they have not sold.
    const result = canHold({ refundable: false, freeCancellationUntil: wellAhead }, now);
    expect(result).toEqual({ ok: false, reason: "nonRefundable" });
  });

  it("refuses a refundable rate with no stated deadline", () => {
    // Refundable "until further notice" is not something we can schedule a
    // cancellation against.
    expect(canHold({ refundable: true }, now)).toEqual({ ok: false, reason: "nonRefundable" });
  });

  it("refuses a window that closes inside the safety margin", () => {
    /*
     * The sweeper needs room to run late. A deadline two hours away would be
     * accepted by a naive check and then missed by a scheduler that skipped a
     * run — and a missed run is the difference between free and a night's
     * charge.
     */
    const soon = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    expect(canHold({ refundable: true, freeCancellationUntil: soon }, now)).toEqual({
      ok: false,
      reason: "tooLate",
    });
  });

  it("refuses a window that has already closed", () => {
    const past = new Date(now - 1000).toISOString();
    expect(canHold({ refundable: true, freeCancellationUntil: past }, now).ok).toBe(false);
  });
});

describe("the deadline a hold is released at", () => {
  it("lands before the supplier's, not on it", () => {
    const supplier = "2026-09-01T23:59:00Z";
    const ours = holdDeadline(supplier);
    expect(new Date(ours).getTime()).toBe(new Date(supplier).getTime() - HOLD_SAFETY_MARGIN_MS);
    expect(new Date(ours).getTime()).toBeLessThan(new Date(supplier).getTime());
  });
});

describe("what a hold does to the credit line", () => {
  const AGENCY = {
    id: "agc_t",
    name: "Test",
    slug: "test",
    countryCode: "AE",
    status: "active" as const,
    commissionPercent: 10,
    markup: { default: { mode: "percent" as const, value: 0 }, overrides: [] },
    credit: { limit: 10000, currency: "USD", paymentDays: 30 },
    profile: { legalName: "T", address: "", city: "", email: "", phone: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const SESSION = {
    agentId: "a1",
    agencyId: "agc_t",
    email: "a@t.example",
    name: "Agent",
    role: "agent" as const,
    agencyName: "Test",
  };

  it("takes headroom without raising a charge", async () => {
    /*
     * The client's wording is "without deducting credit", and nothing is
     * charged — but the room really is held in the agency's name, so a line
     * that ignored it could be spent twice on the same money.
     */
    __resetAgencies({ agencies: [AGENCY] });
    await reserveForHold(SESSION, "NZ-HOLD-1", 400, "USD", "Test Hotel", "2026-08-01T00:00:00.000Z");

    const balance = await agencyBalance("agc_t");
    expect(balance?.available).toBe(9600);
    expect(balance?.heldAmount).toBe(400);

    // Not a charge: the ledger says held, and a statement can leave it out.
    const ledger = await listLedger("agc_t", 10);
    expect(ledger[0].kind).toBe("hold");
  });

  it("gives the headroom back when the hold lapses", async () => {
    __resetAgencies({ agencies: [AGENCY] });
    await reserveForHold(SESSION, "NZ-HOLD-2", 400, "USD", "Test Hotel", "2026-08-01T00:00:00.000Z");
    await releaseHold("agc_t", "agt_t", "NZ-HOLD-2", 400, "USD", "2026-08-02T00:00:00.000Z", "expired");

    const balance = await agencyBalance("agc_t");
    expect(balance?.available).toBe(10000);
    expect(balance?.heldAmount).toBe(0);
  });

  it("does not move the line when a hold becomes a sale", async () => {
    /*
     * Issuing releases the reservation and raises the charge in its place. The
     * same money changes from held to owed, so headroom must not wobble — and
     * the order matters: charging first would briefly double-count and could
     * refuse an issue for want of credit the agency already has.
     */
    __resetAgencies({ agencies: [AGENCY] });
    await reserveForHold(SESSION, "NZ-HOLD-3", 400, "USD", "Test Hotel", "2026-08-01T00:00:00.000Z");
    const held = await agencyBalance("agc_t");

    await issueHold(
      SESSION,
      {
        reference: "NZ-HOLD-3",
        agencyId: "agc_t",
        agentId: "a1",
        agentName: "Agent",
        hotelName: "Test Hotel",
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        leadGuest: "A B",
        publicPrice: 500,
        cost: 400,
        sell: 450,
        currency: "USD",
        status: "held",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      "2026-08-02T00:00:00.000Z",
    );

    const issued = await agencyBalance("agc_t");
    expect(issued?.available).toBe(held?.available);
    // It is owed now, not held.
    expect(issued?.heldAmount).toBe(0);
    expect(issued?.used).toBe(400);
  });

  it("cannot reserve the same booking twice", async () => {
    // A retried request must not take the headroom twice over.
    __resetAgencies({ agencies: [AGENCY] });
    await reserveForHold(SESSION, "NZ-HOLD-4", 400, "USD", "H", "2026-08-01T00:00:00.000Z");
    await reserveForHold(SESSION, "NZ-HOLD-4", 400, "USD", "H", "2026-08-01T00:00:00.000Z");
    expect((await agencyBalance("agc_t"))?.heldAmount).toBe(400);
  });
});

describe("the sweep that makes a hold safe", () => {
  const AGENCY = {
    id: "agc_s",
    name: "Sweep",
    slug: "sweep",
    countryCode: "AE",
    status: "active" as const,
    commissionPercent: 10,
    markup: { default: { mode: "percent" as const, value: 0 }, overrides: [] },
    credit: { limit: 10000, currency: "USD", paymentDays: 30 },
    profile: { legalName: "S", address: "", city: "", email: "", phone: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  function heldBooking(reference: string, expiresAt: string) {
    return {
      reference,
      agencyId: "agc_s",
      agentId: "a1",
      agentName: "Agent",
      hotelName: "Sweep Hotel",
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      leadGuest: "A B",
      publicPrice: 500,
      cost: 400,
      sell: 450,
      currency: "USD",
      status: "held" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      holdExpiresAt: expiresAt,
    };
  }

  it("releases a hold whose deadline has passed and gives the credit back", async () => {
    const now = Date.parse("2026-08-10T00:00:00Z");
    __resetAgencies({
      agencies: [AGENCY],
      bookings: [heldBooking("NZ-SWEEP-1", "2026-08-09T00:00:00.000Z")],
      ledger: [
        {
          id: "led_hold_NZ-SWEEP-1",
          agencyId: "agc_s",
          at: "2026-08-01T00:00:00.000Z",
          amount: -400,
          currency: "USD",
          kind: "hold" as const,
          reference: "NZ-SWEEP-1",
          note: "Held",
        },
      ],
    });

    const result = await sweepExpiredHolds({ now });
    expect(result.expired).toBe(1);
    expect(result.cancelled).toEqual(["NZ-SWEEP-1"]);

    // The whole point: the headroom comes back, and it is no longer held.
    const balance = await agencyBalance("agc_s");
    expect(balance?.available).toBe(10000);
    expect(balance?.heldAmount).toBe(0);
  });

  it("leaves a hold alone while its deadline is still ahead", async () => {
    /*
     * Cancelling early is not a safe default — it is a room an agency still
     * intends to sell, taken away from them.
     */
    const now = Date.parse("2026-08-10T00:00:00Z");
    __resetAgencies({
      agencies: [AGENCY],
      bookings: [heldBooking("NZ-SWEEP-2", "2026-08-20T00:00:00.000Z")],
    });

    const result = await sweepExpiredHolds({ now });
    expect(result.examined).toBe(1);
    expect(result.expired).toBe(0);
    expect(result.cancelled).toEqual([]);
  });

  it("finds the holds due for a warning without touching them", async () => {
    const now = Date.parse("2026-08-10T00:00:00Z");
    __resetAgencies({
      agencies: [AGENCY],
      bookings: [
        // Inside the 48-hour window.
        heldBooking("NZ-DUE-1", "2026-08-11T00:00:00.000Z"),
        // Further out — not yet anyone's problem.
        heldBooking("NZ-DUE-2", "2026-08-30T00:00:00.000Z"),
        // Already past: the sweep deals with this one, not the warning.
        heldBooking("NZ-DUE-3", "2026-08-09T00:00:00.000Z"),
      ],
    });

    const due = await holdsDueWithin(48 * 60 * 60 * 1000, now);
    expect(due.map((entry) => entry.booking.reference)).toEqual(["NZ-DUE-1"]);
  });
});
