import { AdminCasesView } from "@/components/pages/admin-b2c-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — the support queue, ordered by time to SLA. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminCasesView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
