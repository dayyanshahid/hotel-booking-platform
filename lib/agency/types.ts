/**
 * The B2B domain.
 *
 * An agency portal is a different product on the same inventory, and the
 * difference is not cosmetic: a consumer is buying a stay, an agent is buying
 * stock to resell. That changes three things the consumer app deliberately does
 * not do.
 *
 * An agent sees cost. The consumer contract hides net rates (§9.4) because a
 * traveller has no use for them and a supplier's commercial terms are not
 * theirs to see. An agency's own cost *is* theirs to see — it is what they are
 * being charged. What stays hidden either way is which supplier the rate came
 * from: that is our commercial relationship, not theirs.
 *
 * An agency sets its own selling price. The platform markup that produces a
 * consumer price is replaced by the agency's own margin rule, so two agencies
 * can sell the same room at different prices.
 *
 * And an agency books on credit rather than a card, so the balance — not a
 * payment authorisation — decides whether a booking can proceed.
 */

export type AgentRole = "admin" | "agent";

export interface Agent {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  role: AgentRole;
  /** Suspended agents keep their bookings but cannot sign in or book. */
  active: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

/**
 * How an agency prices what it resells.
 *
 * `percent` is the default and what most agencies want. `fixed` adds a flat
 * amount per booking, for agencies charging a service fee rather than a margin.
 * Both apply to the agency's cost, never to the consumer price — marking up a
 * price that already carries our markup would compound the two.
 */
export interface MarkupRule {
  mode: "percent" | "fixed";
  value: number;
  /** ISO currency for a fixed rule. Ignored for percent. */
  currency?: string;
}

export interface CreditTerms {
  /**
   * Agreed limit, in whole currency units like every other amount in the app.
   * Bookings are refused once committed spend would exceed it.
   */
  limit: number;
  currency: string;
  /** Days from booking to settlement. */
  paymentDays: number;
}

export interface Agency {
  id: string;
  name: string;
  /** Used in URLs and as the agency's booking-reference prefix. */
  slug: string;
  countryCode: string;
  status: "active" | "suspended";
  /**
   * The discount off our public price that this agency is contracted to
   * receive. It is what makes the portal worth using: an agency whose cost is
   * the public price has nothing to sell. Held per agency because the figure is
   * negotiated, not standard.
   *
   * Deliberately expressed against our *public* price rather than the supplier
   * net, so an agency can see how their cost relates to what their customer
   * could find elsewhere — and so our own supplier margin stays ours.
   */
  commissionPercent: number;
  markup: MarkupRule;
  credit: CreditTerms;
  createdAt: string;
}

/**
 * One movement against an agency's credit.
 *
 * A ledger rather than a running total, because a balance you cannot explain is
 * a balance nobody trusts. The current figure is the sum of its entries, so
 * every number on screen traces to the booking that caused it.
 */
export interface LedgerEntry {
  id: string;
  agencyId: string;
  at: string;
  /** Negative commits credit, positive releases it. */
  amount: number;
  currency: string;
  kind: "booking" | "cancellation" | "settlement" | "adjustment";
  /** Platform booking reference, when the entry came from one. */
  reference?: string;
  note: string;
}

export interface AgencyBalance {
  agencyId: string;
  currency: string;
  limit: number;
  /** Committed but unsettled — what current bookings hold. */
  used: number;
  available: number;
}

/** What the portal knows about whoever is driving it. */
export interface AgencySession {
  agentId: string;
  agencyId: string;
  email: string;
  name: string;
  role: AgentRole;
  agencyName: string;
}

/**
 * An offer as an agent sees it.
 *
 * Cost and margin sit alongside the selling price, and there is no field for
 * the supplier — so it cannot be added to a response by accident.
 */
export interface AgencyOfferView {
  offerId: string;
  /** What the agency is charged. */
  cost: number;
  /** What the agency's customer pays, after the agency's own markup. */
  sell: number;
  /** sell − cost, because an agent needs it to quote. */
  margin: number;
  currency: string;
}

/**
 * A booking made through the portal, from the agency's side.
 *
 * Deliberately not merged into `Booking`: that record is the guest's, and is
 * served by consumer routes and printed on a voucher. Cost, margin and which
 * agent made the sale have no place on a document a traveller receives.
 */
export interface AgencyBooking {
  reference: string;
  agencyId: string;
  agentId: string;
  agentName: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  leadGuest: string;
  /** What the agency owes us. */
  cost: number;
  /** What the agency charges its customer, at the markup in force that day. */
  sell: number;
  currency: string;
  status: "confirmed" | "pending" | "cancelled" | "failed";
  createdAt: string;
}
