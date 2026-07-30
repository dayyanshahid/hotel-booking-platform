"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Button, Checkbox, Select } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MAX_ADULTS_PER_ROOM, MAX_CHILDREN_PER_ROOM, MAX_CHILD_AGE, MAX_ROOMS } from "@/lib/server/validate";
import type { RoomAllocation } from "@/lib/types";

/**
 * F-022 — room, adult and child allocation.
 *
 * Child ages are captured per room because they change both eligibility and
 * price; at least one adult per room is enforced (§5.3, §8.1).
 */
export function OccupancyPicker({
  rooms,
  accessibleRoom,
  onChange,
  errors,
}: {
  rooms: RoomAllocation[];
  accessibleRoom: boolean;
  onChange: (next: { rooms: RoomAllocation[]; accessibleRoom: boolean }) => void;
  errors?: Record<string, string>;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const adults = rooms.reduce((s, r) => s + r.adults, 0);
  const children = rooms.reduce((s, r) => s + r.childrenAges.length, 0);
  // "1 Children" and "1 Rooms" is how a search bar tells an agent nobody
  // proof-read it. Arabic has its own count rules, which `countLabel` owns.
  const summary = [
    `${rooms.length} ${rooms.length === 1 ? t("common.room") : t("common.rooms")}`,
    `${adults} ${adults === 1 ? t("common.adult") : t("common.adults")}`,
    ...(children ? [`${children} ${children === 1 ? t("common.child") : t("common.children")}`] : []),
  ].join(" · ");

  function update(index: number, patch: Partial<RoomAllocation>) {
    onChange({
      rooms: rooms.map((room, i) => (i === index ? { ...room, ...patch } : room)),
      accessibleRoom,
    });
  }

  const missingAge = rooms.some((r) => r.childrenAges.some((a) => a == null || Number.isNaN(a)));
  const overCapacity = rooms.some((r) => r.adults + r.childrenAges.length > 5);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="search-field"
      >
        <Icon name="users" size={20} className="search-field-icon" />
        <span className="search-field-body">
          <span aria-hidden className="search-field-label">
            {t("common.rooms")} &amp; {t("common.guests")}
          </span>
          <span className="search-field-value">{summary}</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("common.guests")}
          /*
           * Anchored to the field's end once it has a width of its own.
           *
           * `inset-x-0` is right on a phone, where the panel is the width of the
           * bar. On a desktop it pins the panel's start edge to a field that is
           * the last one in the bar and then gives it 420px to grow into, so it
           * ran sixty-four pixels past the right of a 1280 viewport: the plus
           * buttons for adults and children were off-screen and the page scrolled
           * sideways. An agent could open the picker and not add a guest.
           *
           * Logical properties, so RTL mirrors it rather than repeating the bug
           * on the other side.
           */
          className="surface hairline rise absolute inset-x-0 top-full z-30 mt-2 w-full rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-float)] sm:start-auto sm:end-0 sm:w-[420px]"
        >
          <div className="max-h-[50vh] space-y-4 overflow-y-auto">
            {rooms.map((room, index) => (
              <div key={index} className="hairline rounded-[var(--radius-control)] border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {t("common.room")} {index + 1}
                  </p>
                  {rooms.length > 1 && (
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() =>
                        onChange({ rooms: rooms.filter((_, i) => i !== index), accessibleRoom })
                      }
                    >
                      {t("search.removeRoom")}
                    </Button>
                  )}
                </div>

                <Counter
                  label={t("common.adults")}
                  value={room.adults}
                  min={1}
                  max={MAX_ADULTS_PER_ROOM}
                  onChange={(adults) => update(index, { adults })}
                />
                <Counter
                  label={t("common.children")}
                  value={room.childrenAges.length}
                  min={0}
                  max={MAX_CHILDREN_PER_ROOM}
                  onChange={(count) => {
                    const next = [...room.childrenAges];
                    while (next.length < count) next.push(8);
                    next.length = count;
                    update(index, { childrenAges: next });
                  }}
                />

                {room.childrenAges.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {room.childrenAges.map((age, childIndex) => (
                      <label key={childIndex} className="text-xs">
                        <span className="mb-1 block font-medium">
                          {t("common.child")} {childIndex + 1} — {t("search.childAge")}
                        </span>
                        <Select
                          value={String(age)}
                          onChange={(e) => {
                            const next = [...room.childrenAges];
                            next[childIndex] = Number(e.target.value);
                            update(index, { childrenAges: next });
                          }}
                          className="!min-h-10"
                        >
                          {Array.from({ length: MAX_CHILD_AGE + 1 }, (_, a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {rooms.length < MAX_ROOMS ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => onChange({ rooms: [...rooms, { adults: 2, childrenAges: [] }], accessibleRoom })}
            >
              + {t("search.addRoom")}
            </Button>
          ) : (
            <p className="text-muted mt-3 text-xs">{t("search.tooManyRooms")}</p>
          )}

          <div className="mt-4 border-t pt-3">
            <Checkbox
              checked={accessibleRoom}
              onChange={(e) => onChange({ rooms, accessibleRoom: e.target.checked })}
              label={t("search.accessible")}
              description={t("search.accessibleHint")}
            />
          </div>

          {missingAge && (
            <div className="mt-3">
              <Alert tone="warning">{t("search.childAgeMissing")}</Alert>
            </div>
          )}
          {overCapacity && (
            <div className="mt-3">
              <Alert tone="info">{t("search.capacityWarning")}</Alert>
            </div>
          )}
          {errors?.rooms && (
            <div className="mt-3">
              <Alert tone="critical">{errors.rooms}</Alert>
            </div>
          )}

          <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
            {t("common.done")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`${label} −`}
          className="size-10 rounded-full border text-lg disabled:opacity-40"
        >
          −
        </button>
        <span aria-live="polite" className="w-6 text-center text-sm font-semibold">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`${label} +`}
          className="size-10 rounded-full border text-lg disabled:opacity-40"
        >
          +
        </button>
      </span>
    </div>
  );
}
