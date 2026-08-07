/**
 * Normalized, customer-safe domain model.
 *
 * Scope §8 / §9.4: the browser never sees supplier identifiers, net rates,
 * credentials or raw supplier errors. Everything in this file is what the BFF
 * is allowed to return to the client.
 */

import type { CurrencyCode } from "./currencies";

export type { CurrencyCode };
export type Locale = "en" | "ar";

/* ------------------------------------------------------------------ search */

export type DestinationType =
  | "city"
  | "region"
  | "country"
  | "airport"
  | "landmark"
  | "neighborhood"
  | "hotel";

export interface Suggestion {
  id: string;
  type: DestinationType;
  /** Localized primary label, e.g. "Riyadh". */
  label: string;
  /** Country / parent context — never mix similarly named places. §5.3 */
  context: string;
  countryCode: string;
  coordinates?: { lat: number; lng: number };
  /** Canonical hotel slug when type === "hotel". */
  hotelSlug?: string;
  propertyCount?: number;
  recent?: boolean;
}

export type Flexibility = "exact" | "p1" | "p3" | "p7";

export interface RoomAllocation {
  adults: number;
  /** Age in years per child — required per child. §8.1 */
  childrenAges: number[];
}

export interface SearchIntent {
  destinationId: string;
  destinationDisplay: string;
  destinationType: DestinationType;
  checkIn: string; // ISO local date
  checkOut: string; // ISO local date
  flexibility: Flexibility;
  rooms: RoomAllocation[];
  nationality?: string;
  accessibleRoom?: boolean;
  locale: Locale;
  currency: CurrencyCode;
}

/* ------------------------------------------------------------------ pricing */

export interface ChargeLine {
  code: string;
  label: string;
  amount: number;
  /** included = inside the total; payAtProperty = collected by the hotel. */
  basis: "included" | "payAtProperty";
  /** Amount is an estimate the platform cannot guarantee (E-07). */
  estimated?: boolean;
}

export interface PriceStack {
  currency: CurrencyCode;
  /** Complete stay total for what `roomsCovered` describes — the primary price. §3.1 */
  total: number;
  /** Secondary only. */
  nightlyAverage: number;
  base: number;
  includedCharges: ChargeLine[];
  payAtProperty: ChargeLine[];
  /** Present only with a valid comparable basis. §8.2 */
  strikeTotal?: number;
  discountLabel?: string;
  memberDelta?: number;
  /** Currency the card is actually charged in, when different. E-20 */
  chargeCurrency?: CurrencyCode;
  fxBasis?: string;
  nights: number;
  /**
   * What each night of the stay costs, when the supplier says.
   *
   * Hotelbeds returns a daily breakdown and it was being thrown away, so a
   * price-details panel had nothing to show but the total divided by the
   * nights — which is a different claim. A weekend night is routinely dearer
   * than the Tuesday beside it, and an agent quoting a four-night stay is
   * often asked exactly that.
   *
   * Carried as a share of the total rather than the supplier's own net
   * figures: the total on screen has been marked up and converted, and a
   * breakdown that does not add up to the number above it is worse than no
   * breakdown. Absent where the supplier prices the stay as a whole, and the
   * panel then says it is showing an average.
   */
  nightly?: { date: string; amount: number }[];
  /** Guests this total covers — the occupancy of `roomsCovered`, not the party. */
  guests: number;
  /**
   * How many rooms this total buys, and how many the search asked for.
   *
   * These were the same number by assumption and the assumption was wrong. A
   * supplier prices a rate per room; a search for three rooms returned one
   * room's total, and the card printed it under "total for 3 nights, 7 guests".
   * The same figure came out of a one-room search and a three-room search of
   * the same property, so an agent quoting a group under-quoted it by two
   * thirds and only found out at the counter.
   *
   * Kept as two fields rather than one ratio because the interesting case is
   * when they disagree: that is a price that needs qualifying, and a party that
   * still needs rooms found for it.
   */
  roomsCovered: number;
  roomsRequested: number;
}

/* ------------------------------------------------------------------- hotels */

