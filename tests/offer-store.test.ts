import { beforeEach, describe, expect, it } from "vitest";
import {
  __forgetOffers,
  batchedOfferId,
  getOffer,
  loadOffer,
  newOfferBatch,
  publishOffers,
  rebatchOffers,
  rememberOffer,
  republishOffer,
  type StoredOffer,
} from "@/lib/server/store";

/**
 * The bug this file exists for.
 *
 * Offers lived in one process's memory, so on a serverless platform the
 * request that ran the search and the request that handled the click seconds
 * later were routinely different instances — and the second one told the
 * customer their rate had gone while it sat in the first one's memory.
 * Measured on production before the fix: two of twelve trade rows priced, and
 * four of six checkouts refused for properties that were fine.
 *
 * `__forgetOffers()` is what a cold instance looks like: the shared store still
 * has everything, this process has nothing.
 */
function offer(id: string, total = 250): StoredOffer {
  return {
    offerId: id,
    hotelSlug: "hb-1-test",
    roomKey: "DBL",
    canonicalRoomKey: "DBL",
    board: "RO",
    rateClass: "flex",
    sourceCode: "HB",
    rateTypeInternal: "BOOKABLE",
    conditionCodes: [],
    memberRate: false,
    guaranteeEligible: false,
    modifiable: false,
    allotment: 0,
    intent: { destinationId: "dest-dubai", checkIn: "2026-10-01", checkOut: "2026-10-03" },
    price: { total, currency: "USD" },
    cancellation: { refundable: true, timezone: "Asia/Dubai", steps: [] },
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    supplierRoomLabel: "Double",
  } as unknown as StoredOffer;
}

describe("finding an offer this instance never created", () => {
  beforeEach(() => __forgetOffers());

  it("hands it back after the process has forgotten everything", async () => {
    const batch = newOfferBatch();
    const id = batchedOfferId(batch, "hb-1::o0");
    rememberOffer(id, offer(id));
    await publishOffers([id]);

    __forgetOffers();
    expect(getOffer(id)).toBeUndefined();
    expect((await loadOffer(id))?.price.total).toBe(250);
  });

  it("reads the batch once and answers the rest of the page from memory", async () => {
    // A trade page prices up to sixty offers from one search. Sixty round
    // trips to answer one question is not a trade worth making.
    const batch = newOfferBatch();
    const ids = Array.from({ length: 12 }, (_, i) => batchedOfferId(batch, `hb-1::o${i}`));
    for (const id of ids) rememberOffer(id, offer(id));
    await publishOffers(ids);

    __forgetOffers();
    await loadOffer(ids[0]);
    // Every sibling is now local, so nothing else needs the store.
    for (const id of ids) expect(getOffer(id)).toBeDefined();
  });

  it("does not invent an offer that was never published", async () => {
    const id = batchedOfferId(newOfferBatch(), "hb-1::gone");
    expect(await loadOffer(id)).toBeUndefined();
  });

  it("survives an id with no batch in it rather than throwing", async () => {
    // Old ids, or anything hand-typed into a URL.
    expect(await loadOffer("of_legacy")).toBeUndefined();
  });

  it("carries a repriced offer across, not the price the search showed", async () => {
    const batch = newOfferBatch();
    const id = batchedOfferId(batch, "hb-1::o0");
    rememberOffer(id, offer(id, 250));
    await publishOffers([id]);

    // A recheck moves the price on this instance…
    rememberOffer(id, offer(id, 310));
    await republishOffer(id);

    // …and the instance that takes the money must not commit the old number.
    __forgetOffers();
    expect((await loadOffer(id))?.price.total).toBe(310);
  });

  it("keeps a fresher local copy over the published one", async () => {
    const batch = newOfferBatch();
    const id = batchedOfferId(batch, "hb-1::o0");
    const sibling = batchedOfferId(batch, "hb-1::o1");
    rememberOffer(id, offer(id, 250));
    rememberOffer(sibling, offer(sibling, 100));
    await publishOffers([id, sibling]);

    // This process rechecked one of them but has not published yet.
    rememberOffer(id, offer(id, 999));
    // Loading a sibling pulls the whole batch in; it must not overwrite the
    // rate this process just confirmed with the supplier.
    await loadOffer(sibling);
    expect(getOffer(id)?.price.total).toBe(999);
  });

  it("merges a later page into the batch the first one wrote", async () => {
    // A filter change re-reads cached supply, so the second page's offers
    // belong to the batch the *first* search minted.
    const batch = newOfferBatch();
    const first = batchedOfferId(batch, "hb-1::o0");
    const later = batchedOfferId(batch, "hb-2::o0");
    rememberOffer(first, offer(first));
    await publishOffers([first]);
    rememberOffer(later, offer(later));
    await publishOffers([later]);

    __forgetOffers();
    expect(await loadOffer(first)).toBeDefined();
    expect(await loadOffer(later)).toBeDefined();
  });
});

describe("stamping a batch onto what an adapter produced", () => {
  it("renames the offers and rekeys the bindings together", () => {
    // Renaming one without the other is how a rate loses its rateKey and
    // becomes unbookable — the map is keyed by the id being changed.
    const adapted = {
      offers: [{ offerId: "tm-752649::o0" }, { offerId: "tm-752649::o1" }],
      contexts: new Map([
        ["tm-752649::o0", { rateCode: "A" }],
        ["tm-752649::o1", { rateCode: "B" }],
      ]),
    };
    rebatchOffers("ob123", adapted);

    expect(adapted.offers.map((o) => o.offerId)).toEqual(["ob123~tm-752649::o0", "ob123~tm-752649::o1"]);
    expect(adapted.contexts.get("ob123~tm-752649::o0")).toEqual({ rateCode: "A" });
    expect(adapted.contexts.get("tm-752649::o0")).toBeUndefined();
    expect(adapted.contexts.size).toBe(2);
  });

  it("mints a different batch every time", () => {
    expect(newOfferBatch()).not.toBe(newOfferBatch());
  });

  it("keeps the separator out of the batch, so the id can be split back", () => {
    expect(newOfferBatch()).not.toContain("~");
  });
});
