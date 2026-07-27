/**
 * Raw APItude payload shapes.
 *
 * These types describe the supplier's contract, not ours. They exist so the
 * adapter can be type-checked; nothing in this file may be re-exported to a
 * client component or embedded in an API response (§9.4).
 *
 * Fields are optional wherever the supplier documents them as conditional, so a
 * missing block degrades to a gap in the canonical model rather than a crash.
 */

export interface HbAuditData {
  processTime?: string;
  timestamp?: string;
  requestHost?: string;
  serverId?: string;
  environment?: string;
  release?: string;
  token?: string;
  internal?: string;
}

/* ------------------------------------------------------------ availability */

export interface HbCancellationPolicy {
  /** Fee charged if the booking is cancelled from `from` onward. */
  amount?: string | number;
  /** ISO datetime in the property's local time. */
  from?: string;
  hotelAmount?: string | number;
  hotelCurrency?: string;
}

export interface HbTax {
  included?: boolean;
  percent?: string | number;
  amount?: string | number;
  currency?: string;
  type?: string;
  clientAmount?: string | number;
  clientCurrency?: string;
}

export interface HbPromotion {
  code?: string;
  name?: string;
  remark?: string;
}

export interface HbRate {
  rateKey?: string;
  rateClass?: string;
  /** BOOKABLE proceeds directly; RECHECK requires a CheckRate call first. */
  rateType?: "BOOKABLE" | "RECHECK" | string;
  net?: string | number;
  discount?: string | number;
  discountPCT?: string | number;
  sellingRate?: string | number;
  hotelSellingRate?: string | number;
  amount?: string | number;
  hotelCurrency?: string;
  hotelMandatory?: boolean;
  allotment?: number;
  commission?: string | number;
  commissionVAT?: string | number;
  commissionPCT?: string | number;
  /** Pipe-delimited identifier used to resolve wording from the Content API. */
  rateCommentsId?: string;
  rateComments?: string;
  paymentType?: string;
  packaging?: boolean;
  boardCode?: string;
  boardName?: string;
  rooms?: number;
  adults?: number;
  children?: number;
  childrenAges?: string;
  cancellationPolicies?: HbCancellationPolicy[];
  taxes?: { taxes?: HbTax[]; allIncluded?: boolean };
  promotions?: HbPromotion[];
  offers?: { code?: string; name?: string; amount?: string | number }[];
  rateBreakDown?: unknown;
  dailyRates?: { offset?: number; dailyNet?: string | number }[];
}

export interface HbRoom {
  code?: string;
  name?: string;
  rates?: HbRate[];
}

export interface HbHotel {
  code?: number;
  name?: string;
  categoryCode?: string;
  categoryName?: string;
  destinationCode?: string;
  destinationName?: string;
  zoneCode?: number;
  zoneName?: string;
  latitude?: string | number;
  longitude?: string | number;
  rooms?: HbRoom[];
  minRate?: string | number;
  maxRate?: string | number;
  currency?: string;
  /** Present when the account is configured for hotel packages. */
  keywords?: unknown;
  reviews?: { rate?: number; reviewCount?: number; type?: string }[];
}

export interface HbAvailabilityResponse {
  auditData?: HbAuditData;
  hotels?: {
    hotels?: HbHotel[];
    checkIn?: string;
    checkOut?: string;
    total?: number;
  };
  error?: { code?: string; message?: string };
}

/* --------------------------------------------------------------- checkrate */

export interface HbCheckRateResponse {
  auditData?: HbAuditData;
  hotel?: HbHotel & {
    checkIn?: string;
    checkOut?: string;
    totalNet?: string | number;
    totalSellingRate?: string | number;
    pendingAmount?: string | number;
    supplier?: { name?: string; vatNumber?: string };
    /** Alternative rates the supplier suggests when the selected one moved. */
    upselling?: { rooms?: HbRoom[] };
  };
  error?: { code?: string; message?: string };
}

/* ----------------------------------------------------------------- booking */

export interface HbPax {
  roomId?: number;
  type?: "AD" | "CH" | string;
  age?: number;
  name?: string;
  surname?: string;
}

export interface HbBookingRoom {
  status?: string;
  id?: number;
  code?: string;
  name?: string;
  paxes?: HbPax[];
  rates?: HbRate[];
}

