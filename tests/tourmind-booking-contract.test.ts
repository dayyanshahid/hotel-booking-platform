import { describe, expect, it } from "vitest";
import { TourmindError, __categoryForCode } from "@/lib/server/tourmind/client";
import { mapTourmindError } from "@/lib/server/tourmind/errors";

/**
 * The two rules TourMind enforces that we learned by being refused.
 *
 * Both were found by driving the booking flow end to end against their test
 * credentials, and neither is visible from the adapter alone: one is about the
 * order of two calls, the other about a code that is an answer wearing the
 * costume of an error. They are here because the next person to touch the
 * booking route will not know either of them, and the supplier only says so at
 * the moment a real customer is trying to pay.
 */

describe("their error codes", () => {
  it("treats 'no room available' as availability, not as an outage", () => {
    /*
     * Code 301 is "No Room Available". It arrives as an error object, so with
     * no entry in the table it fell through to the default and a sold-out room
     * was reported as "the supplier is not responding right now — try again
     * shortly". That is a retry loop that cannot ever succeed, offered at the
     * exact moment the customer should be looking at a different room.
     */
    expect(__categoryForCode("301")).toBe("availabilityChanged");

    const mapped = mapTourmindError(new TourmindError("availabilityChanged", "301", "No Room Available"), "en");
    expect(mapped.status).toBe(409);
    expect(mapped.retryable).toBe(false);
    expect(mapped.action).toBe("selectAlternative");
  });

  it("still says nothing was charged when the room has gone", () => {
    // The customer has just been through a payment step. Whatever else the
    // message says, it has to answer the only question they have.
    const mapped = mapTourmindError(new TourmindError("availabilityChanged", "301", "No Room Available"), "en");
    expect(mapped.message.toLowerCase()).toContain("nothing has been charged");
  });

  it("keeps a genuine outage retryable", () => {
    // The distinction only earns its keep if the other side of it survives.
    const mapped = mapTourmindError(new TourmindError("temporaryService", "104", "internal"), "en");
    expect(mapped.retryable).toBe(true);
    expect(mapped.status).toBe(503);
  });

  it("never passes a supplier's own words to a traveller", () => {
    // §9.4: their strings name internal systems and are written in whichever
    // language the endpoint felt like. The category decides what the UI says.
    for (const code of ["301", "104", "102"]) {
      const mapped = mapTourmindError(new TourmindError(__categoryForCode(code), code, "内部服务错误 node-7"), "en");
      expect(mapped.message).not.toContain("node-7");
      expect(mapped.message).not.toContain("内部");
    }
  });

  it("classifies an unknown code as something the customer can retry", () => {
    // Guessing "sold out" for a code we have never seen would send somebody
    // away from a room that is very likely still there.
    expect(__categoryForCode("999")).toBe("temporaryService");
  });
});

describe("the order of their calls", () => {
  it("is documented where the booking route can be read", async () => {
    /*
     * Not a behavioural test — the behaviour needs their live endpoint — but a
     * guard on the thing that will actually regress.
     *
     * TourMind refuses CreateOrder with code 102, "no valid session, please
     * get the lastest price via CheckRoomRate message", unless a prebook has
     * just run for that rate. The trade path satisfied this by accident,
     * because an agent rechecks before committing credit; the consumer
     * checkout went straight from a frozen price to the order, so every
     * TourMind booking on the public site failed. If someone removes the
     * prebook as a redundant round trip, this fails and says why.
     */
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
    );
    const prebookAt = source.indexOf("tourmindPrebook(");
    const bookAt = source.indexOf("tourmindBook({");
    expect(prebookAt, "the booking route no longer prebooks the TourMind rate").toBeGreaterThan(-1);
    expect(bookAt).toBeGreaterThan(-1);
    expect(prebookAt, "the prebook must come before the order, not after it").toBeLessThan(bookAt);
  });
});
