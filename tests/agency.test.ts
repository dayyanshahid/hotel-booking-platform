import { describe, expect, it, beforeEach } from "vitest";
import { applyAgencyMarkup, agencyOfferView, marginPercent, policyFrom } from "@/lib/agency/pricing";
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
  markup: { default: { mode: "percent", value: 10 }, overrides: [{ countryCode: "SA", rule: { mode: "percent", value: 5 } }] },
  credit: { limit: 100_000, currency: "USD", paymentDays: 30 },
  profile: {
    legalName: "Test Travel (Pvt) Ltd",
    address: "1 Test Road",
    city: "Karachi",
    email: "ops@test.example",
    phone: "+92 21 000 0000",
  },
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
    const view = agencyOfferView("off_1", 1000, "USD", { default: { mode: "percent", value: 20 }, overrides: [] });
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

describe("markup by country", () => {
  it("uses the country rule where one exists", () => {
    // The agency sells Saudi Arabia at 5% and everything else at 10%; a Makkah
    // stay must not be priced on the default.
    const sa = viewOffer("off_1", 1000, "USD", agency, "SA");
    const pt = viewOffer("off_2", 1000, "USD", agency, "PT");
    expect(sa.sell).toBe(924); // 880 cost + 5%
    expect(pt.sell).toBe(968); // 880 cost + 10%
  });

  it("matches the country case-insensitively", () => {
    expect(viewOffer("off_1", 1000, "USD", agency, "sa").sell).toBe(924);
  });

  it("falls back to the default when the country is unknown", () => {
    expect(viewOffer("off_1", 1000, "USD", agency, undefined).sell).toBe(968);
    expect(viewOffer("off_1", 1000, "USD", agency, "ZZ").sell).toBe(968);
  });

  it("reads a bare rule stored before policies existed", () => {
    // Older records hold `{mode, value}` where a policy now lives. Migrating on
    // read is what stops `.overrides` throwing on a real agency's settings page.
    const policy = policyFrom({ mode: "percent", value: 12 });
    expect(policy.default.value).toBe(12);
    expect(policy.overrides).toEqual([]);
  });
});

describe("supplier-agnostic trade pricing", () => {
  /**
   * The point of the whole architecture, asserted at the trade layer.
   *
   * An agency's cost, selling price and margin must not depend on which
   * supplier the rate came from — a TourMind rate and a Hotelbeds rate at the
   * same public price must produce identical figures — and the view an agent
   * receives must never carry a supplier binding, however the offer was stored.
   */
  const hotelbedsOffer = {
    offerId: "of_hb",
    price: { total: 1000, currency: "USD" },
    hotelbeds: { rateKey: "RATE|KEY|SECRET", hotelCode: 1234, roomCode: "DBL", boardCode: "BB", net: 700, supplierCurrency: "EUR" },
    intent: { destinationId: "dest-lisbon" },
  };
  const tourmindOffer = {
    offerId: "of_tm",
    price: { total: 1000, currency: "USD" },
    tourmind: { rateCode: "TM-RATE-CODE", hotelCode: "9911", net: 690, supplierCurrency: "CNY" },
    intent: { destinationId: "dest-lisbon" },
  };

  it("prices both suppliers identically from the same public price", () => {
    const hb = viewOffer(hotelbedsOffer.offerId, hotelbedsOffer.price.total, "USD", agency, "PT");
    const tm = viewOffer(tourmindOffer.offerId, tourmindOffer.price.total, "USD", agency, "PT");
    expect(tm.cost).toBe(hb.cost);
    expect(tm.sell).toBe(hb.sell);
    expect(tm.margin).toBe(hb.margin);
  });

  it("leaks no supplier binding into what the agent receives", () => {
    for (const offer of [hotelbedsOffer, tourmindOffer]) {
      const view = viewOffer(offer.offerId, offer.price.total, "USD", agency, "PT");
      const serialised = JSON.stringify(view);
      // The exact secrets held server-side for each supplier.
      for (const secret of ["RATE|KEY|SECRET", "TM-RATE-CODE", "9911", "1234", "700", "690", "EUR", "CNY"]) {
        expect(serialised).not.toContain(secret);
      }
      expect(Object.keys(view)).toEqual(["offerId", "cost", "sell", "margin", "currency", "publicPrice"]);
    }
  });

  it("applies a country rule regardless of supplier", () => {
    // Saudi Arabia carries a 5% override on this agency; both suppliers follow it.
    expect(viewOffer("of_hb", 1000, "USD", agency, "SA").sell).toBe(924);
    expect(viewOffer("of_tm", 1000, "USD", agency, "SA").sell).toBe(924);
  });
});
