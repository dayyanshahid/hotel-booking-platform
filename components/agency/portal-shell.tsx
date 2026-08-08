"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Button, Drawer, Spinner, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/wordmark";
import { CartProvider } from "./cart";
import { CartButton, CartDock, CartSheet } from "./cart-drawer";
import { Meter, Money } from "./ui";
import { href } from "@/lib/nav";
import { refreshAgency, useAgency, type AgencyContext } from "./use-agency";
import type { Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

/**
 * The portal frame.
 *
 * Rebuilt around how the thing is actually used. An agent lives in this all day
 * with a customer waiting, so navigation is a fixed sidebar rather than a row
 * of links that wrapped onto three lines once there were eight of them — a nav
 * that reflows as the window resizes is a nav you have to re-read.
 *
 * The credit line sits in that sidebar as a meter, not a number in a corner.
 * "How much is left" is the question behind every quote, and a bar answers
 * "am I about to run out" in a way a figure does not.
 */

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

export function PortalShell({
  locale,
  children,
  requireAdmin = false,
}: {
  locale: Locale;
  children: (context: AgencyContext) => React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { t } = useApp();
  const { context, loading, unreachable } = useAgency();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Whether the rail is down to icons.
   *
   * Two hundred and forty pixels of permanent navigation is a quarter of a
   * laptop's width spent on a list an agent reads once a session and then
   * knows by heart — and it is taken from the results, which is the part of
   * the screen the job actually happens in.
   *
   * Remembered per browser rather than per account: it is a preference about
   * this screen on this machine, and an agent who collapses it on a small
   * laptop does not want it collapsed on the desk they sit at tomorrow.
   */
  const [railClosed, setRailClosed] = useState(false);

  useEffect(() => {
    try {
      setRailClosed(localStorage.getItem("nz_agency_rail") === "closed");
    } catch {
      /* private mode — the rail simply starts open */
    }
  }, []);

  function toggleRail() {
    setRailClosed((closed) => {
      const next = !closed;
      try {
        localStorage.setItem("nz_agency_rail", next ? "closed" : "open");
      } catch {
        /* not remembering it is survivable; not toggling it is not */
      }
      return next;
    });
  }

  // A route change should not leave the drawer sitting open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  /*
   * "We could not check" is not "you are not signed in".
   *
   * The session load used to map a dropped request onto the same `null` a 401
   * produces, so a blink of network put the sign-in screen in front of an
   * agent who was already signed in — and asked them for an address and a
   * code they did not need, possibly with a customer on the phone. Reloading
   * is the fix for one and does nothing for the other.
   */
  if (unreachable) return <SessionUnavailable />;
  if (!context) return <SignInPrompt locale={locale} />;

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t("agency.navSell"),
      items: [
        /*
         * One entry, because there is one screen.
         * Home and Search stays had converged — the same bar at the top of
         * both, differing only in what sat underneath — and two nav items for
         * that is a choice an agent has to make before they can start. The
         * month's figures are under Manage, where somebody goes looking for
         * them on purpose.
         */
        { path: "/agency", label: t("agency.searchStays"), icon: "search" },
        { path: "/agency/quotes", label: t("agency.quotes"), icon: "receipt" },
        { path: "/agency/customers", label: t("agency.customers"), icon: "users" },
      ],
    },
    {
      label: t("agency.navManage"),
      items: [
        { path: "/agency/overview", label: t("agency.dashboard"), icon: "grid" },
        { path: "/agency/bookings", label: t("agency.bookings"), icon: "plane" },
        { path: "/agency/credit", label: t("agency.credit"), icon: "tag" },
        { path: "/agency/reports", label: t("agency.reports"), icon: "list" },
      ],
    },
    {
      label: t("agency.navAccount"),
      items: [
        { path: "/agency/team", label: t("agency.team"), icon: "users" },
        { path: "/agency/settings", label: t("agency.settings"), icon: "settings" },
      ],
    },
  ];

  async function signOut() {
    await fetch(apiUrl("/api/agency/session"), { method: "DELETE", credentials: apiCredentials() });
    refreshAgency();
    router.push(href(locale, "/agency/signin"));
  }

  /**
   * The same navigation at two widths.
   *
   * Collapsed, the label leaves the flow but not the accessibility tree: the
   * link keeps its accessible name and gains a native tooltip, so an icon rail
   * is still navigable by screen reader and still identifiable by anyone who
   * has not memorised nine glyphs.
   */
  function navList(compact: boolean) {
    return (
      <nav aria-label={t("agency.portal")} className={compact ? "space-y-2" : "space-y-5"}>
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            {compact ? (
              // A heading with no room for its words becomes a rule instead —
              // the grouping is still legible, the label is not pretending.
              <div className="hairline mx-2 border-t pt-2" aria-hidden />
            ) : (
              <p className="text-muted px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const target = href(locale, item.path);
                const active = item.path === "/agency" ? pathname === target : pathname.startsWith(target);
                return (
                  <li key={item.path}>
                    <Link
                      href={target}
                      aria-current={active ? "page" : undefined}
                      title={compact ? item.label : undefined}
                      className={cx(
                        "relative flex items-center rounded-[var(--radius-control)] text-sm transition-colors",
                        compact ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                        /*
                          Weight as well as colour, and a mark on the edge.
                          The active item was a pale wash the same shape as the
                          hover state, so "where am I" and "what is under the
                          pointer" looked alike — and on the two screens where
                          the tint sits behind a hover at the same time, alike
                          enough to misread. Colour is doing the least of the
                          work here, which is the point.
                        */
                        active
                          ? "bg-brand-50 text-brand-700 font-semibold"
                          : "text-muted hover:bg-ink-50 hover:text-ink-900 font-medium",
                      )}
                    >
                      {active && !compact && (
                        <span
                          aria-hidden
                          className="bg-brand-600 absolute inset-y-1.5 start-0 w-[3px] rounded-e-full"
                        />
                      )}
                      <Icon name={item.icon} size={compact ? 18 : 16} className={active ? undefined : "opacity-80"} />
                      {compact ? <span className="sr-only">{item.label}</span> : item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  const nav = navList(false);

  return (
    <CartProvider>
      <div className="lg:flex lg:gap-6">
      {/*
        Desktop rail. Sticky, so navigation never scrolls away mid-task, and
        collapsible, because the results are what the agent is here for and the
        rail was taking a quarter of the width to say things they know.
      */}
      <aside
        className={cx(
          "no-print hidden shrink-0 transition-[width] duration-200 ease-[var(--ease-out)] lg:block",
          /*
            256, not 240. The lockup is 34px of globe plus two lines of
            non-wrapping type, and with the collapse button beside it the row
            needed about ten pixels more than w-60 gave — so the brand rendered
            as "TRAVEL & MOR". Clipping a company's own name in its own
            product is not a rounding error.
          */
          railClosed ? "w-16" : "w-64",
        )}
      >
        {/*
          A plane of its own, rather than text floating on the page.

          The rail was transparent over the same tint as the content, held apart
          by a single hairline — so nine links, three headings and the credit
          line read as loose furniture at the left edge rather than as one
          region you navigate from. Everything else on this screen that groups
          things is a card on that tint: the filter rail, the KPI tiles, the
          results. The navigation was the only structural element not speaking
          the language, and giving it the same surface costs nothing and settles
          it.

          It also scrolls inside itself now. Sticky alone meant a laptop short
          enough — and 800px of viewport is ordinary — pushed Settings off the
          bottom with no way to reach it but scrolling the results.
        */}
        <div
          className={cx(
            "surface hairline sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-4",
            "overflow-y-auto rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]",
            railClosed ? "p-2" : "p-3",
          )}
        >
          <div className={cx("flex items-center", railClosed ? "justify-center" : "justify-between gap-2")}>
            <Link href={href(locale, "/agency")} className="block min-w-0 overflow-hidden">
              <Wordmark markOnly={railClosed} />
            </Link>
            {!railClosed && (
              /*
                A 28px control, not a 44px one.

                The lockup needs 187 pixels and the row had 178 to give it, so
                the brand rendered as "TRAVEL & MOR" — the exact clipping the
                width comment above was written about, reintroduced by the
                card's own padding. A ghost Button at `size="sm"` was 44 pixels
                wide for a chevron; at 28 the name fits with room to spare, and
                a control this secondary should not have been carrying a
                primary button's dimensions next to the company's name in the
                first place. Comfortably past the 24px minimum, and this rail is
                desktop-only — the phone gets the drawer.
              */
              <button
                type="button"
                onClick={toggleRail}
                aria-label={t("agency.collapseNav")}
                title={t("agency.collapseNav")}
                aria-expanded
                className="hover:bg-ink-50 text-muted hover:text-ink-900 grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] transition-colors"
              >
                <Icon name="chevronRight" size={16} className="rotate-180 rtl:rotate-0" />
              </button>
            )}
          </div>

          {railClosed ? (
            /*
              Collapsed, the one thing that still has to be visible is the
              money — a credit line an agent cannot see is a credit line they
              overspend.

              This is what the comment here has always claimed and the code
              never did: it rendered a chevron and nothing else, so collapsing
              the rail hid the credit line completely. Now it is the bar alone,
              which is readable at sixteen pixels, with the figure and the limit
              in its tooltip and in its accessible name.
            */
            <>
              <CreditRail locale={locale} context={context} compact />
              <button
                type="button"
                onClick={toggleRail}
                aria-label={t("agency.expandNav")}
                title={t("agency.expandNav")}
                className="hover:bg-ink-50 text-muted flex w-full items-center justify-center rounded-[var(--radius-control)] py-2"
              >
                <Icon name="chevronRight" size={16} className="rtl:rotate-180" />
              </button>
            </>
          ) : (
            /*
              The badge that said "Agent portal" on the agent portal is gone.
              It was the third brand mark in a 90-pixel column, under a wordmark
              that had already said whose product this is, telling an agent
              something they cannot fail to know.
            */
            <CreditRail locale={locale} context={context} />
          )}

          {navList(railClosed)}
        </div>
      </aside>

      {/*
        Everything inside measures against this column, not the window.
        The rail is 272px wide, so a 1024px window gives the content about 710px
        — and a layout keyed to the *viewport* laid out four search fields and a
        button as though it had the full 1024, pushing Search off the edge. Zoom
        makes it worse in exactly the same way, because zoom is a narrower
        viewport wearing a different name.
      */}
      {/*
        Six between blocks rather than five, now that the header is a card
        sitting in the same stack: a surface needs a little more room around it
        than a line of text does before the next one starts.
      */}
      <div className="@container min-w-0 flex-1 space-y-6">
        {/*
          Sticky, and a surface of its own.

          It scrolled away with the page, which is wrong for what it holds: the
          basket carries a countdown to the moment its rates go stale, and the
          credit line is the number behind every decision on the screen below
          it. Both were reachable only by scrolling back to the top of a result
          list the agent had just scrolled down.

          A surface because it now sits between two of them — the rail beside
          it and the cards under it — and a bare row with one hairline read as
          the gap between them rather than as a thing.
        */}
        <header className="surface hairline sticky top-4 z-30 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border px-3 py-2 shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label={t("agency.portal")}
            >
              <Icon name="menu" size={18} />
            </Button>
            <Link href={href(locale, "/agency")} className="lg:hidden">
              <Wordmark markOnly />
            </Link>
            {/*
              Hidden on a phone, where the credit figure has the better claim
              on the space — the agency's own name is the one thing an agent
              never needs reminding of, and it is in the drawer regardless.
            */}
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold leading-tight">{context.agency.name}</p>
              <p className="text-muted truncate text-xs">{context.session.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/*
              The figure follows the agent everywhere, but it is only ever in
              one place at a time.

              The rail already carries available credit, the limit under it and
              a utilisation bar, and this pill was carrying the same number two
              inches away — the same $23,698 twice on one screen, which reads
              as two figures that happen to agree rather than as one fact. So
              the pill appears exactly where the rail cannot: on a laptop with
              the nav collapsed, and on anything narrower than `lg`, where the
              rail is behind the menu button.
            */}
            {context.balance && (
              <Link
                href={href(locale, "/agency/credit")}
                className={cx(
                  "hairline hover:border-brand-300 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  !railClosed && "lg:hidden",
                )}
              >
                {/* The label is the first thing to go when space is short; the
                    figure is what an agent is actually looking for. */}
                <span className="text-muted hidden sm:inline">{t("agency.creditAvailable")}</span>
                <Money
                  amount={context.balance.available}
                  currency={context.balance.currency}
                  locale={locale}
                  size="sm"
                  className="font-semibold"
                />
              </Link>
            )}
            {/* The selection follows the agent between screens, so its
                handle has to be somewhere that does the same. */}
            <CartButton />
            {/*
              Sign out behind the account, not beside the basket.

              It sat in the top-right corner — the most prominent position on
              the screen — as a plain button one stray click from an agent
              mid-quote, and it was the only thing there. The account it belongs
              to now holds it, which is where somebody goes looking for it and
              nowhere near where they are working.
            */}
            <AccountMenu context={context} onSignOut={signOut} />
          </div>
        </header>

        {requireAdmin && context.session.role !== "admin" ? (
          <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-3 py-2 text-sm">
            {t("agency.adminOnly")}
          </p>
        ) : (
          children(context)
        )}
      </div>

        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("agency.portal")}>
          <div className="space-y-5">
            <CreditRail locale={locale} context={context} />
            {nav}
          </div>
        </Drawer>

        {/*
          The third column. Inside the flex row, so opening the cart narrows
          the results rather than covering them — which is the whole point:
          every Add button on the left stays live while it is open.
        */}
        <CartDock locale={locale} />
      </div>

      {/* No room to dock on a phone, so there it stays a sheet. */}
      <CartSheet locale={locale} />
    </CartProvider>
  );
}

/**
 * The credit line, as the sidebar shows it.
 *
 * Available first and largest, because that is what a quote is checked against.
 * The limit sits below in smaller type — useful context, not the operative
 * figure — and the bar changes colour before the money runs out.
 */
function CreditRail({
  locale,
  context,
  compact = false,
}: {
  locale: Locale;
  context: AgencyContext;
  /** Icon-width rail: the bar alone, with the figures in its accessible name. */
  compact?: boolean;
}) {
  const { t } = useApp();
  const balance = context.balance;
  if (!balance) return null;

  const ratio = balance.limit > 0 ? balance.available / balance.limit : 0;
  const money = (amount: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
      style: "currency",
      currency: balance.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  const limit = money(balance.limit);
  /** Everything the expanded block says, in one string a tooltip can hold. */
  const summary = `${t("agency.creditAvailable")}: ${money(balance.available)} ${t("agency.ofLimit", { limit })}`;

  if (compact) {
    return (
      <Link
        href={href(locale, "/agency/credit")}
        title={summary}
        aria-label={summary}
        className="hover:bg-ink-50 block rounded-[var(--radius-control)] px-1.5 py-2"
      >
        <Meter value={balance.available} max={balance.limit} label={t("agency.creditAvailable")} />
      </Link>
    );
  }

  /*
   * Tinted rather than outlined.
   *
   * A bordered card inside a bordered card is two frames around one number, and
   * it made the credit line the loudest thing in a column whose job is
   * navigation — an agent's eye went to the money before the menu on every
   * single page load. The figure is a shade smaller and the frame is gone; it
   * is still the first thing under the wordmark, which is prominence enough for
   * something read at a glance rather than studied.
   */
  return (
    <Link
      href={href(locale, "/agency/credit")}
      className="surface-sunken hover:bg-brand-50 block rounded-[var(--radius-control)] p-3 transition-colors"
    >
      <p className="text-muted text-[10px] font-semibold uppercase tracking-[0.08em]">
        {t("agency.creditAvailable")}
      </p>
      <p className="mt-0.5">
        <Money amount={balance.available} currency={balance.currency} locale={locale} size="md" />
      </p>
      <div className="mt-2">
        <Meter value={balance.available} max={balance.limit} label={t("agency.creditAvailable")} />
      </div>
      <p className="text-muted mt-1.5 text-[11px]">{t("agency.ofLimit", { limit })}</p>
      {ratio < 0.15 && <p className="text-critical-700 mt-1.5 text-xs font-medium">{t("agency.creditLow")}</p>}
    </Link>
  );
}

/**
 * Who you are signed in as, and the way out.
 *
 * Sign out used to be a bare button in the top-right corner: the most prominent
 * position on the screen, holding the one action an agent cannot undo, one
 * stray click from a quote in progress. Behind the account is where people look
 * for it and nowhere near where they work.
 *
 * Written here rather than as a `Menu` in the kit because there is one of them.
 * A primitive designed against a single caller is a guess about the next four;
 * if a second menu turns up, this is the thing to lift.
 */
function AccountMenu({
  context,
  onSignOut,
}: {
  context: AgencyContext;
  onSignOut: () => void | Promise<void>;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Initials, so the control is identifiable at a glance on a shared machine. */
  const initials = context.session.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={context.session.name}
        className="hover:bg-ink-50 flex items-center gap-2 rounded-[var(--radius-pill)] py-1 pe-2 ps-1 transition-colors"
      >
        <span
          aria-hidden
          className="bg-brand-100 text-brand-700 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
        >
          {initials || "?"}
        </span>
        <Icon name="chevronDown" size={14} className="text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="surface hairline absolute end-0 z-40 mt-1 w-56 rounded-[var(--radius-card)] border p-1 shadow-[var(--shadow-float)]"
        >
          {/* Which account, on a machine several agents share. */}
          <div className="hairline border-b px-3 py-2">
            <p className="truncate text-sm font-semibold">{context.session.name}</p>
            <p className="text-muted truncate text-xs">{context.agency.name}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void onSignOut();
            }}
            className="hover:bg-ink-50 mt-1 flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-start text-sm"
          >
            <Icon name="close" size={14} />
            {t("agency.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The session could not be checked — which is a network problem, not a sign-out. */
function SessionUnavailable() {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <Wordmark className="justify-center" />
      <h1 className="text-xl font-bold">{t("agency.sessionUnverified")}</h1>
      <p className="text-muted text-sm">{t("agency.sessionUnverifiedBody")}</p>
      <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
    </div>
  );
}

function SignInPrompt({ locale }: { locale: Locale }) {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <Wordmark className="justify-center" />
      <h1 className="text-xl font-bold">{t("agency.signIn")}</h1>
      <p className="text-muted text-sm">{t("agency.signInRequired")}</p>
      <Link href={href(locale, "/agency/signin")}>
        <Button>{t("agency.signIn")}</Button>
      </Link>
    </div>
  );
}
