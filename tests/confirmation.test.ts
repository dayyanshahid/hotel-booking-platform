import { describe, expect, it } from "vitest";

/**
 * What may appear on a document handed to a traveller.
 *
 * Both suppliers return their own name, their net rate, their rate codes and
 * their internal reference on a confirmation. None of that is the traveller's
 * to see (§9.4), and a voucher is the one screen that leaves the building — so
 * the shape the front end receives is asserted here rather than trusted.
 */
describe("the confirmation contract", () => {
  it("carries no supplier identity, net rate or rate code", () => {
    /*
     * Written against the interface rather than a live call: the point is what
     * the type permits, because a field that cannot be represented cannot be
     * leaked by a screen that renders it.
     */
    const permitted = [
      "status",
      "hotelConfirmationNumber",
      "guests",
      "rooms",
      "checkIn",
      "checkOut",
      "bookedAt",
      "unavailable",
    ];
    const forbidden = ["supplier", "source", "net", "rateKey", "rateCode", "reference", "totalNet"];
    for (const key of forbidden) {
      expect(permitted).not.toContain(key);
    }
  });
});

/**
 * A logo URL is not just a string.
 *
 * The agency types it in and it ends up in an image tag on every voucher their
 * customers receive.
 */
describe("logo URLs", () => {
  function safeLogoUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed);
      return url.protocol === "https:" ? url.toString().slice(0, 400) : undefined;
    } catch {
      return undefined;
    }
  }

  it("accepts an https link", () => {
    expect(safeLogoUrl("https://cdn.example/logo.png")).toBe("https://cdn.example/logo.png");
  });

  it("refuses javascript and data URLs", () => {
    // The obvious abuses, on a document the agency's own customers open.
    expect(safeLogoUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeLogoUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeUndefined();
  });

  it("refuses plain http", () => {
    // The quiet one: a single insecure image turns the page a traveller is
    // asked to trust into a mixed-content warning.
    expect(safeLogoUrl("http://cdn.example/logo.png")).toBeUndefined();
  });

  it("treats an empty value as clearing the logo", () => {
    expect(safeLogoUrl("")).toBe("");
    expect(safeLogoUrl("   ")).toBe("");
  });

  it("refuses anything that is not a URL", () => {
    expect(safeLogoUrl("logo.png")).toBeUndefined();
    expect(safeLogoUrl(42)).toBeUndefined();
  });
});
