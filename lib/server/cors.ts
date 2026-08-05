import "server-only";

import { isAllowedOrigin, portalOriginList } from "@/lib/portal-origins";

/**
 * Who is allowed to call this backend from a browser.
 *
 * The portals are moving to their own front ends, so the API stops being
 * same-origin and starts being asked for credentials from another site. That is
 * exactly the shape of a cross-site request forgery, and the only thing that
 * makes it safe is being specific: named origins, echoed one at a time, with
 * credentials allowed and a wildcard never used.
 *
 * `*` is not merely discouraged here — a browser refuses to send credentials to
 * a wildcard origin, so an API that tried it would be both insecure in
 * principle and broken in practice.
 *
 * Origins come from configuration rather than code because they differ per
 * environment: a preview deployment, a staging domain and production are three
 * different hosts for the same front end.
 */

/** Origins allowed to call the API with a session, from configuration. */
export function allowedOrigins(): string[] {
  return portalOriginList(process.env.PORTAL_ORIGINS);
}

/**
 * The headers to answer a cross-origin request with, or nothing.
 *
 * An unknown origin gets no CORS headers at all rather than a refusal: the
 * browser then blocks the read itself, and we have not told a prober whether
 * the endpoint exists.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin, allowedOrigins())) return {};

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    // Echoing the origin means the answer differs by caller, and a cache that
    // did not know that would serve one front end's response to another.
    vary: "Origin",
  };
}

/** The preflight answer. Browsers send this before any credentialed POST. */
export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const headers = corsHeaders(req);
  if (!Object.keys(headers).length) return new Response(null, { status: 403 });

  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      // `x-locale` and `x-scenario` are ours; content-type is what makes a JSON
      // POST non-simple and triggers the preflight in the first place.
      "access-control-allow-headers": "content-type,x-locale,x-scenario",
      "access-control-max-age": "86400",
    },
  });
}

/**
 * Whether sessions have to survive a cross-site request.
 *
 * A cookie that another origin's page must send is `SameSite=None`, and a
 * browser only accepts that over HTTPS. So this is not a preference: configure
 * separate portal origins and the cookies must change with them, or every
 * sign-in silently fails to stick.
 *
 * Deliberately reads the variable rather than `allowedOrigins()`, which now
 * carries our own front ends whether or not anything is configured. Deriving
 * it from that list would have quietly turned every session cookie into
 * `SameSite=None` on a deployment that never intended a second origin —
 * loosening a cookie policy as a side effect of a CORS convenience, which is
 * exactly the sort of change nobody goes looking for afterwards.
 */
export function crossSiteSessions(): boolean {
  return portalOriginList(process.env.PORTAL_ORIGINS).length > portalOriginList(undefined).length;
}
