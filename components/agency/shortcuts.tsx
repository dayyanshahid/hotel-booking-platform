"use client";

import { useEffect } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Drawer } from "@/components/ui";

/**
 * The keyboard, for people who work at one.
 *
 * An agent on a call types quickly and clicks slowly, and every one of these
 * replaces a hunt across the screen with a key. There are deliberately few of
 * them: a large scheme nobody can remember is worse than four somebody does,
 * and every extra binding is another chance to steal a key from a text field.
 *
 * They are all single, unmodified keys, which only works because of the guard
 * below. Getting that wrong is the classic version of this bug — an agent types
 * "Sofitel" into the hotel-name filter, the `f` is swallowed as a shortcut, and
 * the field quietly receives "Sotel".
 */
export interface Shortcut {
  /** The key as `event.key` reports it. */
  key: string;
  /** What it does, from the `agency.shortcut*` strings. */
  labelKey:
    | "agency.shortcutSearch"
    | "agency.shortcutFilters"
    | "agency.shortcutCompare"
    | "agency.shortcutClose"
    | "agency.shortcutHelp";
  run: () => void;
}

/** Whether the keystroke belongs to whatever the person is typing into. */
export function isTyping(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Whether this keystroke is one of ours.
 *
 * Pulled out as a rule of its own, and duck-typed rather than written against
 * `KeyboardEvent` and `HTMLElement`, because it is the whole feature: get it
 * wrong and an agent typing "Sofitel" into the hotel-name filter has the `f`
 * swallowed as a shortcut and the field quietly receives "Sotel". A rule that
 * can be stated on its own can be tested on its own, and this one is worth
 * testing far more than the `addEventListener` around it.
 *
 * Modified keystrokes are never ours: ⌘F, ⌘K and ctrl-anything belong to the
 * browser or the operating system, and a portal that eats the browser's own
 * find is a portal an agent fights.
 */
export function claimsKeystroke(
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  target: { tagName?: string; isContentEditable?: boolean } | null,
  keys: readonly string[],
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTyping(target)) return false;
  return keys.includes(event.key);
}

/**
 * Bind the shortcuts while the screen is mounted.
 *
 * Deliberately without a dependency array: `run` closes over state that
 * changes every render, and a listener bound once would act on whatever the
 * page looked like when it mounted.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (!claimsKeystroke(event, target, shortcuts.map((s) => s.key))) return;
      const match = shortcuts.find((s) => s.key === event.key);
      if (!match) return;
      event.preventDefault();
      match.run();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
}

/**
 * What the keys do, on demand.
 *
 * A shortcut nobody knows about is dead weight, and a permanently visible
 * legend is clutter on a screen that is already dense. `?` is the convention
 * and it is announced once, quietly, under the results.
 */
export function ShortcutsCard({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}) {
  const { t } = useApp();
  return (
    <Drawer open={open} onClose={onClose} title={t("agency.shortcuts")}>
      <dl className="divide-y divide-[var(--border)]">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.key} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm">{t(shortcut.labelKey)}</dt>
            <dd>
              <kbd className="surface-sunken hairline rounded-[var(--radius-control)] border px-2 py-1 font-mono text-xs">
                {shortcut.key === "Escape" ? "Esc" : shortcut.key}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Drawer>
  );
}