export interface Amenity {
  code: string;
  label: string;
  scope: "property" | "room";
  fee?: string;
  schedule?: string;
  /** available ≠ included. §8.3 */
  included?: boolean;
}

export interface HotelImage {
  id: string;
  url: string;
  /** Width descriptors for the same frame, when the image host can resize (§12.2). */
  srcSet?: string;
  /** Drawn if `url` cannot load — never a supplier URL, always a local render. */
  fallbackUrl?: string;
  alt: string;
  category: "exterior" | "room" | "dining" | "pool" | "lobby" | "view";
  caption?: string;
  credit?: string;
  /** canonicalRoomId when this image belongs to a room. */
  roomId?: string;
}

export interface PolicySummary {
  checkInFrom: string;
  checkInTo?: string;
  checkOutBy: string;
  childPolicy: string;
  cotPolicy: string;
  petPolicy: string;
  parking: string;
  smoking: string;
  deposit?: string;
  idRequirement: string;
  accessibility: string;
  /** Mandatory charges collected locally. */
  localFees: ChargeLine[];
}

export interface HotelNotice {
  id: string;
  severity: "info" | "warning" | "critical";
  dateFrom: string;
  dateTo: string;
  description: string;
  alternative?: string;
}

export interface ReviewSummary {
  score: number;
  scale: number;
  count: number;
  source: string;
  licensed: boolean;
  subScores: { label: string; score: number }[];
}

export interface CanonicalHotel {
  canonicalHotelId: string;
  slug: string;
  name: string;
  category: number; // stars
  propertyType: string;
  chain?: string;
  destinationId: string;
  address: {
    line1: string;
    city: string;
    country: string;
    countryCode: string;
    postalCode?: string;
    neighborhood: string;
  };
  coordinates: { lat: number; lng: number };
  /**
   * How to reach the property directly.
   *
   * The supplier sends a booking line, a hotel line, a fax, an address and a
   * website on every property, and none of it was mapped. An agent chasing a
   * late arrival, an early check-in or a room type the rate does not describe
   * rings the hotel — it is the most ordinary escalation there is, and the
   * number was sitting in a payload we were discarding.
   *
   * Never shown on the consumer site: a traveller who books through us and
   * then rings the property directly gets an answer that contradicts the
   * booking, because the property has no idea who they are until we send it.
   */
  contact?: {
    bookingPhone?: string;
    hotelPhone?: string;
    fax?: string;
    email?: string;
    web?: string;
  };
  landmarks: { label: string; distanceKm: number; type: "landmark" | "airport" | "transit" }[];
  descriptions: { overview: string; location: string; family: string; accessibility: string };
  amenities: Amenity[];
  images: HotelImage[];
  policies: PolicySummary;
  notices: HotelNotice[];
  review?: ReviewSummary;
  qualityBadges: string[];
  /** Which internal sources contributed content — provenance, never supplier brand. §8.3 */
  contentProvenance: string;
  seo: { metaTitle: string; metaDescription: string; breadcrumbs: string[] };
}

/* ------------------------------------------------------- rooms, rates, offers */

export interface CanonicalRoom {
  canonicalRoomId: string;
  name: string;
  /** 0..1 — internal-only in production; surfaced here to drive UI separation rules. */
  mappingConfidence: number;
  sizeSqm?: number;
  view?: string;
  beds: { type: string; count: number }[];
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  extraBed?: boolean;
  cot?: boolean;
  smoking: boolean;
  accessible: boolean;
  amenities: Amenity[];
  images: HotelImage[];
}

export interface CancellationStep {
  /** ISO datetime in the destination time zone. */
  until: string;
  fee: number;
  label: string;
}

export interface CancellationPolicy {
  refundable: boolean;
  /** Free-cancellation deadline, when one exists. */
  freeUntil?: string;
  timezone: string;
  steps: CancellationStep[];
}

export interface RateComment {
  id: string;
  /** Structured, plain-language version shown by default. §5.7 */
  summary: string;
  /** Mandatory supplier wording, preserved verbatim in an expandable section. */
  verbatim: string;
  mandatory: boolean;
}

export interface OfferCapabilities {
  recheckRequired: boolean;
  cancellationQuote: boolean;
  modifyAllowed: boolean;
  guaranteeEligible: boolean;
  instantConfirmation: boolean;
}

