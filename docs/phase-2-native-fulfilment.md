# Phase 2 — Native Fulfilment & Complete Marketplace Transaction

Implementation branch: `phase-2-native-fulfilment-complete`

This phase builds on the completed Phase 1 platform split and security foundation.

## Implemented

### Rider Android
- Expo/React Native Android application shell with secure native auth storage.
- Rider login/session restore.
- Online/offline controls.
- Foreground/background GPS using an Android foreground location service.
- Native FCM token registration.
- Foreground/background delivery-offer notification handling.
- Offer accept/reject.
- Active delivery workflow.
- Pickup verification code entry.
- Drop-off OTP entry.
- Native camera proof capture.
- Private proof upload integration.
- Rider earnings visibility.
- Incident reporting.

### Dispatch and custody
- Paid-order guard remains mandatory before assignment.
- Missing pickup coordinates fail closed.
- Redis proximity discovery with database eligibility checks.
- Route-matrix ETA integration for shortlisted candidates.
- Offer acceptance is concurrency protected.
- `ARRIVED_PICKUP -> EN_ROUTE` bypass is prohibited.
- Pickup requires Merchant `READY` plus pickup verification code.
- Post-pickup Rider self-release is prohibited.
- Post-pickup failure remains an Ops incident and preserves Rider custody/BUSY state.
- Rider earnings are finalized with delivery completion.

### Private media
- Private S3-compatible object storage integration.
- Signed upload intents.
- Upload completion verification.
- Authorized signed read URLs.
- Rider documents, delivery proof, and incident evidence use private media objects.
- Delivery PHOTO proof requires verified media owned by the assigned Rider.

### Notifications
- Native device registration.
- FCM HTTP v1 push provider.
- Africa's Talking SMS provider.
- Resend email provider.
- In-app notification channel.
- Rider offers enqueue durable PUSH notifications.
- Customer delivery lifecycle notifications enqueue from the same business transaction.
- Durable notification worker claims rows with `FOR UPDATE SKIP LOCKED`.
- Worker claims have expiring leases and recover after worker crashes.
- Provider failures retry with bounded backoff.
- Exhausted notifications enter the dead-letter queue.
- External provider acceptance is recorded as `SENT`; only synchronous in-app events are immediately `DELIVERED`.

Run the worker with:

```bash
pnpm worker:notifications
```

### Merchant kitchen
- Live kitchen columns for incoming, preparing, and ready orders.
- SSE refresh with polling fallback.
- Audible incoming-order alert after user activation.
- Accept/reject.
- Prep-time selection.
- Preparing/Ready progression.
- Rider pickup/handoff visibility.

### Customer fulfilment
- Existing paid-order checkout remains authoritative.
- Customer live tracking uses scoped order ownership.
- Rider identity is privacy-reduced.
- Live GPS is only returned while the delivery is active.
- Tracking ends after terminal order/delivery states.
- Realtime lifecycle events retain REST as authoritative recovery.

## Phase 2 CI gate

CI must pass:

- frozen pnpm install;
- pnpm-only repository policy;
- root typecheck/lint;
- OpenAPI validation and route coverage;
- unit/integration tests;
- Phase 2 fulfilment regressions;
- production dependency audit;
- Rider Android typecheck;
- Rider Android export build;
- Customer Web build;
- Merchant Web build;
- Admin Web build;
- API build;
- PostgreSQL/PostGIS + Redis foundation suite;
- Phase 1 browser isolation acceptance;
- CodeQL.

## Dependency-audit exception

Expo SDK 57 currently reaches two high-severity advisories through the build-only `@expo/cli` dependency chain and neither advisory has a published patched version:

- `GHSA-86w9-cpqp-85rv` via `node-forge`;
- `GHSA-vfj7-8cjw-p6xm` via `braces`.

CI ignores only these named advisories while continuing to fail on any other high/critical production advisory. Remove each exception as soon as the Expo dependency chain has a fixed release.

## External certification still configuration-dependent

The code intentionally fails closed when real providers are not configured. Production certification still requires real credentials/environments for:

- Firebase Cloud Messaging;
- private S3-compatible object storage;
- Google Routes;
- M-PESA/card sandbox and production approval;
- Africa's Talking/Resend where those channels are enabled.

A green CI run proves the implementation contract and local/durable test gates. It does not claim that an external provider accepted a live production transaction without its credentials.

## Deliberately deferred to Phase 3

- Glovo-style Admin Control Tower expansion;
- supply planning;
- merchant onboarding pipeline expansion;
- fleet/3PL administration;
- production merchant settlement execution;
- production Rider B2C/bank payouts;
- advanced risk operations;
- launch monitoring/DR/load certification.
