"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell, refreshAdmin } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Skeleton, cx } from "@/components/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { CurrencyCode, Locale } from "@/lib/types";

/* -------------------------------------------------------------- sign-in */

export function AdminSignInView({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { demoCode?: string }; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setStage("code");
    setHint(body.data?.demoCode ?? null);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("account.codeInvalid"));
      return;
    }
    refreshAdmin();
    window.location.assign(href(locale, "/admin"));
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-8">
      <div className="space-y-2 text-center">
        <Wordmark />
        <Badge tone="critical">{t("admin.console")}</Badge>
        <h1 className="text-xl font-bold">{t("admin.signIn")}</h1>
        <p className="text-muted text-sm">{t("admin.signInBody")}</p>
      </div>

      <Card className="space-y-4 p-5">
        {error && <Alert tone="critical">{error}</Alert>}
        <Field label={t("agency.workEmail")} htmlFor="admin-email">
          <Input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={stage === "code"}
          />
        </Field>

        {stage === "email" ? (
          <Button onClick={send} loading={busy} disabled={!email} className="w-full">
            {t("agency.sendCode")}
          </Button>
        ) : (
          <>
            <p className="text-muted text-sm">{t("agency.codeSent")}</p>
            {hint && (
              <Alert tone="info">
                <span className="font-mono text-sm">{hint}</span>
              </Alert>
            )}
            <Field label={t("agency.code")} htmlFor="admin-code">
              <Input
                id="admin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Button onClick={verify} loading={busy} disabled={!code} className="w-full">
              {t("agency.verify")}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- overview */

interface Overview {
  bookings: { total: number; live: number; today: number; attention: number; cancelled: number };
  direct: { count: number; gross: number };
  trade: { count: number; gross: number; commission: number };
  agencies: {
    total: number;
    active: number;
    suspended: number;
    exposure: number;
    headroom: number;
    lowCredit: number;
  };
  commercial: { markupPercent: number };
  suppliers: {
    id: string;
    configured: boolean;
    environment: string;
    quotaUsed?: number;
    quotaRemaining?: number;
  }[];
}

export function AdminOverviewView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Overview locale={locale} />}</ConsoleShell>;
}

function Overview({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/overview", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: Overview };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;

  // Displayed in the platform's own settlement currency: these are our figures,
  // not one customer's, and mixing currencies into a single total would be a
  // number that means nothing.
  const currency = "USD" as CurrencyCode;

  return (
    <div className="space-y-5">
      {/*
        Anything needing a human comes first, and only appears when it is true —
        a permanent "0 issues" panel trains people to stop reading the top of
        the page, which is exactly where the alarms are.
      */}
      {(data.bookings.attention > 0 || data.agencies.lowCredit > 0) && (
        <Alert tone="warning" title={t("admin.attention")}>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {data.bookings.attention > 0 && (
              <li>
                <a className="underline" href={href(locale, "/admin/bookings?status=attention")}>
                  {t("admin.attentionBookings", { n: data.bookings.attention })}
                </a>
              </li>
            )}
            {data.agencies.lowCredit > 0 && (
              <li>
                <a className="underline" href={href(locale, "/admin/agencies")}>
                  {t("admin.attentionCredit", { n: data.agencies.lowCredit })}
                </a>
              </li>
            )}
          </ul>
        </Alert>
      )}

      <section className="space-y-2">
        <SectionHeading title={t("admin.overview")} description={t("admin.overviewBody")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("admin.bookingsTotal")} value={String(data.bookings.total)} />
          <Stat label={t("admin.bookingsLive")} value={String(data.bookings.live)} />
          <Stat label={t("admin.bookingsToday")} value={String(data.bookings.today)} />
          <Stat label={t("admin.cancelled")} value={String(data.bookings.cancelled)} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("admin.b2cDirect")}</h2>
          <p className="text-muted text-sm">{t("admin.b2cBody")}</p>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.bookingsLive")} value={String(data.direct.count)} />
            <Row label={t("admin.gross")} value={formatMoney(data.direct.gross, currency, locale)} />
          </dl>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("admin.b2bTrade")}</h2>
          <p className="text-muted text-sm">{t("admin.b2bBody")}</p>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.bookingsLive")} value={String(data.trade.count)} />
            <Row label={t("admin.gross")} value={formatMoney(data.trade.gross, currency, locale)} />
            <Row
              label={t("admin.retained")}
              value={formatMoney(data.trade.commission, currency, locale)}
              strong
            />
          </dl>
        </Card>
      </div>

      <section className="space-y-2">
        <SectionHeading title={t("admin.creditExposure")} description={t("admin.creditExposureBody")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("admin.agenciesActive")} value={`${data.agencies.active}/${data.agencies.total}`} />
          <Stat label={t("admin.committed")} value={formatMoney(data.agencies.exposure, currency, locale)} />
          <Stat label={t("admin.headroom")} value={formatMoney(data.agencies.headroom, currency, locale)} />
          <Stat label={t("admin.markup")} value={`${data.commercial.markupPercent}%`} />
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading title={t("admin.suppliers")} />
        <Card className="divide-ink-100 divide-y">
          {data.suppliers.map((supplier) => (
            <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium capitalize">{supplier.id}</p>
                <p className="text-muted text-xs wrap-anywhere">{supplier.environment}</p>
              </div>
              <div className="flex items-center gap-3">
                {supplier.quotaRemaining !== undefined && (
                  <span className="text-muted text-xs">
                    {t("admin.quota")} {supplier.quotaUsed}/{(supplier.quotaUsed ?? 0) + supplier.quotaRemaining}
                  </span>
                )}
                <Badge tone={supplier.configured ? "positive" : "neutral"}>
                  {supplier.configured ? t("admin.connected") : t("admin.notConfiguredShort")}
                </Badge>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cx(strong && "text-positive-700 font-semibold")}>{value}</dd>
    </div>
  );
}
