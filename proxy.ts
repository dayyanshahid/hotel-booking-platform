import { NextResponse, type NextRequest } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Locale routing (§5.1). Every customer-facing URL is locale-prefixed so
 * hreflang, canonical URLs and shared links stay stable.
 *
 * Next.js 16 renames the middleware convention to `proxy`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
