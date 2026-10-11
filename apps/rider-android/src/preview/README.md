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
