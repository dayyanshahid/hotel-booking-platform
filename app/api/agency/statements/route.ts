import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, statementPeriods } from "@/lib/agency/store";

/**
 * Monthly statements.
 *
 * `format=csv` returns the same figures as a file, because the person who
 * reconciles an agency's account works in a spreadsheet and will otherwise
 * retype them — and retyping is where reconciliation errors come from.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [agency, periods] = await Promise.all([getAgency(session.agencyId), statementPeriods(session.agencyId)]);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") {
    const month = url.searchParams.get("month");
    const rows = periods
      .filter((period) => !month || period.month === month)
      .flatMap((period) => period.entries.map((entry) => ({ period: period.month, entry })));

    const csv = [
      ["month", "date", "type", "reference", "description", "amount", "currency"].join(","),
      ...rows.map(({ period, entry }) =>
        [
          period,
          entry.at,
          entry.kind,
          entry.reference ?? "",
          // A note containing a comma would otherwise split into two columns.
          `"${entry.note.replace(/"/g, '""')}"`,
          entry.amount,
          entry.currency,
        ].join(","),
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="statement-${agency.slug}${month ? `-${month}` : ""}.csv"`,
      },
    });
  }

  return ok({ periods, currency: agency.credit.currency, paymentDays: agency.credit.paymentDays });
}
