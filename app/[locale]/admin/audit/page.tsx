import { AdminAuditView } from "@/components/pages/admin-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — operator action log. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminAuditView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
