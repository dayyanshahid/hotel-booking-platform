import { NextResponse } from "next/server";
import type { ApiError, ErrorCategory, Locale } from "../types";
import { createTranslator, isLocale } from "../i18n";
import { isServerless } from "./runtime";

/**
 * Platform-standard envelope (§9.4): every endpoint returns an error category,
 * a customer-safe message key, retryability, a correlation ID and the
 * recommended UI action. Supplier text never appears here.
 */

export function correlationId(): string {
  return `cid_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

const ACTION_BY_CATEGORY: Record<ErrorCategory, ApiError["recommendedAction"]> = {
  validation: "editInput",
  availabilityChanged: "selectAlternative",
  paymentActionNeeded: "changeMethod",
  bookingProcessing: "wait",
  temporaryService: "retry",
  accountSecurity: "authenticate",
  policyRestriction: "contactSupport",
};

export function localeFrom(req: Request): Locale {
  const url = new URL(req.url);
  const q = url.searchParams.get("locale");
  if (isLocale(q ?? undefined)) return q as Locale;
  const header = req.headers.get("x-locale");
  if (isLocale(header ?? undefined)) return header as Locale;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/nz_locale=(en|ar)/);
  if (match) return match[1] as Locale;
  return "en";
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  category: ErrorCategory,
  messageKey: string,
  locale: Locale,
  options: {
    status?: number;
    retryable?: boolean;
    action?: ApiError["recommendedAction"];
    fields?: Record<string, string>;
    message?: string;
  } = {},
) {
  const t = createTranslator(locale);
  const error: ApiError = {
    category,
    messageKey,
    message: options.message ?? t(messageKey),
    retryable: options.retryable ?? category === "temporaryService",
    correlationId: correlationId(),
    recommendedAction: options.action ?? ACTION_BY_CATEGORY[category],
    fields: options.fields,
  };
  return NextResponse.json({ ok: false, error }, { status: options.status ?? 400 });
}

/**
 * A booking that cannot be found.
 *
 * On a serverless deployment the demo store is process-local, so a booking made
 * on another instance genuinely is not visible here. Saying that plainly beats a
 * bare "not found", which would read as data loss (§11.3: explain uncertainty).
 */
export function notFoundOrDemoState(locale: Locale) {
  const key = isServerless ? "error.demoStateLost" : "error.notFound";
  return fail("validation", key, locale, { status: 404, action: "editInput" });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Sanitize free text before it is stored or echoed back (§8.5). */
export function sanitize(input: unknown, maxLength = 500): string {
  if (typeof input !== "string") return "";
  return input.replace(/[<>]/g, "").slice(0, maxLength).trim();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
