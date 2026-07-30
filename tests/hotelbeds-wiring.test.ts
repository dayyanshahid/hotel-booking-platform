import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import { POST as sessionRoute } from "@/app/api/checkout/sessions/route";
import { POST as recheckRoute } from "@/app/api/rates/recheck/route";
import { POST as bookingRoute } from "@/app/api/bookings/route";
import { POST as quoteRoute } from "@/app/api/bookings/[reference]/cancellation-quotes/route";
import { resetQuota } from "@/lib/server/hotelbeds/client";
import { searchHotelbedsDestination } from "@/lib/server/hotelbeds/search";
import { getOffer, getSupplierReference } from "@/lib/server/store";
import { applyMarkup } from "@/lib/server/markup";
import type { Booking, CheckoutSession, RecheckResult, SearchIntent } from "@/lib/types";

/**
 * End-to-end wiring against a stubbed transport.
 *
 * The adapter tests prove the mapping; these prove the plumbing — that a live
 * offer survives into a checkout session, that CheckRate drives the acceptance
 * gate, that a booking sends the refreshed rate key, and that an uncertain
 * booking becomes pending instead of a duplicate order. No network is touched.
 */

const intent: SearchIntent = {
  destinationId: "hbd-PMI",
  destinationDisplay: "Mallorca",
  destinationType: "city",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  flexibility: "exact",
  rooms: [{ adults: 2, childrenAges: [] }],
  locale: "en",
  currency: "EUR",
};

interface StubCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

let calls: StubCall[] = [];
let handler: (call: StubCall) => { status?: number; body: unknown };

function installTransport() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const call: StubCall = {
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      const { status = 200, body } = handler(call);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
}

function req(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-locale": "en" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<{ ok: boolean; data: T; error: { message: string; category: string } }> {
  return (await response.json()) as never;
}

const CHECKRATE_HIGHER = {
  hotel: {
    code: 100234,
    name: "HOTEL PLAYA DE PALMA",
    currency: "EUR",
    rooms: [
      {
        code: "DBL.ST",
        name: "DOUBLE STANDARD",
        rates: [
          {
            // A refreshed key: the booking must use this one, not the original.
            rateKey: "REFRESHED-RATE-KEY-0001",
            rateType: "BOOKABLE",
            net: "520.00",
            boardCode: "BB",
            boardName: "BED AND BREAKFAST",
            cancellationPolicies: [{ amount: "520.00", from: "2026-09-09T23:59:00+02:00" }],
          },
        ],
      },
    ],
  },
};

const BOOKING_CONFIRMED = {
  booking: {
    reference: "123-4567890",
    clientReference: "NAZIL-NZ-ABC-1234",
    status: "CONFIRMED",
    totalNet: "520.00",
    currency: "EUR",
    holder: { name: "Ada", surname: "Traveller" },
    hotel: {
      code: 100234,
      name: "HOTEL PLAYA DE PALMA",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      rooms: [{ name: "DOUBLE STANDARD", rates: [{ boardName: "BED AND BREAKFAST" }] }],
      totalNet: "520.00",
      currency: "EUR",
    },
  },
};

beforeEach(() => {
  calls = [];
  // Each case starts with the full request budget; otherwise the guard would
  // (correctly) start refusing partway through the file.
  resetQuota();
  process.env.HOTELBEDS_API_KEY = "test-key";
  process.env.HOTELBEDS_SECRET = "test-secret";
  handler = () => ({ body: availabilityFixture });
  installTransport();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HOTELBEDS_API_KEY;
  delete process.env.HOTELBEDS_SECRET;
});

async function liveOfferId(): Promise<string> {
  const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
  expect(result.status).toBe("ok");
  // The rate that the supplier flags as needing revalidation.
  const offer = result.hotels[0].offers.find((candidate) => candidate.capabilities.recheckRequired)!;
  return offer.offerId;
}

