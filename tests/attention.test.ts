import { describe, expect, it } from "vitest";
import { attentionItems } from "@/lib/agency/attention";
import type { AgencyBooking } from "@/lib/agency/types";

/**
 * The list an agent reads first thing.
 *
 * Its whole value is the order: the thing about to disappear has to be at the
 * top, and it has to still be right an hour later. That is a function of the
 * clock, so it is tested at chosen moments rather than by opening the page on
 * a day when the account happens to have the right shape.
 */

const NOW = Date.parse("2026-08-03T09:00:00Z");

function booking(over: Partial<AgencyBooking> = {}): AgencyBooking {
  return {
    reference: over.reference ?? "NZ-AAA-0001",
    agencyId: "ag_1",
    agentId: "agt_1",
    agentName: "Counter agent",
    hotelName: "Test Hotel",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    leadGuest: "A Guest",
    publicPrice: 200,
    cost: 150,
    sell: 190,
    currency: "USD",
    status: "confirmed",
    createdAt: "2026-08-01T10:00:00Z",
    ...over,
  };
}

const inMinutes = (n: number) => new Date(NOW + n * 60_000).toISOString();

describe("what needs an agent today", () => {
  it("ignores an account where nothing is wrong", () => {
    // Every morning on a healthy account. The panel must be absent, not empty:
    // a standing "nothing needs you" box teaches people to stop looking at the
    // one place something urgent will eventually appear.
    const items = attentionItems([booking(), booking({ reference: "NZ-AAA-0002", status: "cancelled" })], NOW);
    expect(items).toEqual([]);
  });

  it("puts the hold that goes first, first", () => {
    const items = attentionItems(
      [
        booking({ reference: "LATER", status: "held", holdExpiresAt: inMinutes(600) }),
        booking({ reference: "SOON", status: "held", holdExpiresAt: inMinutes(20) }),
        booking({ reference: "MIDDLE", status: "held", holdExpiresAt: inMinutes(120) }),
      ],
      NOW,
    );
    expect(items.map((i) => i.booking.reference)).toEqual(["SOON", "MIDDLE", "LATER"]);
  });

  it("floats a hold whose release is already due above everything", () => {
    /*
     * The sweeper runs on a schedule, so there is a window where a hold is
     * past its release and still on the books. That is the most urgent state
     * there is — the room is going — and a negative countdown sorts it up
     * rather than off the end.
     */
    const items = attentionItems(
      [
        booking({ reference: "SOON", status: "held", holdExpiresAt: inMinutes(15) }),
        booking({ reference: "OVERDUE", status: "held", holdExpiresAt: inMinutes(-5) }),
      ],
      NOW,
    );
    expect(items[0].booking.reference).toBe("OVERDUE");
    expect(items[0].at).toBeLessThan(0);
  });

  it("leaves a long-dated hold off today's list", () => {
    /*
     * A hold three weeks out reserves real credit and is real work, but it is
     * not this morning's work. Listing it permanently under "needs you today"
     * is how a panel stops being read — and the thing it then fails to surface
     * is the hold that really was about to go.
     */
    const items = attentionItems(
      [booking({ reference: "FAR", status: "held", holdExpiresAt: inMinutes(26 * 24 * 60) })],
      NOW,
    );
    expect(items).toEqual([]);
  });

  it("brings that same hold onto the list as its deadline approaches", () => {
    // The horizon is a moving window, not a property of the booking.
    const far = [booking({ reference: "FAR", status: "held", holdExpiresAt: inMinutes(26 * 24 * 60) })];
    const nearlyThere = NOW + 25 * 24 * 60 * 60_000;
    expect(attentionItems(far, NOW)).toEqual([]);
    expect(attentionItems(far, nearlyThere)).toHaveLength(1);
  });

  it("lists a hold with no stated deadline rather than hiding it", () => {
    // The horizon is a claim about when something happens. An unknown deadline
    // supports no such claim, and could be at any moment.
    const items = attentionItems([booking({ reference: "UNKNOWN", status: "held" })], NOW);
    expect(items).toHaveLength(1);
  });

  it("does not let a hold with no deadline outrank one that has a real one", () => {
    // An unknown deadline is not an imminent one. It stays on the list, at the
    // bottom, rather than being sorted to the top by a missing value.
    const items = attentionItems(
      [
        booking({ reference: "UNKNOWN", status: "held" }),
        booking({ reference: "REAL", status: "held", holdExpiresAt: inMinutes(300) }),
      ],
      NOW,
    );
    expect(items.map((i) => i.booking.reference)).toEqual(["REAL", "UNKNOWN"]);
  });

  it("shows a cancellation nobody could confirm", () => {
    /*
     * The credit stays committed against these on purpose, so the agency's
     * limit is quietly short until somebody chases it. The sweeper knows; the
     * people whose credit it is did not.
     */
    const items = attentionItems(
      [booking({ reference: "STUCK", status: "cancelled", cancellationUnconfirmedAt: inMinutes(-60) })],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("unconfirmed");
  });

  it("leaves a freshly pending booking alone", () => {
    /*
     * An uncertain supplier order becomes pending and is reconciled rather
     * than resubmitted, which normally resolves in seconds. Flagging it the
     * moment it appears would put a row on the panel for every slow order.
     */
    const items = attentionItems([booking({ reference: "NEW", status: "pending", createdAt: inMinutes(-2) })], NOW);
    expect(items).toEqual([]);
  });

  it("flags a booking that has been pending too long", () => {
    // Credit committed, supplier silent, and the customer is holding no
    // confirmation. Reconciliation should have resolved this by now.
    const items = attentionItems([booking({ reference: "STUCK", status: "pending", createdAt: inMinutes(-90) })], NOW);
    expect(items.map((i) => i.kind)).toEqual(["stalled"]);
  });

  it("counts one booking once, not twice", () => {
    // A stalled booking that also carries an unconfirmed cancellation is one
    // row of work, and two rows for one reference reads as two problems.
    const items = attentionItems(
      [booking({ reference: "BOTH", status: "pending", createdAt: inMinutes(-90), cancellationUnconfirmedAt: inMinutes(-30) })],
      NOW,
    );
    expect(items).toHaveLength(1);
  });

  it("keeps the ordering true as the clock moves", () => {
    /*
     * The countdown is re-derived on every poll, so the same data an hour
     * later has to produce a smaller number — not a frozen one. This is what
     * makes "releases in 40 min" trustworthy instead of decorative.
     */
    const held = [booking({ reference: "H", status: "held", holdExpiresAt: inMinutes(90) })];
    const now = attentionItems(held, NOW)[0].at;
    const later = attentionItems(held, NOW + 60 * 60_000)[0].at;
    expect(later).toBeLessThan(now);
    expect(Math.round(later / 60_000)).toBe(30);
  });

  it("says nothing about a hold that has already been issued", () => {
    // Issuing is the resolution. It stops being work the moment it is a sale.
    const items = attentionItems(
      [booking({ reference: "SOLD", status: "confirmed", issuedAt: inMinutes(-10), holdExpiresAt: inMinutes(60) })],
      NOW,
    );
    expect(items).toEqual([]);
  });
});
