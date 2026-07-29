/**
 * Supplier photography, served from our own origin.
 *
 * The images are the supplier's and stay the supplier's — this does not copy or
 * re-host them, it fetches on demand and passes them through. What it changes
 * is what the browser learns: a page carrying `photos.hotelbeds.com` in thirty
 * image tags tells every visitor, every agency and every competitor exactly who
 * our wholesaler is. The platform's own contract (§9.4) says no supplier
 * identifier reaches the client, and a CDN hostname is one.
 *
 * The route takes a supplier key and a *path*, never a URL. Accepting a URL
 * would make this an open proxy — a request-forgery tool pointed at anything
 * the server can reach — and no amount of allowlisting a hostname afterwards is
 * as safe as never letting the caller name a host at all.
 */

/** Where each supplier's photography actually lives. Not client-visible. */
const ORIGINS: Record<string, string> = {
  hb: "https://photos.hotelbeds.com/giata",
  /*
   * TourMind publish over plain HTTP. Fetching it here rather than from the
   * browser is what makes that acceptable: the page stays HTTPS, no mixed
   * content is loaded, and their hostname is as hidden as the other one.
   */
  tm: "http://tm-lodging-content.tourmind.cn",
};

/**
 * Paths are opaque supplier strings, but they are still attacker-controlled.
 * Traversal and absolute forms are refused rather than normalised: a path that
 * needs cleaning up is a path we should not be fetching.
 */
function isSafePath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("//")) return false;
  return /^[A-Za-z0-9/._-]+$/.test(path);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const supplier = url.searchParams.get("s") ?? "";
  const path = url.searchParams.get("p") ?? "";

  const origin = ORIGINS[supplier];
  if (!origin || !isSafePath(path)) {
    return new Response(null, { status: 404 });
  }

  try {
    const upstream = await fetch(`${origin}/${path}`, {
      // A slow supplier CDN must not hold a connection open indefinitely.
      signal: AbortSignal.timeout(8000),
      headers: { accept: "image/*" },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(null, { status: 404 });
    }

    const type = upstream.headers.get("content-type") ?? "";
    // Whatever the upstream says it is, only images leave this route.
    if (!type.startsWith("image/")) return new Response(null, { status: 404 });

    return new Response(upstream.body, {
      headers: {
        "content-type": type,
        // Supplier photography for a given path does not change, so this is
        // cached hard — the proxy must not become a per-view round trip.
        "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    // A dead path renders the deterministic fallback the caller already holds.
    return new Response(null, { status: 404 });
  }
}
