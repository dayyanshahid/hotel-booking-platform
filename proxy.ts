import { NextResponse, type NextRequest } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Origins allowed to call this backend from another site.
 *
 * Read here rather than imported from the server module, because the proxy runs
 * in the edge runtime and must not pull `server-only` code into it. The list is
 * the same one `lib/server/cors.ts` reads; both come from the environment.
 */
function portalOrigins(): string[] {
  return (process.env.PORTAL_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Answer cross-origin API calls before anything else looks at them.
 *
 * Doing it here rather than per route means a new endpoint is reachable from
 * the portals the moment it exists, and cannot be forgotten. Unknown origins
 * get no CORS headers at all — the browser blocks the read, and we have not
 * confirmed to a prober that the endpoint is there.
 */
function withCors(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (!portalOrigins().includes(origin.replace(/\/+$/, ""))) return null;

  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    // The answer differs by caller; a cache that did not know would hand one
    // front end another's response.
    vary: "Origin",
  };

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...headers,
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-locale,x-scenario",
        "access-control-max-age": "86400",
      },
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

/**
 * Locale routing (§5.1). Every customer-facing URL is locale-prefixed so
 * hreflang, canonical URLs and shared links stay stable.
 *
 * Next.js 16 renames the middleware convention to `proxy`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    // A portal on its own origin reaches the API from another site, which is
    // the one case that needs an explicit answer before the route runs.
    return withCors(request) ?? NextResponse.next();
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return NextResponse.next();

  const cookieLocale = request.cookies.get("nz_locale")?.value;
  const headerLocale = request.headers.get("accept-language")?.slice(0, 2);
  const locale = LOCALES.includes(cookieLocale as never)
    ? cookieLocale
    : LOCALES.includes(headerLocale as never)
      ? headerLocale
      : DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // `/api` is no longer excluded: cross-origin calls from a separated portal
  // have to be answered here, before the route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
