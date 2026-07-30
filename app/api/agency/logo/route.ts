import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, saveAgency } from "@/lib/agency/store";
import { MAX_LOGO_BYTES, clearLogo, saveLogo, sniffImageType } from "@/lib/agency/logo";

/**
 * Uploading the agency's own mark.
 *
 * Admin only, like the rest of the branding: the logo goes on every document
 * the agency's customers receive, and that is not a thing any agent at the
 * counter should be able to change.
 *
 * The file is read into memory whole, which is fine at half a megabyte and is
 * the reason for the cap. `request.formData()` would buffer it anyway.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) {
    return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const candidate = form.get("logo");
    if (candidate instanceof File) file = candidate;
  } catch {
    // Not multipart, or malformed. Handled as a validation failure below.
  }
  if (!file || file.size === 0) {
    return fail("validation", "agency.logoMissing", locale, { status: 422, fields: { logo: "required" } });
  }

  /*
   * Size is checked before the bytes are read, then again after.
   *
   * `File.size` is what the client declared. It is almost always honest and it
   * is free to check, so an oversized upload is refused before it is buffered;
   * the second check is the one that actually holds, because it counts what
   * arrived.
   */
  if (file.size > MAX_LOGO_BYTES) {
    return fail("validation", "agency.logoTooLarge", locale, { status: 422, fields: { logo: "tooLarge" } });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    return fail("validation", "agency.logoTooLarge", locale, { status: 422, fields: { logo: "tooLarge" } });
  }

  /*
   * The type comes from the bytes, never from the upload.
   *
   * This image is served back from our own origin and printed on a customer's
   * voucher. An SVG is a script that draws, so one accepted as `image/png`
   * would sit in the store waiting to run against our domain. Signatures only,
   * and SVG is not among them.
   */
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    return fail("validation", "agency.logoNotAnImage", locale, { status: 422, fields: { logo: "type" } });
  }

  const stored = await saveLogo(agency.id, bytes, contentType);
  await saveAgency({
    ...agency,
    profile: {
      ...agency.profile,
      // An upload replaces a linked URL rather than sitting behind it: two
      // logos and a precedence rule is a question nobody should have to ask.
      logoUrl: "",
      logoUploadedAt: stored.updatedAt,
    },
  });

  return ok({ uploadedAt: stored.updatedAt, contentType, bytes: bytes.byteLength });
}

/** Removing an uploaded logo, leaving the agency unbranded rather than stale. */
export async function DELETE(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) {
    return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  await clearLogo(agency.id);
  await saveAgency({ ...agency, profile: { ...agency.profile, logoUploadedAt: undefined } });
  return ok({ removed: true });
}

export const dynamic = "force-dynamic";
