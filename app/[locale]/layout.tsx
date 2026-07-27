import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { AppProvider } from "@/components/providers/app-provider";
import { SiteHeader } from "@/components/shell/site-header";
import {
  AssistantDrawer,
  BottomNav,
  ConsentBanner,
  GlobalOverlays,
  ScenarioBar,
  SiteFooter,
} from "@/components/shell/site-chrome";
import { LOCALES, LOCALE_META, createTranslator, isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * System font stacks per script. Arabic gets a stack that renders Kufi/Naskh
 * faces correctly on the target platforms without a network font dependency.
 */
const FONT_STACK: Record<Locale, string> = {
  en: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ar: '"SF Arabic", "Geeza Pro", "Noto Kufi Arabic", "Noto Naskh Arabic", "Segoe UI", Tahoma, system-ui, sans-serif',
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(isLocale(locale) ? locale : "en");
  return {
    title: {
      default: `${t("brand.name")} — ${t("brand.tagline")}`,
      template: `%s · ${t("brand.name")}`,
    },
    description: t("home.heroSubtitle"),
    // hreflang for every locale, with a stable canonical (§12.4).
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [LOCALE_META[l].htmlLang, `/${l}`])),
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;
  const meta = LOCALE_META[typed];
  const t = createTranslator(typed);

  return (
    <html lang={meta.htmlLang} dir={meta.dir} data-theme="light" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" style={{ fontFamily: FONT_STACK[typed] }}>
        <AppProvider locale={typed}>
          <a href="#main" className="skip-link">
            {t("nav.skipToContent")}
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto min-h-[60vh] w-full max-w-7xl px-4 pb-8 pt-4">
            {children}
          </main>
          <SiteFooter />
          <BottomNav />
          <ConsentBanner />
          <AssistantDrawer />
          <ScenarioBar />
          <GlobalOverlays />
        </AppProvider>
      </body>
    </html>
  );
}
