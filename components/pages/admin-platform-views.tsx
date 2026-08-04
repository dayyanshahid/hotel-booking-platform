"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Skeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

/* ------------------------------------------------------------ settings */

interface FxRow {
  currency: string;
  perSar: number;
  overridden: boolean;
}

interface SettingsPayload {
  markupPercent: number;
  deployedDefault: number;
  overridden: boolean;
  updatedAt?: string;
  updatedBy?: string;
  range: { min: number; max: number };
  fx: FxRow[];
  fxRange: { min: number; max: number };
}

export function AdminSettingsView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Settings locale={locale} />}</ConsoleShell>;
}

function Settings({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const body = await apiFetch<SettingsPayload>("/api/admin/settings");
    if (body.ok && body.data) {
      setData(body.data);
      setValue(body.data.markupPercent);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!data) return <Skeleton className="h-48 w-full" />;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = await apiFetch<unknown>("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markupPercent: value }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setNotice(t("admin.markupSaved"));
    await load();
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.settings")} description={t("admin.settingsBody")} />
      {error && <Alert tone="critical">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t("admin.markup")}</h2>
        {/*
          Stated in full before the input, because the consequence is not
          obvious from a number field: this moves every public price at once.
        */}
        <Alert tone="warning">{t("admin.markupWarning")}</Alert>

        <div className="grid gap-3 sm:max-w-sm">
          <Field label="%" htmlFor="pm-markup">
            <Input
              id="pm-markup"
              type="number"
              min={data.range.min}
              max={data.range.max}
              step={0.5}
              value={String(value)}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </Field>
        </div>

        <p className="text-muted text-sm">
          {t("admin.deployedDefault")}: <strong>{data.deployedDefault}%</strong>
          {data.overridden && data.updatedBy && (
            <>
              {" · "}
              {t("admin.overriddenBy", { who: data.updatedBy })}
              {data.updatedAt ? ` · ${formatDateTime(data.updatedAt, locale)}` : ""}
            </>
          )}
        </p>

        <p className="text-muted text-sm">
          {t("admin.markupExample", {
            net: 100,
            price: Math.round(100 * (1 + Math.max(0, value) / 100)),
          })}
        </p>

        <Button onClick={save} loading={busy} disabled={value === data.markupPercent}>
          {t("common.save")}
        </Button>
      </Card>

      <FxRates rows={data.fx} onSaved={() => void load()} />
    </div>
  );
}

/**
 * The rates the platform charges on.
 *
 * The built-in table calls itself indicative, which was honest while every
 * price was simulated. It is not honest now — the suppliers quote in their own
 * currencies and this is what turns their number into the one on an agency's
 * invoice — so an operator sets it, and every change is audited.
 *
 * Rates are edited as a set and saved together: an operator adjusting a
 * currency pair usually has a second one in mind, and one round trip per box
 * would audit three changes for one decision.
 */
function FxRates({ rows, onSaved }: { rows: FxRow[]; onSaved: () => void }) {
  const { t } = useApp();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = await apiFetch<unknown>("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fxRates: draft }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("admin.fxRange"));
      return;
    }
    setDraft({});
    setSaved(true);
    onSaved();
  }

  return (
    <Card className="space-y-3 p-5">
      <SectionHeading title={t("admin.fx")} description={t("admin.fxBody")} />
      {error && <Alert tone="critical">{error}</Alert>}
      {saved && <Alert tone="success">{t("admin.fxSaved")}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Field
            key={row.currency}
            label={
              <span className="flex items-center gap-2">
                {row.currency}
                <Badge tone={row.overridden ? "brand" : "neutral"}>
                  {row.overridden ? t("admin.fxOverridden") : t("admin.fxBuiltIn")}
                </Badge>
              </span>
            }
            htmlFor={`fx-${row.currency}`}
            hint={t("admin.fxPerSar")}
          >
            <Input
              id={`fx-${row.currency}`}
              inputMode="decimal"
              value={draft[row.currency] ?? String(row.perSar)}
              onChange={(e) => setDraft((held) => ({ ...held, [row.currency]: e.target.value }))}
            />
          </Field>
        ))}
      </div>

      <Button onClick={save} loading={busy} disabled={!dirty}>
        {t("admin.fxSave")}
      </Button>
    </Card>
  );
}

/* ----------------------------------------------------------- suppliers */

interface Supplier {
  id: string;
  label: string;
  configured: boolean;
  environment: string;
  production: boolean;
  quota?: { used: number; remaining: number; day: string };
  catalogueSize?: number;
  notes: string | null;
}

export function AdminSuppliersView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Suppliers />}</ConsoleShell>;
}

function Suppliers() {
  const { t } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [suppliersFailed, setSuppliersFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const body = await apiFetch<{ suppliers: Supplier[] }>("/api/admin/suppliers");
      // "No suppliers configured" is a very different thing from "we could
      // not ask", on the screen an operator opens to find out why a city
      // returns nothing.
      setSuppliersFailed(!body.ok);
      if (body.ok && body.data) setSuppliers(body.data.suppliers);
    })();
  }, []);

  // An early return on `!suppliers` alone left the page on a skeleton for
  // ever once the read failed, since nothing would ever set the list.
  if (suppliersFailed) return <Alert tone="warning">{t("admin.suppliersUnavailable")}</Alert>;
  if (!suppliers) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.suppliers")} description={t("admin.suppliersBody")} />

      <ul className="grid gap-3 lg:grid-cols-2">
        {suppliers.map((supplier) => (
          <li key={supplier.id}>
            <Card className="space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{supplier.label}</h2>
                <div className="flex gap-1">
                  <Badge tone={supplier.configured ? "positive" : "critical"}>
                    {supplier.configured ? t("admin.connected") : t("admin.notConfiguredShort")}
                  </Badge>
                  <Badge tone={supplier.production ? "caution" : "neutral"}>
                    {supplier.production ? t("admin.production") : t("admin.testEnv")}
                  </Badge>
                </div>
              </div>

              <p className="text-muted font-mono text-xs wrap-anywhere">{supplier.environment}</p>

              {supplier.quota && (
                <div className="space-y-1">
                  <p className="text-sm">
                    {t("admin.quota")}: <strong>{supplier.quota.used}</strong> /{" "}
                    {supplier.quota.used + supplier.quota.remaining} · {supplier.quota.day}
                  </p>
                  <div className="bg-ink-100 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-brand-600 h-full rounded-full"
                      style={{
                        width: `${Math.round(
                          (supplier.quota.used / Math.max(1, supplier.quota.used + supplier.quota.remaining)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {supplier.catalogueSize !== undefined && (
                <p className="text-sm">
                  {t("admin.mappedProperties")}: <strong>{supplier.catalogueSize}</strong>
                  {supplier.catalogueSize === 0 && (
                    <span className="text-caution-700"> · {t("admin.catalogueEmpty")}</span>
                  )}
                </p>
              )}

              {supplier.notes && <Alert tone="warning">{t(supplier.notes)}</Alert>}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