describe("live availability wiring", () => {
  it("signs every request with the documented headers", async () => {
    await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    const call = calls[0];
    expect(call.headers["Api-key"]).toBe("test-key");
    expect(call.headers["X-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(call.headers.Accept).toBe("application/json");
  });

  it("sends the customer's exact occupancy, including child ages", async () => {
    await searchHotelbedsDestination({ code: "PMI" },
      { ...intent, rooms: [{ adults: 2, childrenAges: [7] }] },
      "en",
    );
    const body = calls[0].body as { occupancies: { adults: number; children: number; paxes?: { age: number }[] }[] };
    expect(body.occupancies[0]).toMatchObject({ adults: 2, children: 1 });
    expect(body.occupancies[0].paxes?.[0].age).toBe(7);
  });

  it("stores the rate key server-side and never returns it", async () => {
    const offerId = await liveOfferId();
    const stored = getOffer(offerId)!;
    expect(stored.hotelbeds?.rateKey).toContain("|");
    expect(stored.sourceCode).toBe("HB");
  });

  it("carries a live offer into a checkout session with supplier data stripped", async () => {
    const offerId = await liveOfferId();
    const response = await sessionRoute(req("/api/checkout/sessions", { offerId }));
    const session = await json<CheckoutSession>(response);
    expect(session.ok).toBe(true);
    expect(session.data.hotelName).toBe("HOTEL PLAYA DE PALMA");
    expect(session.data.roomName).toBe("DOUBLE STANDARD");
    expect(session.data.capabilities.recheckRequired).toBe(true);
    expect(session.data.comments.length).toBeGreaterThan(0);
    expect(JSON.stringify(session.data)).not.toMatch(/rateKey|"RECHECK"/);
  });
});

describe("live recheck wiring (§6.4)", () => {
  it("calls checkrates with a single rate key", async () => {
    const offerId = await liveOfferId();
    calls = [];
    handler = () => ({ body: CHECKRATE_HIGHER });

    await recheckRoute(req("/api/rates/recheck", { offerId }));
    const call = calls[0];
    expect(call.url).toContain("/hotel-api/1.0/checkrates");
    const body = call.body as { rooms: { rateKey: string }[] };
    expect(body.rooms).toHaveLength(1);
  });

  it("gates an increase behind explicit acceptance and does not commit the new key", async () => {
    const offerId = await liveOfferId();
    handler = () => ({ body: CHECKRATE_HIGHER });

    const response = await recheckRoute(req("/api/rates/recheck", { offerId }));
    const result = await json<RecheckResult>(response);
    expect(result.data.outcome).toBe("higher");
    expect(result.data.requiresAcceptance).toBe(true);
    expect(result.data.current!.price.total).toBe(applyMarkup(520).total);

    // Not accepted: the original rate key is still the stored one.
    expect(getOffer(offerId)!.hotelbeds!.rateKey).not.toBe("REFRESHED-RATE-KEY-0001");
  });

  it("commits the refreshed rate key once accepted", async () => {
    const offerId = await liveOfferId();
    handler = () => ({ body: CHECKRATE_HIGHER });

    await recheckRoute(req("/api/rates/recheck", { offerId }));
    await recheckRoute(req("/api/rates/recheck", { offerId, accept: true }));

    const stored = getOffer(offerId)!;
    expect(stored.hotelbeds!.rateKey).toBe("REFRESHED-RATE-KEY-0001");
    expect(stored.price.total).toBe(applyMarkup(520).total);
  });

  it("offers alternatives when the supplier returns no rate", async () => {
    const offerId = await liveOfferId();
    handler = (call) =>
      call.url.includes("/checkrates") ? { body: { hotel: { rooms: [] } } } : { body: availabilityFixture };

    const response = await recheckRoute(req("/api/rates/recheck", { offerId }));
    const result = await json<RecheckResult>(response);
    expect(result.data.outcome).toBe("unavailable");
    expect(result.data.requiresAcceptance).toBe(true);
  });
});

describe("live booking wiring (§6.5)", () => {
  const contact = { email: "ada@example.com", phone: "+34600000000", language: "en" as const };
  const lead = { firstName: "Ada", surname: "Traveller" };
  const consents = { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false };
  const payment = { method: "card", token: "tok", threeDsStatus: "passed" as const };

  async function sessionForBooking(): Promise<string> {
    const offerId = await liveOfferId();
    const response = await sessionRoute(req("/api/checkout/sessions", { offerId }));
    return (await json<CheckoutSession>(response)).data.checkoutSessionId;
  }

  it("sends holder, paxes, client reference and tolerance, and hides the supplier reference", async () => {
    const checkoutSessionId = await sessionForBooking();
    calls = [];
    handler = () => ({ body: BOOKING_CONFIRMED });

    const response = await bookingRoute(
      req("/api/bookings", {
        checkoutSessionId,
        idempotencyKey: `idem_${Math.random()}`,
        contact,
        lead,
        guests: [],
        consents,
        payment,
      }),
    );
    const result = await json<{ booking: Booking }>(response);

    const call = calls.find((candidate) => candidate.url.endsWith("/bookings"))!;
    expect(call.method).toBe("POST");
    const body = call.body as {
      holder: { name: string };
      rooms: { rateKey: string; paxes: { type: string; name: string }[] }[];
      clientReference: string;
      tolerance: number;
    };
    expect(body.holder.name).toBe("Ada");
    expect(body.rooms[0].paxes[0]).toMatchObject({ type: "AD", name: "Ada" });
    expect(body.clientReference).toContain("NAZIL-");
    expect(body.tolerance).toBe(2);

    // The customer gets the platform reference; the supplier's stays internal.
    expect(result.data.booking.reference).toMatch(/^NZ-/);
    expect(JSON.stringify(result.data.booking)).not.toContain("123-4567890");
    expect(getSupplierReference(result.data.booking.reference)?.reference).toBe("123-4567890");
  });

  it("turns an uncertain booking into a pending state rather than a second order", async () => {
    const checkoutSessionId = await sessionForBooking();
    handler = (call) => {
      if (call.url.endsWith("/bookings")) throw new Error("socket hang up");
      return { body: availabilityFixture };
    };

    const response = await bookingRoute(
      req("/api/bookings", {
        checkoutSessionId,
        idempotencyKey: `idem_${Math.random()}`,
        contact,
        lead,
        guests: [],
        consents,
        payment,
      }),
    );
    const result = await json<{ booking: Booking }>(response);
    expect(result.data.booking.status).toBe("pending");
    expect(result.data.booking.reconciliation).toBeDefined();

    // Exactly one booking attempt was made: a timeout is never retried.
    expect(calls.filter((call) => call.url.endsWith("/bookings") && call.method === "POST")).toHaveLength(1);
  });

  it("reports a supplier rejection as a clean failure the customer can act on", async () => {
    const checkoutSessionId = await sessionForBooking();
    handler = (call) =>
      call.url.endsWith("/bookings")
        ? { status: 400, body: { error: { code: "BOOKING_ERROR", message: "RATE NOT AVAILABLE" } } }
        : { body: availabilityFixture };

    const response = await bookingRoute(
      req("/api/bookings", {
        checkoutSessionId,
        idempotencyKey: `idem_${Math.random()}`,
        contact,
        lead,
        guests: [],
        consents,
        payment,
      }),
    );
    const result = await json(response);
    expect(result.ok).toBe(false);
    expect(result.error.category).toBe("availabilityChanged");
    expect(result.error.message).not.toMatch(/RATE NOT AVAILABLE|BOOKING_ERROR/);
  });
});

describe("live cancellation quote wiring (§6.6)", () => {
  it("simulates the cancellation before showing a fee", async () => {
    const checkoutSessionId = await (async () => {
      const offerId = await liveOfferId();
      const response = await sessionRoute(req("/api/checkout/sessions", { offerId }));
      return (await json<CheckoutSession>(response)).data.checkoutSessionId;
    })();

    handler = () => ({ body: BOOKING_CONFIRMED });
    const booked = await json<{ booking: Booking }>(
      await bookingRoute(
        req("/api/bookings", {
          checkoutSessionId,
          idempotencyKey: `idem_${Math.random()}`,
          contact: { email: "ada@example.com", phone: "+34600000000", language: "en" },
          lead: { firstName: "Ada", surname: "Traveller" },
          guests: [],
          consents: { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false },
          payment: { method: "card", token: "tok", threeDsStatus: "passed" },
        }),
      ),
    );

    calls = [];
    handler = () => ({
      body: { booking: { status: "CONFIRMED", currency: "EUR", hotel: { cancellationAmount: "100.00" } } },
    });

    const reference = booked.data.booking.reference;
    const response = await quoteRoute(req(`/api/bookings/${reference}/cancellation-quotes`, {}), {
      params: Promise.resolve({ reference }),
    });
    const quote = await json<{ fee: number }>(response);

    const call = calls[0];
    expect(call.method).toBe("DELETE");
    expect(call.url).toContain("cancellationFlag=SIMULATION");
    expect(quote.data.fee).toBe(applyMarkup(100).total);
  });
});

describe("content fetching is bounded, and never serial", () => {
  /*
   * Found by running a real search and watching the clock.
   *
   * Availability returns up to fifty hotels, and adaptation used to fetch the
   * content for each one inline, in a loop. A destination whose properties were
   * not cached therefore cost fifty-one requests and ran them one after another:
   * measured against the test key, 32.8 seconds for one search of Palma, and
   * the whole daily allowance gone. It was invisible in every existing test
   * because the fixtures had already been through a warm cache.
   *
   * What the page needs is availability, which is one call. Content is
   * photography and prose, and a property is worth showing without it.
   */
  const MANY = 40;

  function availabilityWith(count: number) {
    const template = (availabilityFixture as { hotels: { hotels: unknown[] } }).hotels.hotels[0];
    return {
      hotels: {
        hotels: Array.from({ length: count }, (_, i) => ({
          ...(template as Record<string, unknown>),
          // Codes nothing has ever cached, so every one is a potential fetch.
          code: 900_000 + i,
          name: `UNCACHED HOTEL ${i}`,
        })),
      },
    };
  }

  it("fetches content for at most a page of uncached hotels", async () => {
    handler = (call) =>
      call.url.includes("/hotel-content-api/")
        ? { body: { hotel: { code: 900_000, name: { content: "Cached Later" } } } }
        : { body: availabilityWith(MANY) };

    const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    expect(result.status).toBe("ok");
    // Every hotel still reaches the page — the budget limits photography, not
    // supply. A search that dropped rooms to save a request would be worse
    // than the problem it solved.
    expect(result.hotels).toHaveLength(MANY);

    const contentCalls = calls.filter((call) => call.url.includes("/hotel-content-api/"));
    expect(contentCalls.length).toBeLessThanOrEqual(12);
    // And it is not zero: the first page of results keeps its pictures.
    expect(contentCalls.length).toBeGreaterThan(0);
  });

  it("issues those fetches together rather than one after another", async () => {
    // The request count alone would still pass if they ran in sequence, and
    // sequence was half the defect. Each content call parks until released, so
    // if adaptation awaited them one at a time this cannot reach the budget.
    let inFlight = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = String(input);
        if (!url.includes("/hotel-content-api/")) {
          return new Response(JSON.stringify(availabilityWith(MANY)), {
            headers: { "content-type": "application/json" },
          });
        }
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate;
        inFlight -= 1;
        return new Response(JSON.stringify({ hotel: { code: 900_000, name: { content: "X" } } }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const search = searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    // Let the warm phase get every fetch it intends to start into the air.
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await search;

    expect(peak).toBeGreaterThan(1);
  });
});
