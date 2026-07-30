import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import availabilityFixture from "./fixtures/hotelbeds-availability.json";
import { POST as sessionRoute } from "@/app/api/checkout/sessions/route";
import { POST as recheckRoute } from "@/app/api/rates/recheck/route";
import { POST as bookingRoute } from "@/app/api/bookings/route";
import { POST as quoteRoute } from "@/app/api/bookings/[reference]/cancellation-quotes/route";
import { resetQuota } from "@/lib/server/hotelbeds/client";
import { searchHotelbedsDestination } from "@/lib/server/hotelbeds/search";
import { runSearch } from "@/lib/server/search";
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
    expect(session.data.lines).toHaveLength(1);
    expect(session.data.lines[0].roomName).toBe("DOUBLE STANDARD");
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

  /*
   * `guests` means everyone except the lead, who is sent separately. Both of
   * our clients build it that way and neither says so anywhere, so the mistake
   * is easy: include the lead again and the booking carries one occupant more
   * than the room was priced for. The voucher then prints the lead twice, and
   * the extra name goes to the supplier — an over-occupied room is either
   * refused at the property or discovered by the guest at the desk, and by
   * then the order exists.
   *
   * Caught here, where it is still a 422 and not a stay.
   */
  it("rejects a lead who is also listed among the guests", async () => {
    const checkoutSessionId = await sessionForBooking();
    calls = [];

    const response = await bookingRoute(
      req("/api/bookings", {
        checkoutSessionId,
        idempotencyKey: `idem_${Math.random()}`,
        contact,
        lead,
        // The room is for two. Naming the lead here as well makes three.
        guests: [
          { roomIndex: 0, type: "adult", firstName: lead.firstName, surname: lead.surname },
          { roomIndex: 0, type: "adult", firstName: "Bea", surname: "Traveller" },
        ],
        consents,
        payment,
      }),
    );

    expect(response.status).toBe(422);
    const body = await json<never>(response);
    expect(body.ok).toBe(false);
    // And nothing reached the supplier.
    expect(calls.some((call) => call.url.endsWith("/bookings"))).toBe(false);
  });

  it("still allows a booking where only the lead is named", async () => {
    /*
     * The common case, and not an error: a stay is often booked before
     * everyone travelling is known, and the lead alone is enough for both
     * suppliers. Only the upper bound is enforced.
     */
    const checkoutSessionId = await sessionForBooking();
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
    expect(response.status).toBe(200);
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

describe("content can never spend the searching allowance", () => {
  /*
   * The defect this covers is the one that emptied the trade portal.
   *
   * Content and availability drew on one undivided budget of fifty a day, and
   * content costs a call per property. So a search of a city nobody had synced
   * cost thirteen, four of them ended the allowance, and from then on every
   * search in every city returned nothing — while the portal, which sells live
   * supply only and has no catalogue to fall back on, said "no hotels match
   * this search" and offered to try different dates.
   *
   * The rooms were there the whole time. We had spent the day's searches on
   * photographs of them.
   */
  const QUOTA = 10;

  beforeEach(() => {
    process.env.HOTELBEDS_DAILY_QUOTA = String(QUOTA);
    // Six of ten reserved, so content may spend four.
    process.env.HOTELBEDS_AVAILABILITY_RESERVE = "6";
    resetQuota();
  });

  afterEach(() => {
    delete process.env.HOTELBEDS_DAILY_QUOTA;
    delete process.env.HOTELBEDS_AVAILABILITY_RESERVE;
  });

  function uncachedAvailability(count: number) {
    const template = (availabilityFixture as { hotels: { hotels: unknown[] } }).hotels.hotels[0];
    return {
      hotels: {
        hotels: Array.from({ length: count }, (_, i) => ({
          ...(template as Record<string, unknown>),
          code: 800_000 + i,
        })),
      },
    };
  }

  it("keeps searching after a day of browsing has used every content request", async () => {
    let contentCalls = 0;
    handler = (call) => {
      if (call.url.includes("/hotel-content-api/")) {
        contentCalls += 1;
        return { body: { hotel: { code: 800_000, name: { content: "Named" } } } };
      }
      return { body: uncachedAvailability(8) };
    };

    // Four searches of uncached properties. Under the old single budget the
    // first alone would have taken nine of ten.
    for (let i = 0; i < 4; i += 1) {
      const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
      expect(result.status).toBe("ok");
      expect(result.hotels).toHaveLength(8);
    }

    /*
     * Content stopped at its own ceiling rather than at the key's.
     *
     * Three, not four: the reserve is what has to be left *unspent*, and the
     * search's own availability call is spent first. Content gets what is above
     * the floor after that, which is the point — the floor is never encroached
     * on to buy a photograph.
     */
    expect(contentCalls).toBeGreaterThan(0);
    expect(contentCalls).toBeLessThanOrEqual(QUOTA - 6);
    // And the reserve is intact: four searches spent four of it, and the fifth
    // — the one an agent with a customer on the phone is running — still works.
    const after = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    expect(after.status).toBe("ok");
    expect(after.hotels).toHaveLength(8);
  });

  it("tells a trade agent the supply failed, not that their dates did", async () => {
    /*
     * The screen this covers: 0 properties, a banner promising that "some
     * options are still loading… more may appear", and underneath it "no hotels
     * match this search — nothing available for those dates, try shifting them".
     *
     * Three statements, and only the count was true. Nothing was loading, the
     * search matched fine, and the dates were never the problem — one supplier
     * had gone quiet and the other holds nothing in this city. An agent acting
     * on that page re-ran the search on different dates for a customer on the
     * phone, which could not have worked however many times they tried it.
     */
    process.env.TOURMIND_USERNAME = "u";
    process.env.TOURMIND_PASSWORD = "p";
    process.env.TOURMIND_AGENT_CODE = "a";
    handler = () => ({ status: 403, body: { error: { code: "LIMIT", message: "quota exceeded" } } });

    try {
      const response = await runSearch(
        { ...intent, destinationId: "dest-singapore", destinationDisplay: "Singapore" },
        { locale: "en", supply: "live", scenario: "normal" },
      );

      expect(response.totalCount).toBe(0);
      // Asked two, lost one: the page is short, not broken.
      expect(response.completeness).toBe("partial");
      expect(response.sourcesUnavailable).toBeGreaterThan(0);
      // It must not promise arrivals, and must not blame the search.
      expect(response.completenessMessage).toMatch(/did not answer/i);
      expect(response.completenessMessage).not.toMatch(/still loading|more may appear/i);
      expect(response.completenessMessage).toMatch(/dates will not help/i);
    } finally {
      delete process.env.TOURMIND_USERNAME;
      delete process.env.TOURMIND_PASSWORD;
      delete process.env.TOURMIND_AGENT_CODE;
    }
  });

  it("still reports a genuinely exhausted key as unavailable", async () => {
    handler = () => ({ body: uncachedAvailability(1) });

    // Spend the whole allowance on availability, which is allowed to.
    for (let i = 0; i < QUOTA; i += 1) {
      await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    }

    const result = await searchHotelbedsDestination({ code: "PMI" }, intent, "en");
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("daily request budget reached");
  });
});


describe("every room of a set reaches the supplier", () => {
  /*
   * Their `/bookings` takes a `rooms` array and always did; we sent one entry. A
   * party of three therefore had one room booked and two silently dropped — the
   * customer's card charged for the total, the supplier holding a third of it,
   * and a voucher printed for "3 x Deluxe twin".
   *
   * Sending them together is also what makes all-or-nothing free: the order is
   * accepted whole or refused whole, so there is no half-booked state to unwind
   * and no second reference to reconcile.
   */
  const party: SearchIntent = {
    ...intent,
    rooms: [
      { adults: 2, childrenAges: [] },
      { adults: 2, childrenAges: [] },
      { adults: 1, childrenAges: [9] },
    ],
  };

  async function threeLineSession(): Promise<CheckoutSession> {
    const result = await searchHotelbedsDestination({ code: "PMI" }, party, "en");
    // Hotelbeds prices per room, so one offer is one room and three rooms need
    // three lines — which is the whole reason the session carries lines.
    const offerId = result.hotels[0].offers[0].offerId;
    const response = await sessionRoute(
      req("/api/checkout/sessions", { offerIds: [offerId, offerId, offerId] }),
    );
    const body = (await response.json()) as { ok: boolean; data: CheckoutSession };
    expect(body.ok).toBe(true);
    return body.data;
  }

  it("builds a line per room and prices the party, not one room of it", async () => {
    const session = await threeLineSession();
    expect(session.lines).toHaveLength(3);
    expect(session.lines.map((line) => line.roomIndexes)).toEqual([[0], [1], [2]]);
    // Six heads across three rooms — two, two, and an adult with a child — and a
    // total that is three rooms' worth rather than one.
    expect(session.price.guests).toBe(6);
    expect(session.price.roomsCovered).toBe(3);
    expect(session.price.total).toBe(
      session.lines.reduce((sum, line) => sum + line.price.total, 0),
    );
  });

  it("sends one order carrying a room per line, each with its own guests", async () => {
    const session = await threeLineSession();
    calls = [];
    handler = () => ({ body: BOOKING_CONFIRMED });
    const response = await bookingRoute(
      req("/api/bookings", {
        checkoutSessionId: session.checkoutSessionId,
        idempotencyKey: "idem-three-rooms",
        contact: { email: "lead@example.com", phone: "+34 600 000 000", language: "en" },
        lead: { firstName: "Ada", surname: "Traveller" },
        guests: [
          { roomIndex: 1, type: "adult", firstName: "Bo", surname: "Traveller" },
          { roomIndex: 2, type: "adult", firstName: "Cy", surname: "Traveller" },
        ],
        requests: {},
        consents: { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false },
        payment: { method: "card", token: "tok_hosted", threeDsStatus: "passed" },
      }),
    );
    const body = (await response.json()) as { ok: boolean; data: { booking: Booking } };
    expect(body.ok).toBe(true);

    // One call, not three — so the order confirms or fails as a whole.
    const bookingCalls = calls.filter((call) => call.url.includes("/bookings"));
    expect(bookingCalls).toHaveLength(1);

    const rooms = (bookingCalls[0].body as { rooms: { rateKey: string; paxes: { roomId: number }[] }[] }).rooms;
    expect(rooms).toHaveLength(3);
    // `roomId` is the supplier's index into this array, so it counts from one and
    // is derived from position rather than copied from our own roomIndex.
    expect(rooms.map((room) => room.paxes[0].roomId)).toEqual([1, 2, 3]);
    // Each room carries only its own occupants. One flat pax list against every
    // room over-occupies all of them, which is refused or discovered at the desk.
    expect(rooms.every((room) => room.paxes.every((pax) => pax.roomId === room.paxes[0].roomId))).toBe(true);

    // And the booking records all three rooms, so the voucher can list them.
    expect(body.data.booking.lines).toHaveLength(3);
    expect(body.data.booking.lines.every((line) => line.guests.length > 0)).toBe(true);
  });
});
