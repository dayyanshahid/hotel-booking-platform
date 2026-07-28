import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { decodeAdminSession, encodeAdminSession, isAdminEmail } from "@/lib/admin/session";
import { __resetPlatform, appendAudit, listAudit, saveSettings, storedSettings } from "@/lib/admin/store";
import { applyMarkup, currentMarkupPercent, setMarkupOverride, MARKUP_RANGE } from "@/lib/server/markup";
import { __resetAgencies, statementPeriods, appendLedger, saveAgency } from "@/lib/agency/store";
import type { Agency } from "@/lib/agency/types";

const agency: Agency = {
  id: "agc_ops",
  name: "Ops Travel",
  slug: "ops",
  countryCode: "PK",
  status: "active",
  commissionPercent: 12,
  markup: { default: { mode: "percent", value: 10 }, overrides: [] },
  credit: { limit: 50_000, currency: "USD", paymentDays: 30 },
  profile: { legalName: "Ops Travel Ltd", address: "", city: "", email: "", phone: "" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("operator identity", () => {
  const original = process.env.PLATFORM_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com, boss@example.com";
  });
  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = original;
  });

  it("admits only the allowlist, case- and space-insensitively", () => {
    expect(isAdminEmail("ops@example.com")).toBe(true);
    expect(isAdminEmail("  BOSS@example.com ")).toBe(true);
    expect(isAdminEmail("someone@example.com")).toBe(false);
  });

  it("admits nobody when no allowlist is configured", () => {
    // The safe default for a console that can move money: with nothing
    // configured there is no way in at all.
    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect(isAdminEmail("ops@example.com")).toBe(false);
  });

  it("round-trips a signed session and rejects a tampered one", () => {
    const session = { email: "ops@example.com", name: "ops" };
    const token = encodeAdminSession(session);
    expect(decodeAdminSession(token)).toMatchObject(session);

    const [payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.email = "someone@example.com";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    expect(decodeAdminSession(`${forged}.${signature}`)).toBeNull();
  });

  it("expires a session", () => {
    const token = encodeAdminSession({ email: "ops@example.com", name: "ops" }, Date.parse("2026-01-01T00:00:00Z"));
    expect(decodeAdminSession(token, Date.parse("2026-01-02T00:00:00Z"))).toBeNull();
  });
});

describe("platform markup", () => {
  afterEach(() => {
    setMarkupOverride(undefined);
  });

  it("applies an operator override to pricing", () => {
    setMarkupOverride(20);
    expect(currentMarkupPercent()).toBe(20);
    expect(applyMarkup(100).total).toBe(120);
  });

  it("clamps an override into a range a typo cannot escape", () => {
    setMarkupOverride(900);
    expect(currentMarkupPercent()).toBe(MARKUP_RANGE.max);
    setMarkupOverride(-5);
    expect(currentMarkupPercent()).toBe(MARKUP_RANGE.min);
  });

  it("falls back to the deployed default when the override is cleared", () => {
    setMarkupOverride(30);
    setMarkupOverride(undefined);
    // 12 is the deployed default from PLATFORM_MARKUP_PERCENT.
    expect(applyMarkup(100).total).toBe(112);
  });
});

describe("platform store", () => {
  beforeEach(() => {
    __resetPlatform();
  });

  it("keeps an audit trail newest first", async () => {
    await appendAudit({ actor: "a@x", action: "one", subject: "s", detail: "first" });
    await appendAudit({ actor: "b@x", action: "two", subject: "s", detail: "second" });
    const entries = await listAudit();
    expect(entries).toHaveLength(2);
    expect(entries[0].detail).toBe("second");
  });

  it("stores a markup override with who set it", async () => {
    await saveSettings({ markupPercent: 15, updatedAt: "2026-07-01T00:00:00.000Z", updatedBy: "ops@example.com" });
    expect((await storedSettings())?.updatedBy).toBe("ops@example.com");
  });
});

describe("statements", () => {
  beforeEach(async () => {
    __resetAgencies({ agencies: [agency] });
    await saveAgency(agency);
  });

  it("nets a booking and its cancellation within the month, apart from settlements", async () => {
    await appendLedger({
      id: "l1",
      agencyId: agency.id,
      at: "2026-06-05T10:00:00.000Z",
      amount: -1000,
      currency: "USD",
      kind: "booking",
      note: "b1",
    });
    await appendLedger({
      id: "l2",
      agencyId: agency.id,
      at: "2026-06-09T10:00:00.000Z",
      amount: 400,
      currency: "USD",
      kind: "cancellation",
      note: "c1",
    });
    await appendLedger({
      id: "l3",
      agencyId: agency.id,
      at: "2026-06-28T10:00:00.000Z",
      amount: 600,
      currency: "USD",
      kind: "settlement",
      note: "paid",
    });

    const [june] = await statementPeriods(agency.id);
    expect(june.month).toBe("2026-06");
    expect(june.charged).toBe(1000);
    expect(june.credited).toBe(400);
    // A settlement is money in, not a credit note; conflating them would make
    // a paid month look like one that never got billed.
    expect(june.settled).toBe(600);
    expect(june.charged - june.credited - june.settled).toBe(0);
  });

  it("groups by month, newest first", async () => {
    await appendLedger({
      id: "l1",
      agencyId: agency.id,
      at: "2026-05-05T10:00:00.000Z",
      amount: -100,
      currency: "USD",
      kind: "booking",
      note: "may",
    });
    await appendLedger({
      id: "l2",
      agencyId: agency.id,
      at: "2026-07-05T10:00:00.000Z",
      amount: -100,
      currency: "USD",
      kind: "booking",
      note: "july",
    });
    const periods = await statementPeriods(agency.id);
    expect(periods.map((p) => p.month)).toEqual(["2026-07", "2026-05"]);
  });
});
