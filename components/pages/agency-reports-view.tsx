"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { Card, SectionHeading, Skeleton } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { CurrencyCode, Locale } from "@/lib/types";

/**
 * Production.
 *
 * Four questions an agency owner asks at the end of a month — how much did we
 * write, what did we keep, who sold it, and what are we selling — answered on
 * one screen with no chart. A table an owner can read down beats a graph they
 * have to interpret when every row is a number they can act on.
 */
export function AgencyReportsView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{() => <Reports locale={locale} />}</PortalShell>;
}

interface Bucket {
  key: string;
  label: string;
  bookings: number;
  cancelled: number;
  cost: number;
  sell: number;
  margin: number;
}

interface Payload {
  currency: string;
  months: Bucket[];
  agents: Bucket[];
  hotels: Bucket[];
  totals: Omit<Bucket, "key" | "label">;
}

function Reports({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/agency/reports", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: Payload };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;
  const currency = data.currency as CurrencyCode;

  return (
    <div className="space-y-5">
      <SectionHeading title={t("agency.reports")} description={t("agency.reportsBody")} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t("agency.bookingsMade")} value={String(data.totals.bookings)} />
        <Stat label={t("agency.sold")} value={formatMoney(data.totals.sell, currency, locale)} />
        <Stat label={t("agency.margin")} value={formatMoney(data.totals.margin, currency, locale)} />
        <Stat label={t("agency.cancelledCount")} value={String(data.totals.cancelled)} />
      </div>

      <Table
        title={t("agency.byMonth")}
        rows={data.months}
        locale={locale}
        currency={currency}
        empty={t("agency.noProduction")}
      />
      <Table
        title={t("agency.byAgent")}
        rows={data.agents}
        locale={locale}
        currency={currency}
        empty={t("agency.noProduction")}
      />
      <Table
        title={t("agency.byHotel")}
        rows={data.hotels}
        locale={locale}
        currency={currency}
        empty={t("agency.noProduction")}
      />
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

function Table({
  title,
  rows,
  locale,
  currency,
  empty,
}: {
  title: string;
  rows: Bucket[];
  locale: Locale;
  currency: CurrencyCode;
  empty: string;
}) {
  const { t } = useApp();
  if (!rows.length) {
    return (
      <section className="space-y-2">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted text-sm">{empty}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {/* Five money columns do not fit a phone; the table scrolls rather than wraps. */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-muted hairline border-b text-xs">
            <tr>
              <th className="p-3 text-start font-medium">{title}</th>
              <th className="p-3 text-end font-medium">{t("agency.bookingsMade")}</th>
              <th className="p-3 text-end font-medium">{t("agency.cost")}</th>
              <th className="p-3 text-end font-medium">{t("agency.sell")}</th>
              <th className="p-3 text-end font-medium">{t("agency.margin")}</th>
            </tr>
          </thead>
          <tbody className="divide-ink-100 divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="p-3 wrap-anywhere">
                  {row.label}
                  {row.cancelled > 0 && (
                    <span className="text-muted ms-2 text-xs">
                      ({row.cancelled} {t("agency.statusCancelled").toLowerCase()})
                    </span>
                  )}
                </td>
                <td className="p-3 text-end tabular-nums">{row.bookings}</td>
                <td className="p-3 text-end tabular-nums">{formatMoney(row.cost, currency, locale)}</td>
                <td className="p-3 text-end tabular-nums">{formatMoney(row.sell, currency, locale)}</td>
                <td className="text-positive-700 p-3 text-end font-semibold tabular-nums">
                  {formatMoney(row.margin, currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
