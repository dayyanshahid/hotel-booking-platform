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

/**
 * Design-system primitives (§7.1).
 * Every screen composes from here; no isolated styling where a component exists.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-[var(--border-strong)] surface hover:surface-sunken",
  ghost: "hover:surface-sunken",
  danger: "bg-critical-500 text-white hover:bg-critical-700",
  quiet: "text-brand-700 hover:underline underline-offset-4",
};

// 44×44 minimum touch target on interactive controls (§11.1).
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-6 text-base w-full sm:w-auto",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
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
      className={cx("surface rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]", className)}
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold sm:text-xl">
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
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
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
  return <div aria-hidden className={cx("surface-sunken shimmer rounded-md", className)} />;
}

export function EmptyState({
  title,
  body,
  actions,
  icon,
}: {
  title: string;
  body?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-8 text-center">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="text-muted mx-auto mt-2 max-w-md text-sm">{body}</p>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </Card>
  );
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
  label: string;
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
  "surface min-h-11 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500";

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "surface max-h-[92vh] w-full overflow-y-auto rounded-t-2xl shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]",
          widths[size],
        )}
      >
        <div className="surface sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {dismissible && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={labelClose}>
              ✕
            </Button>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="surface sticky bottom-0 border-t px-5 py-4">{footer}</div>}
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-stretch sm:justify-end">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "surface flex max-h-[88vh] w-full flex-col rounded-t-2xl shadow-[var(--shadow-float)] sm:max-h-none sm:w-[420px] sm:rounded-none",
          side === "start" && "sm:me-auto",
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
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
            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
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
              {state === "done" ? "✓" : i + 1}
            </span>
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cx(state === "current" ? "font-semibold" : "text-muted")}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="text-muted rtl-flip">
                ›
              </span>
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
    <div role="tablist" aria-label={label} className="scrollbar-slim flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            "min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium",
            active === tab.id ? "border-brand-600 text-brand-800" : "text-muted border-transparent",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Ratings */

export function Rating({
  score,
  scale,
  count,
  source,
  label,
}: {
  score: number;
  scale: number;
  count: number;
  source: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-brand-700 rounded-md px-2 py-1 text-sm font-bold text-white">
        {score.toFixed(1)}
      </span>
      <span className="text-muted text-xs">
        <span className="sr-only">{label}</span>
        <span aria-hidden>
          / {scale} · {count.toLocaleString()} · {source}
        </span>
      </span>
    </div>
  );
}

export function Stars({ count, label }: { count: number; label: string }) {
  return (
    <span className="text-sand-500 text-xs" title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>{"★".repeat(count)}</span>
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
  alt,
  ratio = "4/3",
  className,
  priority = false,
  fallbackLabel,
  fill = false,
}: {
  src?: string;
  alt: string;
  ratio?: string;
  className?: string;
  priority?: boolean;
  fallbackLabel: string;
  /** Fills the parent box instead of reserving an aspect ratio of its own. */
  fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cx("surface-sunken relative overflow-hidden", fill && "size-full", className)}
      // An aspect ratio reserves space and prevents layout shift; a filled photo
      // takes its size from the parent instead, so the two must not combine.
      style={fill ? undefined : { aspectRatio: ratio }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
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
            "pointer-events-auto rounded-lg px-4 py-2 text-sm text-white shadow-[var(--shadow-float)]",
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
