/**
 * Whether an origin is one of our own front ends.
 *
 * Not `server-only`: the edge proxy answers preflights before any route runs
 * and cannot import server code, so the rule lives here and both callers read
 * the same one. Two copies of a security check drift, and the one that drifts
 * is the one nobody is testing.
 *
 * Entries are exact origins, with one concession: a single `*` may stand in for
 * the deployment hash Vercel mints on every push. That hash changes each time,
 * so an exact list means the URL the CLI prints after a deploy — the one you
 * actually click — is refused, the portal's session call is blocked by the
 * browser, and the screen says it cannot reach us. Which it could not.
 *
 * The wildcard is deliberately narrow. It matches one label's worth of
 * hash characters and no dots, so `travel-agent-portal-*-team.vercel.app`
 * cannot be satisfied by `travel-agent-portal-x.attacker.vercel.app`, and it
 * can never widen to `*.vercel.app`, where anybody may deploy. A pattern with
 * no host prefix, or more than one `*`, is discarded rather than honoured.
 */

/** Parsed from `PORTAL_ORIGINS`: a comma-separated list of origins or patterns. */
export function portalOriginList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function patternToRegExp(pattern: string): RegExp | null {
  const star = pattern.indexOf("*");
  if (star < 0) return null;
  // One wildcard only, and never the whole host.
  if (pattern.indexOf("*", star + 1) >= 0) return null;
  if (!/^https:\/\/[a-z0-9-]+\*/i.test(pattern)) return null;

  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    // No dots: the hash is one label, not a subdomain someone else controls.
    .join("[a-z0-9-]+");
  return new RegExp(`^${escaped}$`, "i");
}

export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  const clean = origin.replace(/\/+$/, "");
  for (const entry of allowed) {
    if (!entry.includes("*")) {
      if (entry === clean) return true;
      continue;
    }
    const rule = patternToRegExp(entry);
    if (rule?.test(clean)) return true;
  }
  return false;
}
