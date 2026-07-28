import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listCases } from "@/lib/server/store";

/**
 * The support queue.
 *
 * Ordered by how close each case is to breaching its own promised response
 * time, not by age. A two-hour-old chat case with a one-hour SLA is more urgent
 * than a day-old email case with an eight-hour one, and sorting by arrival hides
 * exactly that.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  const now = Date.now();

  const cases = listCases()
    .filter((item) => (status === "all" ? true : status === "open" ? item.status !== "resolved" : item.status === status))
    .map((item) => {
      const dueAt = new Date(item.createdAt).getTime() + item.slaHours * 3_600_000;
      return {
        ...item,
        dueAt: new Date(dueAt).toISOString(),
        minutesToDue: Math.round((dueAt - now) / 60_000),
        breached: dueAt < now && item.status !== "resolved",
      };
    })
    .sort((a, b) => a.minutesToDue - b.minutesToDue);

  return ok({ cases, open: cases.filter((c) => c.status !== "resolved").length });
}
