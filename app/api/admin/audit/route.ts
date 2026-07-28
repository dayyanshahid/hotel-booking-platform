import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listAudit } from "@/lib/admin/store";

/**
 * Everything operators have done, newest first.
 *
 * Filterable by actor and action because the questions asked of an audit log
 * are specific — "what did this person change in March", "who has been
 * touching commissions" — and scrolling a thousand rows answers neither.
 * `format=csv` exists for the same reason it does on agency statements: the
 * person reconciling an incident works in a spreadsheet.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const url = new URL(req.url);
  const actor = (url.searchParams.get("actor") ?? "").trim().toLowerCase();
  const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();

  const all = await listAudit(500);
  const entries = all.filter(
    (entry) =>
      (!actor || entry.actor.toLowerCase().includes(actor)) &&
      (!action || entry.action.toLowerCase().startsWith(action)),
  );

  if (url.searchParams.get("format") === "csv") {
    const csv = [
      ["at", "actor", "action", "subject", "detail", "before", "after"].join(","),
      ...entries.map((entry) =>
        [
          entry.at,
          entry.actor,
          entry.action,
          entry.subject,
          // A detail containing a comma would otherwise split into two columns.
          `"${entry.detail.replace(/"/g, '""')}"`,
          entry.before ?? "",
          entry.after ?? "",
        ].join(","),
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit.csv"`,
      },
    });
  }

  // The action list drives the filter dropdown; deriving it from the data means
  // a new audited action appears in the filter without anyone updating a list.
  const actions = [...new Set(all.map((entry) => entry.action.split(".")[0]))].sort();
  return ok({ entries: entries.slice(0, 200), actions, total: all.length });
}
