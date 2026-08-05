import { AgencySearchView } from "@/components/pages/agency-search-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * Agency portal — the screen an agent lands on, which is the search.
 *
 * Home and Search stays had converged into the same page: the same bar at the
 * top, and only the panels underneath differing. Two routes for one screen is a
 * choice an agent has to make for no reason, so this is the search now, and
 * what used to be the home page is what it shows before a search has run.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencySearchView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
