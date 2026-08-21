import type { Locale } from "./types";

/**
 * Where the agency portal lives, now that it is not here.
 *
 * It used to be a path on this site, so the footer linked to
 * `/{locale}/agency/signin` and Next resolved it. The portal is its own
 * deployment now and that path answers 404 — in the footer of every page on
 * the shop, which is the kind of link nobody clicks until an agency does.
 *
 * Configured rather than hard-coded so a preview build can point at a preview
 * portal, with the production address as the default because that is the right
 * answer for every build that does not say otherwise.
 */
export function agentPortalUrl(locale: Locale): string {
  const origin = (process.env.NEXT_PUBLIC_AGENT_PORTAL_URL ?? "https://travel-agent.tracking.me").replace(
    /\/+$/,
    "",
  );
  return `${origin}/${locale}/agency/signin`;
}
