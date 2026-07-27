"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createTranslator, LOCALE_META, type TranslateFn } from "@/lib/i18n";
import type { AppNotification, CurrencyCode, Locale, SearchIntent } from "@/lib/types";
import { SCENARIO_COOKIE, type ScenarioId } from "@/lib/server/scenarios";
import { setPreferenceCookie as setCookie } from "@/lib/cookies";

/* ------------------------------------------------------------ analytics */

export interface AnalyticsEvent {
  name: string;
  at: string;
  props: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Event taxonomy guardrails (§13.1): no free-text PII, no card details, no raw
 * rate keys, no supplier identity. Anything not on the allow-list is dropped
 * before the event is recorded.
 */
const BLOCKED_PROPS = new Set([
  "email",
  "phone",
  "firstName",
  "surname",
  "name",
  "cardNumber",
  "cvv",
  "token",
  "rateKey",
  "supplier",
  "sourceCode",
]);

function scrub(props: AnalyticsEvent["props"]): AnalyticsEvent["props"] {
  const out: AnalyticsEvent["props"] = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (BLOCKED_PROPS.has(k)) continue;
    if (typeof v === "string" && v.includes("@")) continue;
    out[k] = v;
  }
  return out;
}

/* -------------------------------------------------------------- context */

export interface SavedHotel {
  slug: string;
  name: string;
  city: string;
  image: string;
  total?: number;
  currency?: CurrencyCode;
  checkedAt: string;
  collection: string;
}

export interface RecentSearch {
  id: string;
  intent: SearchIntent;
  label: string;
  at: string;
}

interface AppState {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: TranslateFn;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;

  account: { email: string } | null;
  signIn: (email: string) => void;
  signOut: () => void;

  saved: SavedHotel[];
  toggleSaved: (hotel: SavedHotel) => void;
  isSaved: (slug: string) => boolean;
  setCollection: (slug: string, collection: string) => void;

  compare: string[];
  toggleCompare: (slug: string) => boolean;
  clearCompare: () => void;

  recent: RecentSearch[];
  rememberSearch: (intent: SearchIntent, label: string) => void;
  clearRecent: () => void;

  consent: { analytics: boolean; marketing: boolean; decided: boolean };
  setConsent: (c: { analytics: boolean; marketing: boolean }) => void;

  scenario: ScenarioId;
  setScenario: (s: ScenarioId) => void;

  events: AnalyticsEvent[];
  track: (name: string, props?: AnalyticsEvent["props"]) => void;

  notifications: AppNotification[];
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  toasts: { id: string; message: string; tone: "info" | "success" | "critical" }[];
  toast: (message: string, tone?: "info" | "success" | "critical") => void;

  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;

  /** Live-region text announced to assistive technology (§12.1). */
  announcement: string;
  announce: (message: string) => void;
}

const AppContext = createContext<AppState | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the app must keep working (§12.5) */
  }
}



