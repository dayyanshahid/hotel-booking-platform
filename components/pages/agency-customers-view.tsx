"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { DataTable, Nothing, PageBody, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { Alert, Badge, Button, Card, Field, Input, Modal } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { CustomerHistory } from "@/lib/agency/customers";
import type { CurrencyCode } from "@/lib/types";
import type { AgencyCustomer } from "@/lib/agency/types";
import type { Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

/**
 * The agency's own client list.
 *
 * Agencies sell to the same people for years and were retyping them into every
 * quote and every booking — which is not just tedious, it is how a name ends up
 * spelled two ways across a booking and a voucher.
 *
 * Held per agency and never shared. One agency's client list is not another's,
 * and it is not ours to aggregate either.
 */
export function AgencyCustomersView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{() => <Customers locale={locale} />}</PortalShell>;
}

const BLANK = { id: "", name: "", email: "", phone: "", reference: "", notes: "" };

function Customers({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [customers, setCustomers] = useState<AgencyCustomer[] | null>(null);
  const [history, setHistory] = useState<Record<string, CustomerHistory>>({});
  /** The client whose removal is waiting on a second click. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    const body = await apiFetch<{
      customers: AgencyCustomer[];
      history?: Record<string, CustomerHistory>;
    }>("/api/agency/customers");
    // An unreadable address book showed as an empty one, and the obvious next
    // move is to re-enter people who are already on it.
    setLoadFailed(!body.ok);
    if (body.ok && body.data) {
      setCustomers(body.data.customers);
      setHistory(body.data.history ?? {});
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const body = await apiFetch<unknown>("/api/agency/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...editing, id: editing.id || undefined }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(id: string) {
    setConfirming(null);
    setBusy(true);
    setError(null);
    /*
     * The result was thrown away, so a refused or unreachable delete did
     * nothing at all and said nothing at all — the row stayed, the panel
     * closed, and the only reading available was that the click had missed.
     * The screen already has somewhere to put this; the delete just never
     * used it.
     */
    const body = await apiFetch<unknown>(`/api/agency/customers?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setEditing(null);
    await load();
  }

  const rows = (customers ?? []).filter(
    (customer) =>
      !query.trim() ||
      `${customer.name} ${customer.email ?? ""} ${customer.reference ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  return (
    <PageBody measure="data" className="space-y-5">
      <PageHeader
        title={t("agency.customers")}
        description={t("agency.customersBody")}
        actions={<Button onClick={() => setEditing({ ...BLANK })}>{t("agency.addCustomer")}</Button>}
      />

      {/*
        A filter bar, not a card of its own.

        A single search box in a bordered box floating above a full-width table
        is a second object competing with the table for the reader's attention,
        and it does not match how Team or the statement narrow a list. Same
        control, same place, same shape, on every screen that has one.
      */}
      {customers && customers.length > 3 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("agency.customerSearch")}
              aria-label={t("agency.customerSearch")}
            />
          </div>
          <p className="text-muted text-xs tabular-nums">
            {t("agency.movementsShowing", { shown: rows.length, total: customers.length })}
          </p>
        </div>
      )}

      {!customers && !loadFailed && <TableSkeleton rows={4} />}
      {loadFailed && (
        <Alert tone="warning" title={t("agency.customersUnavailable")}>
          {t("agency.customersUnavailableBody")}
        </Alert>
      )}
      {customers && !loadFailed && !customers.length && (
        <Nothing
          icon="users"
          title={t("agency.noCustomers")}
          body={t("agency.noCustomersBody")}
          action={<Button onClick={() => setEditing({ ...BLANK })}>{t("agency.addCustomer")}</Button>}
        />
      )}

      {customers && customers.length > 0 && (
        <DataTable
          rows={rows}
          rowKey={(customer) => customer.id}
          minWidth={620}
          empty={<Nothing icon="search" title={t("agency.noMatches")} />}
          columns={[
            {
              key: "name",
              header: t("agency.customerName"),
              render: (customer) => (
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere">{customer.name}</p>
                  {customer.reference && <p className="text-muted font-mono text-xs">{customer.reference}</p>}
                </div>
              ),
            },
            {
              key: "contact",
              header: t("agency.contact"),
              render: (customer) => (
                <div className="min-w-0 text-xs">
                  {customer.email && <p className="wrap-anywhere">{customer.email}</p>}
                  {customer.phone && <p className="text-muted">{customer.phone}</p>}
                  {!customer.email && !customer.phone && <span className="text-muted">—</span>}
                </div>
              ),
            },
            {
              /*
               * What the agency has actually done with them.
               *
               * The column this replaces showed the notes field, which is
               * already on the record and rarely the thing anybody is scanning
               * for. "Two quotes open, $1,400" is what decides whether to ring
               * somebody this afternoon.
               */
              key: "trade",
              header: t("agency.trade"),
              render: (customer) => {
                const trade = history[customer.id];
                if (!trade || (!trade.quotes && !trade.bookings)) {
                  return <span className="text-muted text-xs">{t("agency.noTradeYet")}</span>;
                }
                const currency = (trade.currency ?? "USD") as CurrencyCode;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {trade.openQuotes > 0 && (
                      <Badge tone="brand">
                        {t("agency.openQuotesWorth", {
                          count: trade.openQuotes,
                          value: formatMoney(trade.openValue, currency, locale),
                        })}
                      </Badge>
                    )}
                    {trade.bookings > 0 && (
                      <span className="text-muted tabular-nums">
                        {t("agency.bookedSold", {
                          count: trade.bookings,
                          value: formatMoney(trade.sold, currency, locale),
                        })}
                      </span>
                    )}
                    {trade.openQuotes === 0 && trade.bookings === 0 && trade.quotes > 0 && (
                      <span className="text-muted">{t("agency.quotesClosed", { count: trade.quotes })}</span>
                    )}
                  </div>
                );
              },
            },
            {
              /*
               * When something last happened, falling back to when they were
               * added. The date a record was created stops being interesting
               * the moment there is trade against it; "last heard from" does
               * not.
               */
              key: "last",
              header: t("agency.lastActivity"),
              align: "end",
              secondary: true,
              render: (customer) => {
                const when = history[customer.id]?.lastActivity ?? customer.createdAt;
                return <span className="whitespace-nowrap">{formatDate(when.slice(0, 10), locale)}</span>;
              },
            },
            {
              key: "edit",
              header: "",
              align: "end",
              render: (customer) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: customer.id,
                      name: customer.name,
                      email: customer.email ?? "",
                      phone: customer.phone ?? "",
                      reference: customer.reference ?? "",
                      notes: customer.notes ?? "",
                    })
                  }
                >
                  {t("common.edit")}
                </Button>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? t("common.edit") : t("agency.addCustomer")}
        size="sm"
      >
        {editing && (
          /*
           * A form, so Enter saves. Everybody types a name and presses it, and
           * without this the key did nothing on a dialog whose whole content is
           * five fields.
           */
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && editing.name.trim()) void save();
            }}
          >
            {error && <Alert tone="critical">{error}</Alert>}
            <Field label={t("agency.customerName")} htmlFor="cus-name">
              <Input
                id="cus-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label={t("agency.customerEmail")} htmlFor="cus-email">
              <Input
                id="cus-email"
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <Field label={t("agency.phone")} htmlFor="cus-phone">
              <Input
                id="cus-phone"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </Field>
            <Field label={t("agency.customerReference")} htmlFor="cus-ref">
              <Input
                id="cus-ref"
                value={editing.reference}
                onChange={(e) => setEditing({ ...editing, reference: e.target.value })}
              />
            </Field>
            <Field label={t("agency.notes")} htmlFor="cus-notes">
              {/*
                Several lines, because this is where an agent records that the
                client only flies mornings and always wants a high floor. A
                single-line input made that a scrolling ribbon nobody could read
                back.
              */}
              <textarea
                id="cus-notes"
                rows={3}
                maxLength={400}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                className="hairline focus-ring w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={busy} disabled={!editing.name.trim()}>
                {t("common.save")}
              </Button>
              {editing.id &&
                /*
                 * Asked before it is done, and it names what goes with them.
                 * Removing a client was one click on an irreversible action
                 * sitting beside Save — and their quotes keep their name and
                 * address, so the loss is the link rather than the record,
                 * which is worth saying rather than leaving to be discovered.
                 */
                (confirming === editing.id ? (
                  <>
                    <Button variant="danger" onClick={() => remove(editing.id)} loading={busy}>
                      {t("agency.removeConfirm")}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      {t("common.cancel")}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirming(editing.id)}>
                    {t("common.remove")}
                  </Button>
                ))}
            </div>

            {confirming === editing.id && (
              <Alert tone="warning">
                {history[editing.id]?.quotes
                  ? t("agency.removeWithTrade", { count: history[editing.id].quotes })
                  : t("agency.removePlain")}
              </Alert>
            )}
          </form>
        )}
      </Modal>
    </PageBody>
  );
}
