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

/**
 * What an account may do, in the three steps the trade actually works in.
 *
 * These are cumulative, and the order is the order money moves in: looking at
 * stock commits nothing, holding it commits the supplier but not the agency's
 * money, and issuing commits both. Splitting them is what lets an agency give a
 * junior a login without giving them the credit line.
 *
 * `admin` is not a fourth permission but a flag alongside them — an office
 * manager who issues bookings and also administers the staff list.
 */
export type AgentPermission = "viewOnly" | "booking" | "issue";

/**
 * Kept for the accounts that predate permissions.
 *
 * Every stored agent had one of these two; `admin` becomes an issuer who can
 * also manage staff, and `agent` becomes an issuer, because that is what they
 * could already do. Migrating anyone *down* to view-only would silently remove
 * a capability an agency is relying on today.
 */
export type AgentRole = "admin" | "agent";

/** Ranked so a check can ask "at least this much" rather than list variants. */
export const PERMISSION_RANK: Record<AgentPermission, number> = {
  viewOnly: 0,
  booking: 1,
  issue: 2,
};

export function canAtLeast(permission: AgentPermission, required: AgentPermission): boolean {
  return PERMISSION_RANK[permission] >= PERMISSION_RANK[required];
}

export interface Agent {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  role: AgentRole;
  /**
   * What this account may do. Absent on accounts created before permissions
   * existed, which {@link permissionOf} resolves from the role.
   */
  permission?: AgentPermission;
  /**
   * Rights that sit beside the ladder rather than on it. Absent means "as
   * before" — see {@link capabilitiesOf}.
   */
  capabilities?: Partial<AgentCapabilities>;
  /**
   * The account that created this one and answers for it.
   *
   * Absent means top-level: an agency administrator, and every agent that
   * existed before sub-agents did. A parent is always inside the same agency —
   * a hierarchy that crossed agencies would let one line of credit be spent by
   * people on another's contract.
   */
  parentId?: string;
  /**
   * The slice of credit this account may commit, in the agency's currency.
   *
   * Absent means "not separately capped": the account is bounded only by the
   * agency line, which is how every agent behaved before this existed and must
   * keep behaving. Zero is a real value and means exactly what it says.
   */
  creditLimit?: number;
  /**
   * What this account sells at, when it should not be the agency default.
   *
   * A sub-agent is often a different trading relationship — a branch on a
   * thinner margin, a sub-agent on a fatter one — and the parent sets it.
   */
  markup?: MarkupRule;
  /** Suspended agents keep their bookings but cannot sign in or book. */
  active: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

/**
 * The permission an account actually has.
 *
 * Reading this rather than the field directly is what keeps an agent created
 * last year working: no stored permission means the role decides, and both
 * existing roles could issue.
 */
export function permissionOf(agent: Pick<Agent, "role" | "permission">): AgentPermission {
  return agent.permission ?? "issue";
}

/**
 * Rights that are not steps on the ladder.
 *
 * `viewOnly < booking < issue` answers "how far up the chain is this account",
 * which is the right question for most things and the wrong shape for these
 * two. An agency may trust a counter agent to reserve a room and not to commit
 * money that cannot be recovered; it may trust a senior agent to issue and
 * still want non-refundable inventory going through one person. A ladder
 * cannot say either of those — every rung implies the ones below it — so these
 * ride alongside it rather than inside it.
 *
 * Both are risks rather than tasks, which is why they are the two that got
 * separated out. A hold is a real supplier booking that somebody has to
 * remember to issue or cancel; non-refundable is money the agency cannot get
 * back if the customer changes their mind.
 */
export interface AgentCapabilities {
  /** May reserve a room without committing to it. */
  hold: boolean;
  /** May book or issue inventory that cannot be cancelled. */
  nonRefundable: boolean;
}

/**
 * What an account may actually do, stored value first.
 *
 * Absent means "as before". An account that could already book could already
 * book a non-refundable rate and could already hold one, so silence resolves
 * to permissive for anyone at booking level or above — migrating an existing
 * agent *down* would quietly remove something their agency relies on, which is
 * the same reasoning `permissionOf` uses for the ladder itself.
 *
 * A view-only account gets neither, because it cannot book at all; granting it
 * a booking right would be a contradiction the UI would then have to explain.
 */
/**
 * A capability record as it arrives from a request, or nothing.
 *
 * Deliberately partial. A screen that flips one switch sends one key, and
 * coercing the absent one to `false` would have a hold being withdrawn every
 * time somebody changed a different setting. Absence means "leave it alone"
 * here and "as before" in {@link capabilitiesOf}; nothing else reads it.
 */
export function readCapabilities(value: unknown): Partial<AgentCapabilities> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const next: Partial<AgentCapabilities> = {};
  if (typeof input.hold === "boolean") next.hold = input.hold;
  if (typeof input.nonRefundable === "boolean") next.nonRefundable = input.nonRefundable;
  return Object.keys(next).length ? next : undefined;
}

