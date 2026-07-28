import { AdminCustomersView } from "@/components/pages/admin-ops-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — who has booked. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminCustomersView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
