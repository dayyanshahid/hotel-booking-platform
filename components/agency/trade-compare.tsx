"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Drawer, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { Money } from "@/components/agency/ui";
import { QuoteModal } from "@/components/agency/quote-modal";
import { compareVerdict, type CompareDimension } from "@/lib/agency/compare-verdict";
import { formatDeadline, formatDate } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CurrencyCode, HotelResultCard, Locale, SearchIntent } from "@/lib/types";

/**
 * Two or three properties, read down instead of scrolled between.
 *
 * This is the shape of the job. An agent on the phone shortlists a few
 * properties and reads them out — "the four-star is two-twenty with breakfast
 * and free cancellation to the ninth, the other one's cheaper but it's
 * non-refundable" — and until now that meant scrolling up and down a results
 * list holding four numbers in their head. The comparison *is* the work, and
 * the screen was not doing any of it.
 *
 * It is a drawer rather than a page, unlike the consumer side, and that is the
 * whole point of building it again here. The public site can afford to navigate
 * to /compare because a shopper has all evening. An agent has a customer
 * waiting and a result set that took several seconds and two supplier requests
 * to assemble; sending them to another page to compare, and back again to act,
 * would throw that away twice per enquiry.
 *
 * Rows are fixed rather than clever. A "differences only" toggle sounds
 * appealing and is wrong here: an agent is reading aloud from this and needs
 * the same fact in the same place in every column, including when two columns
 * agree.
 */
/**
 * A row of the comparison: its label, then a cell per property.
 *
 * Declared here rather than inside `TradeCompare`, which is where it was.
 * A component defined in a render body is a *new type* on every render, so
 * React tears the whole subtree down and rebuilds it each time anything
 * changes — every cell in the table, on a panel whose entire purpose is that
 * an agent clicks around inside it. Focus is lost, any DOM state goes with it,
 * and the work is proportional to the number of properties being compared.
 *
 * `cards` becomes a prop, which is the only reason it was ever written inside.
 */
function Row({
  label,
  cards,
  render,
  strong,
}: {
  label: string;
  cards: HotelResultCard[];
  render: (card: HotelResultCard) => React.ReactNode;
  strong?: boolean;
}) {
  return (
    <>
      <div
        className={cx(
          "surface hairline sticky start-0 z-10 border-e py-2.5 pe-3 text-xs",
          strong ? "font-semibold text-[var(--text)]" : "text-muted",
        )}
      >
        {label}
      </div>
      {cards.map((card) => (
        <div key={card.slug} className="min-w-0 py-2.5 pe-3 text-sm wrap-anywhere">
          {render(card)}
        </div>
      ))}
    </>
  );
}

