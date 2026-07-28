import { AdminOperationsView } from "@/components/pages/admin-ops-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — the work queue: unresolved bookings and unsettled refunds. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminOperationsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
