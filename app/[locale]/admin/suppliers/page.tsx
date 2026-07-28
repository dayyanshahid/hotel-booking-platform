import { AdminSuppliersView } from "@/components/pages/admin-platform-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — supplier configuration and local budget. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminSuppliersView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
