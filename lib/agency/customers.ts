import { quoteTotal } from "./quotes";
import type { AgencyBooking, AgencyCustomer, AgencyQuote } from "./types";

/**
 * What an agency has actually done with a client.
 *
 * The address book was a form-filler: saved once, copied into a quote, and
 * then forgotten. A record that cannot answer "what have we sold this person"
 * is a contact list, and the screen calling itself Customers was promising
 * more than that.
 */

export interface CustomerHistory {
  quotes: number;
  /** Quotes still open, and what they are worth if they land. */
  openQuotes: number;
  openValue: number;
  /** Quotes the client accepted. */
  accepted: number;
  bookings: number;
  /** What those bookings sold for. */
  sold: number;
  currency?: string;
  /** The most recent quote or booking, for sorting by who is live. */
  lastActivity?: string;
}

const EMPTY: CustomerHistory = { quotes: 0, openQuotes: 0, openValue: 0, accepted: 0, bookings: 0, sold: 0 };

/**
 * Whether a quote belongs to this client.
 *
 * By id when there is one, and by email otherwise. Every quote written before
 * the address book was linked carries only a name and an address, and refusing
 * to match them would empty the history of every long-standing client on the
 * day this shipped.
 *
 * Never by name. Two different people called Mohammed Al-Fulan is an ordinary
 * situation and merging their trading histories is not a mistake anybody would
 * catch by looking.
 */
function quoteBelongs(quote: AgencyQuote, customer: AgencyCustomer): boolean {
  if (quote.customerId) return quote.customerId === customer.id;
  if (!customer.email || !quote.customerEmail) return false;
  return quote.customerEmail.toLowerCase() === customer.email.toLowerCase();
}

/**
 * Whether a booking belongs to this client.
 *
 * Only when the agency recorded their own reference against it. A booking
 * carries a lead guest, and the lead guest is whoever is sleeping in the room
 * — often not the person who paid, and never reliably so for a company
 * booking travel for its staff. Matching on that name would attribute a
 * client's bookings to their employees and their employees' to them.
 */
function bookingBelongs(booking: AgencyBooking, customer: AgencyCustomer): boolean {
  if (!customer.reference || !booking.customerReference) return false;
  return booking.customerReference.trim().toLowerCase() === customer.reference.trim().toLowerCase();
}

export function customerHistory(
  customer: AgencyCustomer,
  quotes: AgencyQuote[],
  bookings: AgencyBooking[],
): CustomerHistory {
  const mine = quotes.filter((q) => quoteBelongs(q, customer));
  /*
   * Cancelled and failed bookings are not sales, for the same reason they are
   * left out everywhere else: a client shown as having spent money they got
   * back is a client an agent will treat differently on the phone.
   */
  const sold = bookings.filter(
    (b) => bookingBelongs(b, customer) && b.status !== "cancelled" && b.status !== "failed",
  );
  if (!mine.length && !sold.length) return { ...EMPTY };

  const open = mine.filter((q) => q.status === "open");
  const dates = [...mine.map((q) => q.createdAt), ...sold.map((b) => b.createdAt)].sort();

  return {
    quotes: mine.length,
    openQuotes: open.length,
    openValue: open.reduce((sum, q) => sum + quoteTotal(q), 0),
    accepted: mine.filter((q) => q.status === "accepted").length,
    bookings: sold.length,
    sold: sold.reduce((sum, b) => sum + b.sell, 0),
    currency: mine[0]?.currency ?? sold[0]?.currency,
    lastActivity: dates[dates.length - 1],
  };
}

/** Every client's history in one pass, keyed by id. */
export function customerHistories(
  customers: AgencyCustomer[],
  quotes: AgencyQuote[],
  bookings: AgencyBooking[],
): Record<string, CustomerHistory> {
  return Object.fromEntries(customers.map((c) => [c.id, customerHistory(c, quotes, bookings)]));
}

/**
 * An existing client with the same email address.
 *
 * The whole reason this module exists is that a name spelled two ways across a
 * quote and a voucher is a name somebody has to reconcile by hand. Two records
 * for one address is the same problem one step earlier, and it is easiest to
 * make at the moment somebody is in a hurry.
 *
 * Case-insensitive, and blind to the record being edited — saving a client
 * without touching their address must not report them as their own duplicate.
 */
export function duplicateOf(
  email: string | undefined,
  customers: AgencyCustomer[],
  ignoreId?: string,
): AgencyCustomer | undefined {
  if (!email?.trim()) return undefined;
  const needle = email.trim().toLowerCase();
  return customers.find((c) => c.id !== ignoreId && c.email?.toLowerCase() === needle);
}
