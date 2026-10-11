# Rider Phase 4 — Full Backend Integration

**Branch:** feat/rider-android-backend-phase4 (stacked on backend Phase 3 / PR #61).

## Entry point and visual contract

- Default Android, including release: src/connected/RiderConnectedApp.tsx. Uses real Rider backend; approved brand tokens/cards/five-tab shell.
- Dev mode with EXPO_PUBLIC_RIDER_UI_MODE=mock: src/preview/RiderFrontendApp.tsx. The immutable 24-screen visual reference with demo-only interactions.
- Dev mode with EXPO_PUBLIC_RIDER_UI_MODE=legacy: src/RiderNativeApp.tsx. Temporary production-connected rollback.
- Approved primary navigation: Home, Deliveries, Earnings, Inbox, Profile.
- The approved original components are preserved. The connected UI still requires side-by-side device-level fidelity acceptance; automated CI is not a pixel-perfect certification.

## 24 connected routes

| # | Screen | Server-side integration |
|---:|---|---|
| 1 | Login and Authentication | NativeAuthSession, encrypted Android refresh-token storage and DeeToo login/password recovery, with Rider role check |
| 2 | Rider Registration | POST /auth/register/rider; creates pending application; no auto approval |
| 3 | Documents | GET verification checklist; private camera uploads; POST verification documents and administrator review |
| 4 | Vehicle and Equipment | POST /rider/vehicles in pending state; POST equipment review |
| 5 | Onboarding | GET Rider status/checklist; POST onboarding submission |
| 6 | Home Dashboard | GET status, wallet, performance, active offer/delivery; POST GPS availability |
| 7 | Incoming Offer | GET active offer, POST accept/reject; backend determines expiry/pay |
| 8 | Active Delivery | GET active and owned detail; backend milestone |
| 9 | Merchant Navigation | Server Maps deep link; actual fresh GPS for arrive-pickup |
| 10 | Merchant Pickup | Merchant-supplied code; server READY and assignment checks |
| 11 | Customer Navigation | Server Maps deep link; actual fresh GPS for arrive-dropoff |
| 12 | Handover | Server OTP verification or verified private DELIVERY_PROOF camera upload; fail and escalate |
| 13 | Completion | Terminal history and posted Rider earning components; not invented earnings |
| 14 | Multi-order | Backend capability contract: disabled until stack dispatch/custody is certified |
| 15 | Delivery History | Scoped paginated history and terminal receipts, privacy-limited |
| 16 | Earnings | Backend earnings time series, ledger KES minor units |
| 17 | Wallet | Real available/pending/cash obligations; dispute routes to support |
| 18 | Payouts | Rider payout request intent and status; Finance alone reviews and disburses |
| 19 | Performance | Backend Rider metrics and customer-owned feedback |
| 20 | Notifications | Recipient-owned persistent inbox and mark-read action |
| 21 | Support Center | Participant-scoped GET/POST cases, verifies order ownership |
| 22 | Conversation | Persistent notes/attachments and participant satisfaction; Admin alone resolves |
| 23 | Safety | Rider incident create/read, private incident evidence, admin-owned investigation |
| 24 | Profile | Backend profile, preference persistence, administrator-reviewed change requests |

## Invariants

Rider authentication uses the existing NativeAuthSession and SecureStore. Production API origin must be HTTPS. Rider API routes cannot execute Finance/Admin operations. No client-simulated OTP, mock media filename, fake earnings, paid status or case closure is used in connected mode. Photo capture uses private media upload, content upload and completion verification. Withdrawal requests use KES minor units, idempotency and Finance review; they do not transfer money. Account deletion, identity and payout-destination edits require authorized governance. Emergency assistance displays safety guidance; no responder is contacted by the application. Maps deep links are real where backend-provided; the embedded illustrative map is not live navigation.

## Test and acceptance

Commands:

    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/unit/rider_phase4_backend_adapter.test.ts
    pnpm typecheck:rider-android
    pnpm build:rider-android

The Android device visual and workflow acceptance gate still includes narrow-screen layout, keyboard behaviour, accessibility, camera/GPS/FCM permissions, real Customer–Merchant–Dispatch–Rider–Admin journey, provider M-PESA certification, and authenticated incident/support edge cases. Nothing is merged into main before end-to-end release hardening.
