import { crossSiteSessions } from "@/lib/server/cors";

/**
 * How a session cookie should be written, here, on this deployment.
 *
 * `SameSite=None` is the only value a browser will send on a cross-site
 * request, and a browser will only accept it alongside `Secure` — which it
 * will only accept over HTTPS. Those three facts are a chain, and the code
 * broke it in the middle: `crossSiteSessions()` is driven by `PORTAL_ORIGINS`,
 * that variable is set in `.env.local` like every other one, and a developer
 * running the platform on plain `http://localhost` was therefore issued a
 * `Secure; SameSite=None` cookie that their browser silently dropped. Sign-in
 * answered 200 and the next request arrived anonymous.
 *
 * It stayed hidden because the QA harnesses use curl, and curl does not
 * implement cookie policy — every one of them passed against a browser flow
 * that could not work.
 *
 * So the two questions are asked separately: whether the deployment *wants*
 * cross-site cookies, and whether this origin can actually carry one. Where it
 * cannot, `lax` is not a downgrade — it is the only value that functions, and
 * on a development machine nothing is cross-site anyway.
 */
export function sessionCookiePolicy(): { sameSite: "none" | "lax"; secure: boolean } {
  /*
   * HTTPS is the thing being tested, and `NODE_ENV` is the honest proxy for it
   * here: every deployed environment terminates TLS and a local `next dev`
   * does not. Reading `x-forwarded-proto` would be more direct and is not
   * available to `cookies()` without threading a request through every caller.
   */
  const overHttps = process.env.NODE_ENV === "production";
  const crossSite = crossSiteSessions() && overHttps;
  return { sameSite: crossSite ? "none" : "lax", secure: crossSite || overHttps };
}
