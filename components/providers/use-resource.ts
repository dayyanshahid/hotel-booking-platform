"use client";

import { useCallback, useEffect, useState } from "react";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

/**
 * Read something from the API, and be honest about all three outcomes.
 *
 * Every loader in this app was written the same way and got the same two
 * things wrong. The fetch was not wrapped, so a request that never completed
 * — no network, the origin refusing a cross-site call — rejected inside an
 * effect and left the screen on a skeleton that would never resolve; slow and
 * broken look identical, and only one of them ends. And a refusal was folded
 * into the empty case with `body.ok ? body.data.x : []`, so a 401 or a 500
 * rendered as "you have no quotes" — an answer, confidently wrong, about
 * somebody's own money.
 *
 * There are three states and they are not two. Loading is `data === null` with
 * `failed === false`. Failure is `failed`. Empty is real data that happens to
 * be empty, and only the server may say so.
 */
export interface Resource<T> {
  /** The last good value. Kept across a failed refresh rather than blanked. */
  data: T | null;
  /** The most recent attempt did not produce data. */
  failed: boolean;
  /** Nothing has arrived yet and nothing has gone wrong yet. */
  loading: boolean;
  reload: () => void;
}

/**
 * @param path API path, or `null` to stand down — a detail view with no id yet
 *   should not fetch, and making the caller branch around the hook would break
 *   the rules of hooks.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    let alive = true;

    (async () => {
      try {
        const res = await fetch(apiUrl(path), { credentials: apiCredentials() });
        const body = (await res.json()) as { ok?: boolean; data?: T };
        if (!alive) return;
        if (!body?.ok || body.data === undefined) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setData(body.data);
      } catch {
        // Transport, or a body that was not JSON at all — which on a separated
        // front end is what a mis-addressed call returns.
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [path, reloads]);

  return { data, failed, loading: data === null && !failed, reload };
}
