import type { ApiError, ErrorCategory, Locale } from "@/lib/types";
import { HotelbedsError } from "./client";
import { recordIncident } from "../incidents";

/**
 * Supplier failure → platform error taxonomy (§10.1).
 *
 * The customer never sees a supplier code, a supplier message or the supplier's
 * name. Each failure becomes one of the seven customer-safe categories with a
 * recommended action, and the supplier's own code survives only in the server
 * log line for support.
 */
export interface MappedSupplierError {
  category: ErrorCategory;
  messageKey: string;
  message: string;
  status: number;
  action: ApiError["recommendedAction"];
  retryable: boolean;
  /** Server-side only. */
  logDetail: string;
}

export function mapSupplierError(error: unknown, locale: Locale): MappedSupplierError {
  const ar = locale === "ar";
  const hb = error instanceof HotelbedsError ? error : null;
  const logDetail = hb
    ? `hotelbeds:${hb.kind}${hb.supplierCode ? `:${hb.supplierCode}` : ""}${hb.status ? `:${hb.status}` : ""}`
    : `hotelbeds:unknown:${error instanceof Error ? error.name : "error"}`;

  switch (hb?.kind) {
    case "auth":
    case "quotaExceeded":
      // A credential or allowance problem is ours, not the customer's: it reads
      // as a temporary service issue and never mentions keys or quotas.
      return {
        category: "temporaryService",
        messageKey: "error.temporaryService",
        message: ar
          ? "تعذّر تحميل بعض الخيارات الآن. حاول مرة أخرى بعد قليل."
          : "Some options could not load right now. Please try again shortly.",
        status: 503,
        action: "retry",
        retryable: true,
        logDetail,
      };

    case "rateLimited":
    case "network":
    case "timeout":
      return {
        category: "temporaryService",
        messageKey: "error.temporaryService",
        message: ar
          ? "استغرقت الاستجابة وقتًا أطول من المعتاد. حاول مرة أخرى."
          : "That took longer than expected. Please try again.",
        status: 503,
        action: "retry",
        retryable: true,
        logDetail,
      };

    case "invalidRequest":
      return {
        category: "availabilityChanged",
        messageKey: "error.availabilityChanged",
        message: ar
          ? "تغيّر هذا الخيار أو لم يعد متاحًا لنفس التواريخ وعدد الضيوف."
          : "This option changed or is no longer available for the same dates and occupancy.",
        status: 409,
        action: "selectAlternative",
        retryable: false,
        logDetail,
      };

    case "supplierError":
    default:
      return {
        category: "availabilityChanged",
        messageKey: "error.availabilityChanged",
        message: ar
          ? "لم يعد هذا الخيار متاحًا. اختر بديلًا قريبًا."
          : "That option is no longer available. Choose one of the alternatives.",
        status: 409,
        action: "selectAlternative",
        retryable: false,
        logDetail,
      };
  }
}

/**
 * Structured, PII-free server log for a supplier failure (§12.3).
 *
 * Also mirrored into the in-process incident feed so the operator console can
 * answer "is this supplier having a bad hour" without anyone opening a log
 * aggregator. The console copy is lossy; this one is the durable record.
 */
export function logSupplierError(operation: string, error: unknown, correlationId: string): void {
  const mapped = mapSupplierError(error, "en");
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "error",
      operation,
      correlationId,
      detail: mapped.logDetail,
      retryable: mapped.retryable,
    }),
  );
  recordIncident({
    supplier: "hotelbeds",
    operation,
    kind: error instanceof HotelbedsError ? error.kind : "unknown",
    detail: mapped.logDetail,
    reference: correlationId,
  });
}
