import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { listTravelers, saveTravelers } from "@/lib/server/store";
import type { TravelerProfile } from "@/lib/types";

/** Reusable traveler profiles, stored only with explicit consent (§5.10). */
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get("email") ?? "").toLowerCase();
  if (!email) return ok({ travelers: [] });
  return ok({ travelers: listTravelers(email) });
}

export async function PUT(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ email: string; travelers: TravelerProfile[]; consent: boolean }>(req);
  if (!body?.email) return fail("validation", "error.validation", locale, { status: 400 });
  if (!body.consent) {
    return fail("validation", "error.validation", locale, {
      status: 422,
      fields: { consent: locale === "ar" ? "الموافقة مطلوبة لحفظ بيانات المسافرين." : "Consent is required to store traveler details." },
    });
  }
  const cleaned = (body.travelers ?? []).slice(0, 12).map((t) => ({
    id: t.id || `tp_${Math.random().toString(36).slice(2, 9)}`,
    type: t.type === "child" ? ("child" as const) : ("adult" as const),
    firstName: sanitize(t.firstName, 40),
    surname: sanitize(t.surname, 40),
    dateOfBirth: t.dateOfBirth,
    nationality: t.nationality,
    consentAt: t.consentAt || new Date().toISOString(),
  }));
  saveTravelers(body.email, cleaned);
  return ok({ travelers: cleaned });
}

export const dynamic = "force-dynamic";
