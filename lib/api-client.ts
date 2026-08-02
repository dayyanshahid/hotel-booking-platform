import { apiCredentials, apiUrl } from "./api-origin";
import type { ApiError } from "./types";

/**
 * One call to our own API, from the browser, that cannot throw.
 *
 * Sixty-five call sites wrote this by hand:
 *
 *     const res = await fetch(apiUrl(path), { credentials: apiCredentials() });
 *     const body = (await res.json()) as { ok: boolean; data?: T };
 *
 * Three things had to be remembered every time and the third never was. The
 * address, because the portals are separate deployments and a bare path
 * resolves to whichever front end is rendering. The cookie, because a
 * cross-origin request sends none by default. And the failure — a fetch that
 * rejects, or a body that is not JSON because the response was an HTML error
 * page. None of these loaders caught anything, so the rejection escaped into
 * an effect, the state was never set, and the screen sat on a skeleton that
 * would never resolve. Slow and broken look identical, and only one of them
 * ends.
 *
 * The reply is deliberately the same shape those call sites already read, so
 * adopting this is deleting a line rather than rewriting a component.
 */
export interface ApiReply<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

function unreachable(): ApiError {
  return {
    category: "temporaryService",
    messageKey: "error.temporaryService",
    // Distinct from a malformed body: this one never arrived at all, which is
    // the difference between "try again" and "something is wrong with what
    // came back".
    message: "Could not reach the service",
    retryable: true,
    correlationId: "cid_offline",
    recommendedAction: "retry",
  };
}

function unreadable(): ApiError {
  return {
    category: "temporaryService",
    messageKey: "error.generic",
    message: "Unexpected response",
    retryable: true,
    correlationId: "cid_local",
    recommendedAction: "retry",
  };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiReply<T>> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: apiCredentials(),
      ...init,
    });
  } catch {
    return { ok: false, error: unreachable() };
  }

  try {
    const body = (await res.json()) as ApiReply<T>;
    // A JSON body that is not our envelope is as unusable as no body at all.
    return typeof body?.ok === "boolean" ? body : { ok: false, error: unreadable() };
  } catch {
    return { ok: false, error: unreadable() };
  }
}
