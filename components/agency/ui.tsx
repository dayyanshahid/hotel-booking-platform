"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, Card, Skeleton, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import { roomLabel } from "@/lib/i18n";
import type { CurrencyCode, Locale } from "@/lib/types";

/**
 * The portal's own small kit.
 *
 * The consumer site is a shop: generous spacing, photography, one decision per
 * screen. The portal is a tool someone uses forty times a day with a customer
 * on the phone, and it wants the opposite — density, alignment, and the same
 * shapes in the same places on every screen so nothing has to be re-read.
 *
 * These pieces exist so that discipline is inherited rather than remembered.
 * Before them, each screen invented its own header, its own stat card and its
 * own way of right-aligning money, and they had quietly drifted apart.
 */

/* --------------------------------------------------------------- money */

/**
 * An amount, aligned so a column of them can be compared.
 *
 * Tabular figures are the whole point: with proportional numerals a column of
 * prices is ragged and the eye cannot scan it, which is exactly what an agent
 * is trying to do when they look at four rates at once.
 */
export function Money({
  amount,
  currency,
  locale,
  tone = "default",
  size = "md",
  className,
}: {
  amount: number;
  currency: string;
  locale: Locale;
  tone?: "default" | "muted" | "positive" | "critical" | "strike";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "tabular-nums",
        size === "lg" && "text-lg font-bold",
        size === "md" && "font-semibold",
        size === "sm" && "text-xs",
        tone === "muted" && "text-muted",
        tone === "positive" && "text-positive-700",
        tone === "critical" && "text-critical-700",
        tone === "strike" && "text-muted line-through",
        className,
      )}
    >
      {formatMoney(amount, currency as CurrencyCode, locale)}
    </span>
  );
}

/* -------------------------------------------------------- page header */

/**
 * The top of every screen.
 *
 * One shape, so the eye always finds the title, the explanation and the primary
 * action in the same place. `actions` sits inline on wide screens and wraps
 * beneath on narrow ones rather than shrinking the title.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.01em] wrap-anywhere sm:text-2xl">{title}</h1>
          {description && <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A titled block within a screen. Quieter than a page header, same rhythm. */
