import { describe, expect, it, beforeEach } from "vitest";
import { applyAgencyMarkup, agencyOfferView, marginPercent } from "@/lib/agency/pricing";
import { agencyCost, viewOffer } from "@/lib/agency/rates";
import { decodeSession, encodeSession } from "@/lib/agency/session";
import {
  __resetAgencies,
  agencyBalance,
  appendLedger,
  canCommit,
  saveAgency,
} from "@/lib/agency/store";
import type { Agency, AgencySession } from "@/lib/agency/types";

const agency: Agency = {
  id: "agc_test",
  name: "Test Travel",
  slug: "test",
  countryCode: "PK",
  status: "active",
  commissionPercent: 12,
  markup: { mode: "percent", value: 10 },
  credit: { limit: 100_000, currency: "USD", paymentDays: 30 },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const session: AgencySession = {
  agentId: "agt_1",
  agencyId: agency.id,
  email: "agent@test.example",
  name: "Test Agent",
  role: "agent",
  agencyName: agency.name,
};

describe("agency pricing", () => {
  it("marks up cost, never the public price", () => {
    // 12% off 1000 is 880; 10% on 880 is 968 — below the public price, which is
    // the whole point: the agency undercuts us and still earns.
    const view = viewOffer("off_1", 1000, "USD", agency);
    expect(view.cost).toBe(880);
    expect(view.sell).toBe(968);
    expect(view.margin).toBe(88);
  });

  it("refuses to sell below cost when a rule is misconfigured", () => {
    expect(applyAgencyMarkup(1000, { mode: "percent", value: -50 })).toBe(1000);
  });

  it("adds a fixed fee whole, not proportionally", () => {
    expect(applyAgencyMarkup(1000, { mode: "fixed", value: 75 })).toBe(1075);
  });

  it("states margin against the selling price, not cost", () => {
    // 20% on cost is 16.7% of sell. Quoting the larger figure beside a price
    // the customer can see would flatter rather than inform.
    const view = agencyOfferView("off_1", 1000, "USD", { mode: "percent", value: 20 });
    expect(marginPercent(view)).toBeCloseTo(16.7, 1);
  });

  it("clamps a commission that would make a rate free", () => {
    expect(agencyCost(1000, { ...agency, commissionPercent: 400 })).toBe(0);
    expect(agencyCost(1000, { ...agency, commissionPercent: -20 })).toBe(1000);
  });

  it("never returns a supplier field to the client", () => {
    const view = viewOffer("off_1", 1000, "USD", agency);
    const keys = Object.keys(view).join(" ").toLowerCase();
    for (const forbidden of ["supplier", "hotelbeds", "tourmind", "ratekey", "ratecode", "net"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("agency session", () => {
  it("round-trips a signed session", () => {
    expect(decodeSession(encodeSession(session))).toMatchObject(session);
  });

  it("rejects a tampered payload", () => {
    // The attack this exists to stop: editing the agency id to read another
    // agency's rates. Any edit invalidates the signature.
    const token = encodeSession(session);
    const [payload, sig] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.agencyId = "agc_someone_else";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired session", () => {
    const token = encodeSession(session, Date.parse("2026-01-01T00:00:00.000Z"));
    expect(decodeSession(token, Date.parse("2026-01-02T00:00:00.000Z"))).toBeNull();
  });

  it("rejects a missing or malformed token", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("not-a-token")).toBeNull();
  });
});

describe("agency credit", () => {
  beforeEach(async () => {
    __resetAgencies({ agencies: [agency] });
    await saveAgency(agency);
  });

  it("derives the balance from the ledger rather than a stored total", async () => {
    await appendLedger({
      id: "led_1",
      agencyId: agency.id,
      at: "2026-02-01T00:00:00.000Z",
      amount: -30_000,
      currency: "USD",
      kind: "booking",
      reference: "NZ-AAA-1111",
      note: "Test",
    });
    const balance = await agencyBalance(agency.id);
    expect(balance?.used).toBe(30_000);
    expect(balance?.available).toBe(70_000);
  });

  it("gives headroom back when a booking is cancelled", async () => {
    await appendLedger({
      id: "led_1",
      agencyId: agency.id,
      at: "2026-02-01T00:00:00.000Z",
      amount: -30_000,
      currency: "USD",
      kind: "booking",
      note: "Test",
    });
    await appendLedger({
      id: "led_2",
      agencyId: agency.id,
      at: "2026-02-02T00:00:00.000Z",
      amount: 30_000,
      currency: "USD",
      kind: "cancellation",
      note: "Test",
    });
    expect((await agencyBalance(agency.id))?.available).toBe(100_000);
  });

  it("refuses a booking that would exceed the line", async () => {
    expect(await canCommit(agency.id, 100_000)).toBe(true);
    expect(await canCommit(agency.id, 100_001)).toBe(false);
  });

  it("refuses any booking for a suspended agency", async () => {
    __resetAgencies({ agencies: [{ ...agency, status: "suspended" }] });
    expect(await canCommit(agency.id, 1)).toBe(false);
  });
});