export interface Offer {
  /** Opaque, short-lived. The browser never constructs a provider rate key. §8.4 */
  offerId: string;
  canonicalRoomId: string;
  board: { code: string; label: string; detail: string };
  paymentTiming: "payNow" | "payLater" | "payAtProperty";
  payLaterBy?: string;
  cancellation: CancellationPolicy;
  price: PriceStack;
  comments: RateComment[];
  badges: { code: string; label: string; kind: "factual" | "promotional" | "recommendation"; reason: string }[];
  remainingLabel?: string;
  /**
   * Rooms the supplier still holds at this rate, or 0 when it did not say.
   *
   * Both of them report it — Hotelbeds as `allotment`, TourMind as
   * `Allotment` — and both adapters were reading it only to decide whether to
   * print "2 left at this price", then discarding the number. The checkout has
   * a guard that refuses to sell more rooms than a rate holds, and it was being
   * handed a hard-coded zero, which it correctly reads as "the source did not
   * say" and waves through. The one limit the supplier actually stated was
   * therefore enforced nowhere.
   *
   * Zero still means unknown. An unknown is not a limit, and inventing one
   * would refuse bookings that would have succeeded.
   */
  allotment: number;
  capabilities: OfferCapabilities;
  expiresAt: string;
  /** Rooms this offer covers — multi-room searches return one offer per allocation set. */
  roomsCovered: number;
  /** Recommendation scoring inputs, all customer-explainable. §3.2 */
  scores: { price: number; flexibility: number; quality: number; location: number; fit: number };
}

export interface HotelAvailability {
  hotel: CanonicalHotel;
  rooms: CanonicalRoom[];
  offers: Offer[];
  searchToken: string;
  /** Some sources still answering — never claim final inventory. E-02 */
  partial: boolean;
  fetchedAt: string;
}

export interface HotelResultCard {
  canonicalHotelId: string;
  slug: string;
  name: string;
  category: number;
  propertyType: string;
  heroImage: string;
  heroImageSrcSet?: string;
  heroImageFallback?: string;
  heroAlt: string;
  locality: string;
  neighborhood: string;
  coordinates: { lat: number; lng: number };
  landmarkDistance?: { label: string; distanceKm: number };
  review?: ReviewSummary;
  qualityBadges: string[];
  topAmenities: { code: string; label: string }[];
  accessibilityHighlights: string[];
  offerSummary: {
    offerId: string;
    roomSummary: string;
    /** Display text, localised. Never matched on — see `boardCode`. */
    boardSummary: string;
    /**
     * The canonical board this rate is, independent of supplier or language.
     *
     * Filtering and faceting use this. Matching on the label instead made the
     * same board appear as two unrelated values — our own "Breakfast included"
     * and a supplier's "BED AND BREAKFAST" — which split the counts and made
     * the filter miss most of what it should have matched.
     */
    boardCode: string;
    refundable: boolean;
    freeCancellationUntil?: string;
    paymentTiming: Offer["paymentTiming"];
  };
  price: PriceStack;
  badges: Offer["badges"];
  availabilityStatus: "available" | "lastRooms" | "soldOut";
  remainingLabel?: string;
  offerTimestamp: string;
  /** How many internal sources contributed to this canonical property (never named). */
  sourceCount: number;
  scores: Offer["scores"];
}

