import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { canAtLeast, permissionOf, type AgencySession, type AgentPermission } from "./types";
import { getAgency, getAgentByEmail } from "./store";

/**
 * Who is driving the portal.
 *
 * The consumer side is passwordless and keeps no server session — a traveller
 * proves an email owns a booking and that is the whole of it. The portal cannot
 * work that way: an agent sees their agency's cost prices and spends its credit
 * line, so every request has to carry an identity we can verify rather than one
 * the browser asserts.
 *
 * The cookie is signed, not encrypted. Its contents are the agent's own name,
 * email and agency — nothing they cannot already see — so the property that
 * matters is that they cannot *change* it. Without the signature, editing one
 * character of a cookie would move an agent into another agency and show them
 * its rates.
 */

const COOKIE = "sp_agency";
const MAX_AGE = 60 * 60 * 12; // A working day; a shared counter terminal should not stay signed in overnight.

function secret(): string {
  const configured = process.env.AGENCY_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    // Falling back to a known constant in production would make every signature
    // forgeable by anyone who has read this file.
    throw new Error("AGENCY_SESSION_SECRET must be set in production");
  }
  return "dev-only-agency-secret";
}

/**
 * Our own staff, by email.
 *
 * An allowlist in configuration rather than a flag in the store, because the
 * operator role can create agencies and write off their debts — and a
 * privilege that can be granted by writing a row is a privilege anyone who can
 * write a row already has. Changing who is an operator should require a deploy.
 */
export function isOpsEmail(email: string): boolean {
  const raw = process.env.AGENCY_OPS_EMAILS ?? "";
  if (!raw.trim()) return false;
  const needle = email.trim().toLowerCase();
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Constant-time, so a wrong signature cannot be narrowed byte by byte. */
function signatureMatches(payload: string, provided: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Envelope extends AgencySession {
  exp: number;
}

export function encodeSession(session: AgencySession, now = Date.now()): string {
  const envelope: Envelope = { ...session, exp: Math.floor(now / 1000) + MAX_AGE };
  const payload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): AgencySession | null {
  if (!token) return null;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  if (!signatureMatches(payload, provided)) return null;
  try {
    const envelope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Envelope;
    if (!envelope.exp || envelope.exp * 1000 < now) return null;
    const { exp, ...session } = envelope;
    void exp;
    return session;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- request use */

export async function currentAgent(): Promise<AgencySession | null> {
  try {
    const jar = await cookies();
    return decodeSession(jar.get(COOKIE)?.value);
  } catch {
    // No request scope — a route invoked directly, a background job, a test.
    // "No session" is the only safe reading of that: absence of proof of an
    // agent is not proof of one.
    return null;
  }
}

/**
 * The session, re-checked against the store.
 *
 * A signed cookie proves the session was issued by us; it does not prove the
 * agent is still employed or the agency still trading. Suspending an account
 * has to take effect on the next request, not twelve hours later.
 */
export async function activeAgent(): Promise<AgencySession | null> {
  const session = await currentAgent();
  if (!session) return null;
  const [agent, agency] = await Promise.all([getAgentByEmail(session.email), getAgency(session.agencyId)]);
  if (!agent?.active || agent.agencyId !== session.agencyId) return null;
  if (!agency || agency.status !== "active") return null;
  /*
   * Permission comes from the stored account, never from the cookie.
   *
   * A cookie is signed, so it cannot be forged — but it was issued when the
   * agent signed in and says what they could do then. Demoting someone to
   * view-only has to stop the next request, not wait for a twelve-hour session
   * to expire. The same reasoning already applied to the operator allowlist.
   */
  return { ...session, permission: permissionOf(agent), ops: isOpsEmail(session.email) };
}

/**
 * The session, if it may do this.
 *
 * Every route that spends money or holds stock calls this rather than checking
 * a role inline. A permission enforced only where someone remembered to check
 * is not a permission — the portal hides what an account cannot do, and this is
 * what makes hiding it more than a courtesy.
 */
export async function agentWithPermission(
  required: AgentPermission,
): Promise<{ session: AgencySession } | { denied: AgentPermission }> {
  const session = await activeAgent();
  if (!session) return { denied: required };
  const held = session.permission ?? "issue";
  return canAtLeast(held, required) ? { session } : { denied: required };
}

export async function startSession(session: AgencySession): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const AGENCY_COOKIE = COOKIE;
