"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Input, Spinner, cx } from "@/components/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { href } from "@/lib/nav";
import type { AdminSession } from "@/lib/admin/types";
import type { Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

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
  /**
   * The check could not be made — which is neither signed in nor signed out.
   *
   * There was no catch here at all, so a request that never completed rejected
   * inside the effect, `setLoading(false)` never ran, and the whole console
   * sat on its spinner for ever. And once caught, the obvious `null` would
   * have been the portal's bug: an operator whose network blinked being told
   * to sign in again, which is the one remedy that cannot help.
   */
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const body = await apiFetch<{ session: AdminSession }>("/api/admin/me");
      if (!alive) return;
      if (!body.ok && body.error?.correlationId === "cid_offline") {
        setUnreachable(true);
        setLoading(false);
        return;
      }
      const next = body.ok && body.data ? body.data.session : null;
      cached = next;
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

  if (unreachable) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <Wordmark />
        <h1 className="text-xl font-bold">{t("admin.sessionUnverified")}</h1>
        <p className="text-muted text-sm">{t("admin.sessionUnverifiedBody")}</p>
        <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
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
        { path: "/admin/operations", label: t("admin.operations") },
        { path: "/admin/reports", label: t("admin.platformReports") },
        { path: "/admin/audit", label: t("admin.audit") },
      ],
    },
    {
      label: t("admin.b2c"),
      links: [
        { path: "/admin/bookings", label: t("admin.bookings") },
        { path: "/admin/customers", label: t("admin.customers") },
        { path: "/admin/cases", label: t("admin.cases") },
      ],
    },
    {
      label: t("admin.b2b"),
      links: [{ path: "/admin/agencies", label: t("admin.agencies") }],
    },
    {
      label: t("admin.supply"),
      links: [
        { path: "/admin/catalogue", label: t("admin.catalogue") },
        { path: "/admin/suppliers", label: t("admin.suppliers") },
      ],
    },
    {
      label: t("admin.config"),
      links: [
        { path: "/admin/settings", label: t("admin.settings") },
        { path: "/admin/environment", label: t("admin.environment") },
      ],
    },
  ];

  /**
   * The name of the page, taken from whichever nav entry is current.
   *
   * The same rule the sidebar highlights with, so the heading and the
   * highlight can never disagree. A detail page — one booking, one agency —
   * falls to its section's name, which is still the right answer for an
   * outline: "Bookings" is where the reader is.
   */
  const pageTitle =
    groups
      .flatMap((section) => section.links)
      .filter((link) => {
        const target = href(locale, link.path);
        return link.path === "/admin" ? pathname === target : pathname.startsWith(target);
      })
      // Longest match wins, so /admin never beats /admin/bookings.
      .sort((a, b) => b.path.length - a.path.length)[0]?.label ?? t("admin.console");

  async function signOut() {
    await fetch(apiUrl("/api/admin/session"), { method: "DELETE", credentials: apiCredentials() });
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
          <GlobalSearch locale={locale} />
          <p className="text-muted hidden text-sm wrap-anywhere lg:block">{session.email}</p>
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

      {/*
        The console's one top-level heading.

        Every signed-in page here titled itself with `SectionHeading`, which is
        an h2 — so the whole console rendered documents whose outline began at
        the second level with nothing above it. A screen reader announcing
        "heading level 2, Operations" with no level 1 gives no anchor for where
        that section sits, and the pages genuinely do have several equal
        sections, so promoting one of the h2s would have been picking a
        favourite among siblings.

        Taken by the shell instead, from the navigation, which is by definition
        the name of the page. Visually hidden because the page already shows
        its title; this is the outline, not decoration. The agency portal has
        always done the equivalent through its own `PageHeader`.
      */}
      <h1 className="sr-only">{pageTitle}</h1>

      {children(session)}
    </div>
  );
}

interface Hit {
  type: string;
  label: string;
  detail: string;
  href: string;
}

/**
 * One box that finds anything.
 *
 * An operator is handed a reference, an email or a name and has no idea which
 * of eight screens owns it. Making them pick the right one first is making them
 * guess, so this searches everything the console can open and lets the result
 * say what it was.
 */
function GlobalSearch({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const id = window.setTimeout(async () => {
      const res = await fetch(apiUrl(`/api/admin/search?q=${encodeURIComponent(query)}`), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: { hits: Hit[] } };
      if (alive && body.ok && body.data) setHits(body.data.hits);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query]);

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={t("admin.jumpTo")}
        aria-label={t("admin.jumpTo")}
        onChange={(e) => setQuery(e.target.value)}
        className="w-44 sm:w-64"
      />
      {hits.length > 0 && (
        <ul className="surface hairline rise absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-[var(--radius-card)] border">
          {hits.map((hit, i) => (
            <li key={`${hit.href}-${i}`}>
              <Link
                href={href(locale, hit.href)}
                onClick={() => {
                  setQuery("");
                  setHits([]);
                }}
                className="hover:bg-brand-50 block px-3 py-2 text-sm"
              >
                <span className="text-muted me-2 text-[11px] uppercase">{hit.type}</span>
                <span className="font-medium wrap-anywhere">{hit.label}</span>
                <span className="text-muted block text-xs wrap-anywhere">{hit.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
