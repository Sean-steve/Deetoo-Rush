# Operating-flow Phase 2 — paid checkout and identity delivery

Date: 2026-09-24. Repository: `/home/jenny/Downloads/Deetoo1-updated`.

Provider-independent implementation and automated validation are complete. External provider certification is **BLOCKED_BY_CONFIGURATION**. This is not production launch approval. Phase 3 has not begun.

## Approved decisions

Both M-PESA and card checkout are included. M-PESA quotes round the final total upward to whole KES and display the adjustment; card quotes retain exact minor units. Resend email and Africa’s Talking SMS are the recommended messaging defaults, implemented as configurable adapters. No provider account was created and no real message or charge was sent. Phase 1's 5 km eligibility, branches, menus and test pricing remain in place.

## Exact changes

| File | Change |
|---|---|
| `apps/api/src/db/migrations/027_hosted_card_checkout.sql` | Adds nullable `payments.checkout_url TEXT` and CHECK limiting non-null values to `https://checkout.stripe.com/%`. Applied locally with normal migration runner; earlier checksums preserved. |
| `packages/types/src/index.ts` | Optional quote `payment_method` and Payment `checkout_url`. |
| `packages/validation/src/index.ts` | Quote payment method restricted to MPESA/CARD. |
| `apps/api/src/modules/cart/checkout.service.ts` | Frozen method and rounding adjustment in quote configuration/binding; binding regeneration preserves method; rounded total and service allocation. |
| `apps/api/src/modules/payment/payment.service.ts` | Rejects method mismatch and fractional M-PESA payment requests; permits CARD initiation without a token for hosted collection. |
| `apps/api/src/modules/payment/providers/payment-provider.interface.ts` | Provider initiation result supports checkout URL. |
| `apps/api/src/modules/payment/providers/stripe.provider.ts` | Idempotent hosted Checkout Session creation; safe return/checkout URLs; signed session event parsing; authenticated session-to-intent amount/currency/metadata/account verification; expiry and refund resolution to verified intent. Existing tokenized path retained. |
| `apps/api/src/modules/payment/payment.postgres.ts` | Persists hosted URL with payment. |
| `apps/api/src/modules/payment/payment-worker.ts` | Saves provider's hosted URL after durable initiation. |
| `apps/api/src/modules/finance/ledger.repository.ts` | Summary upsert now updates delivery/service/gross revenue, payment-processing cost and platform-funded discount. Previously refunds reversed ledger entries but left these summary columns stale. |
| `apps/customer/src/components/CustomerJourney.tsx` | Method selection before quote; method change invalidates displayed quote/key; rounding line; method-specific payment input/action; safe Stripe link; terminal attempts receive a fresh retry key while transport retries retain the key. |
| `apps/api/src/modules/auth/identity-delivery.ts` | New Resend/Africa’s Talking transport; secure reset/OTP token generation; commit hashes before delivery; no secrets in API response; concurrency-safe five-attempt OTP limit, expiry/replay rejection and persisted phone verification. |
| `apps/api/src/modules/auth/auth.service.ts` | Durable reset/OTP paths use identity delivery; fixture-only behavior remains isolated. OTP verification purpose supported, unrelated login/reset OTP purposes rejected. |
| `apps/api/src/modules/auth/auth.router.ts` | Rate limit OTP confirmation. |
| `apps/customer/src/CustomerApp.tsx` | Opens token entry after durable recovery request. |
| `apps/admin/src/components/AuthenticatorPanel.tsx`, `apps/admin/src/AdminApp.tsx` | Existing authenticated Admin console provides password-confirmed authenticator enrollment and recent-code verification. No privileged action auto-replay. |
| `.env.example` | Documents messaging configuration and card return URL. |
| `openapi/openapi.yaml` | Documents quote method, hosted URL, optional card token. No new routes. |
| `tests/unit/paid-order-provider-verification.test.ts` | Hosted Stripe request and retrieval contracts, pending is not capture, identity/amount/currency/redirect/config rejection. |
| `tests/paid-order/paid-order-transaction.test.ts` | Two additional PostgreSQL tests: method/rounding/refund allocations and complete hosted initiation→signed callback→capture→cancellation→refund worker path. |
| `tests/foundation/durable-foundation.test.ts` | Two additional durable recovery/OTP tests: commit-before-delivery, provider/config failures, concurrent one-time reset and session revocation, concurrent OTP attempt limits/replay. |
| `tests/integration/core-marketplace-journey.test.ts`, `tests/integration/sprint_7_order_lifecycle.test.ts` | Existing M-PESA journeys now request method-bound quotes. All authorization/state assertions retained. |

Local configuration: generated an MFA encryption key once without exposing it; `.env` remains mode0600. Set local card return URL to `http://localhost:3000/#customer`. No production URL or provider credentials invented. No database reset, seeding, real charge/refund or application-user credential reset in this phase.

## Paid-order flow and accounting

`Immutable method-bound quote → PENDING_PAYMENT → provider initiation → authenticated verified capture → PLACED → merchant queue`.

