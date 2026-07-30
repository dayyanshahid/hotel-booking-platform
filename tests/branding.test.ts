import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_COLOR,
  brandingOf,
  contactLine,
  luminance,
  normalizeHex,
  onPaper,
  readableOn,
} from "@/lib/agency/branding";
import { MAX_LOGO_BYTES, sniffImageType } from "@/lib/agency/logo";
import type { AgencyProfile } from "@/lib/agency/types";

/**
 * An agency's identity on the documents its customers receive.
 *
 * The thing worth testing here is not that a colour round-trips — it is that a
 * colour an agency actually chose stays readable once it is printed and handed
 * to a traveller.
 */

const PROFILE: AgencyProfile = {
  legalName: "Skyline Travel LLC",
  address: "12 Marina Walk",
  city: "Dubai",
  email: "hello@skyline.example",
  phone: "+971 4 000 0000",
};

describe("reading a brand colour", () => {
  it("accepts the shapes people actually paste", () => {
    // A brand book gives "#1A4F8A"; someone typing from memory gives "1a4f8a";
    // a three-digit shorthand is still a colour. Refusing any of these would be
    // a support ticket, not a validation.
    for (const input of ["#1a4f8a", "1a4f8a", "#1A4F8A", "  1A4F8A  "]) {
      expect(normalizeHex(input)).toBe("#1a4f8a");
    }
    expect(normalizeHex("#abc")).toBe("#aabbcc");
  });

  it("refuses anything that is not a colour rather than guessing", () => {
    // A guessed colour ends up printed on a customer's paperwork, so there is
    // no safe coercion here — only a clear rejection the form can explain.
    for (const input of ["", "#12345", "#1a4f8g", "rebeccapurple", "rgb(1,2,3)", null, 42, undefined]) {
      expect(normalizeHex(input)).toBeNull();
    }
  });
});

