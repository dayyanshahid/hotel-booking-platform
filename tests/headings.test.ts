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


/**
 * One exported function's source, whole.
 *
 * Slicing at the first `\n}` looked right and stopped inside the destructured
 * props, so every assertion below was reading a fragment — which is harmless
 * for a `toMatch` that then fails loudly, and quietly useless for a
 * `not.toMatch`, which passes on any text that got cut before the thing it
 * was meant to forbid. Cut at the next top-level export instead.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`);
  if (start < 0) throw new Error(`${name} is no longer exported from this file`);
  const rest = source.slice(start + 1);
  const next = rest.indexOf("\nexport ");
  return next < 0 ? rest : rest.slice(0, next);
}

/*
 * The shells this repository still contains.
 *
 * The operator console and the agency portal live in their own repositories
 * now and carry this assertion with them — a test that scans a file by path
 * can only run where the file is, and leaving it here would have read as those
 * shells having lost their heading rather than having moved house.
 */
const shells: { name: string; file: string }[] = [];

describe("document outlines", () => {
  for (const shell of shells) {
    it(`the ${shell.name} emits a top-level heading`, () => {
      const source = readFileSync(shell.file, "utf8");
      expect(source, `${shell.file} renders no h1 at all`).toMatch(/<h1[\s>]/);
    });
  }


  it("does not let SectionHeading start claiming the top level", () => {
    /*
     * The other way this breaks. `SectionHeading` is used many times per page
     * for genuinely sibling sections; if it ever became an h1, every console
     * page would have five of them and the outline would be worse than the
     * flat one this replaced.
     */
    const body = functionBody(readFileSync("components/ui/index.tsx", "utf8"), "SectionHeading");
    // Only the "title" level may reach h1, and it does so through `Heading`.
    expect(body).not.toMatch(/<h1[\s>]/);
  });

  it("gives a whole-page empty state the page's heading level", () => {
    /*
     * `standalone` on EmptyState already meant "this is the page" and was
     * only being used for layout, so a signed-out account, an empty saved
     * list and an empty comparison each served a document whose outline
     * began at level three. Not a missing heading — a heading at the wrong
     * depth, which reads correctly and navigates wrongly.
     */
    const body = functionBody(readFileSync("components/ui/index.tsx", "utf8"), "EmptyState");
    expect(body).toMatch(/const Heading = standalone \? "h1" : "h3"/);
    // And the title has to actually use it rather than a literal tag.
    expect(body).toMatch(/<Heading[\s\S]*?>\{title\}<\/Heading>/);
  });

  it("keeps a page title distinct from a section heading", () => {
    /*
     * Two decisions that were being made by one tag: how big the heading
     * looks and how deep it sits. A screen with several equal sections wants
     * them all at "page"; a screen whose whole content is one form has a
     * single heading and it belongs at the top.
     */
    const body = functionBody(readFileSync("components/ui/index.tsx", "utf8"), "SectionHeading");
    expect(body).toMatch(/level\?: "title" \| "page" \| "card"/);
    expect(body).toMatch(/const Heading = level === "title" \? "h1" : "h2"/);
  });
});
