import "server-only";
import { randomUUID } from "node:crypto";
import { getTourmindConfig } from "./config";
import type { TmError, TmRequestHeader } from "./types";
import type { ApiError } from "@/lib/types";

/**
 * The TourMind transport.
 *
 * Two things differ from every other supplier here and both are handled once,
 * in this file, so no caller has to remember them.
 *
 * Authentication is in the request *body*, not a header — `RequestHeader`
 * carries the password on every call. That means the payload must never be
 * logged, and it is why `getTourmindConfig` defaults to HTTPS even though the
 * published test host is plain HTTP.
 *
 * Errors arrive with HTTP 200. A failed call returns `{ Error: { ErrorCode } }`
 * in an otherwise successful response, so `ok` cannot be trusted on its own.
 */

/**
 * Their error codes onto ours.
 *
 * 101/102/103 are malformed or invalid requests — our bug, and the customer
 * sees a validation message. 104 is their service failing, which is temporary
 * from the traveller's point of view. 105 is bad credentials: nothing the
 * traveller did and nothing they can fix, so it degrades to the same temporary
 * message rather than exposing an account problem to them (§9.4).
 */
const CATEGORY: Record<string, ApiError["category"]> = {
  "101": "validation",
  "102": "validation",
  "103": "validation",
  "104": "temporaryService",
  "105": "temporaryService",
};

function requestHeader(): TmRequestHeader {
  const config = getTourmindConfig();
  return {
    AgentCode: config.agentCode,
    UserName: config.userName,
    Password: config.password,
    RequestTime: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z"),
    TransactionID: randomUUID(),
  };
}

export class TourmindError extends Error {
  readonly category: ApiError["category"];
  readonly code: string;
  constructor(category: ApiError["category"], code: string, message: string) {
    super(message);
    this.name = "TourmindError";
    this.category = category;
    this.code = code;
  }
}

/**
 * POST a TMS endpoint and return its parsed body.
 *
 * `RequestHeader` is injected here rather than by callers: a call that forgets
 * it fails with an auth error that looks like bad credentials, which is an
 * expensive thing to debug.
 */
export async function tourmindPost<T extends { Error?: TmError }>(
  path: string,
  body: Record<string, unknown>,
  kind: "search" | "prebook" | "booking" | "catalogue" = "search",
): Promise<T> {
  const config = getTourmindConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeouts[kind]);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Sent alongside the body credentials, per their authorization section.
        "X-Agent-Code": config.agentCode,
        "X-Username": config.userName,
        "accept-encoding": "gzip",
      },
      body: JSON.stringify({ ...body, RequestHeader: requestHeader() }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    throw new TourmindError(
      "temporaryService",
      aborted ? "TIMEOUT" : "NETWORK",
      aborted ? "The supplier did not respond in time." : "The supplier could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new TourmindError(
      "temporaryService",
      String(response.status),
      `Supplier returned HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as T;

  // A TMS failure is an HTTP 200 with an Error object, so this check is the
  // real one — `response.ok` above only catches transport-level failures.
  if (payload?.Error?.ErrorCode) {
    const code = String(payload.Error.ErrorCode);
    throw new TourmindError(
      CATEGORY[code] ?? "temporaryService",
      code,
      payload.Error.ErrorMessage || "The supplier rejected the request.",
    );
  }

  return payload;
}

/** Endpoint paths, in one place so a version bump is a single edit. */
export const TM = {
  search: "/v2/HotelDetail",
  prebook: "/v2/CheckRoomRate",
  book: "/v2/CreateOrder",
  cancel: "/v2/CancelOrder",
  retrieve: "/v2/SearchOrder",
  hotels: "/v2/HotelStaticList",
} as const;

/*
 * `/v2/RegionList` and `/v2/RoomStaticList` were listed here and never called.
 *
 * A map of endpoints reads as a statement of what the integration does, and
 * two entries nothing reaches say we consume more of their API than we do —
 * which is the kind of thing that gets believed during an audit. Neither is
 * needed: destinations resolve from our own geography, and hotel photography
 * and descriptions already arrive on HotelStaticList.
 *
 * They are exercised by scripts/supplier-conformance.ts, which holds their
 * paths and their request shapes, so switching one on later starts from a
 * verified call rather than from their documentation.
 */
