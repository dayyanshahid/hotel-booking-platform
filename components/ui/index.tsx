"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon, StarRow } from "./icons";
import { mediaSrcSet, mediaUrl } from "@/lib/api-origin";

/**
 * Design-system primitives (§7.1).
 * Every screen composes from here; no isolated styling where a component exists.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "action" | "secondary" | "chrome" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

// The press is a 1% scale rather than a colour flip: it registers on touch,
// where there is no hover state to fall back on.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-bold " +
  "transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-[var(--ease-out)] " +
  "active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  /** The everyday blue: search, submit, confirm. */
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  /**
   * Reserved for the one control that moves a booking forward on a given
   * screen — "Show prices", "Reserve". It appears once per card and once per
   * page, which is the only reason a colour this loud stays useful.
   */
  action: "bg-action-400 text-[var(--color-action-ink)] hover:bg-action-500",
  // Border stays brand-500: a non-text boundary needs 3:1 and clears it. The
  // label is normal-size text and needs 4.5:1, which only brand-700 gives.
  secondary: "surface border border-brand-500 text-brand-700 hover:bg-brand-50",
  /** For controls sitting on the navy chrome band, where blue-on-navy vanishes. */
  chrome: "border border-white/40 text-white hover:bg-white/15",
  ghost: "hover:surface-sunken font-semibold",
  danger: "bg-critical-500 text-white hover:bg-critical-700",
  quiet: "text-brand-700 hover:underline underline-offset-2 decoration-2 font-semibold",
};

// 44×44 minimum touch target on interactive controls (§11.1).
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-6 text-base w-full sm:w-auto",
};

