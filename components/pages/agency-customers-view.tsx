"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { DataTable, Nothing, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { Alert, Button, Card, Field, Input, Modal } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { AgencyCustomer } from "@/lib/agency/types";
import type { Locale } from "@/lib/types";
import { apiUrl } from "@/lib/api-origin";

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
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(apiUrl("/api/agency/customers"), { credentials: "same-origin" });
    const body = (await res.json()) as { ok: boolean; data?: { customers: AgencyCustomer[] } };
    setCustomers(body.ok && body.data ? body.data.customers : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl("/api/agency/customers"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...editing, id: editing.id || undefined }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(apiUrl(`/api/agency/customers?id=${encodeURIComponent(id)}`), {
      method: "DELETE",
      credentials: "same-origin",
    });
    setBusy(false);
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
    <div className="space-y-5">
      <PageHeader
        title={t("agency.customers")}
        description={t("agency.customersBody")}
        actions={<Button onClick={() => setEditing({ ...BLANK })}>{t("agency.addCustomer")}</Button>}
      />

      {customers && customers.length > 5 && (
        <Card className="p-4 sm:max-w-md">
          <Field label={t("admin.search")} htmlFor="cus-q">
            <Input id="cus-q" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
        </Card>
      )}

      {!customers && <TableSkeleton rows={4} />}
      {customers && !customers.length && (
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
              key: "notes",
              header: t("agency.notes"),
              secondary: true,
              render: (customer) => <span className="text-muted text-xs wrap-anywhere">{customer.notes ?? "—"}</span>,
            },
            {
              key: "added",
              header: t("agency.added"),
              align: "end",
              secondary: true,
              render: (customer) => (
                <span className="whitespace-nowrap">{formatDate(customer.createdAt.slice(0, 10), locale)}</span>
              ),
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
          <div className="space-y-3">
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
              <Input
                id="cus-notes"
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} loading={busy} disabled={!editing.name.trim()}>
                {t("common.save")}
              </Button>
              {editing.id && (
                <Button variant="ghost" onClick={() => remove(editing.id)} loading={busy}>
                  {t("common.remove")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