export interface SearchFacets {
  /**
   * Per-room price range, and where a slider should actually stop.
   *
   * `max` is the real ceiling, so a filter set to it excludes nothing. But one
   * penthouse sets it: a Singapore search ran to $107,058 against a median near
   * $80, which left every usable price inside the first pixel of the track and
   * made the control decorative.
   *
   * `typicalMax` is the 95th percentile — the top of the range worth dragging
   * through. A slider spans `min` to `typicalMax` and treats its last stop as
   * "no maximum", which is why both numbers are needed: one bounds the control,
   * the other keeps the control from hiding results.
   */
  priceRange: { min: number; max: number; typicalMax: number };
  categories: { value: number; count: number }[];
  neighborhoods: { value: string; count: number }[];
  amenities: { code: string; label: string; count: number }[];
  boards: { code: string; label: string; count: number }[];
  propertyTypes: { value: string; count: number }[];
  paymentTiming: { value: string; count: number }[];
  /** Room kinds present in these results, with how many properties offer one. */
  roomCategories: { value: string; count: number }[];
  /** Free / partial / non-refundable, counted over every rate, not the lead one. */
  rateConditions: { value: string; count: number }[];
  /**
   * What a distance filter can be measured from, nearest-first after the
   * centre. Only places we hold coordinates for appear, so a city with no
   * landmarks in the dataset simply offers its centre.
   */
  distanceAnchors: { id: string; label: string; type: string }[];
  /**
   * Every property in these results, by name, for the name filter to offer.
   *
   * The filter was a bare text box: an agent typed two letters and either got
   * results or did not, with no way to tell whether they had misremembered the
   * name or the property simply is not in supply tonight. Offering the names
   * turns a guess into a choice.
   *
   * Built before any filter is applied, deliberately. A suggestion list that
   * narrowed to what had already been typed could only ever confirm the guess
   * it was meant to replace — the agent would type "ro", see the two matches,
   * and never learn that the property they wanted is spelled "Rho".
   *
   * `locality` rides along because a city can hold four Hiltons and the name
   * alone does not say which is which.
   */
  names: { value: string; locality: string }[];
}

export type SortKey =
  | "recommended"
  | "priceAsc"
  | "priceDesc"
  | "rating"
  | "distance"
  | "flexible"
  | "bestValue";

export interface SearchFilters {
  minPrice?: number;
  maxPrice?: number;
  categories?: number[];
  minRating?: number;
  neighborhoods?: string[];
  amenities?: string[];
  boards?: string[];
  propertyTypes?: string[];
  refundableOnly?: boolean;
  payLaterOnly?: boolean;
  accessibleOnly?: boolean;
  dealsOnly?: boolean;
  maxDistanceKm?: number;
  bounds?: { north: number; south: number; east: number; west: number };
  /**
   * Find one property inside the results.
   *
   * An agent who has been asked for the Hilton does not want to narrow a
   * hundred rows by star and board until it appears — they want to type
   * "hilton". Matched as a fold-insensitive substring of the property name.
   */
  hotelName?: string;
  /** Room kinds read out of the supplier's room names. See `RoomCategory`. */
  roomCategories?: string[];
  /** `free` | `partial` | `nonRefundable`. See `RateCondition`. */
  rateConditions?: string[];
  /**
   * What `maxDistanceKm` is measured from: `"centre"`, or the id of a place in
   * this destination (an airport, a landmark). A radius means nothing without
   * saying what it is a radius around, and "near the airport" and "near the
   * old town" are opposite ends of most cities.
   */
  distanceFrom?: string;
}

export interface SearchResponse {
  searchToken: string;
  intent: SearchIntent;
  results: HotelResultCard[];
  totalCount: number;
  facets: SearchFacets;
  /**
   * How much of the supply behind this page actually answered.
   *
   * `partial` means at least one source is still unavailable; `empty` means
   * none of the sources we asked could answer. `unconfigured` is different in
   * kind: we asked nobody, because this environment has no supplier connected.
   * It is separated out because the recovery is not the same — `empty` is worth
   * retrying and `unconfigured` never will be, and telling an agent to try
   * again in a moment when no amount of trying can help wastes their time and
   * their customer's.
   */
  completeness: "complete" | "partial" | "empty" | "unconfigured";
  /** Customer-safe explanation when completeness !== complete. */
  completenessMessage?: string;
  /**
   * How many of the sources behind this page could not answer.
   *
   * Carried separately from `completeness` because a page can be `partial` and
   * still have nothing on it, and those two facts together mean something
   * neither says alone: the search was fine and the supply did not arrive.
   * Without it, an empty `partial` page was rendered as "no hotels match this
   * search — try shifting the dates", which is advice for a different problem
   * and cannot work on this one. No source is named: which of our suppliers was
   * down is not the agent's business (§9.4), and the number is enough to know
   * the page is short through no fault of the search.
   */
  sourcesUnavailable?: number;
  page: number;
  pageSize: number;
  fetchedAt: string;
  /** Present when zero results — the recovery options for E-01. */
  recovery?: {
    nearbyDates: { checkIn: string; checkOut: string; fromTotal: number }[];
    nearbyDestinations: { id: string; label: string; propertyCount: number }[];
    relaxableFilters: string[];
  };
}

