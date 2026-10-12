# Deetoo Rider Android

> **Consolidated 24-screen Rider frontend:** See
> [RIDER_FRONTEND_CONSOLIDATED.md](./RIDER_FRONTEND_CONSOLIDATED.md) for
> the development mock launch, complete screen catalog, production fallback,
> tests and backend integration boundary.


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


## Go Online troubleshooting — live Rider

If the Rider app shows **Durable storage is unavailable** or an availability
error, do not enable demo/memory mode. The live API requires PostgreSQL for
approved profiles, availability sessions and audits, and Redis for fresh GPS,
heartbeats and shared rider discovery.

From the repository root, with the same `.env` as `pnpm dev:api`:

```bash
docker compose up -d redis
docker exec deetoo-redis redis-cli ping  # must return PONG
pnpm rider:doctor                       # read-only PostgreSQL + Redis probes
pnpm db:status                          # reports missing migrations
```

For the API running directly with `pnpm dev:api`, `REDIS_URL` should ordinarily
be `redis://127.0.0.1:6379`. If the API itself runs inside Docker, use the
Docker service hostname instead. A Redis service can be **running but
unreachable from the API**, so always run `pnpm rider:doctor` in the same
environment/network as the API.

After dependencies recover, try Go Online again. The API now reconnects to
Redis automatically on subsequent requests and identifies Redis connectivity
as `RIDER_REDIS_UNAVAILABLE`, rather than incorrectly suggesting a database
migration. Going online still requires Admin approval, an active vehicle,
eligible coverage and fresh accurate GPS. Nothing in this repair bypasses those
checks or changes persisted rider availability.

Note: do not interpret a previous Go Online failure as success; confirm
`GET /api/v1/rider/availability` reports `ONLINE_AVAILABLE` and an active
session before dispatching.


## Connected Rider UI — October 2026

The connected Rider experience keeps the original five bottom tabs and adds a
separate **Settings** action in the header. Profile owns verified identity,
account change requests and sign-out. Settings owns push-device registration,
notification categories, language, sound and vibration. Swipe down in a
signed-in screen to reload DeeToo API records. The Android hardware back button
and top-left back button follow Rider screen history instead of closing the
shift from a nested page.

The Home service-zone map renders **actual assigned PostGIS zone GeoJSON** and
the Rider's last recorded GPS position using a configured, authorized raster tile provider and OpenStreetMap geographic data (an internet connection is required). It does not draw example locations. Tile
usage must meet [OpenStreetMap's tile policy](https://operations.osmfoundation.org/policies/tiles/);
use a contracted tile provider for significant production traffic.

Delivery navigation screens stay **inside the app**. DeeToo calculates the
route from a fresh Rider GPS record and the assigned delivery's verified stop
via `GET /api/v1/rider/deliveries/:id/route?stop=pickup|dropoff`. This is
authorization- and session-bound; no arbitrary customer coordinates are
accepted from the phone and there are no public demo routing requests.

For real turn/maneuver geometry, configure `GOOGLE_ROUTES_API_KEY` on the API
server (Routes API access and billing are required). For a private local
developer workflow only, a **locally running** OSRM route server can be used
with `DEETOO_LOCAL_WORKFLOW=true` and
`DEETOO_RIDER_LOCAL_ROUTING_URL=http://127.0.0.1:<port>`. DeeToo will reject
a public IP/hostname as a local route provider. If no routing provider is
configured, the actual geographic map and authorized delivery locations still
appear; the app clearly reports that turn-by-turn route data is unavailable.

Road instructions are estimates rather than a voice-guided driving system,
and drivers should follow posted restrictions and current traffic rules.
Android build updates require rebuilding or restarting Expo; an existing
installed APK does not magically gain new native UI code from a server restart.

### Rider map tile blocking: provider setup

OpenStreetMap Foundation's volunteer-run `tile.openstreetmap.org` is **not**
a production tile CDN. It blocked the earlier native direct-image requests.
The Rider app **no longer makes requests to that host**. Copy
`apps/rider-android/.env.example` to `apps/rider-android/.env`, configure
your licensed key, and start the Expo application from the Rider package:

```bash
cd apps/rider-android
cp .env.example .env
# Edit the .env file to set your MapTiler key or licensed tile template.
pnpm start
```

The **Rider build** (not just the API server) must receive the following
configuration before the native app is restarted or the APK rebuilt:

```env
# Preferred: your own MapTiler cloud public/restricted key
EXPO_PUBLIC_RIDER_MAPTILER_KEY=<your_maptiler_public_key>
# OR a licensed XYZ raster provider template with {z}, {x}, {y}
EXPO_PUBLIC_RIDER_TILE_TEMPLATE=https://your-licensed-provider.example/tiles/{z}/{x}/{y}.png
```

DeeToo's built-in MapTiler template uses MapTiler streets-v4 256px raster
tiles. A public mobile key must be restricted and quota-controlled by its
provider. Keys prefixed `EXPO_PUBLIC_` are included in client bundles and
**must not be treated as secrets**. The external tile provider observes tile
viewport requests; avoid sending customer names or street addresses. DeeToo's
route service remains server-authorized.

Without a configured provider, or if the provider denies requests, DeeToo
shows the actual Rider/location overlays and a **map tiles unavailable**
message rather than blocked OpenStreetMap tiles. To fix missing street maps,
configure an authorized provider and restart/rebuild the Rider app. Real
routing still requires GOOGLE_ROUTES_API_KEY (or a local approved OSRM test
server); basemap hosting and road directions are separate services.

### Merchant pickup → customer map

After the backend accepts the merchant pickup code and confirms `PICKED_UP`,
the Rider moves directly to **Navigate to Customer**. The delivery address
and available locality/area label are read from the assigned delivery record,
never guessed from arbitrary map searches. `Start trip to customer` remains
an explicit DeeToo lifecycle action: when the delivery is `PICKED_UP`, the
Rider can start the trip and then confirm arrival at the customer. An invalid
code never advances the screen.

Riders **can self-register** on the Rider login screen via
`POST /api/v1/auth/register/rider`. The resulting application is unapproved
until phone, document, vehicle and equipment verification and authorized Admin
approval are completed. A newly registered Rider cannot self-approve.
