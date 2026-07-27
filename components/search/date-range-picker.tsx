"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, cx } from "@/components/ui";
import { addDays, formatDate, nightsBetween, todayIso } from "@/lib/format";
import { LOCALE_META } from "@/lib/i18n";
import type { Flexibility } from "@/lib/types";

/**
 * F-021 — accessible check-in / check-out range picker.
 *
 * Conveys selected, in-range, unavailable and today states; arrow-key
 * navigation; past dates disabled; nights count and flexible-date modes (§5.3).
 */
export function DateRangePicker({
  checkIn,
  checkOut,
  flexibility,
  onChange,
  error,
  compact,
}: {
  checkIn: string;
  checkOut: string;
  flexibility: Flexibility;
  onChange: (next: { checkIn: string; checkOut: string; flexibility: Flexibility }) => void;
  error?: string;
  compact?: boolean;
}) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => checkIn || todayIso());
  const [monthAnchor, setMonthAnchor] = useState(() => (checkIn || todayIso()).slice(0, 7));
  const boxRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const months = useMemo(() => {
    const [y, m] = monthAnchor.split("-").map(Number);
    return [0, 1].map((offset) => {
      const date = new Date(Date.UTC(y, m - 1 + offset, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }, [monthAnchor]);

  function pick(date: string) {
    if (!checkIn || (checkIn && checkOut)) {
      onChange({ checkIn: date, checkOut: "", flexibility });
      return;
    }
    if (date <= checkIn) {
      onChange({ checkIn: date, checkOut: "", flexibility });
      return;
    }
    onChange({ checkIn, checkOut: date, flexibility });
    setOpen(false);
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    // In RTL the horizontal arrows mirror with the layout.
    const rtl = LOCALE_META[locale].dir === "rtl";
    if (e.key in map) {
      e.preventDefault();
      let delta = map[e.key];
      if (rtl && (e.key === "ArrowLeft" || e.key === "ArrowRight")) delta = -delta;
      const next = addDays(cursor, delta);
      if (next >= todayIso()) {
        setCursor(next);
        setMonthAnchor(next.slice(0, 7));
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const flexOptions: { id: Flexibility; label: string }[] = [
    { id: "exact", label: t("search.flexibleExact") },
    { id: "p1", label: t("search.flexiblePlus1") },
    { id: "p3", label: t("search.flexiblePlus3") },
    { id: "p7", label: t("search.flexiblePlus7") },
  ];

  const summary =
    checkIn && checkOut
      ? `${formatDate(checkIn, locale, { day: "numeric", month: "short" })} → ${formatDate(checkOut, locale, { day: "numeric", month: "short" })} · ${nights} ${nights === 1 ? t("common.night") : t("common.nights")}`
      : checkIn
        ? `${formatDate(checkIn, locale)} → …`
        : t("common.dates");

  return (
    <div ref={boxRef} className="relative">
      <span className={cx("block text-sm font-medium", compact && "sr-only")}>{t("common.dates")}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-describedby={error ? "dates-error" : undefined}
        className={cx(
          "surface mt-1.5 min-h-11 w-full rounded-lg border px-3 text-start text-sm",
          error && "border-critical-500",
        )}
      >
        {summary}
      </button>
      {error && (
        <p id="dates-error" role="alert" className="text-critical-700 mt-1 text-xs font-medium">
          {error}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t("common.dates")}
          className="surface absolute inset-x-0 top-full z-30 mt-1 w-full rounded-lg border p-3 shadow-[var(--shadow-float)] sm:w-[560px]"
        >
          <div className="mb-2 flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const [y, m] = monthAnchor.split("-").map(Number);
                const prev = new Date(Date.UTC(y, m - 2, 1));
                if (prev >= new Date(`${todayIso().slice(0, 7)}-01T00:00:00Z`)) {
                  setMonthAnchor(prev.toISOString().slice(0, 7));
                }
              }}
              aria-label="Previous month"
            >
              <span aria-hidden className="rtl-flip">
                ‹
              </span>
            </Button>
            <p className="text-sm font-semibold">{t("a11y.calendarHelp")}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const [y, m] = monthAnchor.split("-").map(Number);
                setMonthAnchor(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7));
              }}
              aria-label="Next month"
            >
              <span aria-hidden className="rtl-flip">
                ›
              </span>
            </Button>
          </div>

          <div
            ref={gridRef}
            role="grid"
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="grid gap-4 outline-none sm:grid-cols-2"
          >
            {months.map(({ year, month }) => (
              <MonthGrid
                key={`${year}-${month}`}
                year={year}
                month={month}
                checkIn={checkIn}
                checkOut={checkOut}
                cursor={cursor}
                onPick={pick}
                onHover={setCursor}
              />
            ))}
          </div>

          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-semibold">{t("search.flexible")}</p>
            <div className="flex flex-wrap gap-2">
              {flexOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ checkIn, checkOut, flexibility: option.id })}
                  aria-pressed={flexibility === option.id}
                  className={cx(
                    "min-h-9 rounded-full border px-3 text-xs font-medium",
                    flexibility === option.id ? "bg-brand-600 border-brand-600 text-white" : "surface",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  checkIn,
  checkOut,
  cursor,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  checkIn: string;
  checkOut: string;
  cursor: string;
  onPick: (date: string) => void;
  onHover: (date: string) => void;
}) {
  const { locale } = useApp();
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startOffset = first.getUTCDay();
  const today = todayIso();

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(LOCALE_META[locale].intl, { weekday: "narrow", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 8, 1 + i)),
    ),
  );

  return (
    <div>
      <p className="mb-2 text-center text-sm font-semibold">
        {new Intl.DateTimeFormat(LOCALE_META[locale].intl, { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}
      </p>
      <div className="text-muted grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {weekdays.map((day, i) => (
          <span key={i} aria-hidden>
            {day}
          </span>
        ))}
      </div>
      <div role="rowgroup" className="mt-1 grid grid-cols-7 gap-0.5">
        {Array.from({ length: startOffset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const disabled = date < today;
          const isStart = date === checkIn;
          const isEnd = date === checkOut;
          const inRange = Boolean(checkIn && checkOut && date > checkIn && date < checkOut);
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              disabled={disabled}
              tabIndex={-1}
              aria-selected={isStart || isEnd}
              aria-current={isToday ? "date" : undefined}
              onMouseEnter={() => onHover(date)}
              onClick={() => onPick(date)}
              className={cx(
                "relative min-h-10 rounded-md text-sm",
                disabled && "text-muted cursor-not-allowed line-through opacity-40",
                !disabled && "hover:surface-sunken",
                inRange && "bg-brand-50 text-brand-900",
                (isStart || isEnd) && "bg-brand-600 font-semibold text-white",
                cursor === date && !isStart && !isEnd && "ring-2 ring-[var(--focus)]",
                isToday && !isStart && !isEnd && "font-bold underline",
              )}
            >
              {new Intl.NumberFormat(LOCALE_META[locale].intl).format(i + 1)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
