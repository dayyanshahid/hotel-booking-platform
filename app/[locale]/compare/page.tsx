import { CompareView } from "@/components/pages/compare-view";
import { isLocale } from "@/lib/i18n";
import { intentFromSearchParams } from "@/lib/nav";
import type { Locale } from "@/lib/types";

/** F-034 — hotel comparison. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  return <CompareView locale={locale} intent={intentFromSearchParams(query, locale)} />;
}
