import { afterEach, describe, expect, it } from "vitest";
import { sessionCookiePolicy } from "@/lib/server/cookie-policy";

/**
 * The session cookie the browser will actually keep.
 *
 * `SameSite=None` needs `Secure`, and `Secure` needs HTTPS. Break that chain
 * and the browser drops the cookie without a word: sign-in answers 200 and the
 * very next request arrives anonymous, which looks exactly like the session
 * expiring instantly.
 *
 * It hid for a long time because the QA harnesses drive the API with curl, and
 * curl does not implement cookie policy — every one of them passed against a
 * browser flow that could not work.
 */

const NODE_ENV = process.env.NODE_ENV;

function env(nodeEnv: string, portalOrigins?: string) {
  // Assigned rather than redefined: `process.env` rejects a property
  // descriptor, and vitest freezes nothing else about it.
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  if (portalOrigins) process.env.PORTAL_ORIGINS = portalOrigins;
  else delete process.env.PORTAL_ORIGINS;
}

afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = NODE_ENV;
  delete process.env.PORTAL_ORIGINS;
});

describe("how the session cookie is written", () => {
  it("stays lax on a development machine, even with portals configured", () => {
    /*
     * The bug. `PORTAL_ORIGINS` lives in `.env.local` like every other
     * variable, so a developer running plain `http://localhost` was issued a
     * `Secure; SameSite=None` cookie their browser refused, and could not sign
     * in to their own build.
     */
    env("development", "https://agents.example");
    expect(sessionCookiePolicy()).toEqual({ sameSite: "lax", secure: false });
  });

  it("stays lax locally when no portal is configured either", () => {
    env("development");
    expect(sessionCookiePolicy()).toEqual({ sameSite: "lax", secure: false });
  });

  it("goes cross-site only on a deployment that asked for it", () => {
    env("production", "https://agents.example");
    expect(sessionCookiePolicy()).toEqual({ sameSite: "none", secure: true });
  });

  it("keeps a deployed same-origin install on the safer default", () => {
    // `lax` is not a downgrade here: nothing is cross-site, and the weaker
    // promise would be given away for nothing.
    env("production");
    expect(sessionCookiePolicy()).toEqual({ sameSite: "lax", secure: true });
  });

  it("never asks for SameSite=None without Secure", () => {
    // The combination no browser accepts. Whatever else changes, this must not.
    for (const [nodeEnv, origins] of [
      ["development", undefined],
      ["development", "https://agents.example"],
      ["production", undefined],
      ["production", "https://agents.example"],
    ] as const) {
      env(nodeEnv, origins);
      const policy = sessionCookiePolicy();
      expect(policy.sameSite === "none" && !policy.secure, `${nodeEnv} ${origins}`).toBe(false);
    }
  });
});
