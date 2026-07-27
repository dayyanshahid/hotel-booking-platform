import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { getSession } from "@/lib/server/store";
import { getHotelSeed } from "@/lib/data/hotels";
import { getDestination } from "@/lib/data/destinations";
import type { PaymentIntent, PaymentMethodOption } from "@/lib/types";

/**
 * POST /api/payments/intents — initialise the gateway flow.
 *
 * The client receives a hosted-fields client secret and the allowed methods
 * only. No PAN or CVV ever reaches the platform API (§12.3 / [S19]); the
 * simulated 3-D Secure step below mirrors the real SCA hand-off.
 */
const ALL_METHODS: PaymentMethodOption[] = [
  { code: "card", label: "Visa / Mastercard", markets: ["*"], requiresBilling: true },
  { code: "applepay", label: "Apple Pay", markets: ["SA", "AE", "QA", "GB"], requiresBilling: false },
  { code: "mada", label: "mada", markets: ["SA"], requiresBilling: false },
  { code: "stcpay", label: "stc pay", markets: ["SA"], requiresBilling: false },
  { code: "paypal", label: "PayPal", markets: ["GB", "TR", "OTHER"], requiresBilling: false },
];

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ checkoutSessionId: string }>(req);
  if (!body?.checkoutSessionId) return fail("validation", "error.validation", locale, { status: 400 });

  const session = getSession(body.checkoutSessionId);
  if (!session) {
    return fail("availabilityChanged", "checkout.expired", locale, { status: 404, action: "selectAlternative" });
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return fail("availabilityChanged", "checkout.expired", locale, { status: 409, action: "selectAlternative" });
  }

  const seed = getHotelSeed(session.hotelSlug);
  const dest = seed ? getDestination(seed.destinationId) : undefined;
  const market = dest?.countryCode ?? "SA";

  // A pay-later rate authorises a guarantee rather than capturing funds, so the
  // customer is never told they are paying now when they are not (§5.7).
  const mode = session.paymentTiming === "payNow" ? "charge" : "guarantee";

  const intent: PaymentIntent = {
    intentId: `pi_${Math.random().toString(36).slice(2, 12)}`,
    clientSecret: `pi_secret_${Math.random().toString(36).slice(2, 18)}`,
    amount: mode === "charge" ? session.price.total : 0,
    currency: session.price.currency,
    allowedMethods: ALL_METHODS.filter((m) => m.markets.includes("*") || m.markets.includes(market)),
    threeDsRequired: mode === "charge" && session.price.total > 400,
    merchantDescriptor: "NAZIL TRAVEL",
    mode,
  };

  return ok(intent);
}
