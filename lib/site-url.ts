/**
 * Where this site is served from.
 *
 * Used for canonical URLs, hreflang and the sitemap. It lived in
 * `lib/server/runtime` beside the data directory and the seed directory, which
 * are the backend's concerns and moved out with it — but a shop still has to
 * know its own address to write a canonical tag, and that has nothing to do
 * with where a supplier cache lives.
 *
 * Vercel exposes the deployment host at build and run time, so the correct
 * absolute URL needs no manual configuration.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;

  const deploymentHost = process.env.VERCEL_URL;
  if (deploymentHost) return `https://${deploymentHost}`;

  return "http://localhost:4860";
}
