/**
 * Where the API lives.
 *
 * The portals are being split into their own front ends against one backend, so
 * a request can no longer assume the API is on the origin serving the page. It
 * usually still is — the consumer site ships with its own routes — and that
 * stays the default, because a relative path is the one URL that is correct in
 * every environment without configuration.
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
