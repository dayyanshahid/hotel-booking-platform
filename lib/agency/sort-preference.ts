/**
 * The order this agent likes their results in.
 *
 * Whether a trade screen should *open* on best margin rather than on
 * recommended is a commercial decision and the client's to make, not one to
 * slip in as a default. But an agent who works margin-first re-picks the same
 * sort on every search of every day, which is a decision they have already
 * made being thrown away twelve times an hour.
 *
 * So the screen remembers rather than assumes. The first search an account ever
 * runs is still ranked the way the product ranks things; after that it is
 * ranked the way this agent last asked for.
 *
 * Held in the browser, like the recent searches beside it: one agent's working
 * preference on one machine, of no use to anybody else and not worth a round
 * trip on a page that must appear instantly.
 */

/** Per agent, so a shared counter machine does not hand one agent's preference to the next. */
function keyFor(agentId: string): string {
  return `nazil.sort.${agentId}`;
}

/**
 * What was last chosen, or nothing.
 *
 * Deliberately untyped beyond `string`: the caller owns the set of sorts it
 * accepts and has to check anyway. A value written by an older build — or by a
 * sort we have since removed — must not be able to put the page into a state
 * its own controls cannot show.
 */
export function readSortPreference(agentId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyFor(agentId));
  } catch {
    // Private browsing, a full quota, storage disabled by policy. A preference
    // is not worth an exception on the way into a screen.
    return null;
  }
}

export function rememberSortPreference(agentId: string, sort: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(agentId), sort);
  } catch {
    /* see above */
  }
}
