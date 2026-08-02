"use client";

import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Modal, Photo, cx } from "@/components/ui";
import { Icon, amenityIcon } from "@/components/ui/icons";
import { addDays, formatDate, formatMoney } from "@/lib/format";
import { nightLabel } from "@/lib/i18n";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CanonicalRoom, CurrencyCode, Locale, Offer } from "@/lib/types";

/**
 * The two things an agent opens before they read a price aloud.
 *
 * A rate line has room for a number and a cancellation state, and the caller
 * always asks for more than that — what the nightly rate works out at, what is
 * already in the total, what the room actually is. Both were a page load away,
 * on the property page, which is where an agent loses the comparison they were
 * halfway through building.
 */

/* ------------------------------------------------------------ price details */

export function PriceDetailsModal({
  open,
  onClose,
  hotelName,
  offer,
  quote,
  checkIn,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  hotelName: string;
  offer: Offer;
  /** What the agency pays and charges. Absent only if the quote call failed. */
  quote?: AgencyOfferView;
  /** First night of the stay — an offer carries no dates of its own. */
  checkIn: string;
  locale: Locale;
}) {
  const { t } = useApp();
  const price = offer.price;
  const currency = price.currency as CurrencyCode;

  /*
   * Real nights where the supplier sent them, an average where it did not.
   *
   * The distinction is the whole point of the panel. One supplier prices each
   * night and the other prices the stay, and presenting the second as though
   * it were the first — three identical rows that are really one number
   * divided by three — would tell an agent a Saturday costs the same as the
   * Tuesday when we have no idea whether it does.
   */
  const nights =
    price.nightly ??
    Array.from({ length: price.nights }, (_, i) => ({
      date: addDays(checkIn, i),
      amount: price.total / price.nights,
    }));
  const estimated = !price.nightly;

  return (
    <Modal open={open} onClose={onClose} title={hotelName}>
      <div className="space-y-5">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">
              {t("agency.pricePerNight", {
                nights: price.nights,
                unit: nightLabel(t, price.nights, locale),
              })}
            </h3>
            <p className="text-muted text-sm">
              {t("agency.priceAverage", {
                amount: formatMoney(price.total / price.nights, currency, locale),
              })}
            </p>
          </div>

          {estimated && (
            <p className="text-muted mt-1 text-xs">{t("agency.priceNightlyEstimated")}</p>
          )}

          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {nights.map((night, index) => (
              <li
                key={`${night.date}-${index}`}
                className="hairline rounded-[var(--radius-control)] border p-3 text-center"
              >
                <p className="text-muted text-xs">
                  {night.date
                    ? formatDate(night.date, locale, { weekday: "short", day: "numeric", month: "short" })
                    : t("agency.nightN", { n: index + 1 })}
                </p>
                <p className="tabular mt-1 text-base font-bold">
                  {formatMoney(night.amount, currency, locale)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/*
          What is already inside that number, and what is not. An agent who
          quotes the total without the resort fee has quoted the wrong price,
          and the property will be the one to say so.
        */}
        {price.includedCharges.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">{t("rate.included")}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {price.includedCharges
                .filter((line) => line.amount > 0)
                .map((line) => (
                <li key={line.code} className="flex justify-between gap-4">
                  <span className="text-muted">{line.label}</span>
                  <span className="tabular">{formatMoney(line.amount, currency, locale)}</span>
                </li>
                ))}
            </ul>
          </section>
        )}

        {price.payAtProperty.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">{t("rate.payAtPropertyCharges")}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {price.payAtProperty.map((line) => (
                <li key={line.code} className="flex justify-between gap-4">
                  <span className="text-muted">{line.label}</span>
                  <span className="tabular">
                    {line.estimated || !line.amount
                      ? t("agency.atProperty")
                      : formatMoney(line.amount, currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          The trade figures last and largest. The reference portal ends on a
          retail selling price; a trade screen has three numbers to end on, and
          the margin is the one the agent is answerable for.
        */}
        <section className="hairline space-y-2 border-t pt-4">
          {quote ? (
            <>
              <Row label={t("agency.cost")} value={formatMoney(quote.cost, currency, locale)} />
              <Row
                label={t("agency.sell")}
                value={formatMoney(quote.sell, currency, locale)}
                strong
              />
              <Row
                label={t("agency.margin")}
                value={formatMoney(quote.margin, currency, locale)}
                tone="positive"
              />
            </>
          ) : (
            <Alert tone="warning">{t("agency.priceUnavailable")}</Alert>
          )}
          {price.roomsCovered > 1 && (
            <p className="text-muted text-xs">
              {t("agency.rateCoversRooms", { rooms: price.roomsCovered, unit: t("count.rooms") })}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cx("text-sm", strong ? "font-semibold" : "text-muted")}>{label}</span>
      <span
        className={cx(
          "tabular",
          strong ? "text-xl font-bold" : "text-sm font-medium",
          tone === "positive" && "text-positive-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- room details */

export function RoomDetailsModal({
  open,
  onClose,
  hotelName,
  room,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  hotelName: string;
  room: CanonicalRoom;
  locale: Locale;
}) {
  const { t } = useApp();

  const facts: { label: string; value: string }[] = [];
  if (room.sizeSqm) facts.push({ label: t("room.size"), value: `${room.sizeSqm} m²` });
  if (room.beds.length) {
    facts.push({
      label: t("room.beds"),
      value: room.beds.map((b) => `${b.count} × ${b.type}`).join(" / "),
    });
  }
  facts.push({ label: t("room.sleeps"), value: String(room.maxOccupancy) });
  if (room.view) facts.push({ label: t("room.view"), value: room.view });

  return (
    <Modal open={open} onClose={onClose} title={hotelName}>
      <div className="space-y-4">
        <p className="text-muted -mt-2 text-sm">{room.name}</p>

        {/*
          Said plainly rather than shown as a broken frame.
          A supplier that ships no photography for a room is ordinary, and the
          reference portal's grey rectangle with a crossed-out camera tells an
          agent nothing they can act on. This says which it is.
        */}
        {room.images.length === 0 ? (
          <Alert tone="warning">{t("room.noPhotos")}</Alert>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {room.images.slice(0, 6).map((image, index) => (
              <li key={`${image.url}-${index}`} className={index === 0 ? "col-span-2" : undefined}>
                <Photo
                  src={image.url}
                  srcSet={image.srcSet}
                  sizes="(min-width: 640px) 300px, 100vw"
                  fallbackSrc={image.fallbackUrl}
                  alt={image.alt ?? room.name}
                  ratio={index === 0 ? "16/9" : "4/3"}
                  className="rounded-[var(--radius-control)]"
                  fallbackLabel={t("hotel.imageFallback")}
                />
              </li>
            ))}
          </ul>
        )}

        <dl className="hairline grid gap-x-6 gap-y-2 border-t pt-4 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3 text-sm">
              <dt className="text-muted">{fact.label}</dt>
              <dd className="text-end font-medium wrap-anywhere">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-1.5">
          {room.accessible && <Badge tone="brand">{t("room.accessible")}</Badge>}
          <Badge tone="neutral">{room.smoking ? t("room.smoking") : t("room.nonSmoking")}</Badge>
          {room.extraBed && <Badge tone="neutral">{t("room.extraBed")}</Badge>}
          {room.cot && <Badge tone="neutral">{t("room.cot")}</Badge>}
        </div>

        {room.amenities.length > 0 && (
          <ul className="text-muted hairline grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-4 text-sm">
            {room.amenities.slice(0, 12).map((amenity) => (
              <li key={amenity.code} className="inline-flex items-center gap-1.5">
                <Icon name={amenityIcon(amenity.code)} size={14} />
                {amenity.label}
              </li>
            ))}
          </ul>
        )}

        {/*
          Only when the match is uncertain. Rooms are mapped across two
          suppliers and the confidence is real information: an agent about to
          promise a sea view should know we inferred it.
        */}
        {room.mappingConfidence < 0.8 && (
          <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-3 py-2 text-xs">
            {t("room.uncertainMatch")}
          </p>
        )}
      </div>
    </Modal>
  );
}
