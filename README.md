# Nazil — Hotel Booking Platform (frontend)

An implementation of **Hotel Booking Platform — Frontend Scope v1.0** (27 July 2026): a
responsive, supplier-agnostic hotel booking experience with a normalized
backend-for-frontend, two simulated supply sources, English + Arabic/RTL, and every
edge case from §10 reachable and testable.

```bash
npm run dev     # http://localhost:4860
npm test        # 85 unit, API-contract and supplier-adapter tests
npm run build   # production build
npx tsc --noEmit && npx eslint .

# Live Hotelbeds supply (optional — see "Hotelbeds integration" below)
cp .env.example .env.local        # then add your key and secret
npm run hotelbeds:smoke           # 1–3 requests, never books
npm run hotelbeds:sync -- --types --destinations
```

---

## What is here

| Scope section | Where it lives |
| --- | --- |
| §5 module scope, §7 screen inventory | `app/[locale]/**`, `components/pages/**` |
| §7.1 design system | `components/ui/index.tsx`, `app/globals.css` |
| §8 data fields and display rules | `lib/types.ts` |
| §9.3 internal frontend API surface | `app/api/**` |
| §9.1–9.2 supplier insulation | `lib/server/suppliers.ts` → `lib/server/normalize.ts` |
| §10 edge cases | `lib/server/scenarios.ts` + the **QA** button (bottom-right) |
| §9.1 live Hotelbeds supply | `lib/server/hotelbeds/**` (see below) |
| §13 analytics taxonomy | `components/providers/app-provider.tsx` (`track`) |
| §14 acceptance baseline | `tests/domain.test.ts`, `tests/api.test.ts` |

Every screen ID from the §7 inventory is implemented:

| ID | Route | ID | Route |
| --- | --- | --- | --- |
| F-001 | global shell (header, bottom nav, consent, assistant) | F-054/055 | `/[locale]/booking/[reference]` |
| F-010 | `/[locale]` | F-060 | `/[locale]/signin` |
| F-020/021/022 | `components/search/*` | F-061 | `/[locale]/saved` |
| F-030–F-033 | `/[locale]/search` | F-062 | `/[locale]/account` |
| F-034 | `/[locale]/compare` | F-070 | `/[locale]/trips` |
| F-040/041/042 | `/[locale]/hotel/[slug]` | F-071/072/073 | `/[locale]/trips/[reference]` |
| F-050/051/052/053 | `/[locale]/checkout/[sessionId]` | F-080 | `/[locale]/support` |
| F-081 | `/[locale]/notifications` | F-082 | assistant drawer (global) |
| F-090 | `/[locale]/destinations/[slug]`, `/[locale]/deals/[slug]` | F-091 | `/[locale]/legal/[slug]`, `/[locale]/help` |

---

## Architecture

```
browser ─▶ /api/*  (BFF)  ─▶ normalize ─▶ supplier adapters ─▶ simulated sources S1, S2
          customer-safe      canonical      internal only        never reach the browser
```

**The supplier boundary is the point of the whole build.** `lib/server/suppliers.ts`
holds two deliberately different contracts — one Hotelbeds-shaped (hotel codes,
`BOOKABLE`/`RECHECK` rate types, rate keys, comment IDs), one TourMind-shaped
(`hotelId`/`ratePlan`, boolean refundability, penalty windows) — and adapts both into
one internal `RawOffer`. `lib/server/normalize.ts` turns those into the canonical model.
A test asserts that no supplier identifier, rate key or raw rate type can appear in any
customer-facing payload.

Adding a third source means writing one adapter. No screen changes.

### Rules enforced in code, not convention

- **One canonical property per hotel** regardless of how many sources list it (E-04). Cards
  carrying more than one source show a "Merged listing" chip.
- **Rooms merge only above a mapping-confidence threshold** (`MERGE_THRESHOLD = 0.8`).
  Below it the offers stay separate and the UI says so — see *Superior Room* at
  Riyadh Metro Inn (E-05).
- **Total price is the default.** The stay total is primary, nightly average secondary,
  included taxes and pay-at-property charges always separated, strike-through prices only
  against a genuinely comparable basis.
- **Prices are server-calculated.** `lib/server/pricing.ts` is deterministic; the frontend
  formats and explains but never recomputes a commercial total (§9.4).
- **Deadlines render in the property's time zone**, never the device's (§12.5).
- **Recommendations are explainable.** "Why is this recommended?" shows the published
  weighting; the same criteria are exported as `RECOMMENDATION_CRITERIA`.
- **Accessible rooms never become the headline offer** unless the customer asked for one,
  and the accessible collection is derived from room data rather than hand-tagged.
- **One idempotent submission.** The booking key is derived from the checkout session and
  the cancellation key from the quote ID, so double-click, back and refresh cannot create a
  second order (E-16).

