# Rider Frontend Consolidation — 24 approved screens

## Status

One Android frontend design implementation; feature branch `feat/rider-android-consolidated-24`.
Built on the accepted visual work in phases 1–4: PRs #55 → #56 → #57 → #58.
All 24 primary screens are listed in the authoritative typed
`src/preview/screen-catalog.ts`.

**Do not merge to `main` until integration and release acceptance.**

## Launch and choice of application

The Android app has one explicit entrypoint, `apps/rider-android/App.tsx`.
It selects exactly one of these two modes:

| Mode | Run command | Mounted UI | Permitted effects |
|---|---|---|---|
| Approved 24-screen frontend | `EXPO_PUBLIC_RIDER_UI_MODE=mock pnpm --filter @deetoo/rider-android start` | `src/preview/RiderFrontendApp.tsx` | Local-only mock reducer/UI state, no API |
| Existing production-connected fallback | `pnpm --filter @deetoo/rider-android start` | `src/RiderNativeApp.tsx` | Current existing API, location, media and push integration |

The frontend-only mode is **development-only**; `__DEV__` must be true
and the mode must exactly equal `mock`. Both conditions are tested.
This temporary mode selector is the **backend integration seam**, not a
request to operate two competing Rider products indefinitely. Phase 4 of
integration will connect the approved component tree and retire the old
connected UI only after complete end-to-end certification.

The 24-screen preview is the **sole approved visual reference**. Do not
create another Rider web frontend, screen set or competing design system.
Existing `apps/rider` browser implementation remains only a simulator.

## Approved primary navigation

**Home → Deliveries → Earnings → Inbox → Profile.**

One bottom navigation is generated from `src/preview/screen-catalog.ts`.
Onboarding/login are outside the bottom nav until sign-in.
The screen catalog is checked for exactly 24 sequential and uniquely
numbered screens, six per phase, with valid tabs. All linked screen
components are retained. Phase 1–4 unit tests cover the mock workflows
and rejection/safety constraints.

## Architecture and ownership

| Concern | Source of truth during frontend acceptance |
|---|---|
| Navigation and cross-screen mock state | `RiderFrontendApp.tsx` (consolidated root UI composition) |
| Approved UI styling and tab shell | `ui.tsx`, DeeToo green/dark green/navy tokens |
| Screen definitions / intended primary navigation | `screen-catalog.ts` |
| Onboarding/screens 1–6 | `RiderFrontendApp.tsx`, `phase1-model.ts` |
| Dispatch/screens 7–12 | `Phase2DeliveryScreens.tsx`, `phase2-model.ts` |
| Delivery summary and history/screens 13–15 | `Phase3Deliveries.tsx`, `phase3-model.ts` |
| Earnings, wallet and payout/screens 16–18 | `Phase3Finance.tsx`, `phase3-model.ts` |
| Performance/screens 19 | `Phase4Performance.tsx` |
| Notifications and support/screens 20–22 | `Phase4Communication.tsx`, `phase4-model.ts` |
| Safety/screens 23 | `Phase4Safety.tsx`, `phase4-model.ts` |
| Profile and settings/screens 24 | `Phase4Profile.tsx`, `phase4-model.ts` |

## Contract for backend capability audit (next phase)

- Mock **auth/OTP/recovery** must map to existing DeeToo auth and rider roles;
  no demo code, admin approval controls or mock credentials can enter production.
- **Rider verification** must map to onboarding, document storage/review,
  vehicle and equipment compliance; verified identity edits trigger recheck.
- **Delivery lifecycle** must follow Dispatch's assignment authority,
  accurate location and server-validated merchant pickup/customer proof.
  Multi-order routes are server-assigned, not rearrangeable by the rider.
- **Finance** must use real earnings ledger, cash settlement, pending vs.
  withdrawable funds and idempotent M-PESA disbursement state changes.
  Sample KSh amounts must never become authoritative.
- **Support and safety** must persist secure, participant-authorized
  threaded messages, incidents, evidence and admin-only resolution.
  The Rider app cannot resolve support cases or incident investigations.
- **Settings/security** must use real authentication, encrypted token
  storage, server-confirmed device sessions, revision and audit policy;
  account deletion requests must respect pending orders/financial holds.

Important: no extra tables, APIs, migrations or dependencies were introduced
in consolidation. There is no live network access in mock mode. All screen
components remain intact; no approved screen was removed.

## Verification and acceptance

```bash
pnpm exec tsx --test tests/unit/rider_frontend_consolidated.test.ts
pnpm exec tsx --test tests/unit/rider_phase1_preview.test.ts tests/unit/rider_phase2_preview.test.ts tests/unit/rider_phase3_preview.test.ts tests/unit/rider_phase4_preview.test.ts
pnpm typecheck:rider-android
pnpm build:rider-android
```

The complete GitHub CI also runs Rider Android prebuild and the remaining
repository-wide regressions.

**Automated CI passing is not proof of pixel-perfect design fidelity.**
Android device/emulator visual and interaction certification remains a
separate acceptance gate before mapping the approved UI to backend services.