export function AppProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const dir = LOCALE_META[locale].dir;

  const [currency, setCurrencyState] = useState<CurrencyCode>("SAR");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const [saved, setSaved] = useState<SavedHotel[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [consent, setConsentState] = useState({ analytics: false, marketing: false, decided: false });
  const [scenario, setScenarioState] = useState<ScenarioId>("normal");
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppState["toasts"]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    setCurrencyState(read<CurrencyCode>("nz_currency", "SAR"));
    setTheme(read<"light" | "dark">("nz_theme", "light"));
    setAccount(read<{ email: string } | null>("nz_account", null));
    setSaved(read<SavedHotel[]>("nz_saved", []));
    setCompare(read<string[]>("nz_compare", []));
    setRecent(read<RecentSearch[]>("nz_recent", []));
    setConsentState(read("nz_consent", { analytics: false, marketing: false, decided: false }));
    setScenarioState(read<ScenarioId>("nz_scenario_state", "normal"));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    document.documentElement.dataset.theme = theme;
    write("nz_theme", theme);
  }, [theme]);

  const track = useCallback(
    (name: string, props: AnalyticsEvent["props"] = {}) => {
      const event: AnalyticsEvent = { name, at: new Date().toISOString(), props: scrub(props) };
      // Events are always recorded locally for the inspector; forwarding to a
      // vendor happens only with analytics consent (§12.3).
      setEvents((prev) => [event, ...prev].slice(0, 200));
    },
    [],
  );

  const value: AppState = useMemo(
    () => ({
      locale,
      dir,
      t,
      currency,
      setCurrency: (c) => {
        setCurrencyState(c);
        write("nz_currency", c);
        setCookie("nz_currency", c);
        track("currency_changed", { currency: c });
      },
      theme,
      toggleTheme: () => setTheme((prev) => (prev === "light" ? "dark" : "light")),

      account,
      signIn: (email) => {
        const next = { email: email.toLowerCase() };
        setAccount(next);
        write("nz_account", next);
        track("account_signed_in", {});
      },
      signOut: () => {
        setAccount(null);
        write("nz_account", null);
        setNotifications([]);
      },

      saved,
      toggleSaved: (hotel) => {
        setSaved((prev) => {
          const exists = prev.some((s) => s.slug === hotel.slug);
          const next = exists ? prev.filter((s) => s.slug !== hotel.slug) : [hotel, ...prev];
          write("nz_saved", next);
          track(exists ? "unsaved" : "saved", { hotel: hotel.slug });
          return next;
        });
      },
      isSaved: (slug) => saved.some((s) => s.slug === slug),
      setCollection: (slug, collection) => {
        setSaved((prev) => {
          const next = prev.map((s) => (s.slug === slug ? { ...s, collection } : s));
          write("nz_saved", next);
          return next;
        });
      },

      compare,
      toggleCompare: (slug) => {
        let accepted = true;
        setCompare((prev) => {
          if (prev.includes(slug)) {
            const next = prev.filter((s) => s !== slug);
            write("nz_compare", next);
            return next;
          }
          if (prev.length >= 4) {
            accepted = false;
            return prev;
          }
          const next = [...prev, slug];
          write("nz_compare", next);
          track("compared", { hotel: slug, count: next.length });
          return next;
        });
        return accepted;
      },
      clearCompare: () => {
        setCompare([]);
        write("nz_compare", []);
      },

      recent,
      rememberSearch: (intent, label) => {
        setRecent((prev) => {
          const entry: RecentSearch = {
            id: `${intent.destinationId}-${intent.checkIn}-${intent.checkOut}`,
            intent,
            label,
            at: new Date().toISOString(),
          };
          const next = [entry, ...prev.filter((r) => r.id !== entry.id)].slice(0, 6);
          write("nz_recent", next);
          return next;
        });
      },
      clearRecent: () => {
        setRecent([]);
        write("nz_recent", []);
      },

      consent,
      setConsent: (c) => {
        const next = { ...c, decided: true };
        setConsentState(next);
        write("nz_consent", next);
        track("consent_set", { analytics: c.analytics, marketing: c.marketing });
      },

      scenario,
      setScenario: (s) => {
        setScenarioState(s);
        write("nz_scenario_state", s);
        setCookie(SCENARIO_COOKIE, s);
      },

      events,
      track,

      notifications,
      refreshNotifications: async () => {
        if (!account?.email) return;
        const res = await fetch(`/api/notifications?channel=${encodeURIComponent(account.email)}`);
        const json = await res.json();
        if (json?.ok) setNotifications(json.data.notifications ?? []);
      },
      markNotificationsRead: async () => {
        if (!account?.email) return;
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: account.email }),
        });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      },

      toasts,
      toast: (message, tone = "info") => {
        const id = Math.random().toString(36).slice(2, 9);
        setToasts((prev) => [...prev, { id, message, tone }]);
        setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
      },

      assistantOpen,
      setAssistantOpen,

      announcement,
      announce: (message) => setAnnouncement(message),
    }),
    [
      locale,
      dir,
      t,
      currency,
      theme,
      account,
      saved,
      compare,
      recent,
      consent,
      scenario,
      events,
      notifications,
      toasts,
      assistantOpen,
      announcement,
      track,
    ],
  );

  useEffect(() => {
    if (account?.email) void value.refreshNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** Fetch helper that always carries locale and the active scenario. */
export function useApi() {
  const { locale, scenario } = useApp();
  return useCallback(
    async <T,>(input: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: import("@/lib/types").ApiError }> => {
      const res = await fetch(input, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-locale": locale,
          "x-scenario": scenario,
          ...(init.headers ?? {}),
        },
      });
      try {
        return (await res.json()) as { ok: true; data: T };
      } catch {
        return {
          ok: false,
          error: {
            category: "temporaryService",
            messageKey: "error.generic",
            message: "Unexpected response",
            retryable: true,
            correlationId: "cid_local",
            recommendedAction: "retry",
          },
        };
      }
    },
    [locale, scenario],
  );
}
