import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { AppProvider } from "@/components/providers/app-provider";
import { SiteHeader } from "@/components/shell/site-header";
import { ConsumerChrome } from "@/components/shell/consumer-chrome";
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
 * Font stacks per script, each led by a self-hosted variable face declared in
 * `globals.css`. The system stack behind it is what renders during `swap` and
 * if the file fails, so it stays script-appropriate rather than generic.
 */
const FONT_STACK: Record<Locale, string> = {
  en: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ar: '"Noto Sans Arabic Variable", "SF Arabic", "Geeza Pro", "Noto Kufi Arabic", "Noto Naskh Arabic", "Segoe UI", Tahoma, system-ui, sans-serif',
};

/** The face needed for first paint, fetched in parallel with the stylesheet. */
const PRELOAD_FONT: Record<Locale, string> = {
  en: "/fonts/inter-latin.woff2",
  ar: "/fonts/noto-sans-arabic.woff2",
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
      <head>
        <link
          rel="preload"
          href={PRELOAD_FONT[typed]}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh antialiased" style={{ fontFamily: FONT_STACK[typed] }}>
        <AppProvider locale={typed}>
          <a href="#main" className="skip-link">
            {t("nav.skipToContent")}
          </a>
          <ConsumerChrome>
            <SiteHeader />
          </ConsumerChrome>
          <main id="main" className="mx-auto min-h-[60vh] w-full max-w-7xl px-4 pb-10 pt-6 sm:pt-8">
            {children}
          </main>
          <ConsumerChrome>
            <SiteFooter />
            <BottomNav />
          </ConsumerChrome>
          {/*
            Both of these speak to a traveller: a cookie consent for the
            booking flow, and a trip assistant. Neither belongs over an
            operator console or a counter agent's screen.
          */}
          <ConsumerChrome>
            <ConsentBanner />
            <AssistantDrawer />
          </ConsumerChrome>
          <ScenarioBar />
          <GlobalOverlays />
        </AppProvider>
      </body>
    </html>
  );
}
