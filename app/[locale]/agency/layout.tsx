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
  return children;
}
