# Rider Android visual preview — Phase 1 acceptance checklist

This is a **development-only**, frontend-only implementation of approved screens 1–6.
It does **not** replace the production rider backend-connected UI.

## Launch

```bash
EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start
```

For production mode, omit the variable. The preview is guarded by `__DEV__`
and cannot be used as an authentication bypass in a release build.

## Review paths

| Screen | Acceptance interaction | Mock states |
| --- | --- | --- |
| 1 Login | Enter phone/email + password; continue with `123456`; reset using the same demo code; open Register | empty, invalid identity, password error, verifying, recovery, success |
| 2 Registration | Complete name/ID/DOB, Kenyan phone, county/address and distinct emergency contact | validation error, completed form |
| 3 Documents | Add/remove fake ID-front, ID-back, selfie and licence evidence | missing, staged; vehicle-dependent licence |
| 4 Vehicle & Equipment | Change Motorcycle/Bicycle/Car, enter details, stage papers, check bag/safety equipment | selected type, missing docs, missing gear, valid |
| 5 Onboarding Status | Submit; simulate under review, changes requested, resubmit, approval; open dashboard | submitted, review, rejection, re-application, approved |
| 6 Rider Dashboard | Toggle online/offline; simulate outside zone and account restriction; hide/show service-zone illustration; use bottom tabs | offline, online, restriction, map hidden, placeholder destinations |

## Navigation contract

Bottom navigation: **Home · Deliveries · Earnings · Inbox · Profile**.
Screens 7–24 will replace the marked placeholders in later phases. Screen 5 is a
form-flow screen, reached through registration or dashboard (not a sixth tab).

## Limits and security notes

- No network request, real authentication, token, location permission, upload,
  account approval, SMS, dispatch, M-PESA transaction or payout is used in preview.
- Uploads only toggle local `Staged` indicators. No personal-document bytes are read.
- The visual map is **illustrative**, not a live geospatial component.
- Earnings and deliveries are visibly sample values, not ledger data.
- Approval and online switches affect local UI state only.
- The existing live `RiderNativeApp` is untouched.
- Successful React Native device rendering, keyboard behaviour, scroll height
  and visual comparison with mockups must be confirmed on an Android emulator
  or physical Android device before visual acceptance is finalized.

## Run checks

```bash
pnpm exec tsx --test tests/unit/rider_phase1_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
```


## Phase 2 — Delivery Operations (approved screens 7–12)

Choose **Deliveries** from the five-tab navigation after signing in with preview
credentials, then go **Online** on Home to simulate a new offer. This adds
frontend-only screens to the existing Phase 1 preview; the normal connected
Rider app is not modified.

| Screen | Primary acceptance checks |
| --- | --- |
| 7 Incoming Delivery Request | Start a simulated offer, observe the 25-second timer, expected **rider pay** versus food item price, merchant/customer addresses; accept/decline/expire and replay. |
| 8 Active Delivery Details | Accepted-order milestone tracker, full item list, merchant and recipient information, contact actions, issue reporting, start merchant navigation. |
| 9 Navigate to Merchant | Illustrative map and pickup marker, 1.2 km/5 min ETA, route guidance, merchant contact, confirm merchant arrival. |
| 10 Merchant Pickup Confirmation | Arrived status, item-by-item list, explicit item-count confirmation, pickup reference `4621`, prevent pickup before verification, missing-item issue. |
| 11 Navigate to Customer | Customer route, 4.8 km/23 min ETA, route guidance, contact actions, address/intercom instructions, confirm arrival. |
| 12 Customer Handover & Delivery Confirmation | Arrived status, customer PIN `638204` **or** staged mock photo proof, verified handover gate, failure/incident report, block completion with unresolved customer issue. |

The delivery process is a **pure reducer** in `phase2-model.ts` and all UI is in
`Phase2DeliveryScreens.tsx`. The reducer rejects illegal stage skips
(e.g. delivery completion before customer arrival). Declined or expired orders
cannot be accepted. Reports remain attached to the active mock delivery; rider
actions do not resolve or close them. Even after verification, all completions
are **simulation only** and do not record a real transaction.