describe("ink that can be read on the brand colour", () => {
  it("puts dark text on pale colours and light text on dark ones", () => {
    // Roughly a third of real brand colours are pale — golds, mints, yellows.
    // White on those is invisible, and worst in print.
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#ffd400")).toBe("#000000");
    expect(readableOn("#d1fae5")).toBe("#000000");

    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#1a4f8a")).toBe("#ffffff");
    expect(readableOn(DEFAULT_BRAND_COLOR)).toBe("#ffffff");
  });

  it("always picks the higher-contrast of black and white", () => {
    /*
     * The property that matters, stated directly rather than through the
     * threshold: whichever ink is chosen must contrast at least as well as the
     * one rejected. A future tweak to the cutoff cannot quietly break this.
     */
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    for (const color of ["#ffffff", "#000000", "#ffd400", "#1a4f8a", "#808080", "#7f7f7f", "#c0392b"]) {
      const bg = luminance(color);
      const chosen = luminance(readableOn(color));
      const other = readableOn(color) === "#ffffff" ? luminance("#000000") : luminance("#ffffff");
      expect(contrast(bg, chosen)).toBeGreaterThanOrEqual(contrast(bg, other));
    }
  });

  it("stays legible on every colour it will accept", () => {
    /*
     * Swept rather than sampled, because the failure is a specific agency's
     * specific colour and a handful of examples would miss it. 4.5:1 is the
     * WCAG AA floor for body text; the header text on the accent is large, but
     * holding the stricter line means the accent can be reused anywhere.
     */
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    let worst = Infinity;

    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          worst = Math.min(worst, contrast(luminance(hex), luminance(readableOn(hex))));
        }
      }
    }

    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the brand colour used as text on white paper", () => {
  /*
   * The case the first pass of this missed entirely.
   *
   * `readableOn` guards text sitting on top of the accent — but the accent is
   * also used *as* ink, for the document title, and nothing checked that. A
   * pale yellow rule across the top of a quotation looks right; the word
   * QUOTATION in that same yellow on white is unreadable, which is exactly what
   * the settings preview showed the moment a real brand colour went in.
   */
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const onWhite = (hex: string) => contrast(luminance("#ffffff"), luminance(hex));

  it("darkens a pale colour until it can be read", () => {
    expect(onWhite("#ffd400")).toBeLessThan(4.5); // the colour as chosen
    expect(onWhite(onPaper("#ffd400"))).toBeGreaterThanOrEqual(4.5); // as printed
  });

  it("leaves a colour that is already dark enough alone", () => {
    // Taking lightness from a colour that did not need it would quietly change
    // a brand nobody asked us to change.
    expect(onPaper("#1a4f8a")).toBe("#1a4f8a");
    expect(onPaper(DEFAULT_BRAND_COLOR)).toBe(DEFAULT_BRAND_COLOR);
  });

  it("keeps the hue while giving up the lightness", () => {
    // Yellow stays yellow: red and green high, blue low. An agency's colour
    // may come back darker, but it must not come back as a different colour.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(onPaper("#ffd400").slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(100);
  });

  it("is legible for every colour an agency can choose", () => {
    let worst = Infinity;
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          worst = Math.min(worst, onWhite(onPaper(hex)));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

describe("resolving a profile into a letterhead", () => {
  it("falls back to the account name and the neutral accent", () => {
    const branding = brandingOf({ id: "agc_test", name: "Skyline Travel", profile: { ...PROFILE, legalName: "" } });
    expect(branding.name).toBe("Skyline Travel");
    // Not our own brand colour: an agency that has chosen nothing should get a
    // document that looks unbranded, not one that looks like it came from us.
    expect(branding.color).toBe(DEFAULT_BRAND_COLOR);
  });

  it("prefers the legal name, because that is what belongs on paperwork", () => {
    expect(brandingOf({ id: "agc_test", name: "Skyline Travel", profile: PROFILE }).name).toBe("Skyline Travel LLC");
  });

  it("normalises whatever was stored, so a document never renders a raw value", () => {
    const branding = brandingOf({ id: "agc_test", name: "Skyline", profile: { ...PROFILE, brandColor: "1A4F8A" } });
    expect(branding.color).toBe("#1a4f8a");
    expect(branding.onColor).toBe("#ffffff");
  });

  it("survives a stored colour that is no longer valid", () => {
    // Data outlives validation: a colour written by an older build, or edited
    // by hand, must not put "not-a-colour" into a style attribute.
    const branding = brandingOf({ id: "agc_test", name: "Skyline", profile: { ...PROFILE, brandColor: "puce" } });
    expect(branding.color).toBe(DEFAULT_BRAND_COLOR);
  });

  it("omits empty fields rather than printing blank lines", () => {
    const branding = brandingOf({
      id: "agc_test",
      name: "Skyline",
      profile: { ...PROFILE, taxNumber: "", logoUrl: "", website: "", documentFooter: "" },
    });
    expect(branding.taxNumber).toBeUndefined();
    expect(branding.logoUrl).toBeUndefined();
    expect(branding.footer).toBeUndefined();
  });

  it("joins only the contact details that exist", () => {
    expect(contactLine(brandingOf({ id: "agc_test", name: "Skyline", profile: PROFILE }))).toBe(
      "+971 4 000 0000 · hello@skyline.example",
    );
    expect(
      contactLine(brandingOf({ id: "agc_test", name: "Skyline", profile: { ...PROFILE, phone: "", email: "" } })),
    ).toBe("");
  });
});

describe("what may be accepted as a logo", () => {
  /*
   * The bytes decide, never the upload.
   *
   * This image is stored, then served back from our own origin and printed on a
   * document a traveller is asked to trust. A `Content-Type` header is whatever
   * the client claims, and an SVG is a script that happens to draw — one
   * accepted as `image/png` would sit in the store waiting to run against our
   * own domain the moment anybody opened it directly. So SVG is refused
   * outright, a logo having no need of it, and the rest are confirmed by
   * signature before anything is written.
   */
  const bytesOf = (...values: number[]) => Uint8Array.from(values);

  it("recognises the formats a logo actually comes in", () => {
    expect(sniffImageType(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffImageType(bytesOf(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    // RIFF, four size bytes, then WEBP.
    expect(sniffImageType(bytesOf(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("refuses an SVG however it is labelled", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it("refuses anything else, including a near miss", () => {
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    // One byte off the PNG signature is not a PNG.
    expect(sniffImageType(bytesOf(0x89, 0x50, 0x4e, 0x46, 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
    // Truncated to shorter than the signature it is pretending to be.
    expect(sniffImageType(bytesOf(0x89, 0x50))).toBeNull();
    expect(sniffImageType(bytesOf())).toBeNull();
  });

  it("holds a cap small enough for the store it is written to", () => {
    // Base64 adds a third, and the Redis tiers this runs on cap a value at
    // about a megabyte. A logo renders in a 220px box; half a meg is generous.
    expect(MAX_LOGO_BYTES).toBeLessThanOrEqual(512 * 1024);
    expect(Math.ceil((MAX_LOGO_BYTES * 4) / 3)).toBeLessThan(1024 * 1024);
  });
});
