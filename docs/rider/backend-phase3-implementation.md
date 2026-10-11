# DeeToo Rider — Phase 3 backend gap implementation

**Branch:** `feat/rider-android-backend-phase3` · **PR:** #61 (draft; stacked on Rider audit PR #60)  
**Date:** 2026-10-11 · **Scope:** Backend capabilities and security; **no redesign** of the 24 approved Android screens and **no integration/merge to main**.

## Implemented

| Workstream | Real backend implementation | Status |
|---|---|---|
| Support-case authorization | Participant Rider case creation verifies assigned Rider for linked delivery/order and validates linked payment→order before linking other parties. Foreign IDs fail closed. | Added |
| Support resolution authority | Rider/other participant `ACCEPTED` feedback remains `PARTY_CONFIRMATION`; an authorized Admin must call existing `POST /operations/support/cases/:id/finalize` to resolve and close. Full note/confirmation history retained. | Corrected |
| Rider delivery history | `GET /rider/deliveries/history`, `GET /rider/deliveries/history/:historyId`, status/pagination, Rider ownership, terminal-only redacted record, authoritative earning component lookup; no recipient details/OTP after delivery. | Added |
| Rider safety & incident handling | Rider `POST/GET /rider/incidents`, `GET /rider/incidents/:incidentId`; owned delivery optional; incident investigation/admin resolution stays staff-only. Rider-owned `RIDER_INCIDENT` private media purpose and evidence GET/POST; Ops evidence list contains both Admin and Rider attachments. | Added |
| Verified onboarding | Rider document upload/verification checklist, ID/selfie/licence/insurance requirements by vehicle type, staff document review, equipment submission/review, verified phone required, dispatch eligibility check. Validated at submit/approval/goOnline. | Added |
| Immutable legacy migration policy | Existing pre-migration Rider profiles grandfathered on document-review flag; new Rider profiles have `verification_required=TRUE` by default. Tests explicitly tag legacy-approved fixtures. | Added |
| Protected profile/vehicle edits | Approved/pending-review Riders cannot directly replace verified identity or vehicle/ACTIVE configuration. Sensitive changes become participant-scoped support cases for authorized administrative review. | Added |
| Rider signup | `POST /auth/register/rider` with name, password, contact, address and emergency phone; creates RIDER identity, DRAFT profile, no dispatch eligibility, phone OTP and verification required before approval. | Added |
| Rider payout requests | `GET/POST /rider/payout-requests` records KES minor-unit intent with idempotency, cash/ledger checks and outstanding-intent holds. Finance-only review and payout-link APIs. **No Rider pay/approve/provider action.** | Added |
| Earnings, performance and optional preferences | `GET /rider/earnings/trends`, `GET /rider/performance/feedback`, `GET/PUT /rider/preferences` return Rider-only records. Mandatory account, safety and delivery alerts cannot be disabled. | Added |
| Multi-order operations | `GET /rider/deliveries/capabilities` communicates `enabled:false`, `max_active_deliveries:1`. **Not enabled** because original dispatch excludes active Riders. Screen 14 remains approved and a disabled/unsupported state is available for integration. | Safely gated |

## PostgreSQL migrations

- `042_rider_incident_evidence.sql` — incident-linked private Rider media evidence.
- `043_rider_verification.sql` — verification documents, reviewed equipment and legacy-safe `verification_required`.
- `044_rider_withdrawal_requests.sql` — Rider cash-out intents, unique Rider idempotency keys and unique payout linkage.
- `045_rider_self_registration.sql` — Rider residential and emergency contacts.
- `046_rider_preferences.sql` — optional app preferences only; critical alerts are not settings.

Migrations use `CREATE TABLE IF NOT EXISTS` or additive alterations. Run migrations through the standard DeeToo migration tool in a sandbox before release; do not run direct DDL against production.

## Security and business invariants

1. Only the authenticated Rider may see their history, incidents, earnings/ratings and financial requests; a foreign linked order/delivery/payment cannot be put into Rider support tickets.
2. Staff controls incident investigation/resolution. Only an authorized Admin can finalize a support case; a Rider's satisfaction response cannot close it.
3. Rider account and vehicle verified changes are not applied immediately; Rider-created payout requests **never** invoke disbursement or override Finance maker/checker and provider webhook proof.
4. Critical delivery assignment, identity/security and safety alerts always remain enabled; only optional preferences are persisted.
5. Newly onboarded Riders must verify phone, submit approved documents, and pass equipment review before approval and dispatch.
6. No payout/bank destination is changed from the Rider UI. Sensitive changes are queued for review in existing support operations.
7. One active delivery remains authoritative until a separate multi-order dispatch/custody and fee architecture is certified.

## Still intentionally outside this Phase 3 backend implementation

- **Multi-order dispatch:** The actual concurrent assignment, ordered stops, route optimization, custody and per-job earnings model is **not** implemented. Screen 14 is retained but must remain disabled in connected mode.
- **Self-service payout destination activation:** Profile-change requests are supported, but a Finance/Admin process must verify and apply encrypted payout destination changes. No direct Rider beneficiary mutation is permitted.
- **Advanced analytics/achievement policy and an in-app navigation renderer:** Basic data/series/feedback exists; routing still uses the existing mapping provider and external navigation links.
- **End-to-end production certification:** Real provider credentials, SMS/FCM and M-PESA payouts, Android hardware GPS/camera, cross-application live sessions and visual comparisons are Phase 5 gates.
- **Frontend integration:** All 24 approved Rider screens still run in dev-only mock mode. Phase 4 replaces mock data via adapters; do not delete approved UI controls to match gaps.

## Review and acceptance gates

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm openapi:validate
pnpm openapi:coverage
pnpm test
pnpm test:foundation
pnpm test:phase2
pnpm test:phase3
pnpm typecheck:rider-android
pnpm build:api
```

CI also covers real PostgreSQL/PostGIS + Redis Merchant→Rider→Delivery, API shopping and browser regressions. See the latest workflow run on the branch for actual results; no CI claims here replace a successful Actions conclusion.

**Release decision:** Do **not** merge to `main` on a red or incomplete CI run, or until relevant multi-party negative-role/financial evidence and Android acceptance are complete. Draft PR #61 holds this work for review.
