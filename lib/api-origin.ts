/**
 * Where the API lives.
 *
 * The portals are separate front ends against one backend now, so a request
 * cannot assume the API is *implemented* on the origin serving the page. It is
 * still reached there: every front end rewrites `/api` to the backend in its
 * `next.config.ts`, which keeps the browser talking to one host and the session
 * cookie first-party. So relative stays the default, and is the answer in every
 * deployment that carries that rewrite.
 *
 * `NEXT_PUBLIC_API_URL` remains for a front end served without one — a static
 * host, a preview with no proxy. It is public by necessity: the browser has to
 * know the address it is calling, and there is nothing secret about it. What is
 * secret stays behind the API.
 *
 * Set `NEXT_PUBLIC_API_URL` and every call goes there instead. It is public by
 * necessity: the browser has to know the address it is calling, and there is
 * nothing secret about it. What is secret stays behind the API.
 *
 * Kept free of imports so both a server component and a client bundle can use
 * it, and so a front end that carries none of the backend can still call it.
 */

/** The API origin, without a trailing slash. Empty means "same origin". */
export function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) return "";
  return configured.replace(/\/+$/, "");
}

/**
 * Absolute when an origin is configured, relative when it is not.
 *
 * Callers pass the same `/api/...` path they always did, so moving a front end
 * onto a remote backend is a deployment change rather than a code change.
 */
export function apiUrl(path: string): string {
  const origin = apiOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The same rule, for anything the browser fetches by URL rather than by code.
 *
 * A photograph is a request to the backend exactly as much as a search is, but
 * it is made by the browser off an `src` attribute instead of by us off a
 * `fetch`, so `apiUrl` never got near it. On the separated portal every
 * property photo therefore pointed at the portal's own origin, which serves no
 * API, and the card fell through its photo, then its illustrated fallback, to
 * an empty grey box. The images were fine; the addresses were wrong.
 *
 * Only backend paths are rewritten. Anything already absolute, a data URI, or
 * a static asset the front end ships itself is returned untouched — those are
 * correct as they stand and rewriting them would break them.
 */
export function mediaUrl(src: string | undefined): string | undefined {
  if (!src || !src.startsWith("/api/")) return src;
  return apiUrl(src);
}

/**
 * The same, for a `srcSet` — a comma-separated list of "url descriptor" pairs.
 *
 * Rewriting the whole string with a regular expression would be shorter and
 * would corrupt any URL containing a comma; splitting on the descriptor keeps
 * each entry intact.
 */
export function mediaSrcSet(srcSet: string | undefined): string | undefined {
  if (!srcSet || !apiIsRemote()) return srcSet;
  return srcSet
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return "";
      const gap = trimmed.lastIndexOf(" ");
      const url = gap === -1 ? trimmed : trimmed.slice(0, gap);
      const descriptor = gap === -1 ? "" : trimmed.slice(gap);
      return `${mediaUrl(url) ?? url}${descriptor}`;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Whether the API is somewhere else.
 *
 * Cross-origin calls need credentials sent explicitly and cookies that survive
 * a cross-site request; same-origin calls need neither. Asking here keeps that
 * decision in one place rather than in seventy-seven fetches.
 */
export function apiIsRemote(): boolean {
  return apiOrigin() !== "";
}

/**
 * Whether to send the session cookie.
 *
 * `same-origin` — the safe default, and what every call here used to say —
 * sends nothing at all to another origin. On a separated front end that is a
 * silent failure with no error anywhere: the sign-in succeeds, the cookie is
 * set on the API's domain, and every subsequent request arrives anonymous, so
 * the portal shows its sign-in screen to someone who has just signed in.
 *
 * So the mode follows the deployment. Local and combined stay `same-origin`;
 * a configured remote API gets `include`, which is exactly what the backend's
 * CORS is written to allow and no more.
 */
export function apiCredentials(): RequestCredentials {
  return apiIsRemote() ? "include" : "same-origin";
}
