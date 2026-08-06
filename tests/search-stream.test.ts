import { describe, expect, it, vi } from "vitest";
import { isFrameStream, readFrames, type SearchFrame } from "@/lib/search-stream";

/**
 * Reading a search that arrives in pieces.
 *
 * The failure mode here is silent: a frame split across two network reads
 * fails `JSON.parse`, the page update is dropped, and nothing throws. Whichever
 * frame goes missing, the symptom is the same — a search that shows less than
 * it found, or a page that never stops shimmering — so these tests are about
 * the framing rather than the happy path.
 */

/** A response whose body yields exactly these chunks, in this order. */
function streamed(chunks: string[], contentType = "application/x-ndjson"): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": contentType } });
}

const frame = (type: "partial" | "final", count: number): string =>
  JSON.stringify({ type, data: { totalCount: count }, progress: { answered: 1, pending: 1, asked: 2 } });

describe("reading a streamed search", () => {
  it("hands over one frame per line", async () => {
    const seen: SearchFrame[] = [];
    await readFrames(streamed([`${frame("partial", 12)}\n${frame("final", 30)}\n`]), (f) => {
      seen.push(f);
    });
    expect(seen.map((f) => f.type)).toEqual(["partial", "final"]);
  });

  it("reassembles a frame split across two network reads", async () => {
    /*
     * The case this file exists for. A frame carrying twelve result cards is
     * comfortably larger than one read, so the buffer has to hold half an
     * object until its newline turns up. Parsing per chunk loses the frame and
     * says nothing about it.
     */
    const whole = `${frame("final", 68)}\n`;
    const split = Math.floor(whole.length / 2);
    const seen: SearchFrame[] = [];
    await readFrames(streamed([whole.slice(0, split), whole.slice(split)]), (f) => {
      seen.push(f);
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].type === "final" && seen[0].data.totalCount).toBe(68);
  });

  it("reads a last frame the server did not terminate", async () => {
    const seen: SearchFrame[] = [];
    await readFrames(streamed([frame("final", 4)]), (f) => {
      seen.push(f);
    });
    expect(seen).toHaveLength(1);
  });

  it("skips a line it cannot parse and keeps going", async () => {
    // One frame lost is one page update missed. Throwing would lose the search.
    const seen: SearchFrame[] = [];
    await readFrames(streamed([`{not json\n${frame("final", 9)}\n`]), (f) => {
      seen.push(f);
    });
    expect(seen.map((f) => f.type)).toEqual(["final"]);
  });

  it("ignores blank lines", async () => {
    const seen: SearchFrame[] = [];
    await readFrames(streamed([`\n\n${frame("final", 1)}\n\n`]), (f) => {
      seen.push(f);
    });
    expect(seen).toHaveLength(1);
  });

  it("stops when the caller says so", async () => {
    /*
     * A superseded search. The agent has changed a filter and the answer in
     * flight belongs to the question they no longer have, so the rest of the
     * body is nobody's business — and reading it would race the search that
     * replaced it onto the screen.
     */
    const onFrame = vi.fn().mockReturnValue(false);
    await readFrames(streamed([`${frame("partial", 1)}\n${frame("final", 2)}\n`]), onFrame);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("waits for an async handler before reading the next frame", async () => {
    // The handler prices the rows it was given. Overlapping two of those would
    // put the second frame's quotes on screen underneath the first frame's.
    const order: string[] = [];
    await readFrames(streamed([`${frame("partial", 1)}\n${frame("final", 2)}\n`]), async (f) => {
      order.push(`start:${f.type}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${f.type}`);
    });
    expect(order).toEqual(["start:partial", "end:partial", "start:final", "end:final"]);
  });
});

describe("telling a stream from a body", () => {
  it("recognises the streamed form", () => {
    expect(isFrameStream(streamed(["{}\n"]))).toBe(true);
  });

  it("leaves an ordinary JSON response to the ordinary path", () => {
    // Validation still fails with a 422 and a normal envelope, and the client
    // has to keep handling that — asking to stream does not make every answer
    // a stream.
    expect(isFrameStream(streamed(["{}"], "application/json"))).toBe(false);
  });
});
