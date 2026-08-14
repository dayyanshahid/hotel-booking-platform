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
/* ---------------------------------------------------------------- measure */

/**
 * How wide a screen should actually read.
 *
 * The portal is capped at a workbench width because search needs it: results,
 * filters and the cart side by side are four real columns of data, and every
 * pixel taken off them is taken off the job. Every other screen inherited that
 * width and should not have.
 *
 * What it looked like at 1512: a two-option dropdown 597px wide, another 874px,
 * body copy running to 1206px, and a statement row with its label at one edge
 * and its amount 1,285px away at the other — far enough apart that the eye
 * cannot associate the two without tracking across the screen. Sparse, not
 * dense, which is the opposite of what a tool used forty times a day wants.
 *
 * So width becomes a decision a screen makes rather than one it inherits:
 *
 * - `wide` — the workbench. Search and comparison, where the columns earn it.
 * - `data` — tables and lists. Wide enough for six columns of figures, narrow
 *   enough that the two ends of a row stay one object.
 * - `form`  — settings and anything mostly prose. A reading measure.
 */
export function PageBody({
  measure = "wide",
  className,
  children,
}: {
  measure?: "wide" | "data" | "form";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        /*
         * Left-aligned, not centred.
         *
         * A narrower column centred under a full-width navigation bar shares
         * no edge with anything, and reads as a page that has come loose. Left
         * against the same spine as the bar, the nav simply extends further
         * right — which is what it is doing — and every screen starts its
         * content in the same place whether it is measured or not.
         */
        "w-full",
        measure === "data" && "max-w-5xl",
        measure === "form" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
  /*
   * A page title should look like one.
   *
   * The content column spaces everything on one rhythm, so the name of the
   * page sat exactly as far from the first section as that section sat from
   * the next — five identical gaps down a screen with one title and four
   * section headings on it, and nothing in the spacing saying which was which.
   * Depth was being carried entirely by type size.
   *
   * A little more air underneath, and the title is a level rather than just a
   * larger line.
   */
  return (
    <div className="space-y-1 pb-1">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] wrap-anywhere sm:text-[1.75rem]">{title}</h1>
          {description && <p className="text-muted mt-1.5 max-w-2xl text-sm leading-relaxed">{description}</p>}
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          {/*
            A shade larger than the body it heads, and a shade tighter. It was
            the same size as the sentence underneath it, so a section announced
            itself with weight alone — which on a screen of eight stat tiles
            and three tables is not enough to break the page into parts.
          */}
          <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</h2>
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
  const tone = ratio < 0.15 ? "critical" : ratio < 0.35 ? "caution" : "healthy";

  /*
   * A healthy credit line should not look like an alarm.
   *
   * The thresholds were right and the colour was backwards. An agency that has
   * spent almost nothing has almost all of its credit available, so the bar is
   * nearly full — and it was painted full-strength brand orange, edge to edge,
   * at the top of the sidebar on every screen. A saturated bar running the
   * whole width is the universal shape of "at the limit"; here it meant the
   * exact opposite, and it was the loudest thing in the portal saying it.
   *
   * So the good state is quiet. It keeps the brand hue and drops to a tint that
   * reads as a filled track rather than a warning, and the bar only gains
   * saturation as the money actually runs down — amber at a third left, red at
   * a sixth. Colour now moves in the same direction as concern.
   */
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
            tone === "healthy" && "bg-brand-300",
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
  /**
   * Hidden below `sm` *in the table* — for columns that are useful but not
   * load-bearing when horizontal room is scarce.
   *
   * The mobile card list shows them anyway, deliberately: hiding was a
   * concession to width, and a card has as many lines as it needs.
   */
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
    <>
      {/*
        On a phone, a table is a list of records.

        Every table here declares a `minWidth` so its columns keep their shape,
        and inside a 341px column that produced a 620px table behind a
        horizontal scrollbar: the customer's name and email visible, their
        trade, their last activity and the edit control all off-screen and
        reachable only by discovering a sideways swipe. The data was present
        and unreachable, which is the worst of both.

        Below `sm` each row becomes a card and each cell keeps its column
        header as its label — so nothing is dropped and nothing is hidden. From
        `sm` up the table returns unchanged, because on a real screen a table
        is the better instrument.
      */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const target = onRowHref?.(row);
          const body = (
            <Card className="space-y-1.5 p-3.5">
              {columns.map((column, index) => {
                const cell = column.render(row);
                if (cell === null || cell === undefined || cell === "") return null;
                /*
                 * The first column is the record — a customer's name, a
                 * booking's reference. It reads as the card's heading rather
                 * than as a labelled field: "Customer name / Dayyan" is a
                 * label restating what the value obviously is.
                 */
                if (index === 0) {
                  return (
                    <div
                      key={column.key}
                      /*
                       * A link in the heading is how a record is opened, and
                       * at a text line-height that is a twenty-pixel target.
                       * The card gives it a full one without changing how any
                       * screen writes its own first column.
                       */
                      className="pb-0.5 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center"
                    >
                      {cell}
                    </div>
                  );
                }
                /*
                 * A column with no header is an action — Edit, CSV. It gets the
                 * full width and no label, because "" as a label reads as a
                 * missing string rather than as a button.
                 */
                if (!column.header) {
                  return (
                    <div key={column.key} className="pt-0.5">
                      {cell}
                    </div>
                  );
                }
                return (
                  <div key={column.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-muted shrink-0 text-xs">{column.header}</span>
                    <span className={cx("min-w-0 text-sm", column.align === "end" && "tabular-nums")}>{cell}</span>
                  </div>
                );
              })}
            </Card>
          );
          return target ? (
            <a key={rowKey(row)} href={target} className="block">
              {body}
            </a>
          ) : (
            <div key={rowKey(row)}>{body}</div>
          );
        })}
      </div>

    <Card className="hidden overflow-x-auto sm:block">
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
    </>
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

/**
 * The screen could not read its data, said so, and offers the way out.
 *
 * Deliberately not `Nothing`. "You have no quotes" and "we could not fetch
 * your quotes" are different sentences about somebody's own money, and the
 * loaders here used to collapse them into the first one — `body.ok ? data :
 * []` renders a refusal as an empty account, confidently and wrongly. A
 * failure has to look like a failure and offer a retry, because unlike an
 * empty list it is something the reader can act on.
 */
export function LoadFailed({ title, body, onRetry }: { title: string; body?: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <Card className="border-caution-300 bg-caution-50 flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {body && <p className="text-muted text-xs">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
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
  /*
   * The order of these three is the order an agent needs them.
   *
   * They were a stack of same-weight lines with the margin last, smallest and
   * grey — the one number the agency is in business for, set below the public
   * price, which is a figure an agent never quotes and cannot change. Reading a
   * page of rates meant reading the least useful number first every time.
   *
   * So: what you charge, large, because that is what goes to the customer. Then
   * the margin, given a shape of its own so it can be found by eye down a
   * column of rows rather than read. Cost sits with it because the two are one
   * thought, and the public price goes last and quiet — useful for justifying a
   * quote, never the thing being decided.
   */
  return (
    <div className={cx("text-end", compact ? "space-y-1" : "space-y-1.5")}>
      <div className={cx(compact ? "flex items-baseline justify-end gap-2" : undefined)}>
        <p className="text-muted text-[11px] font-medium uppercase tracking-wide">{t("agency.sell")}</p>
        <Money amount={sell} currency={currency} locale={locale} size="lg" className="text-xl leading-tight" />
      </div>

      {/*
        One line for the three supporting figures when space is tight.
        Stacked, they were three of the five rows setting the height of every
        row on the page; side by side they are one, and they are read together
        anyway — what it costs, what is left, and what the public would pay.
      */}
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <span
          className={cx(
            "inline-flex items-baseline gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-semibold",
            margin > 0 ? "bg-positive-50 text-positive-700" : "surface-sunken text-muted",
          )}
        >
          <span className="font-medium opacity-80">{t("agency.margin")}</span>
          <Money amount={margin} currency={currency} locale={locale} size="sm" />
        </span>
        <span className="text-muted text-xs">
          {t("agency.cost")}{" "}
          <Money amount={cost} currency={currency} locale={locale} size="sm" className="text-ink-900" />
        </span>
        {compact && publicPrice !== undefined && (
          <span className="text-muted text-[11px]">
            {t("agency.public")}{" "}
            <Money amount={publicPrice} currency={currency} locale={locale} tone="strike" size="sm" />
          </span>
        )}
      </div>

      {!compact && publicPrice !== undefined && (
        <p className="text-muted text-[11px]">
          {t("agency.public")}{" "}
          <Money amount={publicPrice} currency={currency} locale={locale} tone="strike" size="sm" />
        </p>
      )}
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
