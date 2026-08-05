import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/**
 * The search lives at `/agency` now.
 *
 * It was two routes for one screen — this one and the home page, which led with
 * the same bar. Kept as a redirect rather than deleted because quotes, saved
 * links and an agent's own bookmarks point here, and the query string is the
 * search itself: dropping it would land them on an empty form holding nothing.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "en";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }

  const suffix = query.toString();
  redirect(`/${locale}/agency${suffix ? `?${suffix}` : ""}`);
}
