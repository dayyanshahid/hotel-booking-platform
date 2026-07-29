"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, Modal, SectionHeading, Select, Field, Input, Skeleton, cx } from "@/components/ui";
import { SearchBar } from "@/components/search/search-bar";
import { searchParamsFromIntent } from "@/lib/nav";
import { TripPrompt } from "@/components/search/trip-prompt";
import { addDays, formatDate, formatDateTime, formatMoney, todayIso } from "@/lib/format";
import type { AuditEntry } from "@/lib/admin/store";
import type { CurrencyCode, HotelResultCard, Locale, SearchFilters, SearchIntent, SearchResponse } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

/* ---------------------------------------------------------- catalogue */

interface CataloguePayload {
  geography: {
    countries: number;
    bookableCountries: number;
    cities: number;
    editorialCities: number;
    demoProperties: number;
  };
  suppliers: {
    hotelbeds: { enabled: boolean; destinationsCached: number; hotelsCached: number };
    tourmind: { enabled: boolean; hotelsMapped: number; citiesCovered: number };
  };
  countries: { code: string; name: string; cities: number; demo: number; tourmind: number; editorial: number }[];
}

export function AdminCatalogueView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Catalogue />}</ConsoleShell>;
}

interface CityRow {
  slug: string;
  name: string;
  tier: string;
  demo: number;
  tourmind: number;
  editorial: boolean;
}

interface MatchRow {
  slug: string;
  code: string;
  source: string;
  city: string;
}

