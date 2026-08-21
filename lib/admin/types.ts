/**
 * What the operator console renders, without what produces it.
 *
 * Both of these lived beside their implementations — `AdminSession` in the
 * session module, `AuditEntry` in the store — and the console imported them as
 * types. That is erased at runtime, so nothing leaked into a bundle. It still
 * had a cost: extracting the console into its own repository followed those
 * imports and copied the store and the persistence driver across with them,
 * because a type import is still an edge in the module graph.
 *
 * A front end should be able to describe an audit entry without carrying the
 * thing that writes one. So the shapes live here, and the modules that produce
 * them re-export these rather than declaring their own.
 */

/** Who is signed in to the console. */
export interface AdminSession {
  email: string;
  name: string;
}

/**
 * One recorded operator action.
 *
 * `seq` is monotonic within the store, so entries written inside the same
 * millisecond still have an order — sorting on the timestamp alone returned
 * them in whichever order the array happened to hold, and a log that cannot say
 * which change came last fails at the one question it exists to answer.
 */
export interface AuditEntry {
  id: string;
  at: string;
  seq: number;
  actor: string;
  action: string;
  /** What was acted on: an agency id, a booking reference, a setting key. */
  subject: string;
  /** Human-readable summary, already localised to English for the log. */
  detail: string;
  /** Before/after for value changes, so a reversal does not need a guess. */
  before?: string;
  after?: string;
}
