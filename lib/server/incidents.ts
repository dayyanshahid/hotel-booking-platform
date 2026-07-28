/**
 * Recent supplier failures, kept where an operator can see them.
 *
 * Every supplier error already goes to `console.error` as structured JSON,
 * which is right for a log aggregator and useless to the person on the support
 * desk asking "is Hotelbeds down, or is it just this booking?". Answering that
 * from a platform log viewer means leaving the console, knowing the query, and
 * having access — three things a duty operator often does not have at 2am.
 *
 * So the same errors also land in a small ring buffer here. It is process-local
 * and lossy by design: this is a *symptom feed*, not an audit trail. The audit
 * log is durable and complete because it records decisions people made; this
 * records weather. Losing the last hundred timeouts on a cold start costs
 * nothing, and pretending otherwise would mean putting supplier noise into the
 * record that has to survive.
 */

export interface Incident {
  id: string;
  at: string;
  supplier: "hotelbeds" | "tourmind";
  /** The call that failed: `bookings.confirm`, `search.availability`, … */
  operation: string;
  /** Our own classification, not the supplier's wording. */
  kind: string;
  /** Server-side detail. Never rendered to a customer. */
  detail: string;
  /** Booking or correlation reference, when the failure had one. */
  reference?: string;
}

/** Enough to see a pattern in a shift, small enough to never matter for memory. */
const LIMIT = 200;

const buffer: Incident[] = [];
let counter = 0;

export function recordIncident(entry: Omit<Incident, "id" | "at">): void {
  counter += 1;
  buffer.push({ ...entry, id: `inc_${counter}`, at: new Date().toISOString() });
  if (buffer.length > LIMIT) buffer.splice(0, buffer.length - LIMIT);
}

export function listIncidents(limit = LIMIT): Incident[] {
  return [...buffer].reverse().slice(0, limit);
}

/**
 * A count per supplier over a recent window.
 *
 * The overview needs "is anything on fire" in one number, and a raw total is
 * the wrong one — a supplier that failed forty times last Tuesday is not
 * failing now. Only the window counts.
 */
export function incidentRate(windowMinutes = 60, now = Date.now()): { supplier: string; count: number }[] {
  const since = now - windowMinutes * 60_000;
  const counts = new Map<string, number>();
  for (const incident of buffer) {
    if (new Date(incident.at).getTime() < since) continue;
    counts.set(incident.supplier, (counts.get(incident.supplier) ?? 0) + 1);
  }
  return [...counts.entries()].map(([supplier, count]) => ({ supplier, count }));
}

/** Test seam. */
export function __resetIncidents(): void {
  buffer.length = 0;
  counter = 0;
}
