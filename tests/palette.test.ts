import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The palette, checked rather than eyeballed.
 *
 * A redesign is exactly when contrast quietly breaks: the hues all move at
 * once, every pairing is new, and the screen still looks fine to whoever chose
 * the colours because they know what it is meant to say. The failures are
 * found later by the person who cannot read the muted caption on a laptop in
 * daylight.
 *
 * So the pairings the design actually relies on are asserted here, against the
 * stylesheet itself rather than against a copy of the values — a token that is
 * edited in `globals.css` and not here would otherwise pass forever.
 */

const CSS = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

/** Reads a custom property out of the stylesheet by name. */
function token(name: string): string {
  const match = CSS.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!match) throw new Error(`no hex value for ${name} in globals.css`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = "#ffffff";

describe("colour that can actually be read", () => {
  /*
   * 4.5:1 is the floor for body text, and every one of these is body text
   * somewhere: a muted caption under a price, a link in a paragraph, the label
   * on a solid button.
   */
  const bodyOnSurface: [string, string, string][] = [
    ["muted text on a card", token("--text-muted"), WHITE],
    ["body text on a card", token("--text"), WHITE],
    ["a link, on a card", token("--color-brand-700"), WHITE],
    ["a saving", token("--color-ember-700"), WHITE],
    ["a confirmation", token("--color-positive-700"), WHITE],
    ["a warning", token("--color-caution-700"), WHITE],
    ["an error", token("--color-critical-700"), WHITE],
  ];

  for (const [what, ink, paper] of bodyOnSurface) {
    it(`${what} clears 4.5:1`, () => {
      expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("puts readable ink on the primary button", () => {
    // The one control every screen has. White on brand-600 is the pairing the
    // whole system leans on, so it is the one worth being sure about.
    expect(contrast(WHITE, token("--color-brand-600"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the tinted badge backgrounds legible", () => {
    const pairs: [string, string, string][] = [
      ["brand", token("--color-brand-800"), token("--color-brand-50")],
      ["positive", token("--color-positive-700"), token("--color-positive-50")],
      ["caution", token("--color-caution-700"), token("--color-caution-50")],
      ["critical", token("--color-critical-700"), token("--color-critical-50")],
      ["ember", token("--color-ember-700"), token("--color-ember-50")],
    ];
    for (const [name, ink, paper] of pairs) {
      expect(contrast(ink, paper), `${name} badge`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a border visible without being a line drawing", () => {
    /*
     * A border is a non-text boundary: 3:1 is the requirement for one that
     * carries meaning, and the hairline around a card does not — it is
     * decoration over a surface difference. What it must not be is invisible,
     * which is the failure mode of a palette tuned only for prettiness.
     */
    const border = token("--border");
    expect(contrast(border, WHITE)).toBeGreaterThan(1.1);
    expect(contrast(token("--border-strong"), WHITE)).toBeGreaterThan(1.5);
  });

  it("separates the page from the card it holds", () => {
    // The whole light-mode design rests on this: a pure white card on a barely
    // tinted page. Too close and every card disappears; too far and the page
    // reads as grey.
    const page = token("--surface-muted");
    const card = token("--surface");
    const ratio = contrast(page, card);
    expect(ratio).toBeGreaterThan(1.01);
    expect(ratio).toBeLessThan(1.25);
  });
});

describe("the dark theme", () => {
  /** The dark block redefines the same names; take the last match. */
  function darkToken(name: string): string {
    const dark = CSS.slice(CSS.indexOf('html[data-theme="dark"]'));
    const match = dark.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    if (!match) throw new Error(`no dark value for ${name}`);
    return match[1];
  }

  it("reads on its own surfaces", () => {
    const surface = darkToken("--surface");
    expect(contrast(darkToken("--text"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkToken("--text-muted"), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the accent legible on a dark card", () => {
    // brand-700 is a link on white and unreadable on ink; dark mode has to
    // reach up the ramp, and this is the assertion that it still does.
    expect(contrast(token("--color-brand-300"), darkToken("--surface"))).toBeGreaterThanOrEqual(4.5);
  });
});