export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-[-0.01em]">{title}</h2>
          {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- stat */

/**
 * One figure.
 *
 * `hint` carries the sentence that stops a number being misread — what it
 * excludes, what it is a share of. A figure with no context invites the reader
 * to invent one.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: "default" | "positive" | "caution" | "critical";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-brand-600 bg-brand-50 grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)]">
            <Icon name={icon} size={15} />
          </span>
        )}
        <p className="text-muted text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={cx(
          "mt-2 text-xl font-bold tabular-nums tracking-[-0.02em]",
          tone === "positive" && "text-positive-700",
          tone === "caution" && "text-caution-700",
          tone === "critical" && "text-critical-700",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted mt-1 text-xs leading-snug">{hint}</p>}
    </Card>
  );
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return (
    <div className={cx("grid gap-3 sm:grid-cols-2", columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- meter */

/**
 * A proportion, with a tone that changes before it is a problem.
 *
 * A credit line reported only as a figure answers "how much" but not "am I
 * about to run out", which is the question an agent actually has mid-sale. The
 * thresholds are deliberately early: amber at a third left, red at a sixth,
 * because finding out at zero is finding out too late.
 */
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const tone = ratio < 0.15 ? "critical" : ratio < 0.35 ? "caution" : "brand";

  return (
    <div className="space-y-1">
      <div
        className="bg-ink-100 h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            tone === "critical" && "bg-critical-600",
            tone === "caution" && "bg-caution-500",
            tone === "brand" && "bg-brand-500",
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- data table */

export interface Column<T> {
  key: string;
  header: string;
  align?: "start" | "end";
  /** Hidden below `sm` — for columns that are useful but not load-bearing. */
  secondary?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
}

/**
 * One table, so every table behaves the same.
 *
 * Numeric columns end-align and carry tabular figures; the header sticks so a
 * long list keeps its meaning while scrolling; and the whole thing scrolls
 * inside its own box rather than pushing the page sideways. Getting that right
 * once is why the reports, statement and booking lists now read as one product.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 640,
  empty,
  onRowHref,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  minWidth?: number;
  empty?: ReactNode;
  onRowHref?: (row: T) => string | undefined;
}) {
  if (!rows.length && empty) return <>{empty}</>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="text-muted hairline surface sticky top-0 z-10 border-b text-xs">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cx(
                  "p-3 font-medium",
                  column.align === "end" ? "text-end" : "text-start",
                  column.secondary && "hidden sm:table-cell",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-ink-100 divide-y">
          {rows.map((row) => {
            const target = onRowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={cx("hover:bg-brand-50/40 transition-colors", target && "cursor-pointer")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      "p-3 align-top",
                      column.align === "end" ? "text-end tabular-nums" : "text-start",
                      column.secondary && "hidden sm:table-cell",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/* -------------------------------------------------------------- loading */

/**
 * A skeleton shaped like what is coming.
 *
 * A single grey slab tells you nothing is here yet; a skeleton with the right
 * number of rows tells you what to expect and stops the layout jumping when it
 * arrives.
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="divide-ink-100 divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 p-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </Card>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-2 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- empty */

/**
 * Nothing here yet, and what to do about it.
 *
 * Every empty state in the portal offers the next action, because an agent
 * looking at an empty list is usually one click from filling it and a dead end
 * is a support call.
 */
export function Nothing({
  icon = "list",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="text-brand-600 bg-brand-50 grid size-11 place-items-center rounded-full">
        <Icon name={icon} size={20} />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {body && <p className="text-muted mx-auto max-w-sm text-sm leading-relaxed">{body}</p>}
      </div>
      {action}
    </Card>
  );
}

/* ------------------------------------------------------------ price block */

/**
 * The three numbers that decide a sale, in a fixed order.
 *
 * Cost, sell, margin — always those three, always that order, always in the
 * same corner of the row. An agent scanning twenty results is comparing the
 * same position on each one, so the layout must not vary with the data.
 */
export function TradePrices({
  cost,
  sell,
  margin,
  currency,
  locale,
  publicPrice,
  compact = false,
  perRoomOf,
}: {
  cost: number;
  sell: number;
  margin: number;
  currency: string;
  locale: Locale;
  publicPrice?: number;
  compact?: boolean;
  /**
   * Rooms the search asked for, when this rate only covers one of them.
   *
   * The estimate is computed from `sell` rather than reusing the consumer note,
   * because that one multiplies the public price. Putting a public party total
   * under an agency sell price would show an agent two figures from different
   * books and invite them to quote the wrong one.
   */
  perRoomOf?: number;
}) {
  const { t } = useApp();
  const rooms = perRoomOf && perRoomOf > 1 ? perRoomOf : 0;
  return (
    <div className={cx("text-end", compact ? "space-y-0.5" : "space-y-1")}>
      {publicPrice !== undefined && (
        <p className="text-xs">
          <span className="text-muted me-1">{t("agency.public")}</span>
          <Money amount={publicPrice} currency={currency} locale={locale} tone="strike" size="sm" />
        </p>
      )}
      <p className="flex items-baseline justify-end gap-1.5">
        <span className="text-muted text-xs">{t("agency.sell")}</span>
        <Money amount={sell} currency={currency} locale={locale} size="lg" />
      </p>
      <p className="text-muted flex items-baseline justify-end gap-1.5 text-xs">
        <span>{t("agency.cost")}</span>
        <Money amount={cost} currency={currency} locale={locale} size="sm" className="text-ink-900" />
        <span aria-hidden>·</span>
        <span>{t("agency.margin")}</span>
        <Money amount={margin} currency={currency} locale={locale} size="sm" tone="positive" />
      </p>
      {rooms > 0 && (
        <>
          <p className="text-caution-700 text-xs font-medium">{t("rate.perRoomOf", { rooms })}</p>
          <p className="text-muted text-xs">
            {t("rate.partyEstimate", {
              amount: formatMoney(Math.round(sell * rooms), currency as CurrencyCode, locale),
              rooms,
            })}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * How many rooms this rate is filling.
 *
 * The basket was a toggle, so three rooms at the same rate — the ordinary group
 * booking — was the one thing it could not express: picking a rate a second time
 * removed it. An agent had to find three *different* rates to book three rooms,
 * which is neither what they wanted nor what the party needed.
 *
 * Unpicked, it reads as it always did. Picked, it becomes a count with a stepper,
 * and while the basket is short of the party there is a one-click way to fill the
 * rest with the same rate, which is what most groups are.
 */
export function RateQuantity({
  count,
  roomsWanted,
  roomsHeld,
  onAdd,
  onRemove,
  onFillAll,
}: {
  count: number;
  /** Rooms the search asked for — the ceiling the checkout also enforces. */
  roomsWanted: number;
  /** Rooms already in the basket, across every rate. */
  roomsHeld: number;
  onAdd: () => void;
  onRemove: () => void;
  onFillAll: () => void;
}) {
  const { t, locale } = useApp();
  const full = roomsHeld >= roomsWanted;

  if (count === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" variant="secondary" onClick={onAdd} disabled={full}>
          {t("agency.addToQuote")}
        </Button>
        {/* Only worth offering while it would actually do something. */}
        {roomsWanted > 1 && roomsHeld === 0 && (
          <Button size="sm" variant="quiet" onClick={onFillAll}>
            {t("agency.useForAllRooms", { rooms: roomsWanted })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hairline flex items-center gap-1 rounded-[var(--radius-pill)] border p-1">
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("agency.removeRoomAtRate")}
          className="size-9 rounded-full text-lg leading-none"
        >
          −
        </button>
        <span aria-live="polite" className="min-w-14 text-center text-sm font-semibold">
          {t("agency.roomsAtRate", { count, unit: roomLabel(t, count, locale) })}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={full}
          aria-label={t("agency.addRoomAtRate")}
          className="size-9 rounded-full text-lg leading-none disabled:opacity-40"
        >
          +
        </button>
      </span>
      {!full && roomsWanted > 1 && (
        <Button size="sm" variant="quiet" onClick={onFillAll}>
          {t("agency.useForAllRooms", { rooms: roomsWanted })}
        </Button>
      )}
    </div>
  );
}
