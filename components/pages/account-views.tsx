"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Photo,
  SectionHeading,
  Select,
  Toggle,
} from "@/components/ui";
import { EmptySavedArt } from "@/components/ui/illustrations";
import { CURRENCIES } from "@/lib/format";
import { formatMoney, formatRelative } from "@/lib/format";
import { href } from "@/lib/nav";
import { setPreferenceCookie } from "@/lib/cookies";
import { LOCALE_META, LOCALES } from "@/lib/i18n";
import type { CurrencyCode, Locale, TravelerProfile } from "@/lib/types";

/* --------------------------------------------------------------- sign in */

export function SignInView({ locale }: { locale: Locale }) {
  const { t, signIn, account, toast } = useApp();
  const api = useApi();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (account) {
    return (
      <EmptyState
        title={account.email}
        body={t("account.title")}
        actions={
          <Link href={href(locale, "/account")}>
            <Button>{t("account.profile")}</Button>
          </Link>
        }
      />
    );
  }

  async function send() {
    setBusy(true);
    setError("");
    const res = await api<{ demoCode: string }>("/api/auth/otp", {
      method: "POST",
      body: JSON.stringify({ email, purpose: "signin" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDemoCode(res.data.demoCode);
    setStage("code");
  }

  async function verify() {
    setBusy(true);
    setError("");
    const res = await api<{ verified: boolean }>("/api/auth/otp", {
      method: "PUT",
      body: JSON.stringify({ email, code, purpose: "signin" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("account.codeInvalid"));
      return;
    }
    signIn(email);
    toast(t("account.title"), "success");
    router.push(href(locale, "/trips"));
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="p-5">
        <SectionHeading title={t("account.signInTitle")} description={t("account.signInBody")} />
        {stage === "email" ? (
          <div className="space-y-4">
            <Field label={t("account.emailLabel")} htmlFor="signin-email" required error={error}>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button className="w-full" onClick={send} loading={busy} disabled={!email.includes("@")}>
              {t("account.sendCode")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert tone="info">{t("account.codeSent", { email })}</Alert>
            {demoCode && (
              <p className="text-muted text-xs">
                Demo environment — code: <span className="font-mono font-bold">{demoCode}</span>
              </p>
            )}
            <Field label={t("account.codeLabel")} htmlFor="signin-code" required error={error}>
              <Input
                id="signin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Button className="w-full" onClick={verify} loading={busy} disabled={code.length < 6}>
              {t("account.verify")}
            </Button>
            <Button variant="quiet" className="w-full" onClick={() => setStage("email")}>
              {t("common.back")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- account */

export function AccountView({ locale }: { locale: Locale }) {
  const { t, account, signOut, currency, setCurrency, recent, clearRecent, consent, setConsent, toast } = useApp();
  const api = useApi();
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [consentToStore, setConsentToStore] = useState(false);

  useEffect(() => {
    if (!account) return;
    void (async () => {
      const res = await api<{ travelers: TravelerProfile[] }>(`/api/travelers?email=${encodeURIComponent(account.email)}`);
      if (res.ok) setTravelers(res.data.travelers);
    })();
  }, [account, api]);

  if (!account) {
    return (
      <EmptyState
        title={t("account.signInTitle")}
        body={t("account.signInBody")}
        actions={
          <Link href={href(locale, "/signin")}>
            <Button>{t("nav.signIn")}</Button>
          </Link>
        }
      />
    );
  }

  async function saveTravelers(next: TravelerProfile[]) {
    const res = await api<{ travelers: TravelerProfile[] }>("/api/travelers", {
      method: "PUT",
      body: JSON.stringify({ email: account!.email, travelers: next, consent: consentToStore }),
    });
    if (!res.ok) {
      toast(res.error.message, "critical");
      return;
    }
    setTravelers(res.data.travelers);
    toast(t("common.save"), "success");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold sm:text-2xl">{t("account.title")}</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeading title={t("account.profile")} />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("account.emailLabel")}</dt>
              <dd className="font-medium wrap-anywhere">{account.email}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={locale === "ar" ? "العملة" : "Currency"} htmlFor="pref-currency">
              <Select
                id="pref-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {code} — {CURRENCIES[code].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Language" htmlFor="pref-language">
              <Select
                id="pref-language"
                value={locale}
                onChange={(e) => {
                  setPreferenceCookie("nz_locale", e.target.value);
                  window.location.href = `/${e.target.value}/account`;
                }}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_META[code].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="secondary" className="mt-4" onClick={signOut}>
            {t("nav.signOut")}
          </Button>
        </Card>

        <Card className="p-4">
          <SectionHeading title={t("account.rewards")} />
          <div className="flex items-center gap-4">
            <div>
              <p className="text-muted text-xs">{t("account.rewardsTier")}</p>
              <p className="text-lg font-bold">Silver</p>
            </div>
            <div>
              <p className="text-muted text-xs">{t("account.rewardsBalance")}</p>
              <p className="text-lg font-bold">1,240</p>
            </div>
          </div>
          <p className="text-muted mt-2 text-xs">
            {locale === "ar"
              ? "تُحتسب النقاط على المبالغ المدفوعة عبر المنصة فقط، وتظهر بعد انتهاء الإقامة."
              : "Points accrue on amounts paid through the platform only, and appear after checkout of the stay."}
          </p>
        </Card>

        <Card className="p-4">
          <SectionHeading title={t("account.travelers")} description={t("account.travelersBody")} />
          <ul className="space-y-2">
            {travelers.map((traveler) => (
              <li key={traveler.id} className="hairline flex items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3.5 text-sm">
                <span>
                  {traveler.firstName} {traveler.surname}
                  <Badge tone="neutral" className="ms-2">
                    {traveler.type === "child" ? t("common.child") : t("common.adults")}
                  </Badge>
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => saveTravelers(travelers.filter((x) => x.id !== traveler.id))}
                >
                  {t("common.remove")}
                </Button>
              </li>
            ))}
            {!travelers.length && <li className="text-muted text-sm">—</li>}
          </ul>
          <div className="mt-3">
            <Checkbox
              checked={consentToStore}
              onChange={(e) => setConsentToStore(e.target.checked)}
              label={
                locale === "ar"
                  ? "أوافق على تخزين بيانات المسافرين لإعادة استخدامها."
                  : "I consent to storing traveler details for reuse."
              }
            />
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={!consentToStore}
            onClick={() =>
              saveTravelers([
                ...travelers,
                {
                  id: `tp_${Math.random().toString(36).slice(2, 9)}`,
                  type: "adult",
                  firstName: "New",
                  surname: "Traveler",
                  consentAt: new Date().toISOString(),
                },
              ])
            }
          >
            {t("account.addTraveler")}
          </Button>
        </Card>

        <Card className="p-4">
          <SectionHeading title={t("account.privacy")} />
          <div className="space-y-3">
            <Toggle
              checked={consent.analytics}
              onChange={(next) => setConsent({ analytics: next, marketing: consent.marketing })}
              label={locale === "ar" ? "تحليلات مجهولة الهوية" : "Anonymous analytics"}
            />
            <Toggle
              checked={consent.marketing}
              onChange={(next) => setConsent({ analytics: consent.analytics, marketing: next })}
              label={locale === "ar" ? "رسائل تسويقية" : "Marketing messages"}
            />
          </div>

          <div className="mt-4 border-t pt-3">
            <p className="text-sm font-semibold">{t("account.recentActivity")}</p>
            <ul className="text-muted mt-1 space-y-1 text-xs">
              {recent.slice(0, 5).map((entry) => (
                <li key={entry.id} className="wrap-anywhere">
                  {entry.label} · {formatRelative(entry.at, locale)}
                </li>
              ))}
              {!recent.length && <li>—</li>}
            </ul>
            <Button size="sm" variant="secondary" className="mt-2" onClick={clearRecent}>
              {t("account.deleteActivity")}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- saved */

export function SavedView({ locale }: { locale: Locale }) {
  const { t, saved, toggleSaved, currency, toast } = useApp();
  const [shareOpen, setShareOpen] = useState(false);

  if (!saved.length) {
    return (
      <EmptyState
        art={<EmptySavedArt />}
        title={t("saved.title")}
        body={t("saved.empty")}
        actions={
          <Link href={href(locale, "/")}>
            <Button>{t("common.searchHotels")}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">{t("saved.title")}</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(
              `${window.location.origin}${href(locale, "/saved")}?list=${saved.map((s) => s.slug).join(",")}`,
            );
            setShareOpen(true);
            toast(t("common.copied"), "success");
          }}
        >
          {t("saved.shareList")}
        </Button>
      </div>

      {shareOpen && <Alert tone="info">{t("saved.shareBody")}</Alert>}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {saved.map((hotel) => (
          <li key={hotel.slug}>
            <Card className="h-full overflow-hidden">
              <Link href={href(locale, `/hotel/${hotel.slug}`)}>
                <Photo src={hotel.image} alt={hotel.name} ratio="16/10" fallbackLabel={t("hotel.imageFallback")} />
              </Link>
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{hotel.name}</p>
                <p className="text-muted text-xs">{hotel.city}</p>
                {hotel.total != null && (
                  <p className="mt-1 text-sm font-bold">
                    {formatMoney(hotel.total, hotel.currency ?? currency, locale)}
                  </p>
                )}
                {/* Saved prices are never presented as held availability (§5.10). */}
                <p className="text-muted mt-1 text-[11px]">
                  {t("saved.priceStale", { time: formatRelative(hotel.checkedAt, locale) })}
                </p>
                <Button
                  size="sm"
                  variant="quiet"
                  className="mt-1 !px-0"
                  onClick={() => toggleSaved(hotel)}
                >
                  {t("common.remove")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
