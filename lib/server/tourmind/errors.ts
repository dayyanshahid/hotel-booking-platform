import { TourmindError } from "./client";
import { recordIncident } from "../incidents";
import type { ApiError, Locale } from "@/lib/types";

/**
 * Supplier failures as something a customer can act on.
 *
 * Nothing here passes a supplier message through: their strings are Chinese or
 * English depending on the endpoint, they name internal systems, and they are
 * not written for a traveller (§9.4). The category decides what the UI says.
 */

export interface MappedSupplierError {
  category: ApiError["category"];
  messageKey: string;
  message: string;
  status: number;
  retryable: boolean;
  /**
   * What the customer should do next.
   *
   * Typed to the union the API actually accepts rather than to `string`, which
   * is why it used to be dropped at every call site: a loose type would not
   * assign to `fail()`, so the recommended action was quietly left off and the
   * UI fell back to a generic retry — including for a sold-out room, where
   * retrying is the one thing that cannot work.
   */
  action?: ApiError["recommendedAction"];
}

export function mapTourmindError(error: unknown, locale: Locale): MappedSupplierError {
  const ar = locale === "ar";
  const category =
    error instanceof TourmindError ? error.category : ("temporaryService" as const);

  if (category === "availabilityChanged") {
    // Their answer is that the room has gone. The customer's next move is a
    // different room, not the same one again in a minute.
    return {
      category,
      messageKey: "error.availabilityChanged",
      message: ar
        ? "لم يعد هذا الخيار متاحًا. لم يُخصم أي مبلغ — اختر غرفة أخرى."
        : "This option is no longer available. Nothing has been charged — please choose another room.",
      status: 409,
      action: "selectAlternative",
      retryable: false,
    };
  }

  if (category === "validation") {
    return {
      category,
      messageKey: "error.validation",
      message: ar
        ? "تعذّر إتمام الطلب بهذه التفاصيل. راجع التواريخ وعدد الضيوف ثم حاول مجددًا."
        : "That request could not be completed with these details. Check the dates and guests, then try again.",
      status: 400,
      retryable: false,
    };
  }

  return {
    category: "temporaryService",
    messageKey: "error.temporaryService",
    message: ar
      ? "المورد لا يستجيب حاليًا. لم يتم خصم أي مبلغ — حاول مرة أخرى بعد قليل."
      : "The supplier is not responding right now. Nothing has been charged — please try again shortly.",
    status: 503,
    retryable: true,
  };
}

/**
 * True when a failure leaves the booking's fate unknown.
 *
 * A timeout or a dropped connection may have created the order. Treating that
 * as a failure risks a customer booking twice; it becomes pending instead, and
 * reconciliation resolves it (E-16).
 */
export function isIndeterminate(error: unknown): boolean {
  if (error instanceof Error && error.message === "TOURMIND_INDETERMINATE") return true;
  return (
    error instanceof TourmindError && (error.code === "TIMEOUT" || error.code === "NETWORK")
  );
}

/**
 * Logs without the request body — it carries the account password.
 *
 * Mirrored into the console's incident feed for the same reason as the
 * Hotelbeds logger: a duty operator should not need a log aggregator to see
 * that an integration is failing.
 */
export function logTourmindError(scope: string, error: unknown, reference?: string): void {
  const code = error instanceof TourmindError ? error.code : "UNKNOWN";
  console.error(
    JSON.stringify({
      at: "tourmind",
      scope,
      code,
      reference,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  recordIncident({
    supplier: "tourmind",
    operation: scope,
    kind: String(code),
    // The message may name an endpoint; it never carries the request body.
    detail: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    reference,
  });
}
