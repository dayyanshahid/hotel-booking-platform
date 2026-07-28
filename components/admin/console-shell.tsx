"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Spinner, cx } from "@/components/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { href } from "@/lib/nav";
import type { AdminSession } from "@/lib/admin/session";
import type { Locale } from "@/lib/types";

/**
 * The console frame.
 *
 * Plainer than either customer-facing surface, and marked as such: an operator
 * working here can cancel a stranger's booking and change what every agency
 * pays, so the chrome should never be mistaken for the shop. The navigation is
 * grouped by vertical because the two businesses are answered by different
 * people — whoever handles a stuck booking is not usually the person setting
 * credit terms.
 */

let cached: AdminSession | null | undefined;

export function refreshAdmin(): void {
  cached = undefined;
}

export function ConsoleShell({
  locale,
  children,
}: {
  locale: Locale;
  children: (session: AdminSession) => React.ReactNode;
}) {
  const { t } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/admin/me", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { session: AdminSession } };
      const next = body.ok && body.data ? body.data.session : null;
      cached = next;
      if (!alive) return;
      setSession(next);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <Wordmark />
        <h1 className="text-xl font-bold">{t("admin.console")}</h1>
        <p className="text-muted text-sm">{t("admin.signInRequired")}</p>
        <Link href={href(locale, "/admin/signin")}>
          <Button>{t("admin.signIn")}</Button>
        </Link>
      </div>
    );
  }

  const groups: { label: string; links: { path: string; label: string }[] }[] = [
    {
      label: t("admin.platform"),
      links: [
        { path: "/admin", label: t("admin.overview") },
        { path: "/admin/settings", label: t("admin.settings") },
        { path: "/admin/suppliers", label: t("admin.suppliers") },
        { path: "/admin/audit", label: t("admin.audit") },
      ],
    },
    {
      label: t("admin.b2c"),
      links: [
        { path: "/admin/bookings", label: t("admin.bookings") },
        { path: "/admin/cases", label: t("admin.cases") },
      ],
    },
    {
      label: t("admin.b2b"),
      links: [{ path: "/admin/agencies", label: t("admin.agencies") }],
    },
  ];

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
    refreshAdmin();
    router.push(href(locale, "/admin/signin"));
  }

  return (
    <div className="space-y-5">
      <header className="hairline flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link href={href(locale, "/admin")} className="shrink-0">
            <Wordmark />
          </Link>
          <Badge tone="critical">{t("admin.console")}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted text-sm wrap-anywhere">{session.email}</p>
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t("agency.signOut")}
          </Button>
        </div>
      </header>

      <nav aria-label={t("admin.console")} className="hairline flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-2">
        {groups.map((group) => (
          <div key={group.label} className="flex items-center gap-1">
            <span className="text-muted text-[11px] font-semibold uppercase tracking-wide">{group.label}</span>
            {group.links.map((link) => {
              const target = href(locale, link.path);
              const active = link.path === "/admin" ? pathname === target : pathname.startsWith(target);
              return (
                <Link
                  key={link.path}
                  href={target}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm font-medium",
                    active ? "bg-brand-50 text-brand-700" : "text-muted hover:text-ink-900",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {children(session)}
    </div>
  );
}