/* ---------------------------------------------------------------- checkout */

export type FieldType = "text" | "email" | "tel" | "select" | "date" | "number";

export interface RequirementField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  helper?: string;
  options?: { value: string; label: string }[];
  pattern?: string;
  maxLength?: number;
  /** Scope of the field: contact, lead, guest, billing, request. */
  group: "contact" | "lead" | "guest" | "billing" | "request";
}

/**
 * One room being bought, at one rate.
 *
 * A supplier prices a rate per room or per party depending on which supplier it
 * is, so "the thing being bought" was never reliably one room — but the session
 * held one `offerId`, one `roomName` and one `price`, which meant a party of
 * seven across three rooms went to checkout as whichever single rate happened to
 * be selected. The other two rooms were in `rooms`, described, unpriced and
 * unbooked.
 *
 * A line is the unit that has a rate, a cancellation policy, an expiry and a
 * supplier binding of its own. Three rooms is three lines.
 */
export interface SessionLine {
  lineId: string;
  offerId: string;
  /**
   * Which entries of the session's allocation this line houses.
   *
   * Usually one. Not always: Hotelbeds prices a rate per room, so a line is a
   * room — but TourMind prices the whole party, so a single TourMind line covers
   * every room at once. A line that assumed one room would send a three-room
   * TourMind order with one room's guests named and the other two empty, which
   * their create call refuses, or a Hotelbeds order for a third of the party,
   * which it accepts.
   *
   * The rate says how many it covers; this is which ones they are.
   */
  roomIndexes: number[];
  roomName: string;
  boardLabel: string;
  /** The rooms this line sleeps. One entry per room it covers. */
  occupancies: RoomAllocation[];
  price: PriceStack;
  cancellation: CancellationPolicy;
  paymentTiming: Offer["paymentTiming"];
  comments: RateComment[];
  capabilities: OfferCapabilities;
  expiresAt: string;
}

export interface CheckoutSession {
  checkoutSessionId: string;
  hotelSlug: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  /** The allocation searched for. `lines` is what is actually being bought. */
  rooms: RoomAllocation[];
  /**
   * Every room in this checkout. Authoritative; never empty.
   *
   * The fields below it are rollups across these lines, and each rolls up in the
   * direction that cannot overpromise — see the comments on each.
   */
  lines: SessionLine[];
  /** The sum of every line. Guests and rooms describe the whole party. */
  price: PriceStack;
  /**
   * The least forgiving line's policy, because this is what governs the booking
   * as a unit. Three lines can have three deadlines, and one non-refundable line
   * means the set cannot be cancelled freely — presenting the most generous of
   * them as "the" policy is how a customer is told a booking is refundable when
   * a third of it is not.
   */
  cancellation: CancellationPolicy;
  /** `payNow` if any line demands it: the set settles on the strictest terms. */
  paymentTiming: Offer["paymentTiming"];
  /** Merged across lines, deduplicated — a condition stated once is enough. */
  comments: RateComment[];
  requirements: RequirementField[];
  /**
   * Conservative across lines: a capability holds only if every line has it, and
   * `recheckRequired` is true if any single line needs one. A set that claims
   * instant confirmation because two of three rates do is a set that fails.
   */
  capabilities: OfferCapabilities;
  /** The earliest line's expiry. A set is only held as long as its first loss. */
  expiresAt: string;
  termsVersion: string;
  createdAt: string;
}

export interface RecheckResult {
  outcome: "unchanged" | "lower" | "higher" | "policyChanged" | "unavailable";
  /** Material change requires an explicit accept before payment. §6.4 / E-09 */
  requiresAcceptance: boolean;
  previous: { price: PriceStack; cancellation: CancellationPolicy; boardLabel: string };
  current?: { price: PriceStack; cancellation: CancellationPolicy; boardLabel: string };
  changeReasons: string[];
  newExpiresAt?: string;
  alternatives?: { offerId: string; roomName: string; boardLabel: string; price: PriceStack; refundable: boolean }[];
}

