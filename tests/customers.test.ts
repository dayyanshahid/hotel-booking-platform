import { describe, expect, it } from "vitest";
import { customerHistory, duplicateOf } from "@/lib/agency/customers";
import type { AgencyBooking, AgencyCustomer, AgencyQuote } from "@/lib/agency/types";

/**
 * A contact list that can answer "what have we sold this person".
 */

const customer = (over: Partial<AgencyCustomer> = {}): AgencyCustomer => ({
  id: "cus_1",
  agencyId: "agc",
  name: "Nadia Haddad",
  email: "nadia@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const quote = (over: Partial<AgencyQuote> = {}): AgencyQuote => ({
  id: `q_${Math.random()}`,
  reference: "Q-1",
  agencyId: "agc",
  agentId: "agt",
  agentName: "Agent",
  customerName: "Nadia Haddad",
  items: [{ id: "qi_1", hotelName: "H", city: "C", checkIn: "2026-05-01", checkOut: "2026-05-03", nights: 2, roomName: "R", boardLabel: "B", rooms: 1, guests: 2, roomsCovered: 1, cost: 80, sell: 100, currency: "USD", cancellation: "" }],
  currency: "USD",
  validUntil: "2026-05-01",
  status: "open",
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  ...over,
});

const booking = (over: Partial<AgencyBooking> = {}): AgencyBooking => ({
  reference: `BK${Math.random()}`,
  agencyId: "agc",
  agentId: "agt",
  agentName: "Agent",
  hotelName: "H",
  checkIn: "2026-05-01",
  checkOut: "2026-05-03",
  leadGuest: "Somebody Else",
  publicPrice: 120,
  cost: 80,
  sell: 100,
  currency: "USD",
  status: "confirmed",
  createdAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

describe("matching a client to their trade", () => {
  it("matches a quote by the id it was written against", () => {
    const history = customerHistory(customer(), [quote({ customerId: "cus_1" })], []);
    expect(history.quotes).toBe(1);
  });

  it("falls back to the email for quotes written before the link existed", () => {
    /*
     * Every quote predating the address book carries a name and an address and
     * no id. Refusing to match them would empty the history of every
     * long-standing client on the day this shipped.
     */
    const history = customerHistory(customer(), [quote({ customerEmail: "NADIA@example.com" })], []);
    expect(history.quotes).toBe(1);
  });

  it("prefers the id when one is present, even if the address matches somebody else", () => {
    // A client who changed their email, or two records sharing an old address.
    // The explicit link is the stronger statement.
    const history = customerHistory(customer(), [quote({ customerId: "cus_2", customerEmail: "nadia@example.com" })], []);
    expect(history.quotes).toBe(0);
  });

  it("never matches on the name alone", () => {
    /*
     * Two different people with the same name is ordinary, and merging their
     * trading histories is not a mistake anybody catches by looking.
     */
    const history = customerHistory(customer({ email: undefined }), [quote({ customerName: "Nadia Haddad" })], []);
    expect(history.quotes).toBe(0);
  });

  it("matches a booking only by the agency's own reference", () => {
    /*
     * The lead guest is whoever sleeps in the room — often not the person who
     * paid, and never reliably so when a company books for its staff.
     */
    const withRef = customer({ reference: "ACME" });
    expect(customerHistory(withRef, [], [booking({ customerReference: "acme" })]).bookings).toBe(1);
    expect(customerHistory(withRef, [], [booking({ leadGuest: "Nadia Haddad" })]).bookings).toBe(0);
  });

  it("leaves cancelled and failed bookings out of what they have spent", () => {
    const withRef = customer({ reference: "ACME" });
    const history = customerHistory(withRef, [], [
      booking({ customerReference: "ACME", sell: 100 }),
      booking({ customerReference: "ACME", sell: 900, status: "cancelled" }),
      booking({ customerReference: "ACME", sell: 900, status: "failed" }),
    ]);
    expect(history.bookings).toBe(1);
    expect(history.sold).toBe(100);
  });

  it("totals what is still on the table separately from what was accepted", () => {
    const history = customerHistory(customer(), [
      quote({ customerId: "cus_1", status: "open" }),
      quote({ customerId: "cus_1", status: "open" }),
      quote({ customerId: "cus_1", status: "accepted" }),
      quote({ customerId: "cus_1", status: "declined" }),
    ], []);
    expect(history.quotes).toBe(4);
    expect(history.openQuotes).toBe(2);
    expect(history.openValue).toBe(200);
    expect(history.accepted).toBe(1);
  });

  it("reports the most recent thing that happened, quote or booking", () => {
    const history = customerHistory(customer({ reference: "ACME" }), [quote({ customerId: "cus_1" })], [
      booking({ customerReference: "ACME", createdAt: "2026-04-01T00:00:00.000Z" }),
    ]);
    expect(history.lastActivity).toBe("2026-04-01T00:00:00.000Z");
  });

  it("says nothing rather than zero for a client with no trade", () => {
    const history = customerHistory(customer(), [], []);
    expect(history).toEqual({ quotes: 0, openQuotes: 0, openValue: 0, accepted: 0, bookings: 0, sold: 0 });
    expect(history.lastActivity).toBeUndefined();
  });
});

describe("saving the same person twice", () => {
  const book = [customer(), customer({ id: "cus_2", name: "Omar", email: "omar@example.com" })];

  it("finds an existing record with the same address, whatever the case", () => {
    expect(duplicateOf("NADIA@EXAMPLE.COM", book)?.id).toBe("cus_1");
  });

  it("does not report a record as its own duplicate", () => {
    // Editing a client's phone number must not refuse on the address they
    // already had.
    expect(duplicateOf("nadia@example.com", book, "cus_1")).toBeUndefined();
  });

  it("has no opinion when no address was given", () => {
    // An address is optional — a walk-in with a phone number is a real client.
    expect(duplicateOf(undefined, book)).toBeUndefined();
    expect(duplicateOf("   ", book)).toBeUndefined();
  });
});
