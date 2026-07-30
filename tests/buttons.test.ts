import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui";

/**
 * The defect: clicking "+ Add room" ran a search.
 *
 * HTML defaults a `<button>` inside a form to `type="submit"`, and the shared
 * `Button` passed that default through untouched. The search bar is a `<form>`,
 * so every control in the occupancy and date panels submitted it — an agent
 * adding a second room got a search for the allocation they had *before* the
 * edit, with the panel closed under them and no way to tell what had happened.
 *
 * These call the component as a function and read the element it describes,
 * which needs no DOM: the question is only what `type` the button is given.
 */
describe("a button submits only when it says it does", () => {
  it("defaults to type=button, so a panel control cannot submit its form", () => {
    const element = Button({ children: "+ Add room" });
    expect(element.props.type).toBe("button");
  });

  it("still lets a real submit button ask to submit", () => {
    // The assistant's send button and the search bar's own button do exactly
    // this; the default must not take that away from them.
    const element = Button({ type: "submit", children: "Send" });
    expect(element.props.type).toBe("submit");
  });

  it("keeps the props it was given", () => {
    // `type` is destructured out of the spread, so this guards against the
    // rest of the props being dropped along with it.
    const onClick = () => {};
    const element = Button({ type: "reset", onClick, disabled: true, children: "x" });
    expect(element.props.type).toBe("reset");
    expect(element.props.onClick).toBe(onClick);
    expect(element.props.disabled).toBe(true);
  });
});
