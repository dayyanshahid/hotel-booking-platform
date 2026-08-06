import type { ApiError, SearchResponse } from "./types";

/**
 * How much of the supply behind a streamed page has arrived.
 *
 * Mirrors `SearchProgress` on the server. Declared again rather than imported
 * because everything under `lib/server` is server-only, and this is read in the
 * browser.
 */
export interface StreamProgress {
  answered: number;
  pending: number;
  asked: number;
}

/** One line of a streamed search. */
export type SearchFrame =
  | { type: "partial"; data: SearchResponse; progress: StreamProgress }
  | { type: "final"; data: SearchResponse }
  | { type: "error"; error: ApiError };

/** Whether a response is a stream of frames rather than one JSON body. */
export function isFrameStream(res: Response): boolean {
  return Boolean(res.body) && (res.headers.get("content-type") ?? "").includes("ndjson");
}

/**
 * Read a streamed search, a frame at a time.
 *
 * The awkward part is that a chunk is not a line: a frame carrying twelve
 * result cards is comfortably larger than one network read, so the buffer has
 * to hold a partial line until its newline shows up. Getting that wrong does
 * not throw — `JSON.parse` fails on half an object and the frame is silently
 * lost — which is why it is here, alone, with a test, rather than inlined in a
 * component.
 *
 * A malformed line is skipped rather than fatal. A frame we cannot read is one
 * page update missed; a throw would lose the rest of the search with it.
 *
 * `onFrame` may return false to stop reading — a superseded search, an agent
 * who has moved on. The body is cancelled, and the supplier work carries on
 * server-side and lands in the offer store where the next search finds it.
 */
export async function readFrames(
  res: Response,
  onFrame: (frame: SearchFrame) => boolean | void | Promise<boolean | void>,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let stop = false;

  const handle = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame: SearchFrame;
    try {
      frame = JSON.parse(trimmed) as SearchFrame;
    } catch {
      return;
    }
    if ((await onFrame(frame)) === false) stop = true;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        await handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (stop) return;
        newline = buffer.indexOf("\n");
      }
    }
    // A last frame the server did not terminate with a newline.
    buffer += decoder.decode();
    await handle(buffer);
  } finally {
    // Cancelling a reader that has already finished is a no-op; cancelling one
    // that has not is the only way to stop the transfer.
    void reader.cancel().catch(() => {});
  }
}
