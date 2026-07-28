import { AdminReportsView } from "@/components/pages/admin-platform2-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — platform trading reports. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminReportsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
