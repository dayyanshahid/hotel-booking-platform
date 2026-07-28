import type { Metadata } from "next";

/**
 * The console is not public and must never be indexed. Its pages are behind an
 * operator session already; this keeps a shared URL out of results too.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
