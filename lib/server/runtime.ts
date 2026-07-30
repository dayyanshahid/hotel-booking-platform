import path from "node:path";

/**
 * Runtime environment facts.
 *
 * On a serverless platform the deployment bundle is read-only and only the
 * system temp directory is writable, so anything the app persists has to move
 * there. That directory lives for as long as the instance stays warm and is
 * lost on a cold start — which is fine for a demo deployment and is not a
 * substitute for the database a production BFF would own (§16.1).
 */
export const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Writable location for run-time data. */
export function dataDir(): string {
  if (process.env.NAZIL_DATA_DIR) return process.env.NAZIL_DATA_DIR;
  return isServerless ? path.join("/tmp", "nazil", "data") : path.join(process.cwd(), ".data");
}

/**
 * Read-only catalogue data that ships with the build.
 *
 * `dataDir` is `/tmp` on a serverless platform and a cold instance starts with
 * nothing in it, which is fine for anything the app can fetch again and fatal
 * for anything it cannot. TourMind is the second kind: their availability call
 * takes hotel ids, and the only way to know which of their nine thousand
 * properties are in a city is the static catalogue. No catalogue meant no
 * TourMind supply at all on a deployment — searched, ranked and merged
 * correctly, over an empty list.
 *
 * So a compressed copy is committed and read when the writable cache has
 * nothing. It is a seed, not a cache: whatever a sync writes to `dataDir` wins,
 * because that is the fresher of the two.
 */
export function seedDir(): string {
  return process.env.NAZIL_SEED_DIR ?? path.join(process.cwd(), "data-seed");
}

/**
 * Public origin, used for canonical URLs, hreflang and the sitemap (§12.4).
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
