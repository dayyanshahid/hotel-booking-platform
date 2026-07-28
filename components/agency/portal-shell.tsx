"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Spinner, cx } from "@/components/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { href } from "@/lib/nav";
import { formatMoney } from "@/lib/format";
import { refreshAgency, useAgency, type AgencyContext } from "./use-agency";
import type { CurrencyCode, Locale } from "@/lib/types";

/**
 * The portal frame.
 *
 * Deliberately plainer than the consumer site: no photography, no promotional
 * bands, one row of navigation and the credit position always in view. An agent
 * uses this forty times a day with a customer waiting, and the thing they need
 * to know before every quote is how much headroom is left.
 */
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (!context) {
    return <SignInPrompt locale={locale} />;
  }

  const links = [
    { path: "/agency", label: t("agency.dashboard") },
    { path: "/agency/bookings", label: t("agency.bookings") },
    { path: "/agency/credit", label: t("agency.credit") },
    { path: "/agency/team", label: t("agency.team") },
    { path: "/agency/settings", label: t("agency.settings") },
  ];

  async function signOut() {
    await fetch("/api/agency/session", { method: "DELETE", credentials: "same-origin" });
    refreshAgency();
    router.push(href(locale, "/agency/signin"));
  }

  const balance = context.balance;

  return (
    <div className="space-y-5">
      <header className="hairline flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link href={href(locale, "/agency")} className="shrink-0">
            <Wordmark />
          </Link>
          <Badge tone="brand">{t("agency.portal")}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance && (
            <p className="text-sm">
              <span className="text-muted">{t("agency.creditAvailable")}: </span>
              <span className="font-bold">
                {formatMoney(balance.available, balance.currency as CurrencyCode, locale)}
              </span>
            </p>
          )}
          <Link href={href(locale, "/")}>
            <Button variant="secondary" size="sm">
              {t("agency.searchStays")}
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t("agency.signOut")}
          </Button>
        </div>
      </header>

      <p className="text-muted text-sm">
        {t("agency.welcome", { name: context.session.name, agency: context.agency.name })}
      </p>

      <nav aria-label={t("agency.portal")} className="hairline flex flex-wrap gap-1 border-b pb-2">
        {links.map((link) => {
          const target = href(locale, link.path);
          const active = link.path === "/agency" ? pathname === target : pathname.startsWith(target);
          return (
            <Link
              key={link.path}
              href={target}
              aria-current={active ? "page" : undefined}
              className={cx(
                "rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium",
                active ? "bg-brand-50 text-brand-700" : "text-muted hover:text-ink-900",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {requireAdmin && context.session.role !== "admin" ? (
        <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-3 py-2 text-sm">
          {t("agency.adminOnly")}
        </p>
      ) : (
        children(context)
      )}
    </div>
  );
}

function SignInPrompt({ locale }: { locale: Locale }) {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      <Wordmark />
      <h1 className="text-xl font-bold">{t("agency.signIn")}</h1>
      <p className="text-muted text-sm">{t("agency.signInRequired")}</p>
      <Link href={href(locale, "/agency/signin")}>
        <Button>{t("agency.signIn")}</Button>
      </Link>
    </div>
  );
}
