import { AdminCustomerView } from "@/components/pages/admin-ops-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — one customer, with everything support needs on one screen. */
export default async function Page({ params }: { params: Promise<{ locale: string; email: string }> }) {
  const { locale: raw, email } = await params;
  return <AdminCustomerView locale={(isLocale(raw) ? raw : "en") as Locale} email={decodeURIComponent(email)} />;
}