export interface HbBooking {
  reference?: string;
  cancellationReference?: string;
  clientReference?: string;
  creationDate?: string;
  status?: "CONFIRMED" | "CANCELLED" | "PENDING" | string;
  modificationPolicies?: { cancellation?: boolean; modification?: boolean };
  creationUser?: string;
  holder?: { name?: string; surname?: string };
  remark?: string;
  invoiceCompany?: { code?: string; company?: string; registrationNumber?: string };
  totalNet?: string | number;
  pendingAmount?: string | number;
  currency?: string;
  hotel?: HbHotel & {
    checkIn?: string;
    checkOut?: string;
    rooms?: HbBookingRoom[];
    totalNet?: string | number;
    currency?: string;
    supplier?: { name?: string; vatNumber?: string };
    /** Present on a cancellation simulation or a completed cancellation. */
    cancellationAmount?: string | number;
  };
}

export interface HbBookingResponse {
  auditData?: HbAuditData;
  booking?: HbBooking;
  error?: { code?: string; message?: string };
}

/* ----------------------------------------------------------------- content */

export interface HbContentText {
  content?: string;
  languageCode?: string;
}

export interface HbContentImage {
  imageTypeCode?: string;
  path?: string;
  order?: number;
  visualOrder?: number;
  roomCode?: string;
  roomType?: string;
  characteristicCode?: string;
}

export interface HbContentRoom {
  roomCode?: string;
  isParentRoom?: boolean;
  minPax?: number;
  maxPax?: number;
  maxAdults?: number;
  maxChildren?: number;
  minAdults?: number;
  roomType?: string;
  characteristicCode?: string;
  roomFacilities?: { facilityCode?: number; facilityGroupCode?: number; indYesOrNo?: boolean; number?: number }[];
  roomStays?: unknown[];
  description?: string;
}

export interface HbContentFacility {
  facilityCode?: number;
  facilityGroupCode?: number;
  order?: number;
  indYesOrNo?: boolean;
  number?: number;
  voucher?: boolean;
  indFee?: boolean;
  distance?: number;
  ageFrom?: number;
  ageTo?: number;
  timeFrom?: string;
  timeTo?: string;
  amount?: string | number;
  currency?: string;
  applicationType?: string;
}

export interface HbContentHotel {
  code?: number;
  name?: HbContentText;
  description?: HbContentText;
  countryCode?: string;
  stateCode?: string;
  destinationCode?: string;
  zoneCode?: number;
  coordinates?: { longitude?: number; latitude?: number };
  categoryCode?: string;
  categoryGroupCode?: string;
  chainCode?: string;
  accommodationTypeCode?: string;
  boardCodes?: string[];
  segmentCodes?: number[];
  address?: { content?: string; street?: string; number?: string };
  postalCode?: string;
  city?: HbContentText;
  email?: string;
  license?: string;
  phones?: { phoneNumber?: string; phoneType?: string }[];
  rooms?: HbContentRoom[];
  facilities?: HbContentFacility[];
  terminals?: { terminalCode?: string; distance?: number }[];
  interestPoints?: { facilityCode?: number; facilityGroupCode?: number; order?: number; poiName?: string; distance?: string }[];
  issues?: { issueCode?: string; issueType?: string; dateFrom?: string; dateTo?: string; order?: number; alternative?: boolean }[];
  images?: HbContentImage[];
  web?: string;
  lastUpdate?: string;
  ranking?: number;
  S2C?: string;
}

export interface HbContentHotelsResponse {
  auditData?: HbAuditData;
  hotels?: HbContentHotel[];
  from?: number;
  to?: number;
  total?: number;
  error?: { code?: string; message?: string };
}

export interface HbDestination {
  code?: string;
  countryCode?: string;
  isoCode?: string;
  name?: HbContentText;
  zones?: { zoneCode?: number; name?: string; description?: string }[];
  groupZones?: { groupZoneCode?: string; name?: string }[];
}

export interface HbDestinationsResponse {
  auditData?: HbAuditData;
  destinations?: HbDestination[];
  from?: number;
  to?: number;
  total?: number;
}

export interface HbTypeItem {
  code?: string | number;
  description?: HbContentText;
  facilityGroupCode?: number;
  multiChoice?: boolean;
}

export interface HbTypesResponse {
  auditData?: HbAuditData;
  boards?: HbTypeItem[];
  categories?: HbTypeItem[];
  facilities?: HbTypeItem[];
  rooms?: HbTypeItem[];
  countries?: { code?: string; description?: HbContentText; isoCode?: string }[];
  from?: number;
  to?: number;
  total?: number;
}

/** Image CDN base documented for Content API image paths. */
export const HB_IMAGE_BASE = "https://photos.hotelbeds.com/giata";
export type HbImageSize = "original" | "bigger" | "xl" | "big" | "medium" | "small";

export function hbImageUrl(path: string | undefined, size: HbImageSize = "bigger"): string | undefined {
  if (!path) return undefined;
  return `${HB_IMAGE_BASE}/${size}/${path.replace(/^\//, "")}`;
}

export function toNumber(value: string | number | undefined, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
