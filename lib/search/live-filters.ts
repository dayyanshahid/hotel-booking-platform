/** Which facets the search UI and the pipeline both speak in. */
export type FilterKey =
  | "price"
  | "stars"
  | "rating"
  | "neighborhood"
  | "propertyType"
  | "amenities"
  | "refundable"
  | "payLater"
  | "accessible"
  | "deals"
  | "board"
  | "hotelName"
  | "roomCategory"
  | "rateConditions"
  | "distance";

/**
 * What Hotelbeds and TourMind between them can actually answer.
 *
 * Star rating, board, price and cancellation come from both. Zone, property
 * type, facilities and promotions come from Hotelbeds, and amenities now come
 * from TourMind's static list too. Guest rating, accessible rooms and payment
 * timing are not in either contract as data we hold, so they are not offered.
 *
 * Room category and rate conditions are read out of what the suppliers do send
 * — the room's own name and its cancellation policy — so both are answerable
 * here. `refundable` is deliberately absent: "rate conditions" asks the same
 * question with three answers instead of one, and shipping both would be two
 * controls competing over one field.
 */
export const LIVE_SUPPLY_FILTERS: FilterKey[] = [
  "hotelName",
  "price",
  "stars",
  "board",
  "roomCategory",
  "rateConditions",
  "distance",
  "amenities",
  "neighborhood",
  "propertyType",
  "deals",
];

/*
 * Kept in the domain rather than beside the panel that renders it.
 *
 * This is a statement about what two supplier contracts can answer, not about
 * a control — the search pipeline narrows on it and a supplier test asserts
 * against it. Living in a React component meant a backend test importing a
 * filter panel, which is an edge that stops the API being separable at all.
 */
