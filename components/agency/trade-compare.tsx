"use client";

import Image from "next/image";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Drawer, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { Money } from "@/components/agency/ui";
import { formatDeadline, formatDate } from "@/lib/format";
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
}) {
  const { t } = useApp();

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

  /** A row of the comparison: its label, then a cell per property. */
  const Row = ({
    label,
    render,
    strong,
  }: {
    label: string;
    render: (card: HotelResultCard) => React.ReactNode;
    strong?: boolean;
  }) => (
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

  return (
    <Drawer open={open} onClose={onClose} title={t("agency.compareTitle")} width="wide">
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
                label={t("agency.sell")}
                strong
                render={(card) => {
                  const quote = quotes[card.offerSummary.offerId];
                  return quote ? (
                    <Money
                      amount={quote.sell}
                      currency={quote.currency as CurrencyCode}
                      locale={locale}
                      size="lg"
                      className="text-lg leading-tight"
                    />
                  ) : (
                    <span className="text-muted text-xs">{t("agency.priceUnavailable")}</span>
                  );
                }}
              />
              <Row
                label={t("agency.margin")}
                render={(card) => {
                  const quote = quotes[card.offerSummary.offerId];
                  if (!quote) return <span className="text-muted">—</span>;
                  return (
                    <span
                      className={cx(
                        "inline-flex rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-semibold",
                        quote.margin > 0 ? "bg-positive-50 text-positive-700" : "surface-sunken text-muted",
                      )}
                    >
                      <Money amount={quote.margin} currency={quote.currency as CurrencyCode} locale={locale} size="sm" />
                    </span>
                  );
                }}
              />
              <Row
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

              <Row label={t("agency.compareRoom")} render={(card) => card.offerSummary.roomSummary} />
              <Row label={t("agency.compareBoard")} render={(card) => card.offerSummary.boardSummary} />
              <Row
                label={t("agency.compareCancellation")}
                render={(card) =>
                  card.offerSummary.refundable ? (
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
                  )
                }
              />
              <Row
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
                label={t("agency.compareAmenities")}
                render={(card) => (
                  <span className="text-muted text-xs">
                    {card.topAmenities.slice(0, 3).map((a) => a.label).join(" · ") || "—"}
                  </span>
                )}
              />

              {/* Acting on the comparison, from inside the comparison. */}
              <div className="surface sticky start-0 z-10 pe-3" />
              {cards.map((card) => (
                <div key={card.slug} className="min-w-0 pe-3 pt-3">
                  <Button size="sm" variant="action" className="w-full" onClick={() => onViewRooms(card.slug)}>
                    {t("agency.viewRooms")}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="hairline flex justify-end border-t pt-3">
            <Button variant="quiet" size="sm" onClick={onClear}>
              {t("agency.compareClear")}
            </Button>
          </div>
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
