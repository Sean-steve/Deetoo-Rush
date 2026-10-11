# Deetoo Rider Android

The Rider client is a native Expo/React Native Android application. It uses the
central Deetoo API, Android secure credential storage, live GPS, camera proof,
background location and Firebase Cloud Messaging.

## Local development

Use Node 22 and install the monorepo from the repository root:

```bash
pnpm install --frozen-lockfile
```

Set the Rider API origin before starting the app. For the Android emulator:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

A physical Android device must use an address reachable from that device, such
as the development computer's LAN IP.

## Running without push notifications

The Rider UI can start and use API/GPS workflows without FCM being configured.
Push setup is intentionally non-fatal: the app shows notification availability
inside the Rider UI instead of allowing `expo-notifications` initialization to
blank the application.

Remote Android push notifications are not supported in Expo Go. Use a native
development build when testing delivery offer notifications.

## Native development build with FCM

Download the Android `google-services.json` for the Rider Firebase application
and keep it outside source control. Point the build to it:

```bash
export GOOGLE_SERVICES_JSON_PATH=/absolute/path/to/google-services.json
```

Then create/run the Android native project:

```bash
pnpm prebuild:rider-android
pnpm --filter @deetoo/rider-android android
```

Start Metro as needed:

```bash
pnpm --filter @deetoo/rider-android start
```

Open the installed DeeToo Rider development build, not Expo Go, when testing
FCM. The API also requires the Firebase service-account environment variables
(`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`) to send real
notifications.

The existing `apps/rider` browser implementation remains a simulator only.


## Rider visual redesign — Phase 1 (screens 1–6)

Run the **isolated frontend-only visual preview** using a development build:

```bash
EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start
```

On Windows PowerShell set the environment variable before running the start script.
Use the Android simulator or your connected Android device. Restart Metro when switching
between live and mock mode. The regular Rider app remains unchanged when the environment
variable is absent or not equal to `mock`; mock preview is disabled in release builds.

The preview intentionally contains **no API calls**, no real login/OTP/SMS,
no uploads of personal documents, no GPS tracking, no real rider approval,
no live dispatch and no payments. It is not a production authentication method.

The six reviewed primary screens are:

1. Login & Authentication — identifier validation, password visibility,
   mocked sign-in code `123456`, recovery and registration navigation.
2. Rider Registration — required personal, contact, Kenyan address and emergency-contact fields.
3. Document Verification — staged demo ID, selfie and licence attachments;
   licence requirement depends on vehicle choice.
4. Vehicle & Equipment Registration — vehicle type, details, simulated documents
   and equipment checklists with validation.
5. Onboarding Status — submitted, under-review, changes-requested, resubmission
   and approved visual states, with visibly marked *simulation* controls.
6. Rider Dashboard — availability toggle, visual eligibility restrictions,
   today/weekly summary, sample delivery records, Nairobi illustrative service-zone map.

The **approved navigation standard** is Home, Deliveries, Earnings, Inbox and Profile.
Only Home is complete in Phase 1. Other destinations are deliberately marked
as future-phase placeholders to avoid implying functional backend integration.
All six screens support Android-sized scrolling, accessible touch targets and
inline validation/feedback. Demo values are sample data, not production records.

Run the pure workflow-model tests:

```bash
pnpm exec tsx --test tests/unit/rider_phase1_preview.test.ts
pnpm typecheck:rider-android
```

Read `src/preview/README.md` for the acceptance checklist. For the
next phases, replace the placeholders with reviewed frontend implementations;
do not connect the real backend until the distinct backend audit/integration stages.

## Phase 2 — Rider delivery operations visual preview

Phase 2 extends the same dev-only preview with six more screens and does not
modify the connected Rider API app. Sign in with the preview OTP `123456`,
switch **Online** on Home, then open **Deliveries** and press **Simulate new
delivery request**. Accept before the 25-second preview timer expires.

Follow: offer → active details → navigate to merchant → arrived/pickup code
`4621` and item check → navigate to customer → arrival → delivery PIN
`638204` or mock photo proof. Alternate decline, offer expiry, invalid codes,
and incident reports have working preview states. Phase 2 also adds a clearly
labelled visual acceptance shortcut for the six milestone screens.

There is **no live dispatch, GPS route, camera, contact call/message, payout,
order mutation, or support case creation** in the preview. Phase 3 and Phase 4
navigation destinations remain explicitly marked as future work.

Run `pnpm exec tsx --test tests/unit/rider_phase2_preview.test.ts` and
`pnpm typecheck:rider-android`; see `src/preview/README.md` for the full matrix.

## Phase 3 — delivery completion, history, earnings, wallet and payouts

Phase 3 extends the **dev-only frontend preview** with screens 13–18. Run:

```bash
EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start
```

From the five-tab navigation:

- **Deliveries → Active orders**: two-order sample delivery sequence; stop
  advance and route-optimization request are local, with fixed dispatch order.
- **Deliveries → History**: completed/cancelled/failed search and date filters,
  details, sample fees and review status.
- **Deliveries → Delivery flow**: finish Phase 2 handover using demo PIN
  `638204` (or staged photo) to see the Screen 13 completion summary.
  Screen 13 can also be previewed from Active orders.
- **Earnings**: daily/weekly/monthly visual charts, categorized income, delivery
  stats and achievements. Go to Wallet or Payouts from quick actions.
- **Rider Wallet**: visibly distinct withdrawable funds, pending payouts,
  earnings, customer cash held and amount awaiting reconciliation. Cash
  discrepancy requests only enter a local under-review state.
- **Payouts & Transactions**: enter a Kenyan M-PESA destination, amount
  (minimum KSh 100, at most the mock available balance) and explicit
  confirmation. Submit a **demo-only** request and inspect processing,
  completed and failed states. In the demo receipt, simulate success/failure;
  failure releases reserved amounts once.

**No real money moves.** Preview balances and references are fixtures; no
M-PESA account connection, order mutation, or financial ledger posting occurs.
Inbox and Profile are reserved for Phase 4.

```bash
pnpm exec tsx --test tests/unit/rider_phase3_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
```

See `src/preview/README.md` for the full Phase 3 Android acceptance matrix.


## Phase 4 — Final Rider mock frontend screens (19–24)

The development-only preview now contains all **24 primary Rider screens**.
Screens 19–24 are under:

- **Profile → Performance & Ratings**: KPIs, selectable charts, example
  achievements and customer feedback.
- **Inbox → Alerts**: categorized/read/unread notifications, settings, and
  deep links to related areas.
- **Inbox → Support Cases**: case search, creation, known-order links and FAQ.
- **Inbox → Support conversation**: complete thread, staged filenames,
  rider satisfaction and follow-up. **Only admins may formally resolve cases.**
- **Profile → Safety & Incidents**: emergency guidance, incident report
  wizard, sample evidence, tracking and investigation status.
- **Profile → Profile & Settings**: personal/vehicle/document settings,
  mock M-PESA destination, privacy/preferences and guarded account requests.

Approved nav: **Home · Deliveries · Earnings · Inbox · Profile**. Screens
19–24 use mock state and cannot access the real DeeToo API. The production
RiderNativeApp is still mounted in normal mode.

To preview:

```bash
EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start
pnpm exec tsx --test tests/unit/rider_phase4_preview.test.ts
pnpm typecheck:rider-android
```

See `src/preview/README.md` for the detailed interaction and
Android visual acceptance checklist. Production support, safety, messaging,
identity updates, real uploads, emergency calling, financial changes, account
closure and notifications remain separate backend integration work.
