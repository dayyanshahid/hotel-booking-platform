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
    // Deliberately not a travel-agent-portal host: those are first-party and
    // allowed by default now, which would mask what this is checking.
    const two = portalOriginList("https://other-*-thing-*.example.com");
    expect(isAllowedOrigin("https://other-a-thing-b.example.com", two)).toBe(false);
  });

  it("refuses http where the pattern says https", () => {
    expect(
      isAllowedOrigin("http://travel-agent-portal-boxjw9wa9-tracking-1bda7132.vercel.app", ALLOWED),
    ).toBe(false);
  });

  it("still answers to our own front ends when nothing is configured", () => {
    /*
     * The contract used to be "configure it or nothing is allowed", and what
     * that bought was a portal deployed and dead at the same time: the real
     * domain was missing from the variable, so the API refused its preflight
     * and the client could not sign in on the address they had been given.
     * Domains we own are baked in; everything else is still opt-in.
     */
    const none = portalOriginList(undefined);
    expect(isAllowedOrigin("https://travel-agent.tracking.me", none)).toBe(true);
    expect(isAllowedOrigin("https://travel-agent-portal-delta.vercel.app", none)).toBe(true);
    expect(isAllowedOrigin("https://travel-agent-portal-abc123.vercel.app", none)).toBe(true);
    expect(isAllowedOrigin("https://not-ours.example.com", none)).toBe(false);
    expect(isAllowedOrigin("https://travel-agent.attacker.me", none)).toBe(false);
  });
});
