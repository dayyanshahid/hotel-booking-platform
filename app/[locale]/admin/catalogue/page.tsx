import { AdminCatalogueView } from "@/components/pages/admin-platform2-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — catalogue coverage and supplier syncs. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminCatalogueView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
