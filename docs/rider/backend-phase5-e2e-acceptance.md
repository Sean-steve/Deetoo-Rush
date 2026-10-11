# Rider Phase 5 — Comprehensive End-to-End Acceptance

**Date:** 2026-10-11  
**Branch:** `feat/rider-android-backend-phase5` (stacked on Phase 4 PR #62).  
**Scope:** Customer, Merchant, Admin/Dispatch, Rider Android and financial/support/safety backend validation. This is an **evidence ledger**, not a declaration that third-party provider or physical hardware acceptance has passed.

## Release decision

**NOT READY TO MERGE / NOT PRODUCTION-CERTIFIED** until all P0 external/device gates below have verifiable evidence, Rider visual parity review is signed off, and the stacked upstream PR chain is green.

### Executed by CI (deterministic automation)

| Gate | Execution | Evidence |
|---|---|---|
| 24 connected routes and exact 5 tabs | `tests/unit/rider_phase5_screen_gate.test.ts` | Source coverage / production-mode guard, not pixel-certification |
| KSh minor units, idempotency inputs and forbidden admin routes | `tests/unit/rider_phase4_backend_adapter.test.ts` | Backend adapter boundary |
| Real authenticated Rider HTTP read model / privilege denial | `tests/integration/rider_phase5_http_e2e.test.ts` | Express app + fixture roles, route assertions |
| Rider support conversation, unrelated-order denial and unauthorized third-party reads | `tests/integration/rider_phase5_http_e2e.test.ts` | Durable-in-session support thread / role isolation |
| Incident role denial and validation | `tests/integration/rider_phase5_http_e2e.test.ts` | Express app rejects forged admin status |
| Multi-order feature disabled | `tests/integration/rider_phase5_http_e2e.test.ts` | Real server capability contract |
| No fabricated payout in non-durable test mode | `tests/integration/rider_phase5_http_e2e.test.ts` | 503 fail-closed |
| Customer pays → Merchant confirms → Dispatch → Rider pickup/OTP → Ledger | Existing `tests/integration/core-marketplace-journey.test.ts` | Simulated payment provider; authenticated HTTP |
| Provider callback, authorization and outbox on PostgreSQL | `pnpm test:foundation` and `pnpm test:paid-order` | Real PostGIS + Redis test services, local provider |
| Merchant–Rider–Delivery integration | CI `Real PostGIS Redis Merchant-Rider-Delivery journey` | Durable cross-application CI |
| Android compile + native export | `pnpm typecheck:rider-android`; `pnpm prebuild:rider-android`; `pnpm build:rider-android` | Android binary structure and JS bundle; **not device UI** |
| CodeQL and full monorepo/browser regressions | Existing CI pipeline | Security static analysis, Customer/Merchant/Admin browser tests |

The completed GitHub Actions run URL and commit SHA must be attached to release notes. A green CI **does not** prove real Android GPS, OTP SMS delivery, M-PESA settlement or pixel-perfect fidelity.

### Screen-by-screen acceptance matrix

Each row below has a required **Android device** assertion. Mark `PASS` only after taking a physical/emulator screenshot, an authenticated server request ID, and observing the relevant negative state. Until then mark **NOT RUN**.

| # | Screen | Live acceptance step | Required failure/edge state |
|---:|---|---|---|
| 1 | Login / Authentication | Sign in as legitimate Rider; restore secure token; logout and revoke | Customer/merchant token denied, expired/invalid token, offline recovery |
| 2 | Rider Registration | Create new pending Rider, verify account unapproved | Duplicate phone/email, weak password, absent network |
| 3 | Documents | Capture ID/selfie/licence via device, upload and await review | Camera denied, rejected/expired/duplicate evidence, resubmission |
| 4 | Vehicle / Equipment | Submit real vehicle + gear, verify Admin review | Wrong vehicle class/plate, approval cannot be self-set |
| 5 | Onboarding | Submit and review Admin approval, phone verification | Missing required docs/equipment, no online before approval |
| 6 | Dashboard | Toggle online/offline using fresh GPS, view balances | Outside zones, stale GPS, GPS permission denied, active work offline restriction |
| 7 | Incoming Request | Receive actual dispatch offer/expiry, accept or decline | Expired offer, offer replay, Rider not eligible |
| 8 | Active Delivery | Observe server-authoritative stage and order identity | Assignment to another Rider denied |
| 9 | Merchant Navigation | Open real Maps deep link, record arrival with fresh GPS | Maps unavailable, wrong coordinates, no background location permission |
| 10 | Merchant Pickup | Merchant READY + valid pickup verification | Invalid code, wrong order, order not READY, double pickup |
| 11 | Customer Navigation | Navigate actual drop-off, mark arrival with fresh GPS | Wrong stage, unreachable address, background restrictions |
| 12 | Handover | Complete once with actual customer OTP or verified private photo | Wrong/replayed OTP, unverified media, offline attempt, failed delivery custody |
| 13 | Completion | Verify terminal receipt matches server ledger | Fee still pending, no phantom payout or recipient PII leakage |
| 14 | Active / Multiple Orders | Verify backend explicitly blocks stacking | No second assignment or client-controlled reorder |
| 15 | Delivery History | Paginate owned delivered/failed/cancelled records | Another Rider's record hidden; no PII after completion |
| 16 | Earnings | Cross-check KSh minor-unit chart totals with ledger | Zero/empty month, DST/time-zone cutoffs, delayed posting |
| 17 | Wallet / Cash | Compare cash owed, collected, available and pending | Unreconciled cash never increases payout availability |
| 18 | Payouts | Submit valid withdrawal intent and witness Finance decision | Duplicate submit, insufficient funds, paid state only after provider confirmation |
| 19 | Performance | Verify ratings, timelines and customer-authored comments | No data; rejection of fraudulent Rider-authored rating |
| 20 | Notifications | Receive push and persist/read inbox item | Push denied/background, unread state and no silent critical suppression |
| 21 | Support Center | Open Rider-owned and order-related cases | Forged foreign order/payment/delivery link rejected |
| 22 | Conversation | Send/receive threaded messages, satisfaction, follow-up | No Rider final resolution, history survives case state changes |
| 23 | Safety / Incidents | File incident, attach private evidence, track Admin investigation | Another Rider denied, invalid files, emergency guide accessible offline |
| 24 | Profile / Settings | Save preferences and file verified profile/payout change requests | Critical alerts locked; deletion blocked by active job/cash; change requires Admin |

## Device test plan (manual, mandatory)

1. **Reference parity:** Capture every one of the 24 screens on a physical low-end Android phone (360dp width), typical 393dp phone and large text (1.3x–1.5x). Compare to the approved design reference, focusing on full card inventory, typography, colours, spacing, bottom navigation, status variants, scrolling and keyboard accessibility. Do not accept a substitute/wireframe in place of the approved components.
2. **Permissions and lifecycle:** Deny then grant location, background location, camera and Android 13+ push permissions; background/kill/restart; restore the authenticated session securely; revoke and sign out; ensure GPS tracking stops when offline.
3. **Network safety:** Disconnect mid-offer, photo upload, OTP confirmation, payout request and support reply; restore connectivity, verify no false success, double debit/payment or duplicated delivery transitions.
4. **Cross-application live chain:** Customer checkout and captured M-PESA evidence → Merchant acceptance/preparation/READY → Dispatch offers → Rider accepts/pickup code/navigation/handover → Customer sees completion → Admin sees delivery/invoice/support/incident → Rider earnings posted.
5. **Support/safety authority:** Inspect full multi-party thread and uploaded media from authorized accounts; confirm wrong-party access fails and only authorized Admin can finalize. Rider can express satisfaction or dispute, not close.
6. **Finance certification:** Use provider sandbox references with verified callbacks and maker/checker; ensure currency, cash receivable, reserved balance, retry/idempotency and settlement payout IDs balance. Provider API/SMS availability and Finance approval must be real, not simulated.
7. **Operational resilience:** Location spoof/freshness limits, timeouts, expired offer, lost device, revoked Rider, invalid OTP retries, media verification failures, multi-order gate, support storage outage, cash holds, rejected evidence and rollback/recovery.

## Evidence to capture (NOT RUN / awaiting tester)

| External gate | Status | Required evidence |
|---|---|---|
| 24 screenshot pixel/accessibility comparison | **NOT RUN** | Screenshots + 24/24 signoff, with actual devices and viewport |
| Android background GPS (real hardware) | **NOT RUN** | Permission transitions, battery lifecycle/kill/relaunch, server tracking snapshots |
| Actual device camera + private object storage upload | **NOT RUN** | Verified media IDs, denial, retry and access audit |
| Android FCM push and notification channels | **NOT RUN** | Device log / background delivery / token refresh |
| Live SMS OTP provider | **NOT RUN** | SMS provider test receipt / token expiry / throttling |
| Provider M-PESA STK/B2C settlement | **NOT RUN** | Provider sandbox callback + reconciled ledger proof; never fake production payment |
| Full deployed multi-application UAT | **NOT RUN** | Customer/Merchant/Rider/Admin linked audit IDs |
| Privacy/security penetration testing | **NOT RUN** | A tested threat matrix and role-policy evidence |

## Commands

```bash
pnpm install --frozen-lockfile
NODE_ENV=test DEETOO_STORAGE_MODE=memory DEETOO_FIXTURES=true pnpm exec tsx --test tests/unit/rider_phase5_screen_gate.test.ts tests/unit/rider_phase4_backend_adapter.test.ts tests/integration/rider_phase5_http_e2e.test.ts
pnpm test
pnpm typecheck:rider-android
pnpm prebuild:rider-android
pnpm build:rider-android
```

CI additionally runs PostgreSQL/PostGIS+Redis integration jobs and CodeQL, plus browser regression for Customer, Merchant and Admin. For manual Android builds use `pnpm --filter @deetoo/rider-android start` with a configured reachable HTTPS DeeToo API; `EXPO_PUBLIC_RIDER_UI_MODE=mock` is **visual comparison only**, never the connected test mode.

## Blockers and decision

- **Release-blocking until device UAT:** 24-screen visual fidelity, camera/FCM/GPS permission/lifecycle, SMS, M-PESA provider, and multi-party production-like end-to-end acceptance remain unverified here.
- **Known functional limitation:** concurrent delivery stacking intentionally disabled by server contract.
- **Separation of responsibility:** backend/server roles control pickup and delivery proof, Admin support/incident resolution, Finance money-out and payout confirmation. Do not relax these for visual acceptance.
- **No merge to main** while evidence above is missing.

When all gates pass, record device model/Android version, screenshots, run SHA/URL, test data references, privacy checks, defects and signoff, then assess the stacked PRs for merge to main.
