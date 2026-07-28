"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, SectionHeading, Select, Field, Input, Skeleton, cx } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { AuditEntry } from "@/lib/admin/store";
import type { CurrencyCode, Locale } from "@/lib/types";

/* ---------------------------------------------------------- catalogue */

interface CataloguePayload {
  geography: {
    countries: number;
    bookableCountries: number;
    cities: number;
    editorialCities: number;
    demoProperties: number;
  };
  suppliers: {
    hotelbeds: { enabled: boolean; destinationsCached: number; hotelsCached: number };
    tourmind: { enabled: boolean; hotelsMapped: number; citiesCovered: number };
  };
  countries: { code: string; name: string; cities: number; demo: number; tourmind: number; editorial: number }[];
}

export function AdminCatalogueView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Catalogue />}</ConsoleShell>;
}

function Catalogue() {
  const { t } = useApp();
  const [data, setData] = useState<CataloguePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/catalogue", { credentials: "same-origin" });
    const body = (await res.json()) as { ok: boolean; data?: CataloguePayload };
    if (body.ok && body.data) setData(body.data);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;

  async function sync(supplier: "hotelbeds" | "tourmind") {
    setBusy(supplier);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/catalogue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ supplier }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { saved?: number; matched?: number; fetched?: number };
      error?: { message: string };
    };
    setBusy(null);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setNotice(
      t("admin.syncDone", {
        n: body.data?.saved ?? body.data?.matched ?? 0,
        supplier,
      }),
    );
    await load();
  }

  return (
    <div className="space-y-5">
      <SectionHeading title={t("admin.catalogue")} description={t("admin.catalogueBody")} />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("admin.cities")} value={String(data.geography.cities)} />
        <Stat label={t("admin.countriesCovered")} value={String(data.geography.bookableCountries)} />
        <Stat label={t("admin.demoProperties")} value={String(data.geography.demoProperties)} />
        <Stat label={t("admin.editorialCities")} value={String(data.geography.editorialCities)} />
        <Stat label={t("admin.countriesKnown")} value={String(data.geography.countries)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Hotelbeds</h2>
            <Badge tone={data.suppliers.hotelbeds.enabled ? "positive" : "neutral"}>
              {data.suppliers.hotelbeds.enabled ? t("admin.connected") : t("admin.notConfiguredShort")}
            </Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.destinationsCached")} value={String(data.suppliers.hotelbeds.destinationsCached)} />
            <Row label={t("admin.hotelsCached")} value={String(data.suppliers.hotelbeds.hotelsCached)} />
          </dl>
          <p className="text-muted text-xs">{t("admin.syncCost")}</p>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.suppliers.hotelbeds.enabled}
            loading={busy === "hotelbeds"}
            onClick={() => sync("hotelbeds")}
          >
            {t("admin.syncDestinations")}
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">TourMind</h2>
            <Badge tone={data.suppliers.tourmind.enabled ? "positive" : "neutral"}>
              {data.suppliers.tourmind.enabled ? t("admin.connected") : t("admin.notConfiguredShort")}
            </Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.hotelsMapped")} value={String(data.suppliers.tourmind.hotelsMapped)} />
            <Row label={t("admin.citiesCovered")} value={String(data.suppliers.tourmind.citiesCovered)} />
          </dl>
          {data.suppliers.tourmind.enabled && data.suppliers.tourmind.hotelsMapped === 0 && (
            <Alert tone="warning">{t("admin.catalogueEmptyWarning")}</Alert>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.suppliers.tourmind.enabled}
            loading={busy === "tourmind"}
            onClick={() => sync("tourmind")}
          >
            {t("admin.syncCatalogue")}
          </Button>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("admin.coverageByCountry")}</h2>
        <p className="text-muted text-sm">{t("admin.coverageBody")}</p>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-muted hairline border-b text-xs">
              <tr>
                <th className="p-3 text-start font-medium">{t("agency.country")}</th>
                <th className="p-3 text-end font-medium">{t("admin.cities")}</th>
                <th className="p-3 text-end font-medium">{t("admin.demoProperties")}</th>
                <th className="p-3 text-end font-medium">TourMind</th>
                <th className="p-3 text-end font-medium">{t("admin.editorial")}</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {data.countries.map((row) => (
                <tr key={row.code}>
                  <td className="p-3 wrap-anywhere">
                    {row.name} <span className="text-muted text-xs">{row.code}</span>
                  </td>
                  <td className="p-3 text-end tabular-nums">{row.cities}</td>
                  <td className="p-3 text-end tabular-nums">{row.demo}</td>
                  <td className="p-3 text-end tabular-nums">{row.tourmind || "—"}</td>
                  <td className="p-3 text-end tabular-nums">
                    {row.editorial ? `${row.editorial}/${row.cities}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ reports */

interface Bucket {
  key: string;
  label: string;
  direct: number;
  trade: number;
  cancelled: number;
  gross: number;
  retained: number;
}

interface ReportsPayload {
  totals: {
    bookings: number;
    cancelled: number;
    cancellationRate: number;
    gross: number;
    direct: number;
    trade: number;
    averageValue: number;
  };
  months: Bucket[];
  properties: Bucket[];
  agencies: Bucket[];
}

export function AdminReportsView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Reports locale={locale} />}</ConsoleShell>;
}

function Reports({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<ReportsPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/reports", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: ReportsPayload };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;
  const currency = "USD" as CurrencyCode;

  return (
    <div className="space-y-5">
      <SectionHeading title={t("admin.platformReports")} description={t("admin.platformReportsBody")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("admin.bookingsLive")} value={String(data.totals.bookings)} />
        <Stat label={t("admin.gross")} value={formatMoney(data.totals.gross, currency, locale)} />
        <Stat label={t("admin.averageBooking")} value={formatMoney(data.totals.averageValue, currency, locale)} />
        <Stat
          label={t("admin.cancellationRate")}
          value={`${data.totals.cancellationRate}%`}
          tone={data.totals.cancellationRate > 25 ? "critical" : undefined}
        />
      </div>

      <ReportTable title={t("admin.byMonth")} rows={data.months} locale={locale} currency={currency} />
      <ReportTable title={t("admin.topProperties")} rows={data.properties} locale={locale} currency={currency} />
      <ReportTable title={t("admin.agencyLeague")} rows={data.agencies} locale={locale} currency={currency} />
    </div>
  );
}

function ReportTable({
  title,
  rows,
  locale,
  currency,
}: {
  title: string;
  rows: Bucket[];
  locale: Locale;
  currency: CurrencyCode;
}) {
  const { t } = useApp();
  if (!rows.length) {
    return (
      <section className="space-y-2">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted text-sm">{t("admin.noData")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted hairline border-b text-xs">
            <tr>
              <th className="p-3 text-start font-medium">{title}</th>
              <th className="p-3 text-end font-medium">{t("admin.b2c")}</th>
              <th className="p-3 text-end font-medium">{t("admin.b2b")}</th>
              <th className="p-3 text-end font-medium">{t("admin.cancelled")}</th>
              <th className="p-3 text-end font-medium">{t("admin.gross")}</th>
              <th className="p-3 text-end font-medium">{t("admin.retained")}</th>
            </tr>
          </thead>
          <tbody className="divide-ink-100 divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="p-3 wrap-anywhere">{row.label}</td>
                <td className="p-3 text-end tabular-nums">{row.direct}</td>
                <td className="p-3 text-end tabular-nums">{row.trade}</td>
                <td className="p-3 text-end tabular-nums">{row.cancelled || "—"}</td>
                <td className="p-3 text-end tabular-nums">{formatMoney(row.gross, currency, locale)}</td>
                <td className="text-positive-700 p-3 text-end font-semibold tabular-nums">
                  {formatMoney(row.retained, currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------- environment */

interface EnvironmentPayload {
  deployment: {
    origin: string;
    serverless: boolean;
    region: string | null;
    environment: string;
    commit: string | null;
  };
  storage: { dataDir: string; durable: boolean };
  secrets: { name: string; set: boolean; required: boolean }[];
  operators: { email: string; current: boolean }[];
}

export function AdminEnvironmentView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Environment />}</ConsoleShell>;
}

function Environment() {
  const { t } = useApp();
  const [data, setData] = useState<EnvironmentPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/environment", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: EnvironmentPayload };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.environment")} description={t("admin.environmentBody")} />

      {/*
        The most important thing on this screen. Every figure the console shows
        is "what this instance has seen" when storage is ephemeral, and an
        operator reading a revenue total deserves to know that before they quote
        it to anyone.
      */}
      {!data.storage.durable && <Alert tone="warning" title={t("admin.ephemeral")}>{t("admin.ephemeralBody")}</Alert>}

      <Card className="space-y-2 p-5 text-sm">
        <h2 className="font-semibold">{t("admin.deployment")}</h2>
        <Row label={t("admin.environmentName")} value={data.deployment.environment} />
        <Row label={t("admin.origin")} value={data.deployment.origin} />
        {data.deployment.region && <Row label={t("admin.region")} value={data.deployment.region} />}
        {data.deployment.commit && <Row label={t("admin.commit")} value={data.deployment.commit} />}
        <Row label={t("admin.dataDir")} value={data.storage.dataDir} />
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("admin.configuration")}</h2>
        <p className="text-muted text-sm">{t("admin.configurationBody")}</p>
        <ul className="divide-ink-100 divide-y text-sm">
          {data.secrets.map((secret) => (
            <li key={secret.name} className="flex items-center justify-between gap-2 py-2.5">
              <span className="font-mono text-xs wrap-anywhere">{secret.name}</span>
              <Badge tone={secret.set ? "positive" : secret.required ? "critical" : "neutral"}>
                {secret.set ? t("admin.set") : secret.required ? t("admin.missing") : t("admin.unset")}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("admin.operators")}</h2>
        <p className="text-muted text-sm">{t("admin.operatorsBody")}</p>
        <ul className="divide-ink-100 divide-y text-sm">
          {data.operators.map((operator) => (
            <li key={operator.email} className="flex items-center justify-between gap-2 py-2.5">
              <span className="wrap-anywhere">{operator.email}</span>
              {operator.current && <Badge tone="brand">{t("admin.you")}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- shared */

function Stat({ label, value, tone }: { label: string; value: string; tone?: "critical" }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className={cx("mt-1 text-lg font-bold", tone === "critical" && "text-critical-700")}>{value}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-xs wrap-anywhere">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- audit */

export function AdminAuditView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Audit locale={locale} />}</ConsoleShell>;
}

function Audit({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      const params = new URLSearchParams({ actor, action });
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { entries: AuditEntry[]; actions: string[] } };
      if (!alive) return;
      setEntries(body.ok && body.data ? body.data.entries : []);
      if (body.ok && body.data) setActions(body.data.actions);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [actor, action]);

  return (
    <div className="space-y-4">
      <SectionHeading
        title={t("admin.audit")}
        description={t("admin.auditBody")}
        action={
          <a href={`/api/admin/audit?format=csv&actor=${encodeURIComponent(actor)}&action=${encodeURIComponent(action)}`}>
            <Button variant="secondary" size="sm">
              CSV
            </Button>
          </a>
        }
      />

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label={t("admin.actor")} htmlFor="au-actor">
          <Input id="au-actor" value={actor} onChange={(e) => setActor(e.target.value)} />
        </Field>
        <Field label={t("admin.action")} htmlFor="au-action">
          <Select id="au-action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t("admin.allActions")}</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {!entries && <Skeleton className="h-64 w-full" />}
      {entries && !entries.length && <p className="text-muted text-sm">{t("admin.noAudit")}</p>}
      {entries && entries.length > 0 && (
        <Card className="divide-ink-100 divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium wrap-anywhere">{entry.detail}</p>
                <Badge tone="neutral">{entry.action}</Badge>
              </div>
              <p className="text-muted text-xs wrap-anywhere">
                {entry.actor} · {entry.subject} · {formatDateTime(entry.at, locale)}
              </p>
              {(entry.before || entry.after) && (
                <p className="text-muted mt-0.5 font-mono text-xs wrap-anywhere">
                  {entry.before ?? "—"} → {entry.after ?? "—"}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
