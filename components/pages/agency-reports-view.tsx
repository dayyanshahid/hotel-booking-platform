"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { Card } from "@/components/ui";
import { LoadFailed, Money, PageHeader, Section, StatSkeleton, Stat, StatGrid } from "@/components/agency/ui";
import { useResource } from "@/components/providers/use-resource";
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
  /*
   * The refusal branch was missing entirely — `if (body.ok) setData(...)` and
   * no else — so any failure left `data` null and the early return below held
   * the page on a skeleton for ever. Production figures that never arrive look
   * exactly like production figures still loading.
   */
  const { data, failed, loading, reload } = useResource<Payload>("/api/agency/reports");

  if (loading) return <StatSkeleton />;
  if (failed || !data) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("agency.reports")} description={t("agency.reportsBody")} />
        <LoadFailed title={t("agency.reportsUnavailable")} body={t("agency.reportsUnavailableBody")} onRetry={reload} />
      </div>
    );
  }
  const currency = data.currency as CurrencyCode;

  return (
    <div className="space-y-5">
      <PageHeader title={t("agency.reports")} description={t("agency.reportsBody")} />

      <StatGrid>
        <Stat icon="plane" label={t("agency.bookingsMade")} value={String(data.totals.bookings)} />
        <Stat
          icon="receipt"
          label={t("agency.sold")}
          value={<Money amount={data.totals.sell} currency={currency} locale={locale} size="lg" className="text-xl" />}
        />
        <Stat
          icon="star"
          label={t("agency.margin")}
          tone="positive"
          value={<Money amount={data.totals.margin} currency={currency} locale={locale} size="lg" className="text-xl" />}
        />
        <Stat icon="close" label={t("agency.cancelledCount")} value={String(data.totals.cancelled)} />
      </StatGrid>

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
      <Section title={title}>
        <p className="text-muted text-sm">{empty}</p>
      </Section>
    );
  }

  return (
    <Section title={title}>
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
    </Section>
  );
}
