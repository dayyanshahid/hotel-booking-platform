import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Layout that reads the window instead of its own box.
 *
 * Browser zoom is a viewport-width change — 1440px at 125% is a 1152px
 * viewport — so a breakpoint keyed to the window is also a breakpoint keyed to
 * zoom. That is fine on a page that fills the window and wrong the moment
 * something sits beside it: the portal's nav rail is 272px, so the content
 * column is always narrower than the window by that much, and a `lg:` rule
 * fires when the *window* reaches 1024 while the content has only 710 to work
 * with. That is how the Search button ended up clipped off the right edge and
 * the filter rail crushed the results card to 400px.
 *
 * These components are used at three different widths at the same window size
 * — the public site, the portal's content column, and inside a console card —
 * so they measure themselves with container queries instead.
 */
const CONTAINER_QUERIED = [
  "components/search/search-bar.tsx",
  "components/pages/search-results-view.tsx",
];

describe("layout measures its own box, not the window", () => {
  for (const file of CONTAINER_QUERIED) {
    const source = readFileSync(file, "utf8");

    it(`${file} declares a container to measure against`, () => {
      // A container query with no container ancestor never matches, which
      // fails silently: the sidebar simply never appears.
      expect(source).toMatch(/"@container|@container /);
    });

    it(`${file} sizes its layout on the container, not the viewport`, () => {
      // Viewport breakpoints on the *layout* are what this fixes. Utilities
      // that are genuinely about the device — a sticky offset, a font step —
      // are not, so only the grid/track and show-hide rules are checked.
      const viewportLayout = [
        ...source.matchAll(/\b(?:sm|md|lg|xl|2xl):(grid-cols-\[|hidden|block\b)/g),
      ].map((m) => m[0]);
      expect(viewportLayout).toEqual([]);
    });
  }

  it("the site header switches to its drawer before the row stops fitting", () => {
    /*
     * The full header row is 25px wider than a 1024px viewport, which is an
     * iPad in landscape and a 1280 screen at 125%. The nav, the account link
     * and the drawer button are one decision and have to move together, or a
     * width exists with no navigation at all.
     */
    const source = readFileSync("components/shell/site-header.tsx", "utf8");
    expect(source).toContain('className="ms-4 hidden items-center gap-1 xl:flex"');
    expect(source).toContain('className="xl:hidden"');
    expect(source).not.toMatch(/href=\{href\(locale, "\/(account|signin)"\)\} className="hidden lg:block"/);
  });
});