function Catalogue() {
  const { t } = useApp();
  const [data, setData] = useState<CataloguePayload | null>(null);
  const [country, setCountry] = useState<{ name: string; cities: CityRow[] } | null>(null);
  const [lookup, setLookup] = useState("");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(apiUrl("/api/admin/catalogue"), { credentials: apiCredentials() });
    const body = (await res.json()) as { ok: boolean; data?: CataloguePayload };
    if (body.ok && body.data) setData(body.data);
  }

  useEffect(() => {
    void load();
  }, []);

  // The property lookup answers "is this hotel mapped at all", which is the
  // other half of "why did this search come back empty".
  useEffect(() => {
    if (lookup.trim().length < 2) {
      setMatches(null);
      return;
    }
    let alive = true;
    const id = window.setTimeout(async () => {
      const res = await fetch(apiUrl(`/api/admin/catalogue/lookup?q=${encodeURIComponent(lookup)}`), {
        credentials: apiCredentials(),
      });
      const body = (await res.json()) as { ok: boolean; data?: { matches: MatchRow[] } };
      if (alive && body.ok && body.data) setMatches(body.data.matches);
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [lookup]);

  async function openCountry(code: string) {
    const res = await fetch(apiUrl(`/api/admin/catalogue/lookup?country=${encodeURIComponent(code)}`), {
      credentials: apiCredentials(),
    });
    const body = (await res.json()) as { ok: boolean; data?: { country: string; cities: CityRow[] } };
    if (body.ok && body.data) setCountry({ name: body.data.country, cities: body.data.cities });
  }

  if (!data) return <Skeleton className="h-64 w-full" />;

  async function sync(supplier: "hotelbeds" | "tourmind") {
    setBusy(supplier);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl("/api/admin/catalogue"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({ supplier }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { saved?: number; matched?: number; fetched?: number };
      error?: { message: string };
    };
    setBusy(null);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setNotice(
      t("admin.syncDone", {
        n: body.data?.saved ?? body.data?.matched ?? 0,
        supplier,
      }),
    );
    await load();
  }

  return (
    <div className="space-y-5">
      <SectionHeading title={t("admin.catalogue")} description={t("admin.catalogueBody")} />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      <SupplyProbe />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("admin.cities")} value={String(data.geography.cities)} />
        <Stat label={t("admin.countriesCovered")} value={String(data.geography.bookableCountries)} />
        <Stat label={t("admin.demoProperties")} value={String(data.geography.demoProperties)} />
        <Stat label={t("admin.editorialCities")} value={String(data.geography.editorialCities)} />
        <Stat label={t("admin.countriesKnown")} value={String(data.geography.countries)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Hotelbeds</h2>
            <Badge tone={data.suppliers.hotelbeds.enabled ? "positive" : "neutral"}>
              {data.suppliers.hotelbeds.enabled ? t("admin.connected") : t("admin.notConfiguredShort")}
            </Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.destinationsCached")} value={String(data.suppliers.hotelbeds.destinationsCached)} />
            <Row label={t("admin.hotelsCached")} value={String(data.suppliers.hotelbeds.hotelsCached)} />
          </dl>
          <p className="text-muted text-xs">{t("admin.syncCost")}</p>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.suppliers.hotelbeds.enabled}
            loading={busy === "hotelbeds"}
            onClick={() => sync("hotelbeds")}
          >
            {t("admin.syncDestinations")}
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">TourMind</h2>
            <Badge tone={data.suppliers.tourmind.enabled ? "positive" : "neutral"}>
              {data.suppliers.tourmind.enabled ? t("admin.connected") : t("admin.notConfiguredShort")}
            </Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <Row label={t("admin.hotelsMapped")} value={String(data.suppliers.tourmind.hotelsMapped)} />
            <Row label={t("admin.citiesCovered")} value={String(data.suppliers.tourmind.citiesCovered)} />
          </dl>
          {data.suppliers.tourmind.enabled && data.suppliers.tourmind.hotelsMapped === 0 && (
            <Alert tone="warning">{t("admin.catalogueEmptyWarning")}</Alert>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.suppliers.tourmind.enabled}
            loading={busy === "tourmind"}
            onClick={() => sync("tourmind")}
          >
            {t("admin.syncCatalogue")}
          </Button>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("admin.findProperty")}</h2>
        <p className="text-muted text-sm">{t("admin.findPropertyBody")}</p>
        <Field label={t("admin.search")} htmlFor="cat-lookup">
          <Input
            id="cat-lookup"
            value={lookup}
            placeholder={t("admin.findPropertyPlaceholder")}
            onChange={(e) => setLookup(e.target.value)}
          />
        </Field>
        {matches && !matches.length && <p className="text-muted text-sm">{t("admin.notMapped")}</p>}
        {matches && matches.length > 0 && (
          <ul className="divide-ink-100 divide-y text-sm">
            {matches.map((match) => (
              <li key={`${match.source}-${match.slug}`} className="flex items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs wrap-anywhere">{match.slug}</span>
                <span className="flex items-center gap-2">
                  {match.city && <span className="text-muted text-xs">{match.city}</span>}
                  <Badge tone={match.source === "demo" ? "neutral" : "positive"}>{match.source}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("admin.coverageByCountry")}</h2>
        <p className="text-muted text-sm">{t("admin.coverageBody")}</p>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-muted hairline border-b text-xs">
              <tr>
                <th className="p-3 text-start font-medium">{t("agency.country")}</th>
                <th className="p-3 text-end font-medium">{t("admin.cities")}</th>
                <th className="p-3 text-end font-medium">{t("admin.demoProperties")}</th>
                <th className="p-3 text-end font-medium">TourMind</th>
                <th className="p-3 text-end font-medium">{t("admin.editorial")}</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {data.countries.map((row) => (
                <tr key={row.code}>
                  <td className="p-3 wrap-anywhere">
                    <button type="button" className="font-medium underline" onClick={() => openCountry(row.code)}>
                      {row.name}
                    </button>{" "}
                    <span className="text-muted text-xs">{row.code}</span>
                  </td>
                  <td className="p-3 text-end tabular-nums">{row.cities}</td>
                  <td className="p-3 text-end tabular-nums">{row.demo}</td>
                  <td className="p-3 text-end tabular-nums">{row.tourmind || "—"}</td>
                  <td className="p-3 text-end tabular-nums">
                    {row.editorial ? `${row.editorial}/${row.cities}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <Modal open={Boolean(country)} onClose={() => setCountry(null)} title={country?.name ?? ""} size="md">
        <p className="text-muted mb-3 text-sm">{t("admin.cityCoverageBody")}</p>
        <ul className="divide-ink-100 divide-y text-sm">
          {(country?.cities ?? []).map((city) => {
            const sellable = city.demo + city.tourmind > 0;
            return (
              <li key={city.slug} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium wrap-anywhere">{city.name}</span>
                  <span className="text-muted ms-2 text-xs">{city.tier}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-muted">
                    {city.demo} {t("admin.demoShort")}
                  </span>
                  {city.tourmind > 0 && <span className="text-muted">{city.tourmind} TM</span>}
                  {city.editorial && <Badge tone="neutral">{t("admin.editorial")}</Badge>}
                  {!sellable && <Badge tone="caution">{t("admin.noInventory")}</Badge>}
                </span>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------ reports */

interface Bucket {
  key: string;
  label: string;
  direct: number;
  trade: number;
  cancelled: number;
  gross: number;
  retained: number;
}

interface ReportsPayload {
  totals: {
    bookings: number;
    cancelled: number;
    cancellationRate: number;
    gross: number;
    direct: number;
    trade: number;
    averageValue: number;
  };
  months: Bucket[];
  properties: Bucket[];
  agencies: Bucket[];
}

export function AdminReportsView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Reports locale={locale} />}</ConsoleShell>;
}

function Reports({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<ReportsPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(apiUrl("/api/admin/reports"), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: ReportsPayload };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;
  const currency = "USD" as CurrencyCode;

  return (
    <div className="space-y-5">
      <SectionHeading title={t("admin.platformReports")} description={t("admin.platformReportsBody")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("admin.bookingsLive")} value={String(data.totals.bookings)} />
        <Stat label={t("admin.gross")} value={formatMoney(data.totals.gross, currency, locale)} />
        <Stat label={t("admin.averageBooking")} value={formatMoney(data.totals.averageValue, currency, locale)} />
        <Stat
          label={t("admin.cancellationRate")}
          value={`${data.totals.cancellationRate}%`}
          tone={data.totals.cancellationRate > 25 ? "critical" : undefined}
        />
      </div>

      <ReportTable title={t("admin.byMonth")} rows={data.months} locale={locale} currency={currency} />
      <ReportTable title={t("admin.topProperties")} rows={data.properties} locale={locale} currency={currency} />
      <ReportTable title={t("admin.agencyLeague")} rows={data.agencies} locale={locale} currency={currency} />
    </div>
  );
}

function ReportTable({
  title,
  rows,
  locale,
  currency,
}: {
  title: string;
  rows: Bucket[];
  locale: Locale;
  currency: CurrencyCode;
}) {
  const { t } = useApp();
  if (!rows.length) {
    return (
      <section className="space-y-2">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted text-sm">{t("admin.noData")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted hairline border-b text-xs">
            <tr>
              <th className="p-3 text-start font-medium">{title}</th>
              <th className="p-3 text-end font-medium">{t("admin.b2c")}</th>
              <th className="p-3 text-end font-medium">{t("admin.b2b")}</th>
              <th className="p-3 text-end font-medium">{t("admin.cancelled")}</th>
              <th className="p-3 text-end font-medium">{t("admin.gross")}</th>
              <th className="p-3 text-end font-medium">{t("admin.retained")}</th>
            </tr>
          </thead>
          <tbody className="divide-ink-100 divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="p-3 wrap-anywhere">{row.label}</td>
                <td className="p-3 text-end tabular-nums">{row.direct}</td>
                <td className="p-3 text-end tabular-nums">{row.trade}</td>
                <td className="p-3 text-end tabular-nums">{row.cancelled || "—"}</td>
                <td className="p-3 text-end tabular-nums">{formatMoney(row.gross, currency, locale)}</td>
                <td className="text-positive-700 p-3 text-end font-semibold tabular-nums">
                  {formatMoney(row.retained, currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------- environment */

interface EnvironmentPayload {
  deployment: {
    origin: string;
    serverless: boolean;
    region: string | null;
    environment: string;
    commit: string | null;
  };
  storage: { driver: "filesystem" | "kv"; dataDir: string | null; durable: boolean; concurrentWrites: string };
  secrets: { name: string; set: boolean; required: boolean }[];
  operators: { email: string; current: boolean }[];
}

export function AdminEnvironmentView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Environment />}</ConsoleShell>;
}

function Environment() {
  const { t } = useApp();
  const [data, setData] = useState<EnvironmentPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(apiUrl("/api/admin/environment"), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: EnvironmentPayload };
      if (body.ok && body.data) setData(body.data);
    })();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.environment")} description={t("admin.environmentBody")} />

      {/*
        The most important thing on this screen. Every figure the console shows
        is "what this instance has seen" when storage is ephemeral, and an
        operator reading a revenue total deserves to know that before they quote
        it to anyone.
      */}
      {!data.storage.durable && <Alert tone="warning" title={t("admin.ephemeral")}>{t("admin.ephemeralBody")}</Alert>}

      <Card className="space-y-2 p-5 text-sm">
        <h2 className="font-semibold">{t("admin.deployment")}</h2>
        <Row label={t("admin.environmentName")} value={data.deployment.environment} />
        <Row label={t("admin.origin")} value={data.deployment.origin} />
        {data.deployment.region && <Row label={t("admin.region")} value={data.deployment.region} />}
        {data.deployment.commit && <Row label={t("admin.commit")} value={data.deployment.commit} />}
        <Row label={t("admin.storageDriver")} value={t(`admin.storage.${data.storage.driver}`)} />
        {data.storage.dataDir && <Row label={t("admin.dataDir")} value={data.storage.dataDir} />}
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("admin.configuration")}</h2>
        <p className="text-muted text-sm">{t("admin.configurationBody")}</p>
        <ul className="divide-ink-100 divide-y text-sm">
          {data.secrets.map((secret) => (
            <li key={secret.name} className="flex items-center justify-between gap-2 py-2.5">
              <span className="font-mono text-xs wrap-anywhere">{secret.name}</span>
              <Badge tone={secret.set ? "positive" : secret.required ? "critical" : "neutral"}>
                {secret.set ? t("admin.set") : secret.required ? t("admin.missing") : t("admin.unset")}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("admin.operators")}</h2>
        <p className="text-muted text-sm">{t("admin.operatorsBody")}</p>
        <ul className="divide-ink-100 divide-y text-sm">
          {data.operators.map((operator) => (
            <li key={operator.email} className="flex items-center justify-between gap-2 py-2.5">
              <span className="wrap-anywhere">{operator.email}</span>
              {operator.current && <Badge tone="brand">{t("admin.you")}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- shared */

/* --------------------------------------------------------------- probe */

interface ProbePayload {
  results: HotelResultCard[];
  totalCount: number;
  completeness: SearchResponse["completeness"];
  completenessMessage?: string;
  recovery?: SearchResponse["recovery"];
  intent: SearchIntent;
  diagnostics: {
    elapsedMs: number;
    bySource: { hotelbeds: number; tourmind: number; platform: number };
    suppliers: {
      hotelbeds: { enabled: boolean; returned: number };
      tourmind: { enabled: boolean; returned: number };
    };
    destination: {
      id: string;
      display: string;
      city: string;
      country: string;
      seededProperties: number;
    } | null;
    filters: SearchFilters;
  };
}

/**
 * Run the search a guest is complaining about.
 *
 * Coverage numbers answer "is this city mapped". They do not answer the call
 * that actually arrives — "there is nothing in Porto for August" — because the
 * only way to know is to run it for those dates, with that party, and look.
 * This runs the real search through the same code path the site uses, then
 * shows the half the site never shows anyone: which source each result came
 * from, how long it took, and whether a supplier that should have answered
 * did.
 *
 * The same bar and the same sentence box as the other two surfaces, because an
 * operator reproducing a guest's search should be able to type what the guest
 * typed.
 */
function SupplyProbe() {
  const { t, locale, currency } = useApp();
  const [seed, setSeed] = useState<SearchIntent>(() => ({
    destinationId: "",
    destinationDisplay: "",
    destinationType: "city",
    checkIn: addDays(todayIso(), 21),
    checkOut: addDays(todayIso(), 24),
    flexibility: "exact",
    rooms: [{ adults: 2, childrenAges: [] }],
    locale,
    currency,
  }));
  const [data, setData] = useState<ProbePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function probe(intent: SearchIntent, filters: SearchFilters = {}) {
    if (!intent.destinationId) return;
    setBusy(true);
    setFailure(null);
    setSeed(intent);
    const res = await fetch(apiUrl("/api/admin/probe"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": locale },
      credentials: apiCredentials(),
      body: JSON.stringify({ intent, filters }),
    });
    const body = (await res.json()) as { ok: boolean; data?: ProbePayload; error?: { message: string } };
    setBusy(false);
    if (!body.ok || !body.data) {
      setFailure(body.error?.message ?? t("error.temporaryService"));
      setData(null);
      return;
    }
    setData(body.data);
  }

  const diag = data?.diagnostics;

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">{t("admin.probe")}</h2>
        <p className="text-muted text-sm">{t("admin.probeBody")}</p>
      </div>

      {/* Keyed on the search so a described trip rewrites the controls too. */}
      <SearchBar
        key={searchParamsFromIntent(seed).toString()}
        variant="panel"
        initial={seed}
        busy={busy}
        submitLabel={t("admin.runProbe")}
        onSearch={probe}
      />

      <TripPrompt
        className="max-w-none"
        label={t("admin.probeDescribe")}
        placeholder={t("admin.probeDescribePlaceholder")}
        onRun={(intent, filters) => void probe(intent, filters)}
      />

      {failure && <Alert tone="critical">{failure}</Alert>}

      {diag && data && (
        <div className="space-y-3">
          {/*
            Supplier names, which appear nowhere on the consumer or trade
            surfaces. An operator deciding whether to chase a supplier or fix a
            mapping cannot do it against an anonymised page.
          */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("admin.probeResults")} value={String(data.totalCount)} />
            <Stat label={t("admin.probeElapsed")} value={`${diag.elapsedMs} ms`} />
            <Stat
              label="Hotelbeds"
              value={
                diag.suppliers.hotelbeds.enabled
                  ? String(diag.suppliers.hotelbeds.returned)
                  : t("admin.notConfiguredShort")
              }
              tone={
                diag.suppliers.hotelbeds.enabled && diag.suppliers.hotelbeds.returned === 0 ? "critical" : undefined
              }
            />
            <Stat
              label="TourMind"
              value={
                diag.suppliers.tourmind.enabled
                  ? String(diag.suppliers.tourmind.returned)
                  : t("admin.notConfiguredShort")
              }
              tone={diag.suppliers.tourmind.enabled && diag.suppliers.tourmind.returned === 0 ? "critical" : undefined}
            />
          </div>

          <dl className="hairline space-y-1 rounded-[var(--radius-card)] border p-4 text-sm">
            <Row
              label={t("admin.probeStay")}
              value={`${formatDate(data.intent.checkIn, locale)} → ${formatDate(data.intent.checkOut, locale)}`}
            />
            <Row label={t("admin.probeParty")} value={partyLabel(data.intent)} />
            {diag.destination && (
              <>
                <Row
                  label={t("admin.probeDestination")}
                  value={`${diag.destination.display} (${diag.destination.id}) · ${diag.destination.country}`}
                />
                {/* Own inventory separated from supplier supply: the difference
                    between "the suppliers were quiet" and "we never had any". */}
                <Row label={t("admin.probeSeeded")} value={String(diag.destination.seededProperties)} />
              </>
            )}
            <Row label={t("admin.probeOwnInventory")} value={String(diag.bySource.platform)} />
            {Object.keys(diag.filters).length > 0 && (
              <Row label={t("admin.probeFilters")} value={JSON.stringify(diag.filters)} />
            )}
          </dl>

          {data.completeness !== "complete" && (
            <Alert tone={data.completeness === "empty" ? "critical" : "warning"}>
              {data.completenessMessage ?? t("results.partial")}
            </Alert>
          )}

          {!diag.destination && (
            // Not in our geography at all, which no amount of supplier syncing
            // will fix and which the count above would otherwise hide.
            <Alert tone="warning">{t("admin.probeUnknownDestination")}</Alert>
          )}

          {data.results.length === 0 ? (
            <div className="space-y-2">
              <Alert tone="warning">{t("admin.probeEmpty")}</Alert>
              {data.recovery && data.recovery.nearbyDates.length > 0 && (
                <p className="text-muted text-sm">
                  {t("admin.probeNearbyDates")}:{" "}
                  {data.recovery.nearbyDates
                    .map((option) => `${formatDate(option.checkIn, locale)} → ${formatDate(option.checkOut, locale)}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <thead className="text-muted text-start text-xs">
                  <tr className="hairline border-b">
                    <th className="py-2 text-start font-medium">{t("admin.probeProperty")}</th>
                    <th className="py-2 text-start font-medium">{t("admin.probeSource")}</th>
                    <th className="py-2 text-start font-medium">{t("rate.board")}</th>
                    <th className="py-2 text-end font-medium">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.slice(0, 25).map((card) => (
                    <tr key={card.canonicalHotelId} className="hairline border-b last:border-0">
                      <td className="py-2 pe-3">
                        <p className="font-medium wrap-anywhere">{card.name}</p>
                        <p className="text-muted text-xs wrap-anywhere">
                          {card.neighborhood}, {card.locality}
                          {card.category > 0 && ` · ${card.category}★`}
                        </p>
                      </td>
                      <td className="py-2 pe-3">
                        <Badge tone="neutral">{sourceLabel(card.slug)}</Badge>
                      </td>
                      <td className="py-2 pe-3 wrap-anywhere">{card.offerSummary.boardSummary}</td>
                      <td className="py-2 text-end font-semibold whitespace-nowrap">
                        {formatMoney(card.price.total, card.price.currency as CurrencyCode, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.results.length > 25 && (
                <p className="text-muted mt-2 text-xs">{t("admin.probeTruncated", { n: data.results.length - 25 })}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** The origin the adapters mint into the slug. Console-only, by design. */
function sourceLabel(slug: string): string {
  if (slug.startsWith("hb-")) return "Hotelbeds";
  if (slug.startsWith("tm-")) return "TourMind";
  return "Platform";
}

function partyLabel(intent: SearchIntent): string {
  const adults = intent.rooms.reduce((sum, room) => sum + room.adults, 0);
  const children = intent.rooms.reduce((sum, room) => sum + room.childrenAges.length, 0);
  const ages = intent.rooms.flatMap((room) => room.childrenAges);
  return `${intent.rooms.length} rooms · ${adults} adults${children ? ` · ${children} children (${ages.join(", ")})` : ""}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "critical" }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className={cx("mt-1 text-lg font-bold", tone === "critical" && "text-critical-700")}>{value}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-xs wrap-anywhere">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- audit */

export function AdminAuditView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Audit locale={locale} />}</ConsoleShell>;
}

function Audit({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      const params = new URLSearchParams({ actor, action });
      const res = await fetch(apiUrl(`/api/admin/audit?${params.toString()}`), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: { entries: AuditEntry[]; actions: string[] } };
      if (!alive) return;
      setEntries(body.ok && body.data ? body.data.entries : []);
      if (body.ok && body.data) setActions(body.data.actions);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [actor, action]);

  return (
    <div className="space-y-4">
      <SectionHeading
        title={t("admin.audit")}
        description={t("admin.auditBody")}
        action={
          <a href={`/api/admin/audit?format=csv&actor=${encodeURIComponent(actor)}&action=${encodeURIComponent(action)}`}>
            <Button variant="secondary" size="sm">
              CSV
            </Button>
          </a>
        }
      />

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label={t("admin.actor")} htmlFor="au-actor">
          <Input id="au-actor" value={actor} onChange={(e) => setActor(e.target.value)} />
        </Field>
        <Field label={t("admin.action")} htmlFor="au-action">
          <Select id="au-action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t("admin.allActions")}</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {!entries && <Skeleton className="h-64 w-full" />}
      {entries && !entries.length && <p className="text-muted text-sm">{t("admin.noAudit")}</p>}
      {entries && entries.length > 0 && (
        <Card className="divide-ink-100 divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium wrap-anywhere">{entry.detail}</p>
                <Badge tone="neutral">{entry.action}</Badge>
              </div>
              <p className="text-muted text-xs wrap-anywhere">
                {entry.actor} · {entry.subject} · {formatDateTime(entry.at, locale)}
              </p>
              {(entry.before || entry.after) && (
                <p className="text-muted mt-0.5 font-mono text-xs wrap-anywhere">
                  {entry.before ?? "—"} → {entry.after ?? "—"}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