Order creation remains private and unpaid. Redirects and callback payloads alone cannot release an order. Existing merchant/dispatch paid gates remain enforced. API Order/payment keys remain mandatory with request-hash conflicts; durable worker commands and provider identities survive retry. Hosted CARD sends only the authoritative frozen amount/currency and identity metadata to Stripe; card details are collected on Stripe's page. Deetoo stores no PAN or client secret for this flow.

Example: exact total KES115.01 becomes M-PESA KES116.00, adjustment KES0.99. The customer sees the adjustment separately. Internally it is frozen in `service_fee_minor` as platform service-fee revenue, not merchant proceeds. The ledger balances actual captured customer funds plus platform promotion funding against merchant payable, commission, delivery and service revenue. Existing merchant/platform/shared promotion allocations and frozen commission are unchanged. Provider-processing costs require actual evidence; this phase does not invent fees.

Cancellation/rejection retains the existing void-or-refund policy. Late capture is posted and reserved for refund without releasing a cancelled order. Manual refunds require distinct authorized requester/approver and recent MFA where required by the route. Stripe hosted refunds resolve the authenticated captured intent, reuse refund identity and reconcile existing provider refunds before retry. Full refunds reverse the frozen capture allocation including M-PESA adjustment. Partial-refund integer differences use the existing cumulative rounding mechanism. Refund ledger and finance-summary updates now agree in PostgreSQL.

Legacy quotes without method remain supported when payable without unsafe rounding. Fractional legacy M-PESA orders fail with `MPESA_REQUOTE_REQUIRED`; create a fresh M-PESA quote rather than silently changing an immutable order.

## Exact validation

Final commands all exited zero. Results also saved in `docs/operating-phase-2-results.json`.

| Command | Final result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:unit` | 163 passed, 0 failed, 0 skipped |
| `npm run test:integration` | 209 passed, 0 failed, 0 skipped |
| `npm run test:e2e` | 1 API smoke passed, 0 failed, 0 skipped |
| `npm run openapi:validate` | PASS |
| `npm run openapi:coverage` | PASS, 261 routes |
| `npm run test:foundation` | 33 passed, 0 failed, 0 skipped |
| `npm run test:paid-order` | 14 passed, 0 failed, 0 skipped |
| `npm run db:migrate` | Applied only 027; prior checksums accepted |
| `curl -sS --max-time 10 http://localhost:3000/health/ready` | Healthy PostgreSQL/PostGIS/Redis after restart |

**420 passed; zero failures/skips in the listed final suites.** Unit/integration/API smoke explicitly use memory fixtures as defined by their normal test commands. Foundation/paid-order use fresh isolated PostgreSQL databases (names prefixed `deetoo_foundation_final_`) and Redis14/15, not live customer data. Existing process-death, capture rollback, concurrent idempotency, callback duplicates, financial recovery, role/ownership and realtime regressions remain present and passed. Provider HTTP calls are contract-test doubles, not sandbox certification.

Failures were resolved, not exempted: the first integration run exposed old fractional M-PESA fixtures; both journey fixtures now use the approved quote contract. The first new PostgreSQL refund tests exposed the summary upsert omission; the shared repository was corrected and the entire suite rerun successfully.

The normal application was restarted with **`npm run dev`**, PostgreSQL mode and fixtures disabled. Payment and outbox workers restored. Browser attachment timed out and no usable tab remained, so authenticated customer/card/MFA browser acceptance is **NOT VERIFIED**. The API smoke suite is not a substitute for that browser journey. No demo server was started.

## Remaining blockers and Phase 3 readiness

1. **BLOCKED_BY_CONFIGURATION — payment certification:** Stripe secret key/account/webhook secret absent; M-PESA consumer key/secret, shortcode/passkey, callback ingress secret/URL, initiator/security credential and Result/Timeout URLs absent. Configure verified HTTPS ingress and sandbox accounts, then prove capture, rejection, duplicate callback, timeout, cancellation and refund against each provider. M-PESA gateway authentication is not a fabricated Safaricom signature; authenticated transaction evidence remains required.
2. **BLOCKED_BY_CONFIGURATION — account recovery delivery:** Resend key/verified sender and Africa’s Talking key/username/approved sender absent. Actual email/SMS delivery and recovery acceptance remain unverified. The transport deliberately does not blindly retry an unknown SMS outcome; users can request a new message. Login/reset OTP variants are not introduced.
3. **Browser acceptance pending:** real hosted card redirect/return, recovery delivery and Admin MFA must be exercised using configured providers and a working browser. Actual Rider device GPS also remains a later fulfilment gate.
4. **Later approved phases:** dispatch pickup coordinates/readiness timing, merchant pickup/customer OTP custody and audited exceptions require fulfilment verification/repairs; real merchant/Rider disbursement and reconciliation remain separate work. Current prices still require launch approval.

Provider-independent Phase 2 code is ready to support Phase 3 development after authorization. Phase 2 external acceptance and launch readiness remain blocked as above. **Do not start Phase 3 automatically.**
