"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Skeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/types";

/* ------------------------------------------------------------ settings */

interface SettingsPayload {
  markupPercent: number;
  deployedDefault: number;
  overridden: boolean;
  updatedAt?: string;
  updatedBy?: string;
  range: { min: number; max: number };
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
    const res = await fetch("/api/admin/settings", { credentials: "same-origin" });
    const body = (await res.json()) as { ok: boolean; data?: SettingsPayload };
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
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ markupPercent: value }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
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
    </div>
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

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/suppliers", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { suppliers: Supplier[] } };
      setSuppliers(body.ok && body.data ? body.data.suppliers : []);
    })();
  }, []);

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