export interface PaymentIntent {
  intentId: string;
  clientSecret: string;
  amount: number;
  currency: CurrencyCode;
  allowedMethods: PaymentMethodOption[];
  threeDsRequired: boolean;
  merchantDescriptor: string;
  /**
   * charge = captured now; guarantee = card held to secure the booking and
   * charged only per the rate's payment and cancellation terms.
   */
  mode: "charge" | "guarantee";
}

export interface PaymentMethodOption {
  code: "card" | "applepay" | "mada" | "stcpay" | "paypal" | "payAtProperty";
  label: string;
  markets: string[];
  requiresBilling: boolean;
}

/* ---------------------------------------------------------------- bookings */

export type BookingStatus =
  | "processing"
  | "pending"
  | "confirmed"
  | "cancelled"
  | "failed"
  | "reconciliationRequired";

export interface BookingGuest {
  roomIndex: number;
  type: "adult" | "child";
  firstName: string;
  surname: string;
  age?: number;
  nationality?: string;
  lead?: boolean;
}

export interface ServiceEvent {
  at: string;
  code: string;
  label: string;
  detail?: string;
  actor: "customer" | "platform" | "support";
}

export interface RefundState {
  status: "none" | "initiated" | "processing" | "settled";
  amount: number;
  currency: CurrencyCode;
  method: string;
  initiatedAt?: string;
  expectedRange?: string;
  reference?: string;
}

/**
 * One room of a booking, as it was sold.
 *
 * A booking held one `roomName`, one `boardLabel` and one `price`, so both
 * vouchers printed "{rooms.length} × {roomName}" — "3 × Deluxe twin" over the
 * cost of one, the same sentence the quote printed and the booking screen
 * printed. A guest arrived with a voucher for three rooms and a reservation for
 * one.
 *
 * There is no per-line status or supplier reference, and that is not an omission.
 * A booking is one property and one stay, one property is served by one source,
 * and both of our suppliers take every room of an order in a single call — so
 * the order confirms or fails as a whole and its reference belongs to the whole.
 * Per-line outcomes only start to mean something for a basket spanning hotels,
 * which is a second order and a second voucher.
 */
export interface BookingLine {
  lineId: string;
  roomName: string;
  boardLabel: string;
  /** The rooms this line sleeps — one entry per room the rate covered. */
  occupancies: RoomAllocation[];
  price: PriceStack;
  cancellation: CancellationPolicy;
  /** The people in this room, lead included where they are in it. */
  guests: BookingGuest[];
}

export interface Booking {
  /** Stable platform reference — the customer's primary identifier. §8.5 */
  reference: string;
  status: BookingStatus;
  statusDetail: string;
  hotelSlug: string;
  hotelName: string;
  hotelAddress: string;
  hotelPhone: string;
  hotelCoordinates: { lat: number; lng: number };
  checkIn: string;
  checkOut: string;
  /** Every room booked. Authoritative; never empty. */
  lines: BookingLine[];
  rooms: RoomAllocation[];
  guests: BookingGuest[];
  contact: { email: string; phone: string; language: Locale };
  price: PriceStack;
  paidAmount: number;
  dueAtProperty: number;
  paymentTiming: Offer["paymentTiming"];
  paymentMethodLabel: string;
  cancellation: CancellationPolicy;
  comments: RateComment[];
  specialRequests: string[];
  capabilities: OfferCapabilities & { cancelAllowed: boolean };
  voucherVersion: number;
  createdAt: string;
  updatedAt: string;
  timeline: ServiceEvent[];
  refund?: RefundState;
  cancellationReference?: string;
  /** Set while orchestration is still reconciling (E-14). */
  reconciliation?: { startedAt: string; attempts: number; nextCheckMs: number };
}

