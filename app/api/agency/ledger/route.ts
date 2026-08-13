import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { agencyBalance, listAgents, listLedger } from "@/lib/agency/store";
import { statementLines } from "@/lib/agency/statement";

/** The credit statement: every movement, newest first, with its booking. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [all, balance, agents] = await Promise.all([
    /*
     * The whole ledger, not the page the screen shows.
     *
     * A running balance computed from the most recent hundred movements starts
     * from zero a hundred movements in, and is then wrong by everything before
     * it — plausibly wrong, on a page about money, which is the worst kind.
     * Read whole, reconciled, and sliced afterwards.
     */
    listLedger(session.agencyId, Number.MAX_SAFE_INTEGER),
    agencyBalance(session.agencyId),
    listAgents(session.agencyId),
  ]);

  const names = new Map(agents.map((a) => [a.id, a.name]));
  const lines = statementLines(all, balance?.limit ?? 0, names);

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") return csv(lines, balance?.currency ?? "USD");

  /*
   * Capped for the screen, and the total said out loud.
   *
   * A list that silently stops at two hundred tells an agency they have two
   * hundred movements. `total` is what lets the page say "showing 200 of 412"
   * instead, which is the difference between a limit and a lie.
   */
  return ok({ entries: lines.slice(0, 200), total: lines.length, balance });
}

/**
 * The movements as a spreadsheet.
 *
 * The monthly statements already export, and they are totals — an accounts
 * clerk chasing a single figure needs the lines behind them. Everything is
 * quoted because a hotel name with a comma in it would otherwise shift every
 * column after it, silently, in whichever tool opens the file.
 */
function csv(lines: ReturnType<typeof statementLines>, currency: string): Response {
  const cell = (value: string | number | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "Kind", "Reference", "Agent", "Note", `Amount (${currency})`, "Committed after", "Available after"],
    ...lines.map((line) => [
      line.at,
      line.kind,
      line.reference ?? "",
      line.agentName ?? "",
      line.note,
      line.amount.toFixed(2),
      line.usedAfter.toFixed(2),
      line.availableAfter.toFixed(2),
    ]),
  ];
  return new Response(rows.map((row) => row.map(cell).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="statement.csv"',
      // Never a shared cache: this is one agency's commercial history.
      "cache-control": "private, no-store",
    },
  });
}
