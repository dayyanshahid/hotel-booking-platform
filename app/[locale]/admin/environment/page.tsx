import { AdminEnvironmentView } from "@/components/pages/admin-platform2-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — deployment, configuration and operators. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminEnvironmentView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
