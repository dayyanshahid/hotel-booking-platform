import type { Metadata } from "next";

/**
 * The trade portal is not public.
 *
 * Nothing here is useful to a search engine and some of it — an agency's name
 * beside its credit terms — should not be indexed at all. The pages are already
 * behind a session; this keeps them out of results even when a URL is shared.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  /*
   * The trade pages are wider than the shop, from the width where the cart
   * can dock.
   *
   * The root layout caps everything at `max-w-7xl`, which is a reading measure
   * — right for a page of prose or a column of results, wrong for a workbench
   * with four things side by side: the navigation rail, the filters, the
   * results and the cart. Capped at 1280 the extra pixels of a large monitor
   * went to the margins, so docking the cart took its 340 out of a fixed 1248
   * and left the results at 300.
   *
   * Done here rather than in the root layout because that one also serves the
   * shop, where the narrow measure is correct. Negative margins widen past the
   * parent's cap without the parent having to know these routes exist; the
   * padding is re-applied so the gutters match. Only from 2xl, so every
   * narrower screen is untouched.
   *
   * The separate portal deployment does the same thing in its own root layout,
   * where there is no shop to protect.
   */
  return <div className="2xl:-mx-[calc((min(100vw,1700px)-80rem)/2)] 2xl:px-0">{children}</div>;
}
