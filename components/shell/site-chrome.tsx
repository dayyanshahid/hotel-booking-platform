"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useApi } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Card, Drawer, Input, ToastStack, LiveRegion, cx } from "@/components/ui";
import { href } from "@/lib/nav";
import { SCENARIOS } from "@/lib/server/scenarios";
import type { ScenarioId } from "@/lib/server/scenarios";
import { localized } from "@/lib/data/catalog";
import { setPreferenceCookie } from "@/lib/cookies";

/* ------------------------------------------------------- bottom nav */

/** Mobile bottom navigation (§3.3): Explore, Saved, Trips, Support, Account. */
export function BottomNav() {
  const { locale, t, account } = useApp();
  const pathname = usePathname();
  const items = [
    { href: "/", label: t("nav.explore"), icon: "⌂" },
    { href: "/saved", label: t("nav.saved"), icon: "♥" },
    { href: "/trips", label: t("nav.trips"), icon: "✈" },
    { href: "/support", label: t("nav.support"), icon: "☎" },
    { href: account ? "/account" : "/signin", label: t("nav.account"), icon: "☺" },
  ];
  return (
    <nav
      aria-label="Mobile primary"
      className="surface no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t lg:hidden"
    >
      {items.map((item) => {
        const target = href(locale, item.href);
        const active = pathname === target;
        return (
          <Link
            key={item.href}
            href={target}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
              active ? "text-brand-700 font-semibold" : "text-muted",
            )}
          >
            <span aria-hidden className="text-base">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------ footer */

export function SiteFooter() {
  const { locale, t } = useApp();
  const columns = [
    {
      title: t("footer.company"),
      links: [
        { href: "/legal/about", label: t("footer.about") },
        { href: "/legal/price-promise", label: t("footer.priceProm") },
        { href: "/legal/guarantee", label: t("footer.guarantee") },
      ],
    },
    {
      title: t("footer.support"),
      links: [
        { href: "/help", label: t("cms.help") },
        { href: "/support", label: t("support.title") },
        { href: "/trips/lookup", label: t("trips.findBooking") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/legal/terms", label: t("footer.terms") },
        { href: "/legal/privacy", label: t("footer.privacy") },
        { href: "/legal/accessibility", label: t("footer.accessibility") },
        { href: "/legal/security", label: t("footer.security") },
      ],
    },
  ];

  return (
    <footer className="surface no-print mt-12 border-t pb-24 lg:pb-8">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-bold">{t("brand.name")}</p>
          <p className="text-muted mt-2 max-w-xs text-sm">{t("brand.tagline")}</p>
          <p className="text-muted mt-4 text-xs">{t("footer.disclaimer")}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-semibold">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={href(locale, link.href)} className="text-muted text-sm hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="text-muted mx-auto max-w-7xl border-t px-4 py-4 text-xs">
        © {new Date().getFullYear()} {t("brand.name")}. {t("footer.rights")}
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------- consent */

export function ConsentBanner() {
  const { t, consent, setConsent } = useApp();
  const [open, setOpen] = useState(false);
  if (consent.decided) return null;
  return (
    <>
      <div className="no-print fixed inset-x-0 bottom-14 z-40 p-3 lg:bottom-0">
        <Card className="mx-auto max-w-3xl p-4">
          <p className="text-sm font-semibold">{t("consent.title")}</p>
          <p className="text-muted mt-1 text-sm">{t("consent.body")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Privacy-preserving default is offered first. */}
            <Button size="sm" variant="secondary" onClick={() => setConsent({ analytics: false, marketing: false })}>
              {t("consent.essentialOnly")}
            </Button>
            <Button size="sm" onClick={() => setConsent({ analytics: true, marketing: true })}>
              {t("consent.acceptAll")}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
              {t("consent.manage")}
            </Button>
          </div>
        </Card>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("consent.manage")}>
        <ConsentChoices onDone={() => setOpen(false)} />
      </Drawer>
    </>
  );
}

function ConsentChoices({ onDone }: { onDone: () => void }) {
  const { t, setConsent } = useApp();
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked disabled className="mt-1 size-5" />
        <span>
          <span className="font-medium">Essential</span>
          <span className="text-muted block text-xs">Required for search, checkout and security.</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={analytics}
          onChange={(e) => setAnalytics(e.target.checked)}
          className="mt-1 size-5"
        />
        <span>
          <span className="font-medium">Analytics</span>
          <span className="text-muted block text-xs">Anonymous funnel measurement. No personal data.</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
          className="mt-1 size-5"
        />
        <span>
          <span className="font-medium">Marketing</span>
          <span className="text-muted block text-xs">Personalised offers and remarketing.</span>
        </span>
      </label>
      <Button
        onClick={() => {
          setConsent({ analytics, marketing });
          onDone();
        }}
      >
        {t("common.save")}
      </Button>
    </div>
  );
}

/* --------------------------------------------------------- assistant */

/** F-082 — grounded assistant, available from every screen. */
export function AssistantDrawer() {
  const { t, assistantOpen, setAssistantOpen, locale } = useApp();
  const api = useApi();
  const pathname = usePathname();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<
    { role: "customer" | "assistant"; text: string; source?: string; handoff?: boolean }[]
  >([]);

  const hotelSlug = pathname.match(/\/hotel\/([^/?]+)/)?.[1];
  const bookingReference = pathname.match(/\/trips\/([^/?]+)/)?.[1];

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    const asked = question.trim();
    setThread((prev) => [...prev, { role: "customer", text: asked }]);
    setQuestion("");
    setBusy(true);
    const res = await api<{ answer: { text: string; source: string } | null; handoff: boolean; message?: string }>(
      "/api/assistant",
      {
        method: "POST",
        body: JSON.stringify({ question: asked, hotelSlug, bookingReference }),
      },
    );
    setBusy(false);
    if (res.ok && res.data.answer) {
      setThread((prev) => [...prev, { role: "assistant", text: res.data.answer!.text, source: res.data.answer!.source }]);
    } else {
      setThread((prev) => [
        ...prev,
        { role: "assistant", text: res.ok ? (res.data.message ?? t("assistant.unknown")) : t("assistant.unknown"), handoff: true },
      ]);
    }
  }

  return (
    <Drawer open={assistantOpen} onClose={() => setAssistantOpen(false)} title={t("assistant.title")}>
      <p className="text-muted text-xs">{t("assistant.intro")}</p>
      <div className="mt-4 space-y-3">
        {thread.map((message, i) => (
          <div
            key={i}
            className={cx(
              "rounded-lg p-3 text-sm",
              message.role === "customer" ? "surface-sunken ms-6" : "bg-brand-50 text-brand-900 me-6",
            )}
          >
            <p className="wrap-anywhere">{message.text}</p>
            {message.source && (
              <p className="mt-1 text-xs opacity-80">
                {t("assistant.grounded")}: {message.source}
              </p>
            )}
            {message.handoff && (
              <Link href={href(locale, "/support")} className="mt-2 inline-block">
                <Button size="sm" variant="secondary">
                  {t("assistant.handoff")}
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="assistant-input">
          {t("assistant.placeholder")}
        </label>
        <Input
          id="assistant-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("assistant.placeholder")}
        />
        <Button type="submit" loading={busy}>
          {t("assistant.send")}
        </Button>
      </form>
    </Drawer>
  );
}

/* ------------------------------------------------------ scenario bar */

/**
 * Edge-case harness (§10). Not part of the customer product: it drives the same
 * failure paths the BFF would produce so every recovery screen is reachable.
 */
export function ScenarioBar() {
  const { t, locale, scenario, setScenario, events } = useApp();
  const [open, setOpen] = useState(false);
  const active = SCENARIOS.find((s) => s.id === scenario);

  return (
    <>
      <div className="no-print fixed bottom-16 end-3 z-40 lg:bottom-3">
        <Button
          size="sm"
          variant={scenario === "normal" ? "secondary" : "danger"}
          onClick={() => setOpen(true)}
          aria-label={t("dev.title")}
        >
          <span aria-hidden>⚙</span>
          {scenario === "normal" ? "QA" : localized(active!.label, locale)}
        </Button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("dev.title")}>
        <p className="text-muted text-sm">{t("dev.body")}</p>
        <div className="mt-4 space-y-1">
          {SCENARIOS.map((s) => (
            <label
              key={s.id}
              className={cx(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm",
                scenario === s.id ? "surface-sunken font-medium" : "hover:surface-sunken",
              )}
            >
              <input
                type="radio"
                name="scenario"
                checked={scenario === s.id}
                onChange={() => setScenario(s.id as ScenarioId)}
                className="size-4"
              />
              <span className="flex-1">{localized(s.label, locale)}</span>
              {s.edgeCase !== "—" && <Badge tone="neutral">{s.edgeCase}</Badge>}
            </label>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold">{t("dev.events")}</p>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {events.slice(0, 40).map((event, i) => (
              <div key={i} className="surface-sunken rounded p-2 font-mono text-[11px]">
                <span className="font-semibold">{event.name}</span>{" "}
                <span className="opacity-70">{JSON.stringify(event.props)}</span>
              </div>
            ))}
            {!events.length && <p className="text-muted text-xs">No events recorded yet.</p>}
          </div>
        </div>
      </Drawer>
    </>
  );
}

/* --------------------------------------------------- global overlays */

export function GlobalOverlays() {
  const { toasts, announcement, scenario, t } = useApp();
  useEffect(() => {
    setPreferenceCookie("nz_scenario", scenario);
  }, [scenario]);
  return (
    <>
      <ToastStack toasts={toasts} />
      <LiveRegion message={announcement} />
      {scenario === "allSuppliersFail" && (
        <div className="no-print fixed inset-x-0 top-0 z-50">
          <Alert tone="warning">{t("results.allFailed")}</Alert>
        </div>
      )}
    </>
  );
}
