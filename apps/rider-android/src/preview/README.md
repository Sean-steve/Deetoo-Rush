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
