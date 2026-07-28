import "server-only";
import { appendLedger, canCommit, getAgency, listLedger } from "./store";
import { viewOffer } from "./rates";
import type { AgencySession, LedgerEntry } from "./types";

/**
 * Booking on credit.
 *
 * A consumer authorises a card and the money question is settled before the
 * supplier is called. An agency has no card in the flow — the equivalent gate
 * is its credit line, and it has to close in the same place: *before* the
 * supplier order exists. Refusing afterwards means cancelling a room the agent
 * has already promised to a customer standing in front of them.
 *
 * The ledger is the record. `commit` writes a negative entry when the booking
 * is made and `release` writes the matching positive one when it is cancelled,
 * so headroom returns without anyone editing a total.
 */

export interface AgencyCommit {
  reference: string;
  /** The public price this was derived from — kept for the platform's own books. */
  publicPrice: number;
  cost: number;
  sell: number;
  margin: number;
  currency: string;
}

/** What the agency owes us for a booking priced at `publicPrice` on our site. */
export async function priceForAgency(
  publicPrice: number,
  currency: string,
  agencyId: string,
  countryCode?: string,
): Promise<AgencyCommit | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  const view = viewOffer("", publicPrice, currency, agency, countryCode);
  return {
    reference: "",
    publicPrice,
    cost: view.cost,
    sell: view.sell,
    margin: view.margin,
    currency: view.currency,
  };
}

export async function hasHeadroom(agencyId: string, cost: number): Promise<boolean> {
  return canCommit(agencyId, cost);
}

function entryId(reference: string, kind: string): string {
  // Derived rather than random, so a retried commit cannot double-charge the
  // same booking to the ledger.
  return `led_${kind}_${reference}`;
}

export async function commitBooking(
  session: AgencySession,
  commit: AgencyCommit,
  hotelName: string,
  at: string,
): Promise<void> {
  const existing = await listLedger(session.agencyId, 500);
  const id = entryId(commit.reference, "booking");
  if (existing.some((e) => e.id === id)) return;

  const entry: LedgerEntry = {
    id,
    agencyId: session.agencyId,
    at,
    amount: -commit.cost,
    currency: commit.currency,
    kind: "booking",
    reference: commit.reference,
    note: `${hotelName} · ${session.name}`,
  };
  await appendLedger(entry);
}

/**
 * Give credit back after a cancellation.
 *
 * `retained` is the part the supplier keeps — a non-refundable rate
 * releases nothing, a free cancellation releases all of it. Releasing the full
 * cost regardless would hand an agency headroom it has not actually recovered.
 */
export async function releaseBooking(
  agencyId: string,
  reference: string,
  cost: number,
  retained: number,
  currency: string,
  at: string,
): Promise<void> {
  const existing = await listLedger(agencyId, 500);
  const id = entryId(reference, "cancellation");
  if (existing.some((e) => e.id === id)) return;

  const released = Math.max(0, cost - Math.max(0, retained));
  if (released <= 0) return;

  await appendLedger({
    id,
    agencyId,
    at,
    amount: released,
    currency,
    kind: "cancellation",
    reference,
    note: retained > 0 ? "Cancelled — supplier fee retained" : "Cancelled — full release",
  });
}