export interface CancellationQuote {
  quoteId: string;
  bookingReference: string;
  fee: number;
  refundableAmount: number;
  currency: CurrencyCode;
  deadline: string;
  timezone: string;
  expiresAt: string;
  method: string;
  expectedRange: string;
  scope: "wholeBooking" | "room";
}

/* ------------------------------------------------------ account & services */

export interface TravelerProfile {
  id: string;
  type: "adult" | "child";
  firstName: string;
  surname: string;
  dateOfBirth?: string;
  nationality?: string;
  consentAt: string;
}

export interface SavedCollection {
  id: string;
  name: string;
  hotelSlugs: string[];
  shareToken?: string;
  createdAt: string;
}

export interface PriceAlert {
  id: string;
  hotelSlug?: string;
  destinationId: string;
  destinationLabel: string;
  checkIn: string;
  checkOut: string;
  rooms: RoomAllocation[];
  targetPrice: number;
  currency: CurrencyCode;
  channels: ("email" | "push" | "web")[];
  createdAt: string;
  status: "active" | "triggered" | "unsubscribed";
  lastPrice?: number;
}

export interface SupportCase {
  caseId: string;
  bookingReference?: string;
  category: string;
  channel: "chat" | "email" | "call" | "whatsapp";
  status: "open" | "inProgress" | "resolved";
  slaHours: number;
  createdAt: string;
  /**
   * The operator who owns it, by email.
   *
   * A queue with no ownership is a queue two people answer at once and a third
   * assumes someone else has. Optional because a case starts unowned and
   * because every case written before this existed is still valid.
   */
  assignee?: string;
  messages: { at: string; from: "customer" | "agent"; body: string }[];
}

export interface AppNotification {
  id: string;
  kind: "booking" | "payment" | "price" | "cancellation" | "reminder" | "service";
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  read: boolean;
}

/* ------------------------------------------------------------------ errors */

export type ErrorCategory =
  | "validation"
  | "availabilityChanged"
  | "paymentActionNeeded"
  | "bookingProcessing"
  | "temporaryService"
  | "accountSecurity"
  | "policyRestriction";

export interface ApiError {
  category: ErrorCategory;
  /** Message key resolved through the locale dictionary — never a supplier string. */
  messageKey: string;
  message: string;
  retryable: boolean;
  correlationId: string;
  recommendedAction:
    | "editInput"
    | "acceptUpdate"
    | "selectAlternative"
    | "retry"
    | "changeMethod"
    | "wait"
    | "authenticate"
    | "contactSupport";
  fields?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/* ------------------------------------------------- supplier confirmation */

export interface SupplierConfirmation {
  /** Whether the supplier still considers this live. */
  status: "confirmed" | "pending" | "cancelled" | "failed" | "unknown";
  /**
   * The property's own confirmation number, when the supplier gives us one.
   *
   * This is what a guest reads out at the desk. It names the hotel's record,
   * not our wholesaler's, which is why it may be shown when a supplier
   * reference may not. TourMind returns it; Hotelbeds does not, and the voucher
   * simply omits the line rather than printing something misleading in its
   * place.
   */
  hotelConfirmationNumber?: string;
  /** Guests as the supplier holds them — who the property is expecting. */
  guests?: { firstName: string; lastName: string; child: boolean }[];
  /** Rooms as confirmed, which can differ from what was requested. */
  rooms?: { name?: string; board?: string; guests?: string[] }[];
  checkIn?: string;
  checkOut?: string;
  /** When the supplier recorded the booking. */
  bookedAt?: string;
  /** True when we could not reach the supplier; the voucher says so. */
  unavailable?: boolean;
}

/**
 * What `/api/search/interpret` answers with.
 *
 * The interpreter itself is server code — it reads dates and occupancy out of a
 * sentence — but its *answer* is a wire shape, and the component that renders
 * it runs in the browser. Declared here so a front end that carries no server
 * code can still describe what it receives; the module that produces it
 * re-exports this rather than owning a second copy.
 */
export interface Interpretation {
  intent: SearchIntent | null;
  filters: SearchFilters;
  /** What it read straight out of the sentence. */
  understood: string[];
  /** What it had to fill in, stated so the guest can correct it. */
  assumed: string[];
  /** What it could not work out at all. */
  missing: string[];
}