---

## Edge-case harness (§10)

The **QA** button (bottom-right, mirrored in RTL) forces any row of the scope's edge-case
table. It writes a cookie the BFF reads, so the failure is produced server-side exactly as a
real supplier fault would be.

| Scenario | Edge case | What to look for |
| --- | --- | --- |
| One source times out | E-02 | Partial-results banner; no duplicate cards |
| All sources fail | E-03 | Search preserved, retry + support, correlation ID |
| No search results | E-01 | Nearby dates, nearby areas, filter reset, price alert |
| Missing images and content | E-06 | Branded fallback, stable layout, no broken image |
| Price drops at recheck | E-08 | Lower price applied automatically, positive confirmation |
| Price rises at recheck | E-09 | Blocking old/new comparison; explicit acceptance required |
| Cancellation policy changes | E-09 | Same gate, policy diff shown |
| Selected rate sold out | E-10 | Equivalent alternatives, checkout context preserved |
| Payment declined | E-12 | "No booking was created and nothing was charged" |
| 3-D Secure abandoned | E-13 | Safe retry only after the payment state is known |
| Paid, booking uncertain | E-14 | Pending state, polling, "Do not pay again", reconciles to confirmed |
| Confirmation email fails | E-15 | Booking stays confirmed; on-screen voucher remains |
| Multi-room partial | E-17 | No silently split party |
| Cancellation quote changes | E-18 | Old quote expires, reconfirm required |
| Cancellation uncertain | E-19 | Processing state and support reference, no blind resubmit |

The same drawer holds the analytics inspector, showing every §13.1 event as it fires with
its scrubbed properties.

---

## Hotelbeds integration

Real APItude supply, behind the same canonical contract as everything else. With
credentials configured, live hotels appear in the same result list, in the same
cards, through the same checkout — the UI cannot tell the difference, which is
the whole point of §9.1.

### Setting it up

