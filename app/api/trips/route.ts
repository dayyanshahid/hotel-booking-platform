import { fail, localeFrom, ok } from "@/lib/server/api";
import { listBookings } from "@/lib/server/store";

/** GET /api/trips?email= — the signed-in customer's bookings, newest first. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return fail("accountSecurity", "error.accountSecurity", locale, { status: 401, action: "authenticate" });
  }
  const bookings = await listBookings(email);
  return ok({ bookings });
}

export const dynamic = "force-dynamic";
