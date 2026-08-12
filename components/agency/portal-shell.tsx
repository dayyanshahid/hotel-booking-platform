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
  ];

  /*
   * Account-level, and therefore not in the bar.
   *
   * Team and Settings are things you configure, not places you go while
   * selling. In a horizontal bar every item competes with the work for the
   * same strip of pixels, and these two would be competing on behalf of a
   * task an agent does twice a year.
   */
  const accountItems: NavItem[] = [
    { path: "/agency/team", label: t("agency.team"), icon: "users" },
    { path: "/agency/settings", label: t("agency.settings"), icon: "settings" },
  ];

  async function signOut() {
    await fetch(apiUrl("/api/agency/session"), { method: "DELETE", credentials: apiCredentials() });
    refreshAgency();
    router.push(href(locale, "/agency/signin"));
  }

  /**
   * The navigation as a column, for the drawer.
   *
   * This used to render at two widths because the desktop rail could collapse
   * to icons; the rail is gone and the bar has its own renderer, so what is
   * left is the one shape a drawer wants.
   */
  function navList() {
    return (
      <nav aria-label={t("agency.portal")} className="space-y-5">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-muted px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const target = href(locale, item.path);
                const active = item.path === "/agency" ? pathname === target : pathname.startsWith(target);
                return (
                  <li key={item.path}>
                    <Link
                      href={target}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-brand-50 text-brand-700 font-semibold"
                          : "text-muted hover:bg-ink-50 hover:text-ink-900 font-medium",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="bg-brand-600 absolute inset-y-1.5 start-0 w-[3px] rounded-e-full"
                        />
                      )}
                      <Icon name={item.icon} size={16} className={active ? undefined : "opacity-80"} />
                      {item.label}
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

  const nav = navList();

  /**
   * The same destinations, in a row.
   *
   * Icons stay: they are what makes a horizontal bar scannable at a glance
   * rather than a line of similar-length words. The groups become a hairline
   * rather than headings — "SELL" and "MANAGE" have nowhere to live in a
   * single row, and the division between selling and managing is still worth
   * showing even when it cannot be named.
   */
  function navBar() {
    return (
      <nav aria-label={t("agency.portal")} className="hidden min-w-0 flex-1 lg:block">
        <ul className="flex items-center gap-0.5">
          {groups.map((group, groupIndex) => (
            <li key={group.label} className="contents">
              {groupIndex > 0 && (
                <span aria-hidden className="bg-ink-100 mx-1.5 h-5 w-px shrink-0 rounded-full" />
              )}
              {group.items.map((item) => {
                const target = href(locale, item.path);
                const active = item.path === "/agency" ? pathname === target : pathname.startsWith(target);
                return (
                  <Link
                    key={item.path}
                    href={target}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700 font-semibold"
                        : "text-muted hover:bg-ink-50 hover:text-ink-900 font-medium",
                    )}
                  >
                    <Icon name={item.icon} size={15} className={active ? undefined : "opacity-80"} />
                    {/*
                      Below `xl` the labels go and the icons stay. Seven words
                      plus a brand plus the credit line plus the basket do not
                      fit a 1280 window, and a bar that wraps to two rows is a
                      bar you have to read twice.

                      One span that unhides, not a visible one plus a screen
                      reader one: two of them read as "Search staysSearch
                      stays" to anybody listening rather than looking.
                    */}
                    <span className="sr-only xl:not-sr-only">{item.label}</span>
                  </Link>
                );
              })}
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <CartProvider>
      {/*
        Navigation across the top, not down the side.

        The rail cost 280 pixels of every screen — a quarter of a laptop — to
        hold nine links an agent reads once and then knows by heart, and it was
        taken from the results, which is the part of the window the job happens
        in. Across the top the same nine cost about fifty pixels of height, and
        the search and its results get the whole width back.

        Two of them are not here. Team and Settings are account-level rather
        than places you go while selling, and they sit in the account menu at
        the end of the bar, which is both where people look for them and two
        fewer things competing with the work.
      */}
      <div className="space-y-6">
        <header className="surface hairline no-print sticky top-4 z-30 flex items-center gap-3 rounded-[var(--radius-card)] border px-3 py-1.5 shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label={t("agency.portal")}
            >
              <Icon name="menu" size={18} />
            </Button>
            {/*
              The mark alone in the bar, and the full lockup nowhere.

              A horizontal bar has one scarce dimension and the wordmark wanted
              187 pixels of it to say what the browser tab, the drawer and every
              document this portal produces already say. The agency's own name
              moved into the account menu with the rest of the identity.
            */}
            <Link href={href(locale, "/agency")} aria-label={context.agency.name}>
              <Wordmark markOnly />
            </Link>
          </div>

          {navBar()}

          <div className="flex shrink-0 items-center gap-2">
            {/*
              Credit, in the one place it now lives.

              This pill used to hide itself whenever the rail was showing the
              same figure, because the same number twice on one screen reads as
              two figures that happen to agree. With the rail gone there is no
              second copy to duck, and this is the only thing on the bar that
              is a fact rather than a destination — so it keeps the meter, which
              answers "am I about to run out" in a way a figure cannot.
            */}
            {context.balance && (
              <Link
                href={href(locale, "/agency/credit")}
                className="hairline hover:border-brand-300 hidden items-center gap-2 rounded-full border py-1 pe-3 ps-2.5 text-xs transition-colors sm:inline-flex"
              >
                {/*
                  A meter beside the figure, not instead of it. The bar answers
                  "am I close to the limit" at a glance and the number answers
                  "how much"; the word "available" is the first thing to go when
                  the bar gets tight, because the other two carry the meaning.
                */}
                <span aria-hidden className="w-10 shrink-0">
                  <Meter
                    value={context.balance.available}
                    max={context.balance.limit}
                    label={t("agency.creditAvailable")}
                  />
                </span>
                <span className="text-muted hidden xl:inline">{t("agency.creditAvailable")}</span>
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
            <AccountMenu
              context={context}
              locale={locale}
              accountItems={accountItems}
              onSignOut={signOut}
            />
          </div>
        </header>

        {/*
          The work, and the basket beside it.

          Everything inside the first column measures against that column rather
          than against the window — the cart docks into this row, so opening it
          narrows the results instead of covering them, and a layout keyed to
          the viewport would lay out four search fields as though the dock were
          not there.
        */}
        <div className="lg:flex lg:gap-6">
          <div className="@container min-w-0 flex-1 space-y-6">
            {requireAdmin && context.session.role !== "admin" ? (
              <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-3 py-2 text-sm">
                {t("agency.adminOnly")}
              </p>
            ) : (
              children(context)
            )}
          </div>

          {/*
            The third column. Inside the flex row, so opening the cart narrows
            the results rather than covering them — which is the whole point:
            every Add button on the left stays live while it is open.
          */}
          <CartDock locale={locale} />
        </div>

        {/*
          On a phone the bar has room for the mark, the basket and the account
          and nothing else, so the same navigation lives in a drawer — with the
          account destinations appended, or Team and Settings would be reachable
          only through a menu that is itself in the bar it was moved out of.
        */}
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("agency.portal")}>
          <div className="space-y-5">
            <CreditRail locale={locale} context={context} />
            {nav}
            <nav aria-label={t("agency.navAccount")} className="hairline border-t pt-3">
              <p className="text-muted px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
                {t("agency.navAccount")}
              </p>
              <ul className="space-y-0.5">
                {accountItems.map((item) => (
                  <li key={item.path}>
                    <Link
                      href={href(locale, item.path)}
                      className="text-muted hover:bg-ink-50 hover:text-ink-900 flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium"
                    >
                      <Icon name={item.icon} size={16} className="opacity-80" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </Drawer>
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
  locale,
  accountItems,
  onSignOut,
}: {
  context: AgencyContext;
  locale: Locale;
  /** Team and Settings: configured occasionally, so not in the bar. */
  accountItems: NavItem[];
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
            <p className="truncate text-sm font-semibold">{context.agency.name}</p>
            <p className="text-muted truncate text-xs">{context.session.name}</p>
          </div>

          {/*
            The two destinations that left the bar. Here rather than there
            because configuring the team is not something you do between a
            search and a booking.
          */}
          <div className="hairline border-b py-1">
            {accountItems.map((item) => (
              <Link
                key={item.path}
                href={href(locale, item.path)}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="hover:bg-ink-50 flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm"
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </Link>
            ))}
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