/**
 * A button does not submit anything unless it says it does.
 *
 * HTML defaults a `<button>` inside a form to `type="submit"`, and this
 * component passed that default straight through. Every button in the occupancy
 * picker and the date picker therefore submitted the search bar: an agent
 * clicking "+ Add room" ran a search for a room they had not finished
 * describing, the panel closed under them, and the results were for the
 * allocation *before* the edit. "Remove room", "Done" and the date presets did
 * the same thing.
 *
 * `submit` is the rarer intent and the more expensive one to get wrong, so it is
 * the one that has to be asked for. An explicit `type` still wins — both real
 * submit buttons in the app pass it, and are unaffected.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={props.disabled || loading}
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    >
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}

/* --------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  as: As = "div",
  ref,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <As
      // The polymorphic `as` prop makes the element type dynamic; the ref is
      // always attached to the rendered element regardless of which tag it is.
      ref={ref as never}
      className={cx("surface rounded-[var(--radius-card)] border", className)}
    >
      {children}
    </As>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  id,
  level = "page",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
  /**
   * "page" heads a whole section of the page; "card" heads a group inside a
   * card, where the page-level size would out-shout the card's own content.
   */
  level?: "page" | "card";
}) {
  const page = level === "page";
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-3", page ? "mb-5" : "mb-4")}>
      <div>
        <h2
          id={id}
          className={cx(
            "font-semibold",
            page ? "text-xl tracking-[-0.02em] sm:text-[26px]" : "text-base tracking-[-0.01em] sm:text-lg",
          )}
        >
          {title}
        </h2>
        {description && <p className="text-muted mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- Badge */

type BadgeTone = "neutral" | "brand" | "positive" | "caution" | "critical" | "sand";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "surface-sunken text-[var(--text-muted)] border-[var(--border)]",
  brand: "bg-brand-50 text-brand-800 border-brand-200",
  positive: "bg-positive-50 text-positive-700 border-positive-100",
  caution: "bg-caution-50 text-caution-700 border-caution-100",
  critical: "bg-critical-50 text-critical-700 border-critical-100",
  sand: "bg-sand-50 text-sand-700 border-sand-200",
};

/** Badges carry text plus tone — never colour alone (§11.2). */
export function Badge({
  tone = "neutral",
  children,
  icon,
  title,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Alert */

export function Alert({
  tone = "info",
  title,
  children,
  action,
  correlationId,
}: {
  tone?: "info" | "success" | "warning" | "critical";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  correlationId?: string;
}) {
  const tones = {
    info: "bg-brand-50 border-brand-200 text-brand-900",
    success: "bg-positive-50 border-positive-100 text-positive-700",
    warning: "bg-caution-50 border-caution-100 text-caution-700",
    critical: "bg-critical-50 border-critical-100 text-critical-700",
  } as const;
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cx("rounded-[var(--radius-card)] border p-4 text-sm", tones[tone])}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx("wrap-anywhere", title && "mt-1")}>{children}</div>}
      {correlationId && (
        <p className="mt-2 font-mono text-xs opacity-80">{correlationId}</p>
      )}
      {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- Skeleton */

/** Skeletons match the final geometry so nothing shifts on load (§11.2). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("shimmer rounded-[10px]", className)} />;
}

export function EmptyState({
  title,
  body,
  actions,
  icon,
  art,
  standalone = false,
}: {
  title: string;
  body?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  /** Spot illustration — decorative; the heading carries the meaning. */
  art?: ReactNode;
  /**
   * True when this *is* the page — a signed-out account, an empty saved list.
   * It then centres in the space the page would otherwise leave blank, instead
   * of sitting at the top with a void beneath it.
   *
   * Leave false when the empty state sits inside a populated page (an empty
   * section of a list, a room list with no availability): reserving half a
   * viewport there would push the content that follows off the screen.
   */
  standalone?: boolean;
}) {
  // Constrained rather than full-bleed: centred text stranded across a wide
  // card reads as a layout failure, not as a designed empty state.
  const card = (
    <Card className="mx-auto w-full max-w-xl px-6 py-12 text-center">
      {art && <div className="mb-5 flex justify-center">{art}</div>}
      {icon && <div className="mb-4 flex justify-center">{icon}</div>}
      <h3 className="text-lg font-semibold tracking-[-0.015em]">{title}</h3>
      {body && <p className="text-muted mx-auto mt-2 max-w-sm text-sm leading-relaxed">{body}</p>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </Card>
  );

  if (!standalone) return card;
  return <div className="flex min-h-[52vh] items-center justify-center py-4">{card}</div>;
}

/* ------------------------------------------------------------- Fields */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  /** Text, or a node when a label needs to carry a badge alongside it. */
  label: ReactNode;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {/* Labels are persistent, never placeholder-only (§11.2). */}
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden className="text-critical-500"> *</span>}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-critical-700 text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "surface min-h-10 w-full rounded-[var(--radius-control)] border-2 px-3 py-2 text-sm outline-none " +
  "transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] " +
  "placeholder:text-[var(--text-muted)] focus:border-brand-500 focus:shadow-[0_0_0_4px_var(--ring)]";

export function Input({
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={error || undefined}
      className={cx(CONTROL, error && "border-critical-500", className)}
    />
  );
}

