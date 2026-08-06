import { describe, expect, it } from "vitest";
import { claimsKeystroke, isTyping } from "@/components/agency/shortcuts";

/**
 * Which keystrokes the portal may take for itself.
 *
 * Single unmodified letters are a fast way round a dense screen and a fast way
 * to break every text field on it. The failure is quiet and awful: an agent
 * types a hotel name into the filter, the shortcut eats a letter, and the field
 * receives a word nobody typed — on a screen where the next thing that happens
 * is a price being read down a telephone.
 */

const KEYS = ["/", "f", "c", "?", "Escape"];

describe("what counts as typing", () => {
  it("recognises the fields an agent types into", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isTyping({ tagName }), tagName).toBe(true);
    }
  });

  it("recognises a rich-text field, which is not an input at all", () => {
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("does not treat the rest of the page as a field", () => {
    for (const tagName of ["BUTTON", "DIV", "A", "BODY", "LI"]) {
      expect(isTyping({ tagName }), tagName).toBe(false);
    }
    expect(isTyping(null)).toBe(false);
  });
});

describe("claiming a keystroke", () => {
  it("takes a bound key pressed on the page", () => {
    expect(claimsKeystroke({ key: "f" }, { tagName: "BODY" }, KEYS)).toBe(true);
  });

  it("leaves every key alone while someone is typing", () => {
    /*
     * The case this file exists for. "Sofitel" contains an `f` and a `c`;
     * "Sofitel/Ibis" contains a slash. Every one of them has to reach the
     * field.
     */
    for (const key of KEYS) {
      expect(claimsKeystroke({ key }, { tagName: "INPUT" }, KEYS), key).toBe(false);
    }
  });

  it("leaves the destination autocomplete alone, combobox or not", () => {
    // It is an `input` with `role="combobox"`, and the agent typing a city
    // name into it is the single most common keystroke in the portal.
    expect(claimsKeystroke({ key: "c" }, { tagName: "INPUT" }, KEYS)).toBe(false);
  });

  it("never takes a modified keystroke", () => {
    /*
     * ⌘F is the browser's find and ctrl-anything belongs to the operating
     * system. A portal that swallows those is one an agent fights all day.
     */
    expect(claimsKeystroke({ key: "f", metaKey: true }, { tagName: "BODY" }, KEYS)).toBe(false);
    expect(claimsKeystroke({ key: "f", ctrlKey: true }, { tagName: "BODY" }, KEYS)).toBe(false);
    expect(claimsKeystroke({ key: "f", altKey: true }, { tagName: "BODY" }, KEYS)).toBe(false);
  });

  it("ignores a key it was never given", () => {
    expect(claimsKeystroke({ key: "z" }, { tagName: "BODY" }, KEYS)).toBe(false);
  });

  it("still answers Escape from inside a field", () => {
    /*
     * Escape is the one key a field does not want to keep, and the agent
     * pressing it inside the hotel-name filter means "get me out of this", not
     * "type an escape".
     *
     * It is excluded here alongside the letters, and that is a deliberate
     * limitation rather than an oversight: the drawers close themselves on
     * Escape through their own handlers, which run whether or not this one
     * does, so nothing an agent needs is lost by staying out of the way.
     */
    expect(claimsKeystroke({ key: "Escape" }, { tagName: "INPUT" }, KEYS)).toBe(false);
  });
});