The **Show visual acceptance shortcuts** panel permits independently loading any
one of the six screen states. It is visibly labelled as a demo and does not bypass
server authorization, because no server is connected. The new screen stages
reset the scroll position on Android.

**Phase 2 exclusions:** live assignment, countdown synchronization,
backend-authenticated order records, actual GPS / directions / ETA tracking,
real phone calls/messages, upload of package or handover photographs,
authoritative PIN/OTP verification, support case creation, completion of
deliveries and financial ledger entries. The static map and placeholder
contact actions are deliberate.

### Run checks

```bash
pnpm exec tsx --test tests/unit/rider_phase2_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
```

Review the six Android screen states on a narrow physical device/emulator before
requesting Phase 3. Phase 3 starts with Screen 13 (Delivery Completion Summary)
and Screen 14 (Active Deliveries & Multiple Orders) and continues to Screen 18.


## Phase 3 — Earnings, Deliveries & Financial Management (screens 13–18)

Phase 3 keeps the approved frontend-first workflow. The existing live Rider app,
DeeToo API, dispatch, M-PESA, earnings ledger and support/incident integrations
are unchanged. Only the explicit Android development mock preview is extended.

| Screen | Review interactions | Data caveat |
| --- | --- | --- |
| 13 Delivery Completion Summary | Complete Screen 12 with customer PIN or demo photo, see delivery confirmation, merchant/customer route, fee breakdown, illustrative feedback, next order and history actions. Also accessible via **Active orders → Screen 13** preview. | Not an actual payment posting; Screen 13 uses sample KSh 470 irrespective of backend ledger. |
| 14 Active Deliveries & Multiple Orders | **Deliveries → Active orders**; two simultaneous example assignments, one pickup and two sequential drop-offs, step completion, expandable details, suggested optimization (no actual reordering), messaging/support placeholders. | Sample dispatch plan; cannot mutate actual delivery assignments. |
| 15 Delivery History | **Deliveries → History**; status tabs (completed/cancelled/failed), Today/7 days/30 days filters, search, delivery details, settlement review status and completion-preview link. | Static fixture records; unsuccessful delivery fees not automatically payable. |
| 16 Earnings Dashboard | **Earnings**; period-selectable daily/weekly/monthly charts, category breakdown, delivery KPIs, achievements, quick navigation. | Sample KSh figures only, not authoritative accounting. |
| 17 Rider Wallet & Cash Management | **Earnings → Open Rider Wallet**; withdrawable, pending payouts, customer cash, outstanding cash, period earnings, transactions, wallet trend, cash discrepancy review. | Each balance represents a different accounting category; cash review does not settle obligations. |
| 18 Payouts & Transactions | **Earnings → Payouts & Transactions**; recipient phone/amount validation, explicit confirmation, simulated M-PESA request, processing/failed/completed status, transaction filters, dummy receipts and exact-once failure releases. | No actual Safaricom transfer, phone verification, provider receipt, accounting mutation or money movement. |

### Visual and workflow acceptance

- All screens reuse the approved DeeToo green/dark-green/navy tokens,
  mobile-safe cards, readable text, and five-tab standard nav:
  **Home · Deliveries · Earnings · Inbox · Profile**.
- A successful Phase 2 mock handover opens **Screen 13** when Deliveries is
  displaying the Delivery flow. The screen's **Get Next Order** control
  resets the demo order, while History opens Screen 15.
- The multi-order sequencing uses a separate demo dispatch route, preventing
  unrealistic edits to actual order assignment or fulfillment.
- The mock payout reducer reserves requested amounts, logs unique sample
  references and blocks invalid/duplicate completion attempts; a simulated
  failure returns the reserved amount exactly once.
- Reporting a cash discrepancy creates a local pending review record; the
  rider cannot directly mark it reconciled.
- Loading/empty/error states exist for history search, payout validation,
  processing, failure, insufficient funds and cash review.
- Inbox and Profile remain clearly marked Phase 4 placeholders.
- The prototype does not persist sensitive data or contact payment providers.

### Local checks

