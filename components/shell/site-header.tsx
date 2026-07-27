"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Drawer, Select, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { href } from "@/lib/nav";
import { setPreferenceCookie } from "@/lib/cookies";
import { CURRENCIES } from "@/lib/format";
import { MAJOR_CURRENCIES } from "@/lib/currencies";
import { LOCALE_META, LOCALES } from "@/lib/i18n";
import type { CurrencyCode, Locale } from "@/lib/types";

/** F-001 — global shell header with language, currency, support and account. */
export function SiteHeader() {
  const { locale, t, currency, setCurrency, account, signOut, notifications, compare, saved, theme, toggleTheme, setAssistantOpen } =
    useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const unread = notifications.filter((n) => !n.read).length;

  const links = [
    { href: "/", label: t("nav.explore") },
    { href: "/deals", label: t("nav.deals") },
    { href: "/saved", label: t("nav.saved"), count: saved.length },
    { href: "/trips", label: t("nav.trips") },
    { href: "/support", label: t("nav.support") },
  ];

  function switchLocale(next: Locale) {
    const rest = pathname.replace(/^\/(en|ar)/, "");
    setPreferenceCookie("nz_locale", next);
    router.push(`/${next}${rest}${window.location.search}`);
  }

  return (
    /*
      A navy chrome band rather than a translucent white one. Two reasons it
      earns the weight: the search results below it are a wall of white cards
      and photographs that need a hard top edge to sit under, and the currency,
      language and account controls are the only things a traveller needs to
      find without reading — a coloured band makes them one target.
    */
    <header className="chrome sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href={href(locale, "/")} className="flex items-center gap-2 font-bold">
          {/* Wordmark: the Arabic initial of the brand, drawn as a monogram. */}
          <span aria-hidden className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-white/15">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 8v5a5 5 0 0 0 10 0V8" />
              <circle cx="10" cy="4.5" r="1.2" fill="currentColor" stroke="none" />
              <path d="M18 8v11" opacity="0.55" />
            </svg>
          </span>
          <span className="text-[20px] font-bold tracking-[-0.02em]">{t("brand.name")}</span>
        </Link>

        <nav aria-label="Primary" className="ms-4 hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const target = href(locale, link.href);
            const active = pathname === target;
            return (
              <Link
                key={link.href}
                href={target}
                className={cx(
                  "inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] px-3.5 text-sm font-medium",
                  "transition-colors duration-150 ease-[var(--ease-out)]",
                  active ? "bg-white/20" : "hover:bg-white/10",
                )}
              >
                {link.label}
                {link.count ? <Badge tone="brand">{link.count}</Badge> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          {compare.length > 1 && (
            <Link href={href(locale, "/compare")} className="hidden sm:block">
              <Button variant="chrome" size="sm">
                {t("nav.compare")} ({compare.length})
              </Button>
            </Link>
          )}

          <Button
            variant="chrome"
            size="sm"
            onClick={() => setAssistantOpen(true)}
            aria-label={t("nav.assistant")}
            className="hidden sm:inline-flex"
          >
            <Icon name="sparkle" />
          </Button>

          <Link href={href(locale, "/notifications")} className="relative hidden sm:block">
            <Button variant="chrome" size="sm" aria-label={t("nav.notifications")}>
              <Icon name="bell" />
            </Button>
            {unread > 0 && (
              <span className="bg-critical-500 absolute -top-0.5 end-0 grid size-4 place-items-center rounded-full text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>

          <label className="sr-only" htmlFor="header-currency">
            Currency
          </label>
          <Select
            id="header-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="hidden !min-h-9 !w-auto !border-white/30 !bg-transparent !py-1 !text-white sm:block [&>option]:text-[var(--text)]"
          >
            {/* The majors, not all 68 — a currency switcher is a shortcut, not a
                reference table. */}
            {MAJOR_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>

          <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="Language">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => switchLocale(code)}
                aria-current={code === locale ? "true" : undefined}
                className={cx(
                  "min-h-9 rounded-[var(--radius-control)] px-2 text-sm font-medium",
                  code === locale ? "bg-white/20" : "hover:bg-white/10",
                )}
              >
                {LOCALE_META[code].label}
              </button>
            ))}
          </div>

          <Button variant="chrome" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
            <Icon name={theme === "light" ? "moon" : "sun"} />
          </Button>

          {account ? (
            <Link href={href(locale, "/account")} className="hidden lg:block">
              <Button variant="chrome" size="sm">
                {account.email.split("@")[0]}
              </Button>
            </Link>
          ) : (
            <Link href={href(locale, "/signin")} className="hidden lg:block">
              <Button variant="chrome" size="sm">
                {t("nav.signIn")}
              </Button>
            </Link>
          )}

          <Button
            variant="chrome"
            size="sm"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label={t("a11y.openMenu")}
          >
            <Icon name="menu" />
          </Button>
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("nav.menu")}>
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={href(locale, link.href)}
              onClick={() => setMenuOpen(false)}
              className="hover:surface-sunken flex min-h-12 items-center justify-between rounded-lg px-3 text-sm font-medium"
            >
              {link.label}
              {link.count ? <Badge tone="brand">{link.count}</Badge> : null}
            </Link>
          ))}
          <Link
            href={href(locale, account ? "/account" : "/signin")}
            onClick={() => setMenuOpen(false)}
            className="hover:surface-sunken flex min-h-12 items-center rounded-lg px-3 text-sm font-medium"
          >
            {account ? t("nav.account") : t("nav.signIn")}
          </Link>
        </nav>

        <div className="mt-6 grid gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">Language</p>
            <div className="flex gap-2">
              {LOCALES.map((code) => (
                <Button
                  key={code}
                  variant={code === locale ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => switchLocale(code)}
                >
                  {LOCALE_META[code].label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="drawer-currency" className="mb-1 block text-sm font-medium">
              Currency
            </label>
            <Select
              id="drawer-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {MAJOR_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} — {CURRENCIES[code].label}
                </option>
              ))}
            </Select>
          </div>
          {account && (
            <Button variant="secondary" onClick={() => { signOut(); setMenuOpen(false); }}>
              {t("nav.signOut")}
            </Button>
          )}
        </div>
      </Drawer>
    </header>
  );
}
