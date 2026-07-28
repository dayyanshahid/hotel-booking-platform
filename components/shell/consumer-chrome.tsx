"use client";

import { usePathname } from "next/navigation";
import { isPortalPath } from "@/lib/nav";

/**
 * Hides the traveller's chrome on trade routes.
 *
 * The portal is the same application on the same inventory, so it keeps the
 * root layout — fonts, direction, providers, theme all come from one place. It
 * does not keep the guest header, footer and bottom bar: "Saved", "Trips" and a
 * currency switcher are the wrong furniture around a credit line, and an agent
 * on a counter machine should not be one tap from a traveller's account menu.
 */
export function ConsumerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isPortalPath(pathname)) return null;
  return <>{children}</>;
}
