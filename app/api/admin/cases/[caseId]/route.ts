import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { getCase, saveCase } from "@/lib/server/store";
import type { SupportCase } from "@/lib/types";

/**
 * Working a case.
 *
 * A reply and a status change are one call because they are one action: an
 * operator who resolves a case without saying anything has left the customer
 * looking at silence. Either may be omitted, but the common path sends both.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const supportCase = getCase(caseId);
  if (!supportCase) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ reply?: string; status?: SupportCase["status"] }>(req);
  const reply = sanitize(body?.reply, 1200);
  const status = body?.status;
  if (!reply && !status) return fail("validation", "error.validation", locale, { status: 422 });
  if (status && !["open", "inProgress", "resolved"].includes(status)) {
    return fail("validation", "error.validation", locale, { status: 422 });
  }

  const updated: SupportCase = {
    ...supportCase,
    status: status ?? supportCase.status,
    messages: reply
      ? [...supportCase.messages, { at: new Date().toISOString(), from: "agent" as const, body: reply }]
      : supportCase.messages,
  };
  saveCase(updated);

  await appendAudit({
    actor: session.email,
    action: "case.update",
    subject: caseId,
    detail: reply ? `Replied${status ? ` and set ${status}` : ""}` : `Set ${status}`,
    before: supportCase.status,
    after: updated.status,
  });

  return ok({ case: updated });
}
