import { describe, expect, it } from "vitest";
import { isAllowedOrigin, portalOriginList } from "@/lib/portal-origins";

/**
 * Who may call the API with a session.
 *
 * This is the check that stands between the backend and a cross-site request
 * forgery, so the interesting cases are the refusals. The wildcard exists for
 * one narrow reason — Vercel mints a new host on every deploy, and an exact
 * list refuses the very URL the CLI prints — and the risk of it is obvious:
 * widen it by one character and `*.vercel.app` lets anybody who can deploy
 * anything read an agency's credit line.
 */

const ALLOWED = portalOriginList(
  "https://travel-agent-portal-delta.vercel.app, https://travel-agent-portal-*-tracking-1bda7132.vercel.app",
);

describe("origins we answer to", () => {
  it("accepts the stable alias", () => {
    expect(isAllowedOrigin("https://travel-agent-portal-delta.vercel.app", ALLOWED)).toBe(true);
  });

  it("accepts a deployment hash, which is the whole point", () => {
    // The URL `vercel --prod` prints, and the one a person actually clicks.
    expect(
      isAllowedOrigin("https://travel-agent-portal-boxjw9wa9-tracking-1bda7132.vercel.app", ALLOWED),
    ).toBe(true);
  });

  it("ignores a trailing slash on either side", () => {
    expect(isAllowedOrigin("https://travel-agent-portal-delta.vercel.app/", ALLOWED)).toBe(true);
  });

  it("refuses another site entirely", () => {
    expect(isAllowedOrigin("https://attacker.example", ALLOWED)).toBe(false);
  });

  it("refuses a host that merely starts the same way", () => {
    // `travel-agent-portal-delta.vercel.app.attacker.example` is a different
    // site that a prefix match would have welcomed.
    expect(
      isAllowedOrigin("https://travel-agent-portal-delta.vercel.app.attacker.example", ALLOWED),
    ).toBe(false);
  });

  it("does not let the wildcard cross a dot", () => {
    /*
     * The specific way this kind of rule gets broken. If `*` matched dots,
     * `travel-agent-portal-*-tracking-1bda7132.vercel.app` would be satisfied
     * by a host under somebody else's control.
     */
    expect(
      isAllowedOrigin("https://travel-agent-portal-x.attacker.example/-tracking-1bda7132.vercel.app", ALLOWED),
    ).toBe(false);
    expect(
      isAllowedOrigin("https://travel-agent-portal-evil.vercel.app-tracking-1bda7132.vercel.app", ALLOWED),
    ).toBe(false);
  });

  it("refuses a bare wildcard, however it is written", () => {
    // Anybody can deploy to vercel.app. A pattern with no host prefix of our
    // own is discarded rather than honoured.
    for (const bad of ["*", "https://*", "https://*.vercel.app", "*.vercel.app"]) {
      expect(isAllowedOrigin("https://anything.vercel.app", portalOriginList(bad)), bad).toBe(false);
    }
  });

  it("refuses a pattern with more than one wildcard", () => {
    const two = portalOriginList("https://travel-*-portal-*.vercel.app");
    expect(isAllowedOrigin("https://travel-agent-portal-x.vercel.app", two)).toBe(false);
  });

  it("refuses http where the pattern says https", () => {
    expect(
      isAllowedOrigin("http://travel-agent-portal-boxjw9wa9-tracking-1bda7132.vercel.app", ALLOWED),
    ).toBe(false);
  });

  it("allows nothing at all when nothing is configured", () => {
    const none = portalOriginList(undefined);
    expect(none).toEqual([]);
    expect(isAllowedOrigin("https://travel-agent-portal-delta.vercel.app", none)).toBe(false);
  });
});
