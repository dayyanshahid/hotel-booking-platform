import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSortPreference, rememberSortPreference } from "@/lib/agency/sort-preference";

/**
 * Remembering the order an agent asked for.
 *
 * The reason this is a preference rather than a changed default is that
 * whether a trade screen should open on best margin is a commercial decision
 * belonging to the client. What is not in question is that an agent who works
 * margin-first should not have to say so twelve times an hour.
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
});

describe("the sort an agent last chose", () => {
  it("gives nothing back before anyone has chosen", () => {
    // Which is what keeps the product's own ranking as the opening state.
    expect(readSortPreference("agent-1")).toBeNull();
  });

  it("remembers what was chosen", () => {
    rememberSortPreference("agent-1", "marginDesc");
    expect(readSortPreference("agent-1")).toBe("marginDesc");
  });

  it("keeps one agent's preference away from another's", () => {
    /*
     * A counter machine is shared. An agent who works margin-first must not
     * hand that ordering to the colleague who signs in after them — they would
     * have no idea why their results came back in an order they never picked.
     */
    rememberSortPreference("agent-1", "marginDesc");
    rememberSortPreference("agent-2", "priceAsc");
    expect(readSortPreference("agent-1")).toBe("marginDesc");
    expect(readSortPreference("agent-2")).toBe("priceAsc");
  });

  it("survives storage refusing to work", () => {
    /*
     * Private browsing, a full quota, storage disabled by policy. A remembered
     * sort is not worth an exception thrown on the way into the screen — the
     * agent loses a convenience, not the search.
     */
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(() => rememberSortPreference("agent-1", "marginDesc")).not.toThrow();
    expect(readSortPreference("agent-1")).toBeNull();
  });

  it("says nothing on the server, where there is no browser to ask", () => {
    vi.stubGlobal("window", undefined);
    expect(readSortPreference("agent-1")).toBeNull();
    expect(() => rememberSortPreference("agent-1", "priceAsc")).not.toThrow();
  });
});
