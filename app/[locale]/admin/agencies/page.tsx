import { AdminAgenciesView } from "@/components/pages/admin-b2b-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — every agency, its terms and its credit position. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminAgenciesView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