export function capabilitiesOf(
  agent: Pick<Agent, "role" | "permission" | "capabilities">,
): AgentCapabilities {
  const canBook = canAtLeast(permissionOf(agent), "booking");
  if (!canBook) return { hold: false, nonRefundable: false };
  return {
    hold: agent.capabilities?.hold ?? true,
    nonRefundable: agent.capabilities?.nonRefundable ?? true,
  };
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

/**
 * A different margin for one country.
 *
 * Agencies do not price the world uniformly. A Karachi agency sells Makkah on
 * thin margins because every competitor in the city sells the same hotels, and
 * takes more on a European city break nobody is shopping around for. One global
 * percentage forces them to pick which of those two they get wrong.
 */
export interface MarkupOverride {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  rule: MarkupRule;
}

export interface MarkupPolicy {
  default: MarkupRule;
  overrides: MarkupOverride[];
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

/**
 * Who the agency is, for the documents it hands its customers.
 *
 * A quote or a voucher with our name on it is no use to an agency — their
 * customer bought from them. These fields are what turn a booking record into
 * something an agency can put in front of the person who paid for it.
 */
export interface AgencyProfile {
  legalName: string;
  address: string;
  city: string;
  taxNumber?: string;
  email: string;
  phone: string;
  /**
   * The agency's own mark, printed on anything a customer receives.
   *
   * A link to a logo the agency already hosts. The other way in is an upload —
   * see `logoUploadedAt` — which is what most agencies actually need, because
   * the file is on somebody's desktop rather than a CDN. Whichever is set,
   * it renders inside a fixed box so a tall or wide file cannot break the top
   * of a voucher.
   */
  logoUrl?: string;
  /**
   * When a logo was last uploaded, if one was.
   *
   * The bytes live in the store, not here — a logo inlined into the profile
   * would ride along on every response that carries it, and the dashboard
   * polls one every thirty seconds. This is the marker that says there is one,
   * and it doubles as the cache key: a new upload is a new timestamp, so the
   * URL changes and a year-long cache header is safe.
   *
   * Uploading clears `logoUrl` and vice versa. Two logos and a precedence rule
   * is a question nobody should have to answer.
   */
  logoUploadedAt?: string;
  /**
   * The accent on customer-facing documents, as `#rrggbb`.
   *
   * Stored as the agency typed it and resolved through `brandingOf`, which also
   * decides the ink that goes on top of it — a pale brand colour needs dark
   * text, and about a third of real ones are pale.
   */
  brandColor?: string;
  /** Printed under the contact line. HTTPS only, like the logo. */
  website?: string;
  /**
   * The agency's own booking conditions, printed at the foot of every quotation
   * and voucher.
   *
   * Agencies are usually required to put their own terms on what they hand a
   * customer, and without somewhere to say so they either paste it into the
   * notes of every quote or leave it off. Plain text, never markup: this is
   * rendered on a document a traveller is asked to trust, and an agency admin
   * is not a person who should be able to inject HTML into it.
   */
  documentFooter?: string;
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
  markup: MarkupPolicy;
  credit: CreditTerms;
  profile: AgencyProfile;
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
  /*
   * `hold` and `holdRelease` are not charges.
   *
   * Neither supplier offers a true hold, so ours is a real refundable booking
   * that has not been issued yet. The agency owes nothing for it — it can still
   * walk away for free — but the exposure is real, so it has to come off
   * available credit or a line could be spent twice over. Both kinds count
   * toward headroom and neither appears on a statement, because a statement is
   * a list of what is owed.
   */
  kind: "booking" | "cancellation" | "settlement" | "adjustment" | "hold" | "holdRelease";
  /** Platform booking reference, when the entry came from one. */
  reference?: string;
  /**
   * Who committed it, when we know.
   *
   * Absent on everything written before sub-agents existed, and on movements an
   * operator makes against the whole line. A sub-limit is measured only from
   * entries that name somebody, so introducing one today cannot retroactively
   * charge a sub-agent for spending nobody attributed to them.
   */
  agentId?: string;
  note: string;
}

export interface AgencyBalance {
  agencyId: string;
  currency: string;
  limit: number;
  /** Committed but unsettled — what current bookings hold. */
  used: number;
  /** Of `used`, the part that is reserved against holds rather than owed. */
  heldAmount: number;
  available: number;
}

/** What the portal knows about whoever is driving it. */
export interface AgencySession {
  agentId: string;
  agencyId: string;
  email: string;
  name: string;
  role: AgentRole;
  /**
   * Resolved from the stored account on every request, not carried in the
   * cookie: a demotion has to bite immediately.
   */
  permission?: AgentPermission;
  /**
   * Resolved the same way and for the same reason. Withdrawing the right to
   * hold or to sell non-refundable stock is a demotion by another name.
   */
  capabilities?: AgentCapabilities;
  /**
   * What this account sells at, when it is not the agency default. Resolved
   * with the rest, so a parent changing it reaches the next quote rather than
   * the next sign-in.
   */
  markup?: MarkupRule;
  agencyName: string;
  /**
   * Our own staff, identified by an allowlist rather than a row anyone can
   * write. Operators onboard agencies and record their payments; that is not an
   * agency role, so it is not part of {@link AgentRole}.
   */
  ops?: boolean;
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
  /**
   * What a traveller would have paid on the public site that day.
   *
   * Stored rather than re-derived, because what we retained on this booking is
   * `publicPrice − cost` and the commission it was based on can change later.
   * Inverting today's percentage against yesterday's sale gives a number that
   * looks right and is not.
   */
  publicPrice: number;
  /** What the agency owes us. */
  cost: number;
  /** What the agency charges its customer, at the markup in force that day. */
  sell: number;
  currency: string;
  /**
   * `held` is a real supplier booking nobody has issued yet.
   *
   * It exists because neither supplier will hold a room without booking it, so
   * the only honest hold is a refundable booking we intend to cancel unless
   * someone issues it first.
   */
  status: "confirmed" | "pending" | "cancelled" | "failed" | "held";
  createdAt: string;
  /**
   * When an unissued hold is cancelled automatically.
   *
   * Set to a margin *before* the supplier's free-cancellation deadline: a
   * sweeper that runs at the deadline itself will sometimes run a minute late,
   * and a minute late is the difference between free and a night's charge.
   */
  holdExpiresAt?: string;
  /** The supplier's free-cancellation deadline this hold was derived from. */
  freeCancellationUntil?: string;
  /** Who issued it, and when it stopped being a hold. */
  issuedAt?: string;
  issuedBy?: string;
  /** The agency's own reference for this sale, if they recorded one. */
  customerReference?: string;
  /**
   * A cancellation we asked for and could not confirm.
   *
   * The credit stays committed while this is set, because releasing headroom
   * against a cancellation that may not have happened lets the same money be
   * spent twice. But it cannot simply stay committed for ever: without a mark
   * here the booking looked untouched, the agency's limit was quietly short by
   * the cost of a stay nobody could account for, and no screen or job knew to
   * go and find out. The sweeper reads this and asks the supplier again.
   */
  cancellationUnconfirmedAt?: string;
}

/* ------------------------------------------------------------ quotations */

/**
 * A line on a customer quote.
 *
 * Snapshotted rather than referenced. A quote is a document an agency sends to
 * a person, and it has to keep saying the same thing after the underlying rate
 * has moved or expired — a quote that silently reprices is worse than one that
 * is plainly out of date.
 */
export interface AgencyQuoteItem {
  id: string;
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomName: string;
  boardLabel: string;
  /** Rooms the search this came from asked for — context, not what is priced. */
  rooms: number;
  guests: number;
  /**
   * Rooms this line's money actually buys.
   *
   * The line used to record `rooms` from the search and price one room, so a
   * quote sent to a customer read "3 rooms, 7 guests — $307" over a figure that
   * bought one room. That is the same defect as the results page had, except
   * written down, signed and emailed: the agent found out at the counter, in
   * front of the customer, having already been agreed.
   *
   * A line covers what it covers. Three rooms is three lines, which is what the
   * basket has always been able to hold.
   */
  roomsCovered: number;
  cost: number;
  sell: number;
  currency: string;
  /** Plain-language cancellation summary, as it stood when quoted. */
  cancellation: string;
  /** The offer this came from, so an agent can try to book it directly. */
  offerId?: string;
  /**
   * Whether that offer is still in the store, resolved when a quote is read.
   *
   * Never stored — it is a fact about right now, and writing it down would be
   * recording a rate's availability at the moment somebody happened to open
   * the page. Rates live about forty-five minutes and quotes are valid for
   * days, so on an ordinary quote this is false, and that is the honest
   * answer: the price still stands as a quotation, and the specific rate
   * behind it has to be found again before anyone can be charged for it.
   */
  live?: boolean;
}

export interface AgencyQuote {
  id: string;
  reference: string;
  agencyId: string;
  agentId: string;
  agentName: string;
  customerName: string;
  customerEmail?: string;
  notes?: string;
  items: AgencyQuoteItem[];
  currency: string;
  validUntil: string;
  status: "open" | "accepted" | "declined" | "expired";
  createdAt: string;
  updatedAt: string;
}

/**
 * Someone the agency sells to.
 *
 * Agencies work the same names for years — a corporate account, a family that
 * goes every Ramadan — and every quote and booking was retyping them. Held per
 * agency and never shared: one agency's client list is not another's, and it is
 * not ours either.
 */
export interface AgencyCustomer {
  id: string;
  agencyId: string;
  name: string;
  email?: string;
  phone?: string;
  /** The agency's own account code, when they keep one. */
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
