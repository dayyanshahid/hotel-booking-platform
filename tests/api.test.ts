import { afterEach, describe, expect, it } from "vitest";
import { POST as searchRoute } from "@/app/api/hotels/search/route";
import { POST as availabilityRoute } from "@/app/api/hotels/[slug]/availability/route";
import { POST as recheckRoute } from "@/app/api/rates/recheck/route";
import { POST as sessionRoute } from "@/app/api/checkout/sessions/route";
import { POST as paymentRoute } from "@/app/api/payments/intents/route";
import { POST as bookingRoute } from "@/app/api/bookings/route";
import { GET as statusRoute } from "@/app/api/bookings/[reference]/status/route";
import { GET as bookingRoute_GET } from "@/app/api/bookings/[reference]/route";
import { POST as quoteRoute } from "@/app/api/bookings/[reference]/cancellation-quotes/route";
import { POST as cancelRoute } from "@/app/api/bookings/[reference]/cancellations/route";
import { POST as lookupRoute } from "@/app/api/bookings/lookup/route";
import { issueOtp, verifyOtp } from "@/lib/server/store";
import { POST as otpRoute } from "@/app/api/auth/otp/route";
import type { ScenarioId } from "@/lib/server/scenarios";
import type { Booking, CheckoutSession, Offer, RecheckResult } from "@/lib/types";

const INTENT = {
  destinationId: "dest-doha",
  destinationDisplay: "Doha",
  destinationType: "city",
  checkIn: "2026-12-05",
  checkOut: "2026-12-08",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "SAR",
};

