"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Photo, Skeleton, cx } from "@/components/ui";
import { distanceLabel, formatDeadline, formatMoney, guestCount } from "@/lib/format";
import { href, hotelHref } from "@/lib/nav";
import type { CanonicalHotel, CanonicalRoom, Locale, Offer, SearchIntent } from "@/lib/types";

interface Entry {
  slug: string;
  hotel: CanonicalHotel;
  rooms: CanonicalRoom[];
  best: Offer | null;
}

/**
 * F-034 — compare two to four canonical hotels.
 *
 * All columns are priced for the same occupancy, material differences are
 * highlighted, and identical rows can be hidden (§5.5).
 */
export function CompareView({ locale, intent }: { locale: Locale; intent: SearchIntent | null }) {
  const { t, compare, toggleCompare, toast } = useApp();
  const api = useApi();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [hideSame, setHideSame] = useState(false);

  const load = useCallback(async () => {
    if (!compare.length || !intent) {
      setEntries([]);
      return;
    }
    const loaded = await Promise.all(
      compare.map(async (slug) => {
        const res = await api<{ hotel: CanonicalHotel | null; rooms: CanonicalRoom[]; offers: Offer[] }>(
          `/api/hotels/${slug}/availability`,
          { method: "POST", body: JSON.stringify({ intent }) },
        );
        if (!res.ok || !res.data.hotel) return null;
        const best = res.data.offers.length
          ? res.data.offers.reduce((a, b) => (a.price.total <= b.price.total ? a : b))
          : null;
        return { slug, hotel: res.data.hotel, rooms: res.data.rooms, best } satisfies Entry;
      }),
    );
    setEntries(loaded.filter((x): x is Entry => Boolean(x)));
  }, [api, compare, intent]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!intent) {
    return (
      <EmptyState
        title={t("compare.title")}
        body={t("compare.empty")}
        actions={
          <Link href={href(locale, "/")}>
            <Button>{t("common.searchHotels")}</Button>
          </Link>
        }
      />
    );
  }

  if (!entries) return <Skeleton className="h-96 w-full" />;

  if (entries.length < 2) {
    return (
      <EmptyState
        title={t("compare.title")}
        body={t("compare.empty")}
        actions={
          <Link href={href(locale, "/search")}>
            <Button>{t("common.search")}</Button>
          </Link>
        }
      />
    );
  }

  const rows: { key: string; label: string; values: (string | null)[] }[] = [
    {
      key: "price",
      label: t("common.total"),
      values: entries.map((e) => (e.best ? formatMoney(e.best.price.total, e.best.price.currency, locale) : null)),
    },
    {
      key: "nightly",
      label: t("common.perNight"),
      values: entries.map((e) =>
        e.best ? formatMoney(e.best.price.nightlyAverage, e.best.price.currency, locale) : null,
      ),
    },
    {
      key: "payAtProperty",
      label: t("rate.payAtPropertyCharges"),
      values: entries.map((e) =>
        e.best
          ? e.best.price.payAtProperty.length
            ? formatMoney(
                e.best.price.payAtProperty.reduce((s, c) => s + c.amount, 0),
                e.best.price.currency,
                locale,
              )
            : "—"
          : null,
      ),
    },
    {
      key: "cancellation",
      label: t("rate.timeline"),
      values: entries.map((e) =>
        e.best
          ? e.best.cancellation.refundable && e.best.cancellation.freeUntil
            ? t("rate.freeUntil", {
                date: formatDeadline(e.best.cancellation.freeUntil, e.best.cancellation.timezone, locale),
                tz: e.best.cancellation.timezone,
              })
            : t("rate.nonRefundable")
          : null,
      ),
    },
    {
      key: "payment",
      label: t("checkout.payment"),
      values: entries.map((e) =>
        e.best ? (e.best.paymentTiming === "payNow" ? t("rate.payNow") : t("rate.payLater")) : null,
      ),
    },
    { key: "board", label: t("rate.board"), values: entries.map((e) => e.best?.board.label ?? null) },
    {
      key: "room",
      label: t("common.room"),
      values: entries.map((e) => e.rooms.find((r) => r.canonicalRoomId === e.best?.canonicalRoomId)?.name ?? null),
    },
    {
      key: "beds",
      label: t("room.beds"),
      values: entries.map((e) => {
        const room = e.rooms.find((r) => r.canonicalRoomId === e.best?.canonicalRoomId);
        return room ? room.beds.map((b) => `${b.count} × ${b.type}`).join(" + ") : null;
      }),
    },
    {
      key: "rating",
      label: t("hotel.reviews"),
      values: entries.map((e) => (e.hotel.review ? `${e.hotel.review.score} / ${e.hotel.review.scale}` : "—")),
    },
    { key: "category", label: t("filters.stars"), values: entries.map((e) => `${e.hotel.category}★`) },
    { key: "area", label: t("filters.neighborhood"), values: entries.map((e) => e.hotel.address.neighborhood) },
    {
      key: "landmark",
      label: t("hotel.landmarks"),
      values: entries.map((e) =>
        e.hotel.landmarks[0]
          ? `${e.hotel.landmarks[0].label} — ${distanceLabel(e.hotel.landmarks[0].distanceKm, locale)}`
          : "—",
      ),
    },
    {
      key: "checkin",
      label: t("hotel.checkInOut"),
      values: entries.map((e) => `${e.hotel.policies.checkInFrom} / ${e.hotel.policies.checkOutBy}`),
    },
    {
      key: "localFees",
      label: t("rate.payAtPropertyCharges"),
      values: entries.map((e) =>
        e.hotel.policies.localFees.length ? e.hotel.policies.localFees.map((f) => f.label).join(", ") : "—",
      ),
    },
    {
      key: "reason",
      label: t("results.whyRecommended"),
      values: entries.map((e) => e.best?.badges.find((b) => b.kind === "recommendation")?.label ?? "—"),
    },
  ];

  const visibleRows = hideSame
    ? rows.filter((row) => new Set(row.values.map((v) => v ?? "")).size > 1)
    : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">{t("compare.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} label={t("compare.hideSame")} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
              toast(t("common.copied"), "success");
            }}
          >
            {t("compare.share")}
          </Button>
        </div>
      </div>

      {/* Occupancy is identical across every column — never compared silently (§5.5). */}
      <Alert tone="info">
        {t("compare.occupancyWarning")} — {intent.rooms.length} × {t("common.room")}, {guestCount(intent.rooms)}{" "}
        {t("common.guests")}
      </Alert>

      <div className="scrollbar-slim overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t("compare.title")}</caption>
          <thead>
            <tr>
              <th scope="col" className="surface sticky start-0 w-40 p-2 text-start" />
              {entries.map((entry) => (
                <th key={entry.slug} scope="col" className="p-2 align-top">
                  <Card className="overflow-hidden p-0">
                    <Photo
                      src={entry.hotel.images[0]?.url}
                      srcSet={entry.hotel.images[0]?.srcSet}
                      sizes="280px"
                      fallbackSrc={entry.hotel.images[0]?.fallbackUrl}
                      alt={entry.hotel.name}
                      ratio="16/9"
                      fallbackLabel={t("hotel.imageFallback")}
                    />
                    <div className="p-3 text-start">
                      <p className="font-semibold wrap-anywhere">{entry.hotel.name}</p>
                      <p className="text-muted text-xs">{entry.hotel.address.city}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Link href={hotelHref(locale, entry.slug, intent)}>
                          <Button size="sm">{t("common.viewDetails")}</Button>
                        </Link>
                        <Button size="sm" variant="quiet" onClick={() => toggleCompare(entry.slug)}>
                          {t("compare.remove")}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const distinct = new Set(row.values.map((v) => v ?? "")).size > 1;
              return (
                <tr key={row.key}>
                  <th scope="row" className="surface sticky start-0 border-t p-2 text-start align-top font-medium">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <td
                      key={i}
                      className={cx(
                        "wrap-anywhere border-t p-2 align-top",
                        distinct && "bg-brand-50/50 font-medium",
                      )}
                    >
                      {value ?? "—"}
                      {distinct && i === 0 && (
                        <Badge tone="brand" className="ms-2">
                          {t("compare.differences")}
                        </Badge>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
