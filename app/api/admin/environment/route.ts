import { fail, localeFrom, ok } from "@/lib/server/api";
import { adminEmails, currentAdmin } from "@/lib/admin/session";
import { dataDir, isServerless, siteUrl } from "@/lib/server/runtime";
import { driverKind, isDurable } from "@/lib/server/persistence";

/**
 * What an operator needs to know before trusting a number on this console.
 *
 * Storage answers a question every other number on this console depends on:
 * whether it is showing what happened or only what this instance saw. The
 * filesystem driver is durable on a machine with a disk and a scratch directory
 * on a lambda; the KV driver is shared between instances either way. That is
 * reported as the driver's own answer rather than inferred here, so the console
 * cannot drift away from what the store is actually doing.
 *
 * Configuration is reported as present or absent, never by value. Whether a
 * secret is set is operationally useful; what it is, is not — and a console
 * that echoes secrets is a console that leaks them into a screenshot.
 */
function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  return ok({
    deployment: {
      origin: siteUrl(),
      serverless: isServerless,
      region: process.env.VERCEL_REGION ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    storage: {
      driver: driverKind(),
      dataDir: driverKind() === "filesystem" ? dataDir() : null,
      // The single most important caveat on this console, stated as data so the
      // UI cannot forget to show it.
      durable: isDurable(),
      // True of every driver here: a document is read, changed and written
      // whole, so simultaneous writes to the same document keep the later one.
      concurrentWrites: "last-write-wins",
    },
    secrets: [
      { name: "AGENCY_SESSION_SECRET", set: configured("AGENCY_SESSION_SECRET"), required: true },
      { name: "ADMIN_SESSION_SECRET", set: configured("ADMIN_SESSION_SECRET") || configured("AGENCY_SESSION_SECRET"), required: true },
      { name: "PLATFORM_ADMIN_EMAILS", set: adminEmails().length > 0, required: true },
      { name: "HOTELBEDS_API_KEY", set: configured("HOTELBEDS_API_KEY"), required: false },
      { name: "HOTELBEDS_SECRET", set: configured("HOTELBEDS_SECRET"), required: false },
      { name: "TOURMIND_USERNAME", set: configured("TOURMIND_USERNAME"), required: false },
      { name: "TOURMIND_PASSWORD", set: configured("TOURMIND_PASSWORD"), required: false },
      { name: "PLATFORM_MARKUP_PERCENT", set: configured("PLATFORM_MARKUP_PERCENT"), required: false },
      {
        name: "KV_REST_API_URL",
        set: configured("KV_REST_API_URL") || configured("UPSTASH_REDIS_REST_URL"),
        // Required exactly where the filesystem is a lie: a deployment that
        // runs on lambdas and keeps nothing between them.
        required: isServerless,
      },
      {
        name: "KV_REST_API_TOKEN",
        set: configured("KV_REST_API_TOKEN") || configured("UPSTASH_REDIS_REST_TOKEN"),
        required: isServerless,
      },
    ],
    operators: adminEmails().map((email) => ({ email, current: email === session.email })),
  });
}
