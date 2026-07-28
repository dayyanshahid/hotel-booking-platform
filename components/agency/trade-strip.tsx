"use client";

import { useApp } from "@/components/providers/app-provider";
import { cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CurrencyCode } from "@/lib/types";

/**
 * The trade line under a rate.
 *
 * Three figures an agent needs before they can answer "what can you do on
 * this?" — their cost, what they would charge, and what they keep. It sits
 * beside the public price rather than replacing it, because the question at the
 * counter is usually a comparison with what the customer already found online.
 *
 * Renders nothing without a quote, which only exists for a verified trade
 * session. A traveller cannot reach this state.
 */
export function TradeStrip({ quote, className }: { quote?: AgencyOfferView; className?: string }) {
  const { t, locale } = useApp();
  if (!quote) return null;

  const currency = quote.currency as CurrencyCode;
  return (
    <dl
      className={cx(
        "bg-brand-50/60 hairline mt-2 grid grid-cols-3 gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-xs",
        className,
      )}
    >
      <div>
        <dt className="text-muted">{t("agency.cost")}</dt>
        <dd className="font-semibold">{formatMoney(quote.cost, currency, locale)}</dd>
      </div>
      <div>
        <dt className="text-muted">{t("agency.sell")}</dt>
        <dd className="font-semibold">{formatMoney(quote.sell, currency, locale)}</dd>
      </div>
      <div>
        <dt className="text-muted">{t("agency.margin")}</dt>
        <dd className="text-positive-700 font-semibold">{formatMoney(quote.margin, currency, locale)}</dd>
      </div>
    </dl>
  );
}
