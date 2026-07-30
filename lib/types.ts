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
  priceRange: { min: number; max: number };
  categories: { value: number; count: number }[];
  neighborhoods: { value: string; count: number }[];
  amenities: { code: string; label: string; count: number }[];
  boards: { code: string; label: string; count: number }[];
  propertyTypes: { value: string; count: number }[];
  paymentTiming: { value: string; count: number }[];
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

export interface CheckoutSession {
  checkoutSessionId: string;
  offerId: string;
  hotelSlug: string;
  hotelName: string;
  roomName: string;
  boardLabel: string;
  checkIn: string;
  checkOut: string;
  rooms: RoomAllocation[];
  price: PriceStack;
  cancellation: CancellationPolicy;
  paymentTiming: Offer["paymentTiming"];
  comments: RateComment[];
  requirements: RequirementField[];
  capabilities: OfferCapabilities;
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
  roomName: string;
  boardLabel: string;
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
