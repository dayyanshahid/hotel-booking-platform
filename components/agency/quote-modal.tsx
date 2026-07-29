"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Field, Input, Modal, Select } from "@/components/ui";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

/**
 * Turning a basket of rates into a document.
 *
 * It lives here rather than inside the results page because rates are gathered
 * in two places — down a results list, and among the rooms of one property —
 * and an agent who collected three rates on a property page should not have to
 * carry them back to search to write the quote. The property page used to link
 * at a route that was never built, which is the same thing as losing them.
 */
export function QuoteModal({
  open,
  onClose,
  offerIds,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  offerIds: string[];
  onCreated: (id: string) => void;
}) {
  const { t } = useApp();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  /*
   * A margin for this quote alone.
   *
   * Empty means the agency's standing rule, which is what an agent wants
   * almost every time — so it is an optional field rather than a decision they
   * are made to take on every quote.
   */
  const [markup, setMarkup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The agency's saved clients, offered rather than imposed: picking one fills
   * the fields, and an agent quoting for someone new just types over them.
   */
  const [saved, setSaved] = useState<{ id: string; name: string; email?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch(apiUrl("/api/agency/customers"), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: { customers: { id: string; name: string; email?: string }[] } };
      if (body.ok && body.data) setSaved(body.data.customers);
    })();
  }, [open]);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl("/api/agency/quotes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({
        customerName,
        customerEmail: customerEmail || undefined,
        notes,
        offerIds,
        markupPercent: markup.trim() === "" ? undefined : Number(markup),
      }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { quote: { id: string } };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    onCreated(body.data.quote.id);
  }

  return (
    <Modal open={open} onClose={onClose} title={t("agency.newQuote")} size="sm">
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        <p className="text-muted text-sm">
          <Badge tone="neutral">{offerIds.length}</Badge> {t("agency.selectedRates")}
        </p>
        {saved.length > 0 && (
          <Field label={t("agency.pickCustomer")} htmlFor="q-saved">
            <Select
              id="q-saved"
              value=""
              onChange={(e) => {
                const picked = saved.find((customer) => customer.id === e.target.value);
                if (!picked) return;
                setCustomerName(picked.name);
                setCustomerEmail(picked.email ?? "");
              }}
            >
              <option value="">{t("agency.pickCustomerNone")}</option>
              {saved.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("agency.customerName")} htmlFor="q-name">
          <Input id="q-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field label={t("agency.customerEmail")} htmlFor="q-email">
          <Input id="q-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        </Field>
        <Field label={t("agency.quoteMarkup")} htmlFor="q-markup" hint={t("agency.quoteMarkupHint")}>
          <Input
            id="q-markup"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={t("agency.quoteMarkupDefault")}
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
        </Field>
        <Field label={t("agency.quoteNotes")} htmlFor="q-notes">
          <Input id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button onClick={create} loading={busy} disabled={!customerName.trim()}>
          {t("agency.createQuote")}
        </Button>
      </div>
    </Modal>
  );
}
