"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CurrencyCode } from "@/lib/types";

/**
 * What the agent has picked, and has not yet done anything with.
 *
 * Until now a selection lived inside whichever screen made it: the results page
 * held an array of offer ids, the property page held its own, and leaving
 * either one threw the selection away. An agent building a three-hotel quote
 * over a ten-minute phone call had to finish it on one screen or start again,
 * which is not how that call goes.
 *
 * So the cart moved up here, above the routes. It is the same idea as the
 * basket that was on the results page — one selection, two outcomes, quote it
 * or book it — with the difference that it now survives going to look at a
 * property and coming back.
 *
 * Held in `sessionStorage` rather than on the server. These are offer ids with
 * a short life and a price attached, and re-hydrating them tomorrow would show
 * an agent numbers that are no longer for sale. A tab is exactly the right
 * lifetime: it outlives a navigation and it does not outlive the shift.
 */

export interface CartLine {
  offerId: string;
  /** Enough to draw the line without re-fetching the search that produced it. */
  hotelSlug: string;
  hotelName: string;
  roomName: string;
  boardLabel: string;
  refundable: boolean;
  /** What the agency is charged, in the agency's settlement currency. */
  sell: number;
  currency: CurrencyCode;
  nights: number;
  /** Rooms this one rate covers — suppliers differ, so it is never assumed. */
  roomsCovered: number;
  /**
   * Rooms the supplier still holds at this rate, 0 when it did not say.
   *
   * The ceiling on the quantity control, and the reason there is one: the
   * checkout refuses a basket that asks for more rooms than a rate holds, so
   * letting an agent build that basket only moves the refusal to the worst
   * possible moment — after they have quoted the customer.
   */
  allotment: number;
  /** When the supplier's price stops being valid. */
  expiresAt?: string;
  addedAt: string;
}

interface CartApi {
  lines: CartLine[];
  /** Same rate twice is two rooms at that rate, not a toggle. */
  add: (line: Omit<CartLine, "addedAt">) => void;
  removeAt: (index: number) => void;
  /** Drops the last room taken at this rate. */
  removeOne: (offerId: string) => void;
  /**
   * How many of this rate the cart holds, and the most it may.
   *
   * Same rate twice is two rooms at that rate, which is the ordinary group
   * booking — but never past what the supplier said is left.
   */
  quantityOf: (offerId: string) => number;
  canAddMore: (offerId: string, allotment: number) => boolean;
  clear: () => void;
  /** Every line is one property, or the checkout cannot take the order. */
  onePropertyOnly: boolean;
  roomsCovered: number;
  total: number;
  currency: CurrencyCode;
  /** The soonest a rate in here goes stale, or null when none says. */
  expiresAt: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartApi | null>(null);

const KEY = "nz_agency_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read once, after mount: `sessionStorage` does not exist on the server, and
  // seeding state from it during render is what makes a hydration mismatch.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* a corrupt or unavailable store is an empty cart, not a broken portal */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* private mode, or a full quota — the cart still works for this page */
    }
  }, [lines, hydrated]);

  const add = useCallback((line: Omit<CartLine, "addedAt">) => {
    setLines((prev) => [...prev, { ...line, addedAt: new Date().toISOString() }]);
    setOpen(true);
  }, []);

  const removeOne = useCallback((offerId: string) => {
    setLines((prev) => {
      const last = prev.map((l) => l.offerId).lastIndexOf(offerId);
      return last < 0 ? prev : prev.filter((_, i) => i !== last);
    });
  }, []);

  const removeAt = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartApi>(() => {
    const hotels = new Set(lines.map((l) => l.hotelSlug));
    const expiries = lines.map((l) => l.expiresAt).filter(Boolean) as string[];
    return {
      lines,
      add,
      removeAt,
      removeOne,
      clear,
      quantityOf: (offerId: string) => lines.filter((l) => l.offerId === offerId).length,
      /*
       * Zero means the supplier did not say, and an unknown is not a limit —
       * inventing one would refuse bookings that would have succeeded.
       */
      canAddMore: (offerId: string, allotment: number) =>
        allotment <= 0 || lines.filter((l) => l.offerId === offerId).length < allotment,
      onePropertyOnly: hotels.size <= 1,
      roomsCovered: lines.reduce((sum, l) => sum + Math.max(1, l.roomsCovered), 0),
      total: lines.reduce((sum, l) => sum + l.sell, 0),
      // Every line settles in the agency's own currency, so the first is the
      // currency of all of them.
      currency: lines[0]?.currency ?? "USD",
      expiresAt: expiries.length ? expiries.sort()[0] : null,
      open,
      setOpen,
    };
  }, [lines, add, removeAt, removeOne, clear, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside a CartProvider");
  return cart;
}

/**
 * Whether there is room to dock the cart beside the work.
 *
 * A CSS `lg:hidden` was not enough. The sheet's own effect locks body scroll
 * while it is open, and a hidden element runs its effects like any other — so
 * on a laptop the cart docked correctly, the overlay was invisible, and the
 * results underneath silently would not scroll. The two shapes have to be
 * mutually exclusive in the tree, not merely in the paint.
 *
 * Matches Tailwind's `lg`. Starts false so the server and the first client
 * render agree, then corrects itself on mount.
 */
export function useHasRoomToDock(): boolean {
  const [roomy, setRoomy] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const sync = () => setRoomy(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return roomy;
}

/**
 * How long the earliest rate in the cart has left.
 *
 * A real number off the supplier's own `expiresAt`, not a made-up shopping
 * timer. Rates do go stale, the checkout re-checks them and can come back with
 * a different price, and an agent quoting one over the phone deserves to know
 * the clock is running. Returns null when nothing in the cart says.
 */
export function useCartCountdown(expiresAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left)) return null;
  if (left <= 0) return "00:00";
  const total = Math.floor(left / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
