import { contactLine, type Branding } from "@/lib/agency/branding";

/**
 * The masthead and footer of anything an agency hands to a customer.
 *
 * A quotation and a voucher had grown their own headers, which is how the same
 * agency ends up with a logo on one document and not the other. They are the
 * same letterhead, so they are the same component: change the shape of an
 * agency's paperwork once and both follow.
 *
 * Nothing here is ours. No platform name, no supplier name, no reference of
 * ours that a traveller could mistake for the hotel's (§9.4).
 */

/**
 * Print keeps the accent.
 *
 * Browsers drop background colours when printing by default, which is a sound
 * default for a web page and wrong for a letterhead — the one thing an agency
 * chose would be the one thing that did not come out of the printer. This opts
 * the accent back in; everything else on the page still prints as ink on white.
 */
const KEEP_IN_PRINT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

export function DocumentBrand({
  branding,
  title,
  reference,
  meta,
}: {
  branding: Branding;
  /** What this document is — "Quotation", "Booking voucher". */
  title: string;
  reference: string;
  /** Issue date, or whatever the document wants under its reference. */
  meta?: string;
}) {
  const contact = contactLine(branding);

  return (
    <header>
      {/*
        A rule in the agency's colour rather than a filled banner. It reads as
        letterhead at any size, survives a pale brand colour without needing
        contrast-safe text, and costs almost no ink.
      */}
      <div
        aria-hidden
        className="h-1.5 w-full rounded-full"
        style={{ backgroundColor: branding.color, ...KEEP_IN_PRINT }}
      />

      {/*
        Stacked on a narrow screen, two columns from `sm` up.

        This was `flex-wrap` with the reference block set to `text-end`, which
        looked right until an agency filled in its details: a phone number, an
        email and a website on one line is easily five hundred pixels, so the
        left column ate the row and the reference wrapped underneath — where
        `text-end` right-aligned it inside a shrink-to-fit box and left it
        floating in the middle of the page. It happened at desktop width, on
        the document a customer is handed.

        An explicit breakpoint instead of wrapping, so there are two layouts and
        both were chosen. `shrink-0` keeps the reference intact when the
        letterhead is long; the left column takes what is left.
      */}
      <div className="hairline mt-4 flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.name}
              // Boxed, because the file is whatever the agency happened to have
              // — a wide banner and a tall crest both have to sit here without
              // pushing the reference off the page.
              className="mb-2 h-12 w-auto max-w-[220px] object-contain"
            />
          )}
          <p className="wrap-anywhere text-lg font-bold">{branding.name}</p>
          {branding.address && <p className="text-muted wrap-anywhere text-sm">{branding.address}</p>}
          {branding.city && <p className="text-muted text-sm">{branding.city}</p>}
          {contact && <p className="text-muted wrap-anywhere text-sm">{contact}</p>}
          {branding.taxNumber && <p className="text-muted text-xs">{branding.taxNumber}</p>}
        </div>

        {/* Right-aligned only once it is actually a right-hand column. */}
        <div className="shrink-0 text-start sm:text-end">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: branding.ink, ...KEEP_IN_PRINT }}
          >
            {title}
          </p>
          <p className="font-mono text-base font-bold">{reference}</p>
          {meta && <p className="text-muted text-xs">{meta}</p>}
        </div>
      </div>
    </header>
  );
}

/**
 * The agency's own conditions at the foot of the page.
 *
 * Renders nothing when there are none, rather than an empty rule — a document
 * with a heading over blank space reads as something that failed to load.
 *
 * `whitespace-pre-line` because an agency will paste paragraphs and expect them
 * to stay paragraphs. The text is plain and stays plain; it is never markup.
 */
export function DocumentFooter({ branding }: { branding: Branding }) {
  if (!branding.footer) return null;
  return (
    <footer className="hairline mt-5 border-t pt-4">
      <p className="text-muted whitespace-pre-line text-xs leading-relaxed">{branding.footer}</p>
    </footer>
  );
}
