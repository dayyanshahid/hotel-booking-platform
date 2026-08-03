"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Drawer, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { QuoteModal } from "@/components/agency/quote-modal";
import { useCart, useCartCountdown, useHasRoomToDock } from "@/components/agency/cart";
import { formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import { roomLabel } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * The selection, beside the work rather than over it.
 *
 * This was a modal: a scrim across the page, the results dimmed and inert, and
 * an agent who had just added one room had to dismiss the cart before they
 * could add the next. That is exactly backwards for the job — a group booking
 * is four or five rates picked in a row, and the running total is the thing
 * you want in view *while* you pick them, not instead of them.
 *
 * So on a laptop it docks: a column beside the results that scrolls with the
 * page, blocks nothing, and leaves every Add button on the page live. On a
 * phone there is no second column to give it, so it stays a sheet — which is
 * the right shape there, because a phone is doing one thing at a time anyway.
 */

/* ------------------------------------------------------------- the contents */

function CartBody({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const { t } = useApp();
  const router = useRouter();
  const cart = useCart();
  const [quoteOpen, setQuoteOpen] = useState(false);

  if (!cart.lines.length) {
    return <p className="text-muted py-8 text-center text-sm">{t("agency.cartEmpty")}</p>;
  }

  return (
    <>
      <div className="space-y-4">
        <ul className="space-y-3">
          {cart.lines.map((line, index) => (
            <li key={`${line.offerId}-${index}`} className="hairline rounded-[var(--radius-card)] border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold wrap-anywhere">
                    <Icon name="bed" size={15} />
                    {line.hotelName}
                  </p>
                  <p className="text-muted text-xs">
                    {line.nights} {line.nights === 1 ? t("common.night") : t("common.nights")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cart.removeAt(index)}
                  aria-label={t("agency.cartRemove", { room: line.roomName })}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </div>

              <p className="mt-2 text-sm wrap-anywhere">{line.roomName}</p>
              <p className="text-muted text-xs wrap-anywhere">{line.boardLabel}</p>

              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <Badge tone={line.refundable ? "positive" : "neutral"}>
                  {line.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                </Badge>
                <span className="tabular text-sm font-bold">
                  {formatMoney(line.sell, line.currency, locale)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/*
          One order is one property. A quote happily spans three hotels and the
          checkout cannot, so the agent is told here rather than on the page
          that would turn them away.
        */}
        {!cart.onePropertyOnly && <Alert tone="info">{t("agency.basketManyHotels")}</Alert>}
      </div>

      <div className="hairline mt-4 space-y-3 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold">{t("agency.cartTotal")}</span>
          <span className="tabular text-xl font-bold">{formatMoney(cart.total, cart.currency, locale)}</span>
        </div>
        <p className="text-muted text-xs">
          {t("agency.cartCovers", {
            rooms: cart.roomsCovered,
            unit: roomLabel(t, cart.roomsCovered, locale),
          })}
        </p>

        <Button
          className="w-full"
          disabled={!cart.onePropertyOnly}
          onClick={() => {
            onClose();
            router.push(
              href(locale, `/agency/book/${cart.lines.map((l) => encodeURIComponent(l.offerId)).join(",")}`),
            );
          }}
        >
          <Icon name="card" size={16} />
          {t("agency.cartCheckout")}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setQuoteOpen(true)}>
            {t("agency.newQuote")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => cart.clear()}>
            {t("agency.cartEmptyAction")}
          </Button>
        </div>
      </div>

      <QuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        offerIds={cart.lines.map((l) => l.offerId)}
        onCreated={(id) => {
          cart.clear();
          onClose();
          router.push(href(locale, `/agency/quotes/${id}`));
        }}
      />
    </>
  );
}

/** The countdown, which both shapes carry. */
function CartClock() {
  const { t } = useApp();
  const cart = useCart();
  const countdown = useCartCountdown(cart.expiresAt);
  if (!countdown) return null;
  const expired = countdown === "00:00";
  return (
    <p
      className={cx(
        "flex items-center gap-2 text-sm font-medium",
        expired ? "text-critical-700" : "text-muted",
      )}
    >
      <Icon name="clock" size={16} />
      {expired ? t("agency.cartExpired") : t("agency.cartHoldsFor", { time: countdown })}
    </p>
  );
}

/* ------------------------------------------------------------ the two shapes */

/**
 * The docked column, from `lg` up.
 *
 * A sibling of the results rather than an overlay, so the page simply has one
 * more column while it is open and every control on the left stays live.
 */
export function CartDock({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const cart = useCart();
  const roomToDock = useHasRoomToDock();
  if (!cart.open || !roomToDock) return null;

  return (
    <aside
      aria-label={t("agency.cart")}
      /*
        `2xl`, matching useHasRoomToDock. The gate above already decides this,
        but the class has to agree — a dock that renders at a width the hook
        calls too narrow is the same squeeze by another route.
      */
      className="hairline no-print hidden w-[340px] shrink-0 border-s ps-4 2xl:block"
    >
      <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("agency.cart")}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cart.setOpen(false)}
            aria-label={t("common.close")}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className="mt-2 space-y-4">
          <CartClock />
          <CartBody locale={locale} onClose={() => cart.setOpen(false)} />
        </div>
      </div>
    </aside>
  );
}

/**
 * The sheet, below `lg`.
 *
 * `lg:hidden` on the scrim retires the whole overlay once the dock has room,
 * so the two never both exist and nothing has to know which is showing.
 */
export function CartSheet({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const cart = useCart();
  const roomToDock = useHasRoomToDock();
  /*
   * Not rendered at all once the dock has room.
   *
   * Hiding it with a class left its scroll lock running, so the docked cart
   * came with a page that would not scroll — the exact opposite of the
   * non-blocking panel this was built to be.
   */
  if (roomToDock) return null;

  return (
    <Drawer open={cart.open} onClose={() => cart.setOpen(false)} title={t("agency.cart")}>
      <div className="space-y-4">
        <CartClock />
        <CartBody locale={locale} onClose={() => cart.setOpen(false)} />
      </div>
    </Drawer>
  );
}

/**
 * The cart's handle, for the portal's top bar.
 *
 * Carries the count because the whole reason the cart moved out of the results
 * page is that a selection has to stay visible from anywhere in the portal.
 */
export function CartButton() {
  const { t } = useApp();
  const cart = useCart();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => cart.setOpen(!cart.open)}
      aria-label={t("agency.cartCount", { count: cart.lines.length })}
      aria-expanded={cart.open}
      className="relative"
    >
      <Icon name="cart" size={18} />
      {cart.lines.length > 0 && (
        <span className="bg-brand-600 grid size-5 place-items-center rounded-full text-xs font-bold text-white">
          {cart.lines.length}
        </span>
      )}
    </Button>
  );
}