```bash
EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start
pnpm exec tsx --test tests/unit/rider_phase3_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
```

**Device acceptance still required:** compare all six screens and error/empty
variants side by side with the approved mockups at narrow Android widths;
inspect scroll behavior, keyboard overlap, touch targets and large text settings.
Only after all 24 frontend screens pass acceptance will DeeToo backend
capability mapping begin.


## Phase 4 — Rider Account, Communication & Safety (screens 19–24)

Phase 4 completes the 24 approved primary screen frontend previews. The original
\`RiderNativeApp\`, backend, identity and payment services remain untouched.
Run with \`EXPO_PUBLIC_RIDER_UI_MODE=mock\` on an Android development build.

| Screen | Entry and key mock interactions |
|---|---|
| **19 Performance & Ratings** | **Profile → Performance & Ratings** or Home quick action; daily/weekly/monthly chart selectors, customer feedback, achievements, stats and coaching tips. |
| **20 Notifications Center** | **Inbox → Alerts**; unread badges, all/Orders/Earnings/Account/Support/Updates filters, mark read/all read, preferences, deep links to other mock screens. |
| **21 Rider Support Center** | **Inbox → Support Cases**; create categorized case, associate with a known demonstration order, search/filter, inspect cases and FAQ. Safety category connects to Screen 23. |
| **22 Support Conversation** | Select a case; full threaded rider/agent/system history, message composer, staged attachment filename, order link, feedback, **I'm satisfied** or **Request Follow-up**. No rider resolution control. |
| **23 Safety & Incident Reporting** | **Profile → Safety & Incidents**, Home quick action or Support; emergency guidance (no call initiated), four-step report (details, location, evidence, review), optional sample order, list and investigation timeline. |
| **24 Rider Profile & Settings** | **Profile**; personal, vehicle, document, M-PESA destination, mock security, preferences, notifications, account-management requests, and links to performance, safety, support. |

### Exact navigation standard

\`Home · Deliveries · Earnings · Inbox · Profile\`. The previously approved
bottom bar remains unchanged. Support and Notifications are subdivisions of
**Inbox**. Performance, Safety and Settings are subdivisions of **Profile**.

### State and administrative authority contract

- A case remains a multi-participant conversation; rider feedback never marks
  it Resolved. Resolved fixtures are **view only**; the rider has **no close
  or resolve control**. A dissatisfied rider can request follow-up and reopen
  the *local mock* state while retaining the existing message history.
- Incident reporting doesn't directly acknowledge, investigate, or resolve
  incidents. Admin-state fixtures demonstrate the appearance of investigation.
- "Attachment" adds a demo filename to local UI only; neither image bytes nor
  identity documents are read, captured, or sent.
- Critical delivery/identity/security/safety notifications cannot be disabled
  through the prototype preference toggles. Read/unread changes are local.
- Editing identifying information, verified transport, or M-PESA destinations
  moves the **mock account status to Reverification required**; it never
  authorizes an actual production edit or changes provider payout details.
- Account deactivation/deletion are requests, not immediate destructive
  operations. They are blocked by an active delivery or outstanding cash and
  do not modify the real account or delete any data.
- Emergency assistance is visible without completing an incident form, but
  **does not call emergency services**. In a real emergency use the device's
  dialer and your local emergency contacts. The illustrated map is not GPS.
- Data and amounts are examples only. React state lasts for this demo session
  and resets upon sign-out. No persistence, live notifications, real support,
  geolocation, authentication, photo upload or payment provider integration.

### Phase 4 test commands

\`\`\`bash
pnpm exec tsx --test tests/unit/rider_phase4_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
\`\`\`

### Visual acceptance gate

Review each screen against the approved mobile mockup at narrow Android
viewport widths and with larger accessibility fonts. Verify safe-area insets,
keyboard avoidance, scrolling, touch targets, error, unread, empty, pending,
review, satisfied/dissatisfied and resolved-readonly states. Screens may
contain smaller nested scrollable sections; never introduce a second
primary bottom navigation bar. Only after acceptance of the full **24-screen
frontend** should separate backend capability audit, missing backend
development, integration and end-to-end testing begin.