function req(url: string, body?: unknown, scenario: ScenarioId = "normal") {
  return new Request(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-locale": "en", "x-scenario": scenario },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T>(res: Response): Promise<{ ok: boolean; data: T; error: { category: string; recommendedAction: string; correlationId: string; message: string } }> {
  return (await res.json()) as never;
}

async function firstOffer(scenario: ScenarioId = "normal"): Promise<Offer> {
  const res = await availabilityRoute(req("/api/hotels/west-bay-corniche-hotel/availability", { intent: INTENT }, scenario), {
    params: Promise.resolve({ slug: "west-bay-corniche-hotel" }),
  });
  const body = await json<{ offers: Offer[] }>(res);
  return body.data.offers[0];
}

async function newSession(): Promise<CheckoutSession> {
  const offer = await firstOffer();
  const res = await sessionRoute(req("/api/checkout/sessions", { offerId: offer.offerId }));
  return (await json<CheckoutSession>(res)).data;
}

function bookingBody(session: CheckoutSession, idempotencyKey: string) {
  return {
    checkoutSessionId: session.checkoutSessionId,
    idempotencyKey,
    contact: { email: "test.guest@example.com", phone: "+974 5000 0000", language: "en" },
    lead: { firstName: "Test", surname: "Guest" },
    guests: [],
    requests: { arrivalTime: "18:00" },
    consents: { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false },
    payment: { method: "card", token: "tok_hosted", threeDsStatus: "passed" },
  };
}

/* ------------------------------------------------------------- contract */

describe("BFF contract (§9.4)", () => {
  it("returns a customer-safe error envelope with a correlation ID", async () => {
    const res = await searchRoute(req("/api/hotels/search", { intent: { ...INTENT, destinationId: "" } }));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error.category).toBe("validation");
    expect(body.error.recommendedAction).toBe("editInput");
    expect(body.error.correlationId).toMatch(/^CID_/i);
  });

  it("gives every offer an expiry and capability flags rather than hard-coded rules", async () => {
    const offer = await firstOffer();
    expect(new Date(offer.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(offer.capabilities).toHaveProperty("recheckRequired");
    expect(offer.capabilities).toHaveProperty("cancellationQuote");
    expect(offer.capabilities).toHaveProperty("modifyAllowed");
  });

  it("rejects an unknown offer as an availability change, not a crash", async () => {
    const res = await recheckRoute(req("/api/rates/recheck", { offerId: "of_does_not_exist" }));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error.category).toBe("availabilityChanged");
    expect(body.error.recommendedAction).toBe("selectAlternative");
  });
});

/* --------------------------------------------------------------- recheck */

describe("recheck (§6.4)", () => {
  it("E-08: a lower price is applied automatically without asking", async () => {
    const offer = await firstOffer();
    const res = await recheckRoute(req("/api/rates/recheck", { offerId: offer.offerId }, "priceDecrease"));
    const body = await json<RecheckResult>(res);
    expect(body.data.outcome).toBe("lower");
    expect(body.data.requiresAcceptance).toBe(false);
    expect(body.data.current!.price.total).toBeLessThan(body.data.previous.price.total);
  });

  it("E-09: a higher price requires explicit acceptance", async () => {
    const offer = await firstOffer();
    const res = await recheckRoute(req("/api/rates/recheck", { offerId: offer.offerId }, "priceIncrease"));
    const body = await json<RecheckResult>(res);
    expect(body.data.outcome).toBe("higher");
    expect(body.data.requiresAcceptance).toBe(true);
    expect(body.data.changeReasons.length).toBeGreaterThan(0);
  });

  it("E-09: a changed cancellation deadline also requires acceptance", async () => {
    const offer = await firstOffer();
    const res = await recheckRoute(req("/api/rates/recheck", { offerId: offer.offerId }, "policyChange"));
    const body = await json<RecheckResult>(res);
    expect(body.data.requiresAcceptance).toBe(true);
    expect(body.data.current!.cancellation.freeUntil).not.toBe(body.data.previous.cancellation.freeUntil);
  });

  it("E-10: a sold-out rate offers equivalent alternatives", async () => {
    const offer = await firstOffer();
    const res = await recheckRoute(req("/api/rates/recheck", { offerId: offer.offerId }, "rateSoldOut"));
    const body = await json<RecheckResult>(res);
    expect(body.data.outcome).toBe("unavailable");
    expect(body.data.alternatives!.length).toBeGreaterThan(0);
  });

  it("commits the new price only once the customer accepts", async () => {
    const offer = await firstOffer();
    const session = (await json<CheckoutSession>(
      await sessionRoute(req("/api/checkout/sessions", { offerId: offer.offerId })),
    )).data;

    await recheckRoute(req("/api/rates/recheck", { offerId: offer.offerId, checkoutSessionId: session.checkoutSessionId }, "priceIncrease"));
    const accepted = await json<RecheckResult>(
      await recheckRoute(
        req(
          "/api/rates/recheck",
          { offerId: offer.offerId, checkoutSessionId: session.checkoutSessionId, accept: true },
          "priceIncrease",
        ),
      ),
    );
    expect(accepted.data.requiresAcceptance).toBe(false);
    expect(accepted.data.current!.price.total).toBeGreaterThan(offer.price.total);
  });
});

/* -------------------------------------------------------------- checkout */

describe("checkout and payment (§5.8, §12.3)", () => {
  it("returns a dynamic requirement schema driven by occupancy and market", async () => {
    const session = await newSession();
    const names = session.requirements.map((f) => f.name);
    expect(names).toContain("email");
    expect(names).toContain("leadFirstName");
    expect(session.requirements.some((f) => f.group === "request")).toBe(true);
    expect(session.expiresAt).toBeTruthy();
  });

  it("never returns supplier identifiers in the checkout session", async () => {
    const session = await newSession();
    expect(JSON.stringify(session)).not.toMatch(/rateKey|RECHECK|BOOKABLE|"S1"|"S2"/);
  });

  it("authorises a guarantee rather than a charge for pay-later rates", async () => {
    const session = await newSession();
    const intentRes = await paymentRoute(req("/api/payments/intents", { checkoutSessionId: session.checkoutSessionId }));
    const body = await json<{ mode: string; amount: number; allowedMethods: { code: string }[] }>(intentRes);
    if (session.paymentTiming === "payLater") {
      expect(body.data.mode).toBe("guarantee");
      expect(body.data.amount).toBe(0);
    } else {
      expect(body.data.mode).toBe("charge");
    }
    expect(body.data.allowedMethods.length).toBeGreaterThan(0);
  });
});

/* --------------------------------------------------------------- booking */

describe("booking orchestration (§9.4, E-12 to E-16)", () => {
  it("E-16: the same idempotency key never creates a second booking", async () => {
    const session = await newSession();
    const body = bookingBody(session, `idem_${Math.random()}`);
    const first = await json<{ booking: Booking }>(await bookingRoute(req("/api/bookings", body)));
    const second = await json<{ booking: Booking; replay?: boolean }>(await bookingRoute(req("/api/bookings", body)));
    expect(second.data.booking.reference).toBe(first.data.booking.reference);
    expect(second.data.replay).toBe(true);
  });

  it("E-12: a declined payment creates no booking and says nothing was charged", async () => {
    const session = await newSession();
    const res = await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`), "paymentDeclined"));
    expect(res.status).toBe(402);
    const body = await json(res);
    expect(body.error.category).toBe("paymentActionNeeded");
    expect(body.error.message).toMatch(/no booking|nothing was charged/i);
  });

  it("E-13: an abandoned 3-D Secure step is safe to retry", async () => {
    const session = await newSession();
    const res = await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`), "threeDsTimeout"));
    const body = await json(res);
    expect(body.error.category).toBe("paymentActionNeeded");
    expect(body.error.recommendedAction).toBe("retry");
  });

  it("E-14: an uncertain outcome becomes pending and reconciles server-side", async () => {
    const session = await newSession();
    const created = await json<{ booking: Booking }>(
      await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`), "bookingPending")),
    );
    expect(created.data.booking.status).toBe("pending");
    expect(created.data.booking.statusDetail).toBeTruthy();

    const reference = created.data.booking.reference;
    let status = "pending";
    for (let i = 0; i < 4 && status === "pending"; i++) {
      const res = await statusRoute(req(`/api/bookings/${reference}/status`), {
        params: Promise.resolve({ reference }),
      });
      status = (await json<{ booking: Booking }>(res)).data.booking.status;
    }
    expect(status).toBe("confirmed");
  });

  it("E-15: a failed confirmation email does not change booking status", async () => {
    const session = await newSession();
    const res = await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`), "emailFailure"));
    const body = await json<{ booking: Booking; emailDelivered: boolean }>(res);
    expect(body.data.emailDelivered).toBe(false);
    expect(body.data.booking.status).toBe("confirmed");
  });

  it("stores no card data on the booking record", async () => {
    const session = await newSession();
    const body = await json<{ booking: Booking }>(
      await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`))),
    );
    expect(JSON.stringify(body.data.booking)).not.toMatch(/tok_hosted|cvv|pan|cardNumber/i);
  });
});

/* ---------------------------------------------------------- post-booking */

describe("post-booking (§6.6, E-18, E-19, E-22)", () => {
  async function confirmedBooking(): Promise<Booking> {
    const session = await newSession();
    const body = await json<{ booking: Booking }>(
      await bookingRoute(req("/api/bookings", bookingBody(session, `idem_${Math.random()}`))),
    );
    return body.data.booking;
  }

  it("E-22: a booking reference alone cannot retrieve a booking", async () => {
    const booking = await confirmedBooking();
    const res = await bookingRoute_GET(req(`/api/bookings/${booking.reference}`), {
      params: Promise.resolve({ reference: booking.reference }),
    });
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error.category).toBe("accountSecurity");
  });

  it("E-22: lookup cannot be used to discover whether a reference exists", async () => {
    const real = await confirmedBooking();
    const hitRes = await lookupRoute(
      req("/api/bookings/lookup", { reference: real.reference, email: real.contact.email }),
    );
    const missRes = await lookupRoute(
      req("/api/bookings/lookup", { reference: "NZ-ZZZ-0000", email: real.contact.email }),
    );
    // Same status and same success shape whether or not the pair matched.
    expect(missRes.status).toBe(hitRes.status);
    const hit = await json<{ sent: boolean }>(hitRes);
    const miss = await json<{ sent: boolean }>(missRes);
    expect(hit.ok).toBe(true);
    expect(miss.ok).toBe(true);
    expect(miss.data.sent).toBe(hit.data.sent);
    // No booking data leaks on the non-match.
    expect(JSON.stringify(miss.data)).not.toMatch(/hotelName|checkIn|reference/i);
  });

  it("returns a live cancellation quote with its own expiry and time zone", async () => {
    const booking = await confirmedBooking();
    const res = await quoteRoute(req(`/api/bookings/${booking.reference}/cancellation-quotes`, {}), {
      params: Promise.resolve({ reference: booking.reference }),
    });
    const body = await json<{ quoteId: string; expiresAt: string; timezone: string; deadline: string }>(res);
    expect(body.data.quoteId).toBeTruthy();
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(body.data.timezone).toBe("Asia/Qatar");
  });

  it("requires re-authentication before cancelling", async () => {
    const booking = await confirmedBooking();
    const quote = await json<{ quoteId: string }>(
      await quoteRoute(req(`/api/bookings/${booking.reference}/cancellation-quotes`, {}), {
        params: Promise.resolve({ reference: booking.reference }),
      }),
    );
    const res = await cancelRoute(
      req(`/api/bookings/${booking.reference}/cancellations`, {
        quoteId: quote.data.quoteId,
        idempotencyKey: `cx_${Math.random()}`,
        otp: "000000",
      }),
      { params: Promise.resolve({ reference: booking.reference }) },
    );
    expect(res.status).toBe(401);
  });

  it("cancels once and reports fee, refund and reference", async () => {
    const booking = await confirmedBooking();
    const quote = await json<{ quoteId: string; refundableAmount: number }>(
      await quoteRoute(req(`/api/bookings/${booking.reference}/cancellation-quotes`, {}), {
        params: Promise.resolve({ reference: booking.reference }),
      }),
    );
    const otp = await json<{ demoCode: string }>(
      await otpRoute(req("/api/auth/otp", { email: booking.contact.email, purpose: "cancel" })),
    );
    const key = `cx_${Math.random()}`;
    const cancelled = await json<{ booking: Booking }>(
      await cancelRoute(
        req(`/api/bookings/${booking.reference}/cancellations`, {
          quoteId: quote.data.quoteId,
          idempotencyKey: key,
          otp: otp.data.demoCode,
        }),
        { params: Promise.resolve({ reference: booking.reference }) },
      ),
    );
    expect(cancelled.data.booking.status).toBe("cancelled");
    expect(cancelled.data.booking.cancellationReference).toBeTruthy();
    expect(cancelled.data.booking.capabilities.cancelAllowed).toBe(false);

    // E-19 guard: replaying the same key must not submit a second cancellation.
    const replay = await json<{ booking: Booking; replay?: boolean }>(
      await cancelRoute(
        req(`/api/bookings/${booking.reference}/cancellations`, {
          quoteId: quote.data.quoteId,
          idempotencyKey: key,
          otp: otp.data.demoCode,
        }),
        { params: Promise.resolve({ reference: booking.reference }) },
      ),
    );
    expect(replay.data.replay).toBe(true);
  });

  it("E-18: an expired quote is never reused silently", async () => {
    const booking = await confirmedBooking();
    const otp = await json<{ demoCode: string }>(
      await otpRoute(req("/api/auth/otp", { email: booking.contact.email, purpose: "cancel" })),
    );
    const res = await cancelRoute(
      req(`/api/bookings/${booking.reference}/cancellations`, {
        quoteId: "cq_expired_or_unknown",
        idempotencyKey: `cx_${Math.random()}`,
        otp: otp.data.demoCode,
      }),
      { params: Promise.resolve({ reference: booking.reference }) },
    );
    expect(res.status).toBe(409);
  });
});

describe("fixed demo sign-in code", () => {
  const original = process.env.DEMO_OTP;
  afterEach(() => {
    if (original === undefined) delete process.env.DEMO_OTP;
    else process.env.DEMO_OTP = original;
  });

  it("issues and accepts the configured code", () => {
    process.env.DEMO_OTP = "198400";
    expect(issueOtp("someone@example.com", "signin")).toBe("198400");
    expect(verifyOtp("someone@example.com", "signin", "198400")).toBe(true);
  });

  it("accepts it without an issued entry", () => {
    // The point of the fix: on serverless the instance that issues a code is
    // often not the one that checks it, and this store does not span them.
    process.env.DEMO_OTP = "198400";
    expect(verifyOtp("never-asked@example.com", "signin", "198400")).toBe(true);
  });

  it("still refuses a wrong code", () => {
    process.env.DEMO_OTP = "198400";
    expect(verifyOtp("someone@example.com", "signin", "000000")).toBe(false);
  });

  it("falls back to a random code when unset", () => {
    delete process.env.DEMO_OTP;
    const code = issueOtp("random@example.com", "signin");
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyOtp("random@example.com", "signin", "198400")).toBe(false);
  });

  it("ignores a malformed value rather than trusting it", () => {
    // An empty or non-numeric DEMO_OTP must not become a code that verifies.
    process.env.DEMO_OTP = "not-a-code";
    const code = issueOtp("safe@example.com", "signin");
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyOtp("safe@example.com", "signin", "not-a-code")).toBe(false);
  });
});