1. Get the API key and secret from
   [developer.hotelbeds.com/dashboard](https://developer.hotelbeds.com/dashboard)
   (Hotel API application).
2. `cp .env.example .env.local`, then paste them into `HOTELBEDS_API_KEY` and
   `HOTELBEDS_SECRET`. `.env.local` is git-ignored; the values are read on the
   server only and the credential modules carry `import "server-only"`, so an
   accidental client import is a build error rather than a leak.
3. `npm run hotelbeds:smoke` — proves connectivity in at most three requests and
   prints what the customer would see. It never books.
4. `npm run hotelbeds:sync -- --types --destinations` then
   `npm run hotelbeds:sync -- --hotels <DESTINATION_CODE> --limit 50` to fill
   the content cache.

Without credentials nothing changes: `isHotelbedsEnabled()` is false and the app
runs entirely on its simulated sources.

### The 50-requests-a-day problem

Evaluation keys allow **50 requests per day** and answer 403 beyond that. That
constraint shaped the design:

- **Content is synced, never fetched on the request path.** Hotel descriptions,
  images, facilities, boards and destinations live in `.data/hotelbeds/`. Page
  renders and autocomplete cost zero supplier requests.
- **A local budget guard** counts requests per day and degrades to the simulated
  sources *before* the supplier starts refusing, so an exhausted allowance never
  becomes a customer-facing failure.
- **CheckRate only where the supplier asks for it**, one rate key per call, per
  the documented integration rules.
- **The test suite never calls the API.** It runs against a recorded payload in
  `tests/fixtures/`.

### What maps to what

| Supplier operation | Platform surface | Notes |
| --- | --- | --- |
| `POST /hotel-api/1.0/hotels` | `POST /api/hotels/search` | Merged with the simulated sources; partial failure is honest (E-02) |
| `POST /checkrates` | `POST /api/rates/recheck` | Adverse change still requires explicit acceptance (§6.4, E-09) |
| `POST /bookings` | `POST /api/bookings` | One submission, `tolerance` for trivial movement, timeout → pending |
| `GET /bookings?clientReference=` | `GET /api/bookings/{ref}/status` | Reconciliation after an uncertain call — never a resubmit (E-14) |
| `DELETE …?cancellationFlag=SIMULATION` | `POST /api/bookings/{ref}/cancellation-quotes` | The live quote §6.6 requires before confirming |
| `DELETE …?cancellationFlag=CANCELLATION` | `POST /api/bookings/{ref}/cancellations` | Idempotent; timeout → reconciliation, not a retry (E-19) |
| `GET /hotel-content-api/1.0/…` | `npm run hotelbeds:sync` | Cached to disk, never on the request path |

### What the customer never sees

Enforced by `tests/hotelbeds.test.ts`, not by convention:

- the `rateKey`, in any response, URL or analytics event — it is held in the
  server-side offer store and copied between operations untouched
- the supplier's `RECHECK` / `BOOKABLE` vocabulary, its field names, its rate
  comment identifiers, or its name
- supplier error codes and wording: every failure maps to one of the seven
  customer-safe categories in §10.1, with the supplier's code surviving only in
  a structured server log
- the net rate: the customer sees the marked-up total, and `applyMarkup()` is
  the single place that policy lives (scope decision D-03)
- the supplier's own booking reference: it is linked server-side to the platform
  reference, which stays the customer's only identifier (§8.5)

### Deliberate choices worth reviewing

- **Markup is a flat percentage** (`PLATFORM_MARKUP_PERCENT`, default 12%). Real
  pricing policy is D-03 and unresolved; this is a placeholder in the right
  place, not an answer.
- **A timeout on booking is never retried.** The order may exist, so it becomes
  a pending booking and reconciliation resolves it. This is the single most
  important rule in the integration.
- **Guest reviews stay absent** for live hotels. The Content API does not carry a
  licensed review source (§16.1), and the UI omits rather than fabricates.
- **Rooms from a single contracted source are not cross-merged.** The
  confidence-threshold merge exists for the multi-source case; with one live
  supplier the supplier's own room concept is the canonical one.
- **Activities and Transfers are not integrated.** The scope (§16.3) puts them
  out of this build. The signed client is generic, so adding them is an adapter
  and a set of screens, not a re-architecture.

---

## Demo data and simulation

Everything is generated locally — no network calls, no API keys.

- **24 canonical hotels** across Riyadh, Jeddah, Makkah, Dubai, Doha and Istanbul, with
  rooms, policies, notices, landmarks and localized content.
- **Imagery** comes from `/api/image`, which renders deterministic SVG scenes. It stands in
  for the licensed-content CDN described in §12.2.
- **Bookings persist** to `.data/bookings.json` so trips survive a dev restart.
- **OTP codes are returned in the response** (`demoCode`) and shown on screen so the
  passwordless, cancellation and guest-lookup flows can be completed end to end. A real
  deployment delivers them out of band only — the code is marked as demo-only at both ends.

---

## Localization

`/en` and `/ar` are real routes with hreflang and per-locale canonicals. Arabic mirrors the
layout, flips directional icons, uses Arabic-Indic numerals and formats currency and dates
through `Intl`. Cancellation deadlines always carry their time zone. The dictionary is a
single flat map in `lib/i18n.ts`, so a missing key falls back to English rather than
rendering a blank.

---

## Testing

`npm test` runs 85 tests: search validation and deep-link round-trips, deterministic
pricing, cancellation-timeline construction, supplier dedupe and room-mapping rules, the
"no supplier data leaks" assertion, and API-level contract tests that drive the real route
handlers through recheck acceptance, idempotent booking, pending reconciliation,
enumeration-protected retrieval and the cancellation quote lifecycle. The
Hotelbeds suite adds signature correctness, adapter mapping from a recorded
payload, cancellation-policy translation, error-taxonomy mapping and the
supplier-data leak assertions — all without touching the live API.

Verified manually in the browser: full guest booking (search → hotel → rate → checkout →
3-D Secure → confirmation + voucher), the E-09 acceptance gate, Arabic/RTL, dark mode,
mobile layout with bottom navigation, and a clean console.

---

## Known gaps and where they came from

These are scope decisions, not oversights:

- **Hotelbeds is integrated but not certified.** The adapter is complete and runs against
  the test environment; §9.1 certification (workflow, availability, check-rate, confirmation,
  voucher and content evidence) is a separate submission before live keys are used.
- **TourMind is still simulated.** Its endpoint contract is not public (§9.2) and must be
  validated against the signed specification; source S2 stands in for it and demonstrates
  the multi-source merge until then.
- **Guest reviews** need a licensed source (§16.1). Scores here are labelled
  "Post-stay guest surveys" and are demo data — the UI shows source and scale, and omits
  rather than fabricates.
- **Payments** are simulated end to end. A real build uses a PCI-validated provider's hosted
  fields; the flow, 3-D Secure step, guarantee-vs-charge distinction and the "no PAN/CVV in
  our systems" boundary are modelled, but no gateway is contracted.
- **Price freeze, loyalty economics and the travel guarantee** are presented as capability
  flags only, per §4.3 and §9.2 — they need underwriting and contractual wording first.
- **Professional translation and legal review** are separate effort (§16.3). Arabic content
  here is written, not machine-translated, but has not been through legal review.
- **The twelve discovery decisions (D-01…D-12)** are open. The build assumes B2C, guest
  checkout allowed, SAR default with multi-currency display, and merchant-of-record
  behaviour at checkout; all are isolated behind the BFF and the pricing module.
