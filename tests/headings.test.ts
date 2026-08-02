import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every surface starts its document outline at the top.
 *
 * The operator console titled each of its twelve signed-in pages with
 * `SectionHeading`, which renders an h2 — so the console served documents
 * whose outline began at the second level with nothing above it. A screen
 * reader announcing "heading level 2, Operations" gives no anchor for where
 * that section sits, and the pages genuinely do have several equal sections,
 * so promoting one of the h2s would have meant picking a favourite among
 * siblings. The shell takes the h1 instead, from the navigation, which is by
 * definition the name of the page.
 *
 * Checked as source rather than rendered: the property is that each shell
 * emits exactly one h1: rendering all twelve pages to assert the same thing
 * would be slower and no more true.
 */

const shells = [
  { name: "operator console", file: "components/admin/console-shell.tsx" },
  { name: "agency portal", file: "components/agency/ui.tsx" },
];

describe("document outlines", () => {
  for (const shell of shells) {
    it(`the ${shell.name} emits a top-level heading`, () => {
      const source = readFileSync(shell.file, "utf8");
      expect(source, `${shell.file} renders no h1 at all`).toMatch(/<h1[\s>]/);
    });
  }

  it("the console takes its heading from the navigation, not a hardcoded string", () => {
    /*
     * The heading and the highlighted nav entry have to agree, so both are
     * derived the same way. A literal here would drift the first time a page
     * is renamed, and nothing would notice — the visible title comes from a
     * different place.
     */
    const source = readFileSync("components/admin/console-shell.tsx", "utf8");
    expect(source).toMatch(/const pageTitle\s*=/);
    expect(source).toMatch(/<h1 className="sr-only">\{pageTitle\}<\/h1>/);
  });

  it("does not let SectionHeading start claiming the top level", () => {
    /*
     * The other way this breaks. `SectionHeading` is used many times per page
     * for genuinely sibling sections; if it ever became an h1, every console
     * page would have five of them and the outline would be worse than the
     * flat one this replaced.
     */
    const source = readFileSync("components/ui/index.tsx", "utf8");
    const heading = source.slice(source.indexOf("export function SectionHeading"));
    const body = heading.slice(0, heading.indexOf("\n}"));
    expect(body).not.toMatch(/<h1[\s>]/);
  });
});