export function Select({
  error,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={error || undefined}
      className={cx(CONTROL, error && "border-critical-500", className)}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        {...props}
        id={props.id ?? id}
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-[var(--focus)]"
      />
      <label htmlFor={props.id ?? id} className="text-sm leading-6">
        {label}
        {description && <span className="text-muted block text-xs">{description}</span>}
      </label>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2 text-sm"
    >
      <span
        className={cx(
          "relative inline-block h-6 w-11 rounded-full transition-colors",
          checked ? "bg-brand-600" : "surface-sunken border",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "start-[22px]" : "start-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------ Overlays */

/** Modal with focus trapping, Escape handling and scroll lock. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissible = true,
  labelClose = "Close",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
  labelClose?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    node?.querySelector<HTMLElement>("[data-autofocus], button, [href], input, select, textarea")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) onClose();
      if (e.key !== "Tab" || !node) return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose, dismissible]);

  // Overlays always start closed, so rendering nothing during SSR cannot cause
  // a hydration mismatch and no mount flag is needed.
  if (!open || typeof document === "undefined") return null;

  const widths = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" };

  return createPortal(
    <div className="scrim fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "surface rise max-h-[92vh] w-full overflow-y-auto rounded-t-[var(--radius-sheet)]",
          "shadow-[var(--shadow-float)] sm:rounded-[var(--radius-sheet)]",
          widths[size],
        )}
      >
        <div className="surface-blur hairline sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
          {dismissible && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={labelClose}>
              <Icon name="close" />
            </Button>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="surface-blur hairline sticky bottom-0 border-t px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Bottom sheet on small screens, side drawer from large (§11.1). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = "end",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: "start" | "end";
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="scrim fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "surface rise flex max-h-[88vh] w-full flex-col rounded-t-[var(--radius-sheet)]",
          "shadow-[var(--shadow-float)] sm:max-h-none sm:w-[420px] sm:rounded-none",
          side === "start" && "sm:me-auto",
        )}
      >
        <div className="hairline flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------- Disclosure */

export function Accordion({
  items,
  className,
}: {
  items: { id: string; title: ReactNode; content: ReactNode; defaultOpen?: boolean }[];
  className?: string;
}) {
  return (
    <div className={cx("divide-y rounded-[var(--radius-card)] border", className)}>
      {items.map((item) => (
        <details key={item.id} open={item.defaultOpen} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>{item.title}</span>
            <Icon name="chevronDown" size={16} className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="text-muted wrap-anywhere px-4 pb-4 text-sm">{item.content}</div>
        </details>
      ))}
    </div>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Checkout progress">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cx(
                "grid size-6 place-items-center rounded-full border text-xs font-semibold",
                state === "done" && "bg-positive-500 border-positive-500 text-white",
                state === "current" && "bg-brand-600 border-brand-600 text-white",
                state === "todo" && "surface-sunken text-[var(--text-muted)]",
              )}
            >
              {state === "done" ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cx(state === "current" ? "font-semibold" : "text-muted")}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <Icon name="chevronRight" size={14} className="text-muted rtl-flip" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    // A segmented control rather than an underline: the selected tab is a solid
    // shape, which survives being scrolled half out of view on a narrow screen.
    <div
      role="tablist"
      aria-label={label}
      className="surface-sunken scrollbar-slim inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-pill)] p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            "min-h-9 whitespace-nowrap rounded-[var(--radius-pill)] px-4 text-sm font-medium",
            "transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out)]",
            // The raised pill carries the emphasis, so the label just takes the
            // normal text colour — correct in both themes without an override.
            active === tab.id
              ? "surface text-[var(--text)] shadow-[var(--shadow-card)]"
              : "text-muted hover:text-[var(--text)]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Ratings */

/**
 * A qualitative word for a score out of ten.
 *
 * "7.9" is hard to place — out of what, and is that good? The word does the
 * placing, and it is also what a screen reader announces first. Bands are
 * conservative: nothing below 7 gets a compliment.
 */
export type ScoreBand =
  | "score.exceptional"
  | "score.excellent"
  | "score.veryGood"
  | "score.good"
  | "score.pleasant"
  | "score.rated";

export function scoreBand(score: number, scale: number): ScoreBand {
  const pct = (score / scale) * 10;
  if (pct >= 9) return "score.exceptional";
  if (pct >= 8.5) return "score.excellent";
  if (pct >= 8) return "score.veryGood";
  if (pct >= 7) return "score.good";
  if (pct >= 6) return "score.pleasant";
  return "score.rated";
}

export function Rating({
  score,
  scale,
  count,
  source,
  label,
  word,
  compact = false,
}: {
  score: number;
  scale: number;
  count: number;
  source: string;
  label: string;
  /** Localized qualitative band — pass `t(scoreBand(score, scale))`. */
  word?: string;
  /** Badge and word only — for dense rows where the source line does not fit. */
  compact?: boolean;
}) {
  const band = word ?? scoreBand(score, scale);
  return (
    <div className="flex items-center gap-2">
      {/*
        Score first in the DOM but visually last on wide rows is a trick that
        breaks reading order, so the badge simply sits first in both.
      */}
      <span className="score-badge grid min-h-8 min-w-8 place-items-center rounded-[var(--radius-control)] rounded-bs-none px-1.5 text-sm font-bold">
        {score.toFixed(1)}
      </span>
      <span className="text-xs leading-tight">
        <span className="sr-only">{label}</span>
        <span aria-hidden className="block font-bold">
          {band}
        </span>
        {!compact && (
          <span aria-hidden className="text-muted block">
            {count.toLocaleString()} · {source}
          </span>
        )}
      </span>
    </div>
  );
}

export function Stars({ count, label }: { count: number; label: string }) {
  return (
    <span className="text-sand-500 inline-flex items-center" title={label}>
      <span className="sr-only">{label}</span>
      <StarRow count={count} />
    </span>
  );
}

/* --------------------------------------------------------------- Image */

/**
 * Fixed aspect ratio with a branded fallback so a missing asset never breaks the
 * layout (E-06). Plain <img> keeps the SVG endpoint and CSP simple.
 */
export function Photo({
  src,
  srcSet,
  sizes,
  fallbackSrc,
  alt,
  ratio = "4/3",
  className,
  priority = false,
  fallbackLabel,
  fill = false,
}: {
  src?: string;
  /** Width descriptors for the same photo, so the browser fetches one that fits (§12.2). */
  srcSet?: string;
  /** Rendered width of this slot, needed for `srcSet` to be useful. */
  sizes?: string;
  /**
   * Drawn instead if `src` cannot load — the local SVG illustrator, so a blocked
   * or offline image CDN degrades to artwork rather than to an empty box.
   */
  fallbackSrc?: string;
  alt: string;
  ratio?: string;
  className?: string;
  priority?: boolean;
  fallbackLabel: string;
  /** Fills the parent box instead of reserving an aspect ratio of its own. */
  fill?: boolean;
}) {
  // 0 = the photo, 1 = the illustrated fallback, 2 = nothing loadable.
  const [stage, setStage] = useState(0);
  /*
   * Sent to the API's origin, not to whichever front end is rendering.
   *
   * Both of these arrive from the backend as `/api/image/...`, which is correct
   * on the consumer site and points at nothing on the separated portal. Done
   * here because this is the one component every photograph goes through: a
   * card, a gallery, a map bubble and a voucher all reach the browser from it,
   * and fixing it at each call site is how three of them would stay broken.
   */
  const chosen = mediaUrl(stage === 0 ? src : stage === 1 ? fallbackSrc : undefined);
  return (
    <div
      className={cx("surface-sunken relative overflow-hidden", fill && "size-full", className)}
      // An aspect ratio reserves space and prevents layout shift; a filled photo
      // takes its size from the parent instead, so the two must not combine.
      style={fill ? undefined : { aspectRatio: ratio }}
    >
      {chosen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={stage}
          src={chosen}
          srcSet={stage === 0 ? mediaSrcSet(srcSet) : undefined}
          sizes={stage === 0 ? sizes : undefined}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setStage((s) => (s === 0 && fallbackSrc ? 1 : 2))}
          className="size-full object-cover"
        />
      ) : (
        <div className="text-muted grid size-full place-items-center bg-[linear-gradient(135deg,var(--surface-sunken),var(--surface-muted))] p-3 text-center text-xs">
          {fallbackLabel}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Toast */

export function ToastStack({
  toasts,
}: {
  toasts: { id: string; message: string; tone: "info" | "success" | "critical" }[];
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cx(
            "pointer-events-auto rounded-[var(--radius-pill)] px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-float)]",
            toast.tone === "critical" ? "bg-critical-700" : toast.tone === "success" ? "bg-positive-700" : "bg-ink-900",
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/** Screen-reader announcements for result, price and status changes (§12.1). */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
