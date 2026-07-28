import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Operator identity.
 *
 * The super admin console reaches across both verticals: it can read any
 * customer's booking, cancel it, change what every agency is charged, and write
 * off what one of them owes. That is a different kind of account from an agent
 * or a traveller, so it gets a different kind of identity.
 *
 * Two deliberate choices follow from that. Operators are named in configuration
 * rather than stored, because a privilege that can be granted by writing a row
 * is a privilege anyone who can write a row already has — becoming an operator
 * should require a deploy. And the console has its own cookie rather than a
 * flag on the agency session, so an agent's browser cannot hold an operator
 * session by accident and a compromised portal session is not a compromised
 * console.
 */

const COOKIE = "sp_admin";
/** Shorter than the agency portal's. An idle console is a standing risk. */
const MAX_AGE = 60 * 60 * 4;

export interface AdminSession {
  email: string;
  name: string;
}

export function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const allowed = adminEmails();
  if (!allowed.length) return false;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Whether the console can be used at all.
 *
 * With no allowlist configured there is no way in — which is the right default
 * for a console that can move money. It is stated plainly on the sign-in screen
 * rather than left as a silent rejection loop.
 */
export function isAdminConfigured(): boolean {
  return adminEmails().length > 0 && Boolean(secretOrNull());
}

function secretOrNull(): string | null {
  const configured = process.env.ADMIN_SESSION_SECRET ?? process.env.AGENCY_SESSION_SECRET;
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "dev-only-admin-secret";
}

function secret(): string {
  const value = secretOrNull();
  if (!value) throw new Error("ADMIN_SESSION_SECRET must be set in production");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function signatureMatches(payload: string, provided: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Envelope extends AdminSession {
  exp: number;
}

export function encodeAdminSession(session: AdminSession, now = Date.now()): string {
  const envelope: Envelope = { ...session, exp: Math.floor(now / 1000) + MAX_AGE };
  const payload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeAdminSession(token: string | undefined, now = Date.now()): AdminSession | null {
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

/**
 * The operator making this request.
 *
 * The allowlist is re-checked here rather than trusted from the cookie:
 * removing someone has to take effect on their next request, not when their
 * session happens to lapse.
 */
export async function currentAdmin(): Promise<AdminSession | null> {
  try {
    const jar = await cookies();
    const session = decodeAdminSession(jar.get(COOKIE)?.value);
    if (!session || !isAdminEmail(session.email)) return null;
    return session;
  } catch {
    // No request scope — a background job or a test. Absence of proof of an
    // operator is not proof of one.
    return null;
  }
}

export async function startAdminSession(session: AdminSession): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodeAdminSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const ADMIN_COOKIE = COOKIE;
