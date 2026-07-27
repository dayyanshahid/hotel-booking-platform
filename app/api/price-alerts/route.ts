import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { listAlerts, removeAlert, saveAlert } from "@/lib/server/store";
import type { PriceAlert } from "@/lib/types";

/** POST /api/price-alerts — consented search or hotel alert (§5.12). */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<Partial<PriceAlert> & { consent?: boolean }>(req);
  if (!body?.destinationId || !body.checkIn || !body.checkOut) {
    return fail("validation", "error.validation", locale, { status: 422 });
  }
  if (!body.consent) {
    return fail("validation", "error.validation", locale, {
      status: 422,
      fields: { consent: locale === "ar" ? "الموافقة مطلوبة." : "Consent is required." },
    });
  }

  const alert: PriceAlert = {
    id: `al_${Math.random().toString(36).slice(2, 10)}`,
    hotelSlug: body.hotelSlug,
    destinationId: body.destinationId,
    destinationLabel: sanitize(body.destinationLabel ?? "", 80),
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    rooms: body.rooms ?? [{ adults: 2, childrenAges: [] }],
    targetPrice: Math.max(0, Math.round(Number(body.targetPrice ?? 0))),
    currency: body.currency ?? "SAR",
    channels: body.channels?.length ? body.channels : ["email"],
    createdAt: new Date().toISOString(),
    status: "active",
  };
  saveAlert(alert);
  return ok(alert);
}

export async function GET() {
  return ok({ alerts: listAlerts() });
}

export async function DELETE(req: Request) {
  const locale = localeFrom(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("validation", "error.validation", locale, { status: 400 });
  removeAlert(id);
  return ok({ removed: id });
}

export const dynamic = "force-dynamic";
