"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { CancellationTimeline, PriceBlock } from "@/components/commerce/price";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  SectionHeading,
  Skeleton,
  Stepper,
  cx,
} from "@/components/ui";
import { countdown, formatDate, formatDuration, formatMoney, guestCount } from "@/lib/format";
import { href } from "@/lib/nav";
import type {
  ApiError,
  Booking,
  CheckoutSession,
  Locale,
  PaymentIntent,
  RecheckResult,
  RequirementField,
} from "@/lib/types";

type Values = Record<string, string>;

/**
 * F-050 to F-053 — traveler details, recheck, payment/review and processing.
 *
 * Guarantees implemented here:
 *  - a material adverse change at recheck must be explicitly accepted (§6.4)
 *  - card data stays inside the provider's fields; the platform sees a token
 *  - exactly one idempotent submission, protected against double-click, back
 *    and refresh (E-16)
 */
export function CheckoutView({ locale, sessionId }: { locale: Locale; sessionId: string }) {
  const { t, track, account, toast, announce } = useApp();
  const api = useApi();
  const router = useRouter();

  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState({
    terms: false,
    cancellation: false,
    localFees: false,
    mandatory: false,
    marketing: false,
  });
  const [recheck, setRecheck] = useState<RecheckResult | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [payment, setPayment] = useState<PaymentIntent | null>(null);
  const [method, setMethod] = useState("card");
  const [threeDs, setThreeDs] = useState<"idle" | "pending">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  // Drives the held-selection countdown; the value itself is not read.
  const [, setTick] = useState(0);
  /**
   * The checkout session already identifies exactly one order attempt, so the
   * idempotency key is derived from it rather than generated randomly. Replaying
   * a submission — double-click, back, refresh — can never create a second
   * booking (E-16), and the key is stable across re-renders.
   */
  const idempotencyKey = `idem_${sessionId}`;
  const submitted = useRef(false);

  useEffect(() => {
    void (async () => {
      const res = await api<CheckoutSession>(`/api/checkout/sessions?id=${sessionId}`);
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setSession(res.data);
      setValues((prev) => ({
        contactLanguage: locale,
        email: account?.email ?? "",
        ...prev,
      }));
      track("checkout_started", {
        session: res.data.checkoutSessionId,
        rooms: res.data.rooms.length,
        total: res.data.price.total,
        guest: account ? "member" : "guest",
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const expiry = session ? countdown(session.expiresAt) : null;
  const expired = Boolean(expiry?.expired);

  const grouped = useMemo(() => {
    const groups: Record<RequirementField["group"], RequirementField[]> = {
      contact: [],
      lead: [],
      guest: [],
      billing: [],
      request: [],
    };
    for (const field of session?.requirements ?? []) groups[field.group].push(field);
    return groups;
  }, [session]);

  function validateStep(): boolean {
    const next: Record<string, string> = {};
    const required = [...grouped.contact, ...grouped.lead, ...grouped.guest].filter((f) => f.required);
    for (const field of required) {
      const value = (values[field.name] ?? "").trim();
      if (!value) {
        next[field.name] = locale === "ar" ? "هذا الحقل مطلوب." : "This field is required.";
      } else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        next[field.name] = locale === "ar" ? "أدخل بريدًا صحيحًا." : "Enter a valid email address.";
      } else if (field.type === "tel" && value.replace(/\D/g, "").length < 7) {
        next[field.name] = locale === "ar" ? "أدخل رقمًا صحيحًا." : "Enter a valid number.";
      }
    }
    setErrors(next);
    if (Object.keys(next).length) {
      announce(locale === "ar" ? "توجد أخطاء في النموذج" : "The form has errors");
      return false;
    }
    return true;
  }

  /** Recheck runs before payment is initialised, never before the customer asks. */
  const runRecheck = useCallback(async () => {
    if (!session) return;
    setRechecking(true);
    const res = await api<RecheckResult>("/api/rates/recheck", {
      method: "POST",
      body: JSON.stringify({ offerId: session.offerId, checkoutSessionId: session.checkoutSessionId }),
    });
    setRechecking(false);
    if (!res.ok) {
      setSubmitError(res.error);
      return;
    }
    setRecheck(res.data);
    track("rate_recheck_result", {
      outcome: res.data.outcome,
      delta: res.data.current ? res.data.current.price.total - res.data.previous.price.total : 0,
    });

    if (res.data.outcome === "lower" && res.data.current) {
      setSession({ ...session, price: res.data.current.price, cancellation: res.data.current.cancellation });
      toast(t("recheck.lowerTitle"), "success");
    }
    if (!res.data.requiresAcceptance && res.data.outcome !== "unavailable") {
      const intentRes = await api<PaymentIntent>("/api/payments/intents", {
        method: "POST",
        body: JSON.stringify({ checkoutSessionId: session.checkoutSessionId }),
      });
      if (intentRes.ok) setPayment(intentRes.data);
    }
  }, [api, session, t, toast, track]);

  async function acceptChange() {
    if (!session || !recheck?.current) return;
    setRechecking(true);
    const res = await api<RecheckResult>("/api/rates/recheck", {
      method: "POST",
      body: JSON.stringify({ offerId: session.offerId, checkoutSessionId: session.checkoutSessionId, accept: true }),
    });
    setRechecking(false);
    if (!res.ok) return;
    setSession({
      ...session,
      price: res.data.current?.price ?? session.price,
      cancellation: res.data.current?.cancellation ?? session.cancellation,
      expiresAt: res.data.newExpiresAt ?? session.expiresAt,
    });
    setRecheck({ ...res.data, requiresAcceptance: false });
    track("rate_change_accepted", { outcome: res.data.outcome });
    const intentRes = await api<PaymentIntent>("/api/payments/intents", {
      method: "POST",
      body: JSON.stringify({ checkoutSessionId: session.checkoutSessionId }),
    });
    if (intentRes.ok) setPayment(intentRes.data);
  }

  async function submitBooking(threeDsStatus: "notRequired" | "passed" | "abandoned" | "failed") {
    if (!session || submitted.current) return;
    if (!consents.terms || !consents.cancellation) {
      setErrors({ consents: locale === "ar" ? "يجب قبول الشروط وسياسة الإلغاء." : "Accept the terms and the cancellation policy." });
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const guests = session.rooms.flatMap((room, roomIndex) => {
      const list: { roomIndex: number; type: "adult" | "child"; firstName: string; surname?: string; age?: number }[] = [];
      for (let a = 1; a < room.adults; a++) {
        list.push({
          roomIndex,
          type: "adult",
          firstName: values[`room${roomIndex}_adult${a}_firstName`] ?? "",
          surname: values[`room${roomIndex}_adult${a}_surname`] ?? "",
        });
      }
      room.childrenAges.forEach((age, c) => {
        list.push({
          roomIndex,
          type: "child",
          firstName: values[`room${roomIndex}_child${c}_firstName`] ?? "",
          age,
        });
      });
      return list;
    });

    const res = await api<{ booking: Booking; emailDelivered: boolean }>("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        checkoutSessionId: session.checkoutSessionId,
        idempotencyKey,
        contact: {
          email: values.email,
          phone: values.phone,
          language: (values.contactLanguage as Locale) ?? locale,
        },
        lead: {
          firstName: values.leadFirstName,
          surname: values.leadSurname,
          nationality: values.leadNationality,
        },
        guests,
        requests: {
          arrivalTime: values.arrivalTime,
          bedPreference: values.bedPreference,
          accessibilityRequest: values.accessibilityRequest,
          remarks: values.remarks,
        },
        billing: {
          country: values.billingCountry,
          city: values.billingCity,
          company: values.companyName,
          taxId: values.taxId,
        },
        consents,
        payment: { method, token: "tok_provider_hosted_field", threeDsStatus },
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      submitted.current = false;
      setSubmitError(res.error);
      track("payment_result", { outcome: "failed", category: res.error.category, method });
      return;
    }

    track("booking_result", {
      status: res.data.booking.status,
      total: res.data.booking.price.total,
      emailDelivered: res.data.emailDelivered,
    });
    router.push(
      `${href(locale, `/booking/${res.data.booking.reference}`)}?email=${encodeURIComponent(res.data.booking.contact.email)}${res.data.emailDelivered ? "" : "&emailFailed=1"}`,
    );
  }

  function startPayment() {
    if (!validateStep()) return;
    if (payment?.threeDsRequired) {
      setThreeDs("pending");
      track("payment_result", { outcome: "3ds_started", method });
      return;
    }
    void submitBooking("notRequired");
  }

  if (loadError) {
    return (
      <EmptyState
        standalone
        title={t("checkout.expired")}
        body={loadError.message}
        actions={
          <Link href={href(locale, "/")}>
            <Button>{t("common.search")}</Button>
          </Link>
        }
      />
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const payAtProperty = session.price.payAtProperty.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.025em] sm:text-[32px]">{t("checkout.title")}</h1>
        {expiry && !expired && (
          <Badge tone={expiry.minutes < 3 ? "caution" : "neutral"} className="tabular">
            {t("checkout.expiresIn", { time: formatDuration(expiry.minutes, expiry.seconds) })}
          </Badge>
        )}
      </div>

      <Stepper steps={[t("checkout.step1"), t("checkout.step2"), t("checkout.step3")]} current={step} />

      {expired && (
        <Alert
          tone="warning"
          title={t("checkout.expired")}
          action={
            <Button size="sm" onClick={() => runRecheck()} loading={rechecking}>
              {t("common.retry")}
            </Button>
          }
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {step === 0 && (
            <>
              {!account && (
                <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("checkout.signInFaster")}</p>
                    {/* Stated as fact, not as a chip beside a button — chip-shaped
                        text next to a real control reads as a disabled action. */}
                    <p className="text-muted mt-0.5 text-xs">{t("checkout.guestCheckoutHint")}</p>
                  </div>
                  <Link href={href(locale, "/signin")} className="shrink-0">
                    <Button size="sm" variant="secondary">
                      {t("nav.signIn")}
                    </Button>
                  </Link>
                </Card>
              )}

              <FieldGroup
                title={t("checkout.contact")}
                description={t("checkout.contactHint")}
                fields={grouped.contact}
                values={values}
                errors={errors}
                onChange={setValues}
              />
              <FieldGroup
                title={t("checkout.leadGuest")}
                description={t("checkout.nameHint")}
                fields={grouped.lead}
                values={values}
                errors={errors}
                onChange={setValues}
              />
              {grouped.guest.length > 0 && (
                <FieldGroup
                  title={t("bookingDetail.guests")}
                  fields={grouped.guest}
                  values={values}
                  errors={errors}
                  onChange={setValues}
                />
              )}
              <FieldGroup
                title={t("checkout.requests")}
                description={t("checkout.requestsHint")}
                fields={grouped.request}
                values={values}
                errors={errors}
                onChange={setValues}
              />
              {grouped.billing.length > 0 && (
                <FieldGroup
                  title={t("checkout.billing")}
                  description={t("checkout.billingHint")}
                  fields={grouped.billing}
                  values={values}
                  errors={errors}
                  onChange={setValues}
                />
              )}

              <Button
                size="lg"
                onClick={() => {
                  if (!validateStep()) return;
                  setStep(1);
                  track("checkout_step_completed", { step: 1 });
                  void runRecheck();
                }}
              >
                {t("common.continue")}
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              {rechecking && (
                <Alert tone="info" title={t("checkout.rechecking")}>
                  {locale === "ar"
                    ? "نتأكد من السعر النهائي والشروط قبل الدفع."
                    : "We are confirming the final price and conditions before payment."}
                </Alert>
              )}

              {recheck?.outcome === "lower" && (
                <Alert tone="success" title={t("recheck.lowerTitle")}>
                  {t("recheck.lowerBody")}
                </Alert>
              )}

              <Card className="p-4">
                <SectionHeading level="card" title={t("checkout.payment")} description={t("checkout.paymentSecure")} />
                {payment?.mode === "guarantee" && (
                  <div className="mb-3">
                    <Alert tone="info">
                      {locale === "ar"
                        ? "لن نخصم أي مبلغ الآن. تُستخدم البطاقة لضمان الحجز فقط، ويُحصَّل المبلغ حسب شروط الدفع والإلغاء الموضحة."
                        : "Nothing is charged now. Your card only guarantees the booking; it is charged according to the payment and cancellation terms shown."}
                    </Alert>
                  </div>
                )}
                <div className="space-y-2">
                  {(payment?.allowedMethods ?? [{ code: "card", label: "Visa / Mastercard", markets: [], requiresBilling: true }]).map(
                    (option) => (
                      <label
                        key={option.code}
                        className={cx(
                          "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3.5 text-sm transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--ease-out)]",
                          method === option.code && "border-brand-500 bg-brand-50/40",
                        )}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          checked={method === option.code}
                          onChange={() => setMethod(option.code)}
                          className="size-4"
                        />
                        {option.label}
                      </label>
                    ),
                  )}
                </div>

                {method === "card" && (
                  <div className="surface-sunken mt-4 rounded-[var(--radius-card)] border border-dashed p-4">
                    <p className="text-muted text-xs font-medium">
                      {locale === "ar"
                        ? "حقول مزود الدفع الآمنة (محاكاة)"
                        : "Payment provider hosted fields (simulated)"}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div className="surface h-11 rounded border px-3 py-3 text-xs text-[var(--text-muted)]">
                        •••• •••• •••• ••••
                      </div>
                      <div className="surface h-11 rounded border px-3 py-3 text-xs text-[var(--text-muted)]">MM / YY</div>
                      <div className="surface h-11 rounded border px-3 py-3 text-xs text-[var(--text-muted)]">CVC</div>
                    </div>
                    <p className="text-muted mt-2 text-xs">
                      {locale === "ar"
                        ? "لا يمر رقم البطاقة أو رمز التحقق عبر خوادمنا ولا يُسجَّل في أي مكان."
                        : "The card number and CVC never pass through our servers and are never logged."}
                    </p>
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <SectionHeading level="card" title={t("checkout.terms")} />
                <div className="space-y-3">
                  <Checkbox
                    checked={consents.terms}
                    onChange={(e) => setConsents({ ...consents, terms: e.target.checked })}
                    label={t("checkout.acceptTerms")}
                  />
                  <Checkbox
                    checked={consents.cancellation}
                    onChange={(e) => setConsents({ ...consents, cancellation: e.target.checked })}
                    label={t("checkout.acceptCancellation")}
                  />
                  {payAtProperty > 0 && (
                    <Checkbox
                      checked={consents.localFees}
                      onChange={(e) => setConsents({ ...consents, localFees: e.target.checked })}
                      label={t("checkout.acceptLocalFees")}
                    />
                  )}
                  {session.comments.some((c) => c.mandatory) && (
                    <Checkbox
                      checked={consents.mandatory}
                      onChange={(e) => setConsents({ ...consents, mandatory: e.target.checked })}
                      label={t("checkout.acceptMandatory")}
                    />
                  )}
                  {/* Marketing consent is separate and unchecked by default (§5.8). */}
                  <Checkbox
                    checked={consents.marketing}
                    onChange={(e) => setConsents({ ...consents, marketing: e.target.checked })}
                    label={t("checkout.marketing")}
                  />
                </div>
                {errors.consents && (
                  <p role="alert" className="text-critical-700 mt-2 text-xs font-medium">
                    {errors.consents}
                  </p>
                )}
              </Card>

              {submitError && (
                <Alert
                  tone="critical"
                  title={t(`error.${submitError.category}`)}
                  correlationId={`${t("error.correlation")}: ${submitError.correlationId}`}
                  action={
                    <>
                      {submitError.retryable && (
                        <Button size="sm" onClick={() => submitBooking("notRequired")}>
                          {t("common.retry")}
                        </Button>
                      )}
                      <Link href={href(locale, "/support")}>
                        <Button size="sm" variant="secondary">
                          {t("support.title")}
                        </Button>
                      </Link>
                    </>
                  }
                >
                  {submitError.message}
                </Alert>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setStep(0)}>
                  {t("common.back")}
                </Button>
                <Button
                  size="lg"
                  onClick={startPayment}
                  loading={submitting || rechecking}
                  disabled={Boolean(recheck?.requiresAcceptance) || expired}
                >
                  {session.paymentTiming === "payNow"
                    ? t("checkout.payButton", {
                        amount: formatMoney(session.price.total, session.price.currency, locale),
                      })
                    : t("checkout.bookButton")}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Sticky order summary */}
        <aside>
          <Card className="p-4 lg:sticky lg:top-24">
            <p className="text-sm font-semibold">{t("checkout.orderSummary")}</p>
            <p className="mt-2 text-sm font-medium wrap-anywhere">{session.hotelName}</p>
            <p className="text-muted text-sm wrap-anywhere">
              {session.roomName} · {session.boardLabel}
            </p>
            <p className="text-muted mt-1 text-sm">
              {formatDate(session.checkIn, locale)} → {formatDate(session.checkOut, locale)}
            </p>
            <p className="text-muted text-sm">
              {session.rooms.length} × {t("common.room")} · {guestCount(session.rooms)} {t("common.guests")}
            </p>

            <div className="mt-4 border-t pt-3">
              <PriceBlock price={session.price} align="start" size="lg" />
            </div>

            <div className="mt-4 border-t pt-3">
              <CancellationTimeline policy={session.cancellation} currency={session.price.currency} />
            </div>

            {session.comments.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-sm font-semibold">{t("rate.conditions")}</p>
                <ul className="text-muted mt-1 space-y-1 text-xs">
                  {session.comments.map((comment) => (
                    <li key={comment.id} className="wrap-anywhere">
                      {comment.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </aside>
      </div>

      {/* F-052 price/policy change */}
      <Modal
        open={Boolean(recheck?.requiresAcceptance) || recheck?.outcome === "unavailable"}
        onClose={() => setRecheck(null)}
        dismissible={false}
        title={recheck?.outcome === "unavailable" ? t("recheck.unavailableTitle") : t("recheck.title")}
        size="md"
        footer={
          recheck?.outcome === "unavailable" ? (
            <div className="flex flex-wrap gap-2">
              <Link href={href(locale, "/search")}>
                <Button variant="secondary">{t("recheck.reject")}</Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={acceptChange} loading={rechecking}>
                {t("recheck.accept")}
              </Button>
              <Button variant="secondary" onClick={() => router.push(href(locale, `/hotel/${session.hotelSlug}`))}>
                {t("recheck.reject")}
              </Button>
            </div>
          )
        }
      >
        {recheck && (
          <div className="space-y-4">
            <p className="text-sm">
              {recheck.outcome === "unavailable"
                ? t("recheck.unavailableBody")
                : recheck.outcome === "policyChanged"
                  ? t("recheck.policyBody")
                  : t("recheck.higherBody")}
            </p>

            {recheck.current && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="p-3">
                  <p className="text-muted text-xs font-semibold uppercase">{t("recheck.previous")}</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatMoney(recheck.previous.price.total, recheck.previous.price.currency, locale)}
                  </p>
                  <div className="mt-2">
                    <CancellationTimeline
                      policy={recheck.previous.cancellation}
                      currency={recheck.previous.price.currency}
                      compact
                    />
                  </div>
                </Card>
                <Card className="border-brand-500 p-3">
                  <p className="text-muted text-xs font-semibold uppercase">{t("recheck.current")}</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatMoney(recheck.current.price.total, recheck.current.price.currency, locale)}
                  </p>
                  <div className="mt-2">
                    <CancellationTimeline
                      policy={recheck.current.cancellation}
                      currency={recheck.current.price.currency}
                      compact
                    />
                  </div>
                </Card>
              </div>
            )}

            <ul className="text-muted list-disc space-y-1 ps-5 text-sm">
              {recheck.changeReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            {recheck.alternatives && recheck.alternatives.length > 0 && (
              <div>
                <p className="text-sm font-semibold">{t("recheck.viewAlternatives")}</p>
                <ul className="mt-2 space-y-2">
                  {recheck.alternatives.map((alternative) => (
                    <li key={alternative.offerId}>
                      <Card className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{alternative.roomName}</p>
                          <p className="text-muted text-xs">
                            {alternative.boardLabel} ·{" "}
                            {alternative.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className="text-sm font-bold">
                            {formatMoney(alternative.price.total, alternative.price.currency, locale)}
                          </p>
                          <Button
                            size="sm"
                            onClick={async () => {
                              const res = await api<{ checkoutSessionId: string }>("/api/checkout/sessions", {
                                method: "POST",
                                body: JSON.stringify({ offerId: alternative.offerId }),
                              });
                              if (res.ok) router.push(href(locale, `/checkout/${res.data.checkoutSessionId}`));
                            }}
                          >
                            {t("room.selectRate")}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Simulated 3-D Secure step */}
      <Modal
        open={threeDs === "pending"}
        onClose={() => setThreeDs("idle")}
        dismissible={false}
        title={t("checkout.threeDs")}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setThreeDs("idle");
                void submitBooking("passed");
              }}
            >
              {t("checkout.threeDsApprove")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setThreeDs("idle");
                void submitBooking("abandoned");
              }}
            >
              {t("checkout.threeDsReject")}
            </Button>
          </div>
        }
      >
        <p className="text-sm">{t("checkout.threeDsBody")}</p>
        <p className="text-muted mt-2 text-xs">{payment?.merchantDescriptor}</p>
      </Modal>

      {/* F-053 processing */}
      <Modal open={submitting} onClose={() => {}} dismissible={false} title={t("checkout.processing")} size="sm">
        <p className="text-sm">{t("checkout.processingBody")}</p>
        <p className="text-muted mt-3 font-mono text-xs">
          {t("checkout.transactionRef")}: {idempotencyKey.slice(0, 22).toUpperCase()}
        </p>
        <div className="surface-sunken mt-4 h-1.5 overflow-hidden rounded-full">
          <div className="bg-brand-600 h-full w-1/2 animate-pulse" />
        </div>
      </Modal>
    </div>
  );
}

function FieldGroup({
  title,
  description,
  fields,
  values,
  errors,
  onChange,
}: {
  title: string;
  description?: string;
  fields: RequirementField[];
  values: Values;
  errors: Record<string, string>;
  onChange: (updater: (prev: Values) => Values) => void;
}) {
  if (!fields.length) return null;
  return (
    <Card className="p-4">
      <SectionHeading level="card" title={title} description={description} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={field.name}
            hint={field.helper}
            error={errors[field.name]}
            required={field.required}
            className={field.type === "text" && field.maxLength && field.maxLength > 100 ? "sm:col-span-2" : undefined}
          >
            {field.type === "select" ? (
              <Select
                id={field.name}
                value={values[field.name] ?? ""}
                error={Boolean(errors[field.name])}
                aria-describedby={field.helper ? `${field.name}-hint` : undefined}
                onChange={(e) => onChange((prev) => ({ ...prev, [field.name]: e.target.value }))}
              >
                <option value="">—</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={field.name}
                type={field.type}
                maxLength={field.maxLength}
                autoComplete={
                  field.name === "email" ? "email" : field.name === "phone" ? "tel" : field.group === "lead" ? "name" : "off"
                }
                value={values[field.name] ?? ""}
                error={Boolean(errors[field.name])}
                aria-describedby={field.helper ? `${field.name}-hint` : undefined}
                onChange={(e) => onChange((prev) => ({ ...prev, [field.name]: e.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
    </Card>
  );
}
