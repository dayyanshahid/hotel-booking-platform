import { fail, localeFrom, ok } from "@/lib/server/api";
import { adminEmails, currentAdmin } from "@/lib/admin/session";
import { dataDir, isServerless, siteUrl } from "@/lib/server/runtime";

/**
 * What an operator needs to know before trusting a number on this console.
 *
 * The demo store is process-local. On a serverless deployment that means a
 * booking made a minute ago may be invisible to the next request, and every
 * figure on the overview is "what this instance has seen" rather than "what
 * happened". An operator reading a revenue total deserves to know that without
 * having to read the source.
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
      dataDir: dataDir(),
      // The single most important caveat on this console, stated as data so the
      // UI cannot forget to show it.
      durable: !isServerless,
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
    ],
    operators: adminEmails().map((email) => ({ email, current: email === session.email })),
  });
}
