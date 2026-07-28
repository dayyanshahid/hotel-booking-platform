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

  const body = await readJson<{
    reply?: string;
    status?: SupportCase["status"];
    /** "" releases the case back to the queue; "me" claims it. */
    assignee?: string;
  }>(req);
  const reply = sanitize(body?.reply, 1200);
  const status = body?.status;
  const assignee = body?.assignee;
  if (!reply && !status && assignee === undefined) {
    return fail("validation", "error.validation", locale, { status: 422 });
  }
  if (status && !["open", "inProgress", "resolved"].includes(status)) {
    return fail("validation", "error.validation", locale, { status: 422 });
  }

  const nextAssignee =
    assignee === undefined
      ? supportCase.assignee
      : assignee === "me"
        ? session.email
        : assignee || undefined;

  /*
   * Replying takes ownership if nobody holds it.
   *
   * An operator who has answered a customer is, in every practical sense, the
   * person handling that case — making them also click "assign to me" is a
   * step they will skip, and the queue then shows an answered case as
   * unclaimed.
   */
  const updated: SupportCase = {
    ...supportCase,
    status: status ?? supportCase.status,
    assignee: reply && !nextAssignee ? session.email : nextAssignee,
    messages: reply
      ? [...supportCase.messages, { at: new Date().toISOString(), from: "agent" as const, body: reply }]
      : supportCase.messages,
  };
  saveCase(updated);

  await appendAudit({
    actor: session.email,
    action: "case.update",
    subject: caseId,
    detail: reply
      ? `Replied${status ? ` and set ${status}` : ""}`
      : status
        ? `Set ${status}`
        : `Assigned to ${updated.assignee ?? "nobody"}`,
    before: supportCase.status,
    after: updated.status,
  });

  return ok({ case: updated });
}
