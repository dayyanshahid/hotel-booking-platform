"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Drawer, Spinner, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/wordmark";
import { Meter, Money } from "./ui";
import { href } from "@/lib/nav";
import { refreshAgency, useAgency, type AgencyContext } from "./use-agency";
import type { Locale } from "@/lib/types";

/**
 * The portal frame.
 *
 * Rebuilt around how the thing is actually used. An agent lives in this all day
 * with a customer waiting, so navigation is a fixed sidebar rather than a row
 * of links that wrapped onto three lines once there were eight of them — a nav
 * that reflows as the window resizes is a nav you have to re-read.
 *
 * The credit line sits in that sidebar as a meter, not a number in a corner.
 * "How much is left" is the question behind every quote, and a bar answers
 * "am I about to run out" in a way a figure does not.
 */

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

export function PortalShell({
  locale,
  children,
  requireAdmin = false,
}: {
  locale: Locale;
  children: (context: AgencyContext) => React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { t } = useApp();
  const { context, loading } = useAgency();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change should not leave the drawer sitting open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (!context) return <SignInPrompt locale={locale} />;

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t("agency.navSell"),
      items: [
        { path: "/agency", label: t("agency.dashboard"), icon: "grid" },
        { path: "/agency/search", label: t("agency.searchStays"), icon: "search" },
        { path: "/agency/quotes", label: t("agency.quotes"), icon: "receipt" },
      ],
    },
    {
      label: t("agency.navManage"),
      items: [
        { path: "/agency/bookings", label: t("agency.bookings"), icon: "plane" },
        { path: "/agency/credit", label: t("agency.credit"), icon: "tag" },
        { path: "/agency/reports", label: t("agency.reports"), icon: "list" },
      ],
    },
    {
      label: t("agency.navAccount"),
      items: [
        { path: "/agency/team", label: t("agency.team"), icon: "users" },
        { path: "/agency/settings", label: t("agency.settings"), icon: "settings" },
      ],
    },
  ];

  async function signOut() {
    await fetch("/api/agency/session", { method: "DELETE", credentials: "same-origin" });
    refreshAgency();
    router.push(href(locale, "/agency/signin"));
  }

  const nav = (
    <nav aria-label={t("agency.portal")} className="space-y-5">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="text-muted px-3 text-[11px] font-semibold uppercase tracking-wider">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const target = href(locale, item.path);
              const active = item.path === "/agency" ? pathname === target : pathname.startsWith(target);
              return (
                <li key={item.path}>
                  <Link
                    href={target}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-ink-50 hover:text-ink-900",
                    )}
                  >
                    <Icon name={item.icon} size={16} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop rail. Sticky, so navigation never scrolls away mid-task. */}
      <aside className="hairline no-print hidden w-60 shrink-0 border-e pe-4 lg:block">
        <div className="sticky top-4 space-y-4 py-1">
          <Link href={href(locale, "/agency")} className="block">
            <Wordmark />
          </Link>
          <Badge tone="brand">{t("agency.portal")}</Badge>
          <CreditRail locale={locale} context={context} />
          {nav}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-5">
        <header className="hairline flex items-center justify-between gap-3 border-b pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label={t("agency.portal")}
            >
              <Icon name="menu" size={18} />
            </Button>
            <Link href={href(locale, "/agency")} className="lg:hidden">
              <Wordmark markOnly />
            </Link>
            {/*
              Hidden on a phone, where the credit figure has the better claim
              on the space — the agency's own name is the one thing an agent
              never needs reminding of, and it is in the drawer regardless.
            */}
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold">{context.agency.name}</p>
              <p className="text-muted truncate text-xs">{context.session.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* The figure follows the agent everywhere, not only on the rail. */}
            {context.balance && (
              <Link
                href={href(locale, "/agency/credit")}
                className="hairline hover:border-brand-300 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors"
              >
                {/* The label is the first thing to go when space is short; the
                    figure is what an agent is actually looking for. */}
                <span className="text-muted hidden sm:inline">{t("agency.creditAvailable")}</span>
                <Money
                  amount={context.balance.available}
                  currency={context.balance.currency}
                  locale={locale}
                  size="sm"
                  className="font-semibold"
                />
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("agency.signOut")}
            </Button>
          </div>
        </header>

        {requireAdmin && context.session.role !== "admin" ? (
          <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-3 py-2 text-sm">
            {t("agency.adminOnly")}
          </p>
        ) : (
          children(context)
        )}
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("agency.portal")}>
        <div className="space-y-5">
          <CreditRail locale={locale} context={context} />
          {nav}
        </div>
      </Drawer>
    </div>
  );
}

/**
 * The credit line, as the sidebar shows it.
 *
 * Available first and largest, because that is what a quote is checked against.
 * The limit sits below in smaller type — useful context, not the operative
 * figure — and the bar changes colour before the money runs out.
 */
function CreditRail({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const balance = context.balance;
  if (!balance) return null;

  const ratio = balance.limit > 0 ? balance.available / balance.limit : 0;
  const limit = new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
    style: "currency",
    currency: balance.currency,
    maximumFractionDigits: 0,
  }).format(balance.limit);

  return (
    <Link
      href={href(locale, "/agency/credit")}
      className="hairline hover:border-brand-300 block rounded-[var(--radius-card)] border p-3 transition-colors"
    >
      <p className="text-muted text-[11px] font-semibold uppercase tracking-wider">{t("agency.creditAvailable")}</p>
      <p className="mt-0.5">
        <Money amount={balance.available} currency={balance.currency} locale={locale} size="lg" />
      </p>
      <div className="mt-2">
        <Meter value={balance.available} max={balance.limit} label={t("agency.creditAvailable")} />
      </div>
      <p className="text-muted mt-1.5 text-xs">{t("agency.ofLimit", { limit })}</p>
      {ratio < 0.15 && <p className="text-critical-700 mt-1.5 text-xs font-medium">{t("agency.creditLow")}</p>}
    </Link>
  );
}

function SignInPrompt({ locale }: { locale: Locale }) {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <Wordmark className="justify-center" />
      <h1 className="text-xl font-bold">{t("agency.signIn")}</h1>
      <p className="text-muted text-sm">{t("agency.signInRequired")}</p>
      <Link href={href(locale, "/agency/signin")}>
        <Button>{t("agency.signIn")}</Button>
      </Link>
    </div>
  );
}
