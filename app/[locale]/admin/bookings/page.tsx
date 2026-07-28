import { AdminBookingsView } from "@/components/pages/admin-b2c-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — every booking on the platform. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const status = Array.isArray(query.status) ? query.status[0] : query.status;
  return <AdminBookingsView locale={(isLocale(raw) ? raw : "en") as Locale} initialStatus={status} />;
}