export function TradeCompare({
  open,
  onClose,
  cards,
  quotes,
  intent,
  locale,
  currency,
  onRemove,
  onClear,
  onViewRooms,
  onAdd,
  canIssue,
}: {
  open: boolean;
  onClose: () => void;
  /** Only what is in the current result set — see the caller. */
  cards: HotelResultCard[];
  quotes: Record<string, AgencyOfferView>;
  intent: SearchIntent;
  locale: Locale;
  currency: CurrencyCode;
  onRemove: (slug: string) => void;
  onClear: () => void;
  /** Closes the drawer and opens that property's rate sheet in the list. */
  onViewRooms: (slug: string) => void;
  /** Puts a compared property's lead rate straight into the selection. */
  onAdd: (card: HotelResultCard) => void;
  /** Whether this account may commit anything; a reader still compares. */
  canIssue: boolean;
}) {
  const { t } = useApp();
  const router = useRouter();
  const [quoteOpen, setQuoteOpen] = useState(false);

  /**
   * Which column wins which row.
   *
   * Only the three distinctions that are real — see lib/agency/compare-verdict
   * for why distance and rooms-left are deliberately left unmarked.
   */
  const verdict = compareVerdict(
    cards.map((card) => {
      const quote = quotes[card.offerSummary.offerId];
      return {
        sell: quote?.sell,
        margin: quote?.margin,
        refundable: card.offerSummary.refundable,
        freeUntil: card.offerSummary.freeCancellationUntil,
      };
    }),
  );

  /**
   * The compared offers we can actually quote.
   *
   * A quote is a commercial document; a line on it with no cost behind it is
   * one the agency cannot honour. Rates we failed to price are left out rather
   * than sent at the public price.
   */
  const priced = cards
    .filter((card) => quotes[card.offerSummary.offerId])
    .map((card) => card.offerSummary.offerId);

  /** The little flag on a winning cell. Never colour alone. */
  const Win = ({ dimension, index }: { dimension: CompareDimension; index: number }) =>
    verdict[dimension].includes(index) ? (
      <span className="bg-positive-50 text-positive-700 ms-1 inline-flex rounded-[var(--radius-pill)] px-1.5 py-0.5 text-[10px] font-semibold align-middle">
        {t(`agency.compareBest.${dimension}` as never)}
      </span>
    ) : null;

  /**
   * One label column, then one column per property.
   *
   * A grid rather than a table because each cell is a small stack of markup
   * rather than a value, and because the label column has to stay put while
   * the properties scroll sideways on a narrow screen.
   */
  /*
   * `minmax(0, 1fr)` for the properties, not `min-content`.
   *
   * Sized to their contents, one long facilities string set the width of the
   * whole column and pushed the third property off the panel — a comparison
   * where you can only see two of the three things being compared. The columns
   * share what is left over the label, evenly, and the long strings wrap.
   */
  const columns = `minmax(92px, 116px) repeat(${cards.length}, minmax(0, 1fr))`;
  /** Below this the panel scrolls sideways rather than crushing the columns. */
  const floor = 116 + cards.length * 172;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("agency.compareTitle")}
      width="wide"
      // Printing this panel prints only this panel — see globals.css.
      className="print-sheet"
    >
      {cards.length === 0 ? (
        <p className="text-muted text-sm">{t("agency.compareEmpty")}</p>
      ) : (
        <div className="space-y-4">
          {/*
            The stay these prices are for, once at the top. Every column is
            priced for the same dates and the same party — an agent reading
            three totals aloud should not have to wonder whether one of them
            is for different nights.
          */}
          {/*
            On screen the drawer's own header names this; on paper that header
            is chrome with a close button in it, and the customer receiving the
            sheet is not comparing, they are choosing.
          */}
          <h3 className="hidden text-base font-semibold print:block">
            {t("agency.comparePrintTitle")}
          </h3>
          <p className="text-muted text-xs">
            {formatDate(intent.checkIn, locale)} → {formatDate(intent.checkOut, locale)}
          </p>

          <div className="-mx-1 overflow-x-auto px-1">
            <div
              className="grid w-full items-start"
              style={{ gridTemplateColumns: columns, minWidth: floor }}
            >
              {/* The properties themselves, across the top. */}
              <div className="surface sticky start-0 z-10 pe-3" />
              {cards.map((card) => (
                <div key={card.slug} className="min-w-0 space-y-1.5 pb-3 pe-3">
                  <div className="surface-sunken relative h-20 w-full overflow-hidden rounded-[var(--radius-control)]">
                    <Image
                      src={card.heroImage}
                      alt=""
                      fill
                      sizes="220px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <p className="text-sm font-semibold leading-tight wrap-anywhere">{card.name}</p>
                  <p className="text-muted text-xs">
                    {card.category > 0 && (
                      <span className="text-caution-700 me-1" aria-label={t("a11y.stars", { n: card.category })}>
                        {"★".repeat(card.category)}
                      </span>
                    )}
                    {card.locality}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(card.slug)}
                    className="text-muted hover:text-critical-700 text-xs underline underline-offset-2"
                  >
                    {t("compare.remove")}
                  </button>
                </div>
              ))}

              {/*
                Money first. On a consumer comparison the photograph and the
                score come first because the shopper is choosing a hotel; here
                the agent has already decided the property is plausible and is
                deciding what to quote.
              */}
              <Row
                cards={cards}
                label={t("agency.sell")}
                strong
                render={(card) => {
                  const quote = quotes[card.offerSummary.offerId];
                  const index = cards.indexOf(card);
                  return quote ? (
                    <span className="inline-flex flex-wrap items-baseline">
                      <Money
                        amount={quote.sell}
                        currency={quote.currency as CurrencyCode}
                        locale={locale}
                        size="lg"
                        className="text-lg leading-tight"
                      />
                      <Win dimension="cheapest" index={index} />
                    </span>
                  ) : (
                    <span className="text-muted text-xs">{t("agency.priceUnavailable")}</span>
                  );
                }}
              />
              <Row
                cards={cards}
                label={t("agency.margin")}
                render={(card) => {
                  const quote = quotes[card.offerSummary.offerId];
                  if (!quote) return <span className="text-muted">—</span>;
                  return (
                    <span className="inline-flex flex-wrap items-baseline">
                      <span
                        className={cx(
                          "inline-flex rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-semibold",
                          quote.margin > 0 ? "bg-positive-50 text-positive-700" : "surface-sunken text-muted",
                        )}
                      >
                        <Money amount={quote.margin} currency={quote.currency as CurrencyCode} locale={locale} size="sm" />
                      </span>
                      <Win dimension="margin" index={cards.indexOf(card)} />
                    </span>
                  );
                }}
              />
              <Row
                cards={cards}
                label={t("agency.cost")}
                render={(card) => {
                  const quote = quotes[card.offerSummary.offerId];
                  return quote ? (
                    <Money amount={quote.cost} currency={quote.currency as CurrencyCode} locale={locale} size="sm" />
                  ) : (
                    <span className="text-muted">—</span>
                  );
                }}
              />
              <Row
                cards={cards}
                label={t("agency.public")}
                render={(card) => (
                  <Money
                    amount={card.price.total}
                    currency={card.price.currency as CurrencyCode}
                    locale={locale}
                    tone="strike"
                    size="sm"
                  />
                )}
              />

              <Row cards={cards} label={t("agency.compareRoom")} render={(card) => card.offerSummary.roomSummary} />
              <Row cards={cards} label={t("agency.compareBoard")} render={(card) => card.offerSummary.boardSummary} />
              <Row
                cards={cards}
                label={t("agency.compareCancellation")}
                render={(card) => (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                  {card.offerSummary.refundable ? (
                    <span className="text-positive-700 text-xs">
                      {card.offerSummary.freeCancellationUntil
                        ? t("agency.compareFreeUntil", {
                            date: formatDeadline(
                              card.offerSummary.freeCancellationUntil,
                              // The card carries no timezone; the rate sheet does,
                              // and that is where a deadline gets quoted from. Here
                              // it is the date, in the reader's own zone.
                              Intl.DateTimeFormat().resolvedOptions().timeZone,
                              locale,
                            ),
                          })
                        : t("rate.refundable")}
                    </span>
                  ) : (
                    <Badge tone="neutral">{t("rate.nonRefundable")}</Badge>
                  )}
                  <Win dimension="flexible" index={cards.indexOf(card)} />
                  </span>
                )}
              />
              <Row
                cards={cards}
                label={t("agency.compareLeft")}
                render={(card) =>
                  card.remainingLabel ? (
                    <span className="text-caution-700 text-xs font-medium">{card.remainingLabel}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )
                }
              />
              <Row
                cards={cards}
                label={t("agency.compareDistance")}
                render={(card) =>
                  card.landmarkDistance ? (
                    <span className="text-xs">
                      {card.landmarkDistance.distanceKm.toFixed(1)} km · {card.landmarkDistance.label}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )
                }
              />
              <Row
                cards={cards}
                label={t("agency.compareAmenities")}
                render={(card) => (
                  <span className="text-muted text-xs">
                    {card.topAmenities.slice(0, 3).map((a) => a.label).join(" · ") || "—"}
                  </span>
                )}
              />

              {/*
                Acting on the comparison, from inside the comparison.

                A shortlist that can only be looked at sends the agent back to
                the list to do the thing they had already decided to do. Adding
                the compared rate is one press; the rate sheet is there for when
                the lead rate is not the one they want.
              */}
              <div className="surface sticky start-0 z-10 pe-3" />
              {cards.map((card) => (
                <div key={card.slug} className="no-print min-w-0 space-y-1.5 pe-3 pt-3">
                  {canIssue && (
                    <Button
                      size="sm"
                      className="w-full"
                      // A rate with no cost behind it must not reach the basket:
                      // the margin is the number this screen exists to protect.
                      disabled={!quotes[card.offerSummary.offerId]}
                      onClick={() => onAdd(card)}
                    >
                      <Icon name="cart" size={14} />
                      {t("agency.add")}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => onViewRooms(card.slug)}>
                    {t("agency.viewRooms")}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/*
            One quote for the shortlist.

            This is the artefact the comparison exists to produce: an agent
            narrows four properties to three and sends the customer those three
            to choose from. Rebuilding that selection on another screen — which
            is what a quote button only in the cart amounts to — is the work
            done twice.
          */}
          <div className="hairline no-print flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <Button variant="quiet" size="sm" onClick={onClear}>
              {t("agency.compareClear")}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Icon name="print" size={14} />
                {t("common.print")}
              </Button>
              {canIssue && (
                <Button
                  size="sm"
                  // Every column needs a price for the quote to mean anything.
                  disabled={!priced.length}
                  onClick={() => setQuoteOpen(true)}
                >
                  {t("agency.compareQuoteAll", { count: priced.length })}
                </Button>
              )}
            </div>
          </div>

          <QuoteModal
            open={quoteOpen}
            onClose={() => setQuoteOpen(false)}
            offerIds={priced}
            onCreated={(id) => {
              setQuoteOpen(false);
              onClose();
              router.push(href(locale, `/agency/quotes/${id}`));
            }}
          />
        </div>
      )}
    </Drawer>
  );
}

/**
 * The bar that says a comparison is being built.
 *
 * Fixed to the bottom of the viewport because the selecting happens down a
 * scrolling list: an agent ticks one at row three and the next at row eleven,
 * and a counter that scrolled away with row three would leave them unsure
 * whether the first one took.
 */
export function CompareBar({
  count,
  onOpen,
  onClear,
}: {
  count: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  const { t } = useApp();
  if (count === 0) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="surface hairline pointer-events-auto flex items-center gap-3 rounded-[var(--radius-pill)] border px-4 py-2 shadow-[var(--shadow-raised)]">
        <span className="inline-flex items-center gap-2 text-sm">
          <Icon name="grid" size={16} />
          {t("agency.compareSelected", { count })}
        </span>
        {/*
          One is a selection, not a comparison. The button stays visible rather
          than appearing on the second tick — a control that materialises under
          the pointer is one an agent clicks by accident.
        */}
        <Button size="sm" disabled={count < 2} onClick={onOpen}>
          {t("compare.title")}
        </Button>
        <button
          type="button"
          onClick={onClear}
          className="text-muted hover:text-[var(--text)] text-xs underline underline-offset-2"
        >
          {t("agency.compareClear")}
        </button>
      </div>
    </div>
  );
}
