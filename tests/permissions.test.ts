import { describe, expect, it } from "vitest";
import { canAtLeast, permissionOf, PERMISSION_RANK } from "@/lib/agency/types";
import type { Agent } from "@/lib/agency/types";

/**
 * The three steps money moves in.
 *
 * Looking at stock commits nothing, holding it commits the supplier but not the
 * agency's money, and issuing commits both. Splitting them is what lets an
 * agency give a junior a login without giving them the credit line, so the
 * ordering is the whole feature and is asserted rather than assumed.
 */
describe("permission ranking", () => {
  it("is cumulative in the order money moves", () => {
    expect(PERMISSION_RANK.viewOnly).toBeLessThan(PERMISSION_RANK.booking);
    expect(PERMISSION_RANK.booking).toBeLessThan(PERMISSION_RANK.issue);
  });

  it("lets an issuer do everything below it", () => {
    expect(canAtLeast("issue", "viewOnly")).toBe(true);
    expect(canAtLeast("issue", "booking")).toBe(true);
    expect(canAtLeast("issue", "issue")).toBe(true);
  });

  it("stops a holder short of issuing", () => {
    expect(canAtLeast("booking", "booking")).toBe(true);
    expect(canAtLeast("booking", "issue")).toBe(false);
  });

  it("stops a viewer at looking", () => {
    expect(canAtLeast("viewOnly", "viewOnly")).toBe(true);
    expect(canAtLeast("viewOnly", "booking")).toBe(false);
    expect(canAtLeast("viewOnly", "issue")).toBe(false);
  });
});

describe("accounts that predate permissions", () => {
  /**
   * Every stored agent had a role and no permission. Both roles could book and
   * issue, so both resolve to `issue` — migrating anyone *down* to view-only
   * would silently remove a capability an agency is relying on today, and they
   * would find out when a customer was waiting.
   */
  it("keeps what an existing account could already do", () => {
    const base = { id: "a", agencyId: "b", email: "e", name: "n", active: true, createdAt: "" };
    expect(permissionOf({ ...base, role: "admin" } as Agent)).toBe("issue");
    expect(permissionOf({ ...base, role: "agent" } as Agent)).toBe("issue");
  });

  it("prefers an explicit permission over the role", () => {
    const agent = { role: "admin", permission: "viewOnly" } as Pick<Agent, "role" | "permission">;
    expect(permissionOf(agent)).toBe("viewOnly");
  });
});
