"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Drawer, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { QuoteModal } from "@/components/agency/quote-modal";
import { useCart, useCartCountdown } from "@/components/agency/cart";
import { formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import { roomLabel } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * The cart, as a panel rather than a page.
 *
 * An agent picking rates for a party is comparing as they go, and a selection
 * they have to navigate away to see is a selection they lose track of. This
 * sits over the results, keeps the running total in view, and offers the two
 * things the selection can become — a quote to send, or an order on the
 * agency's credit.
 */
export function CartDrawer({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const router = useRouter();
  const cart = useCart();
  const countdown = useCartCountdown(cart.expiresAt);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const expired = countdown === "00:00";

  return (
    <>
      <Drawer open={cart.open} onClose={() => cart.setOpen(false)} title={t("agency.cart")}>
        {!cart.lines.length ? (
          <p className="text-muted py-8 text-center text-sm">{t("agency.cartEmpty")}</p>
        ) : (
          <div className="space-y-4">
            {/*
              The supplier's own clock, not a shopping timer.
              These rates expire and the checkout re-checks them; an agent
              reading one out over the phone should know how long it is good
              for. Absent when no rate in the cart carries an expiry.
            */}
            {countdown && (
              <p
                className={cx(
                  "flex items-center gap-2 text-sm font-medium",
                  expired ? "text-critical-700" : "text-muted",
                )}
              >
                <Icon name="clock" size={16} />
                {expired ? t("agency.cartExpired") : t("agency.cartHoldsFor", { time: countdown })}
              </p>
            )}

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
                    <span className="text-sm font-bold">
                      {formatMoney(line.sell, line.currency, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/*
              One order is one property. A quote happily spans three hotels and
              the checkout cannot, so the agent is told here rather than on the
              page that would turn them away.
            */}
            {!cart.onePropertyOnly && <Alert tone="info">{t("agency.basketManyHotels")}</Alert>}

            <div className="hairline border-t pt-3">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  cart.setOpen(false);
                  router.push(href(locale, "/agency/search"));
                }}
              >
                <Icon name="plus" size={14} />
                {t("agency.cartAddStay")}
              </Button>
            </div>
          </div>
        )}

        {Boolean(cart.lines.length) && (
          <div className="hairline mt-4 space-y-3 border-t pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold">{t("agency.cartTotal")}</span>
              <span className="text-xl font-bold">{formatMoney(cart.total, cart.currency, locale)}</span>
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
                cart.setOpen(false);
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
        )}
      </Drawer>

      <QuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        offerIds={cart.lines.map((l) => l.offerId)}
        onCreated={(id) => {
          cart.clear();
          cart.setOpen(false);
          router.push(href(locale, `/agency/quotes/${id}`));
        }}
      />
    </>
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
      onClick={() => cart.setOpen(true)}
      aria-label={t("agency.cartCount", { count: cart.lines.length })}
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
