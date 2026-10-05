# Phase 3 — Operations, Money-Out & Launch Readiness

Implementation branch: `phase-3-operations-moneyout-launch`

This phase builds on the completed Phase 2 native fulfilment foundation.

## Implemented

### Admin / Operations Control Tower
- Live marketplace snapshot for active orders, deliveries, Rider supply, Merchant state, payments, finance and operational workload.
- Live delivery geo-telemetry in the Admin application.
- Zone supply/demand view with available/busy Riders and unassigned delivery pressure.
- Dispatch operations remain permission-scoped to Admin/Ops.
- Incident, support and risk queues are surfaced in Admin.

### Merchant operations
- Merchant onboarding pipeline:
  - APPLICATION
  - DOCUMENTS_PENDING
  - COMMERCIAL_TERMS
  - CONTENT_SETUP
  - MENU_QA
  - STAFF_TRAINING
  - READY_FOR_REVIEW
  - APPROVED
  - LIVE
  - BLOCKED
- New Admin-created Merchants now start DISABLED/DRAFT and cannot bypass onboarding readiness.
- LIVE/APPROVED stages require branch, menu, Merchant Owner, commercial and payout readiness.

### Finance controls
- Maker-checker financial adjustments.
- Merchant settlement reservation/claim uniqueness.
- Rider payout earning claim uniqueness.
- Payout destinations are encrypted at rest and returned only in masked form.
- Settlement and payout batches must be APPROVED before disbursement.
- Batches move through PROCESSING and are marked PAID only after verified provider success.

### Money-out providers
- Safaricom M-PESA B2C provider.
- Configurable bank payout gateway.
- Provider request idempotency.
- Unique provider/request identity in PostgreSQL.
- Provider callback credential verification.
- Terminal provider outcomes:
  - repeated identical callbacks are idempotent;
  - successful references cannot change;
  - a terminal FAILED attempt cannot later become SUCCEEDED;
  - retry uses a new attempt rather than rewriting history.
- Provider callbacks post final settlement/Rider payout effects transactionally.

### Launch readiness
Evidence-backed launch gates exist for:
- payment sandbox certification;
- Rider device certification;
- object storage certification;
- notifications certification;
- backup/restore certification;
- load testing;
- security review;
- privacy/retention;
- monitoring/alerts.

A gate cannot be PASSED without an evidence reference. Launch readiness remains false unless both configuration checks and all evidence gates pass.

## Phase 3 CI gate

CI must pass:
- frozen pnpm install and pnpm-only policy;
- lint/typecheck;
- OpenAPI validation and route coverage;
- full unit/integration suite;
- Phase 2 fulfilment regressions;
- Phase 3 operations/money-out regressions;
- Rider Android typecheck/native prebuild/export;
- Customer/Merchant/Admin/API builds;
- PostgreSQL/PostGIS + Redis foundation tests;
- browser role/auth acceptance;
- CodeQL;
- production dependency audit with only the documented unpatched Expo CLI exceptions.

## Durable financial invariants

- One Merchant order can be claimed by only one settlement.
- One Rider earning can be claimed by only one payout.
- A payout destination must exist before money-out.
- Sensitive payout destination values are encrypted at rest.
- Maker cannot self-approve a financial adjustment.
- Calculator cannot self-approve settlement/payout where maker identity is recorded.
- APPROVED is not PAID.
- PROCESSING is not PAID.
- Only a verified provider result can produce PAID in the production money-out flow.
- A provider request maps to one disbursement attempt.
- Ledger history is append-only; adjustments create new balanced entries.

## Configuration-dependent production certification

Code intentionally fails closed when required external configuration is absent. Real launch still requires credentials and external acceptance for:
- M-PESA B2C;
- bank payout gateway;
- payment providers;
- FCM;
- object storage;
- Google Routes;
- SMS/email providers;
- backup/restore environment;
- monitoring/alerting platform.

A green CI run proves repository implementation and durable invariants. It does not substitute for provider certification or launch evidence.

## Phase 3 exit condition

The platform can only be considered launch-ready when:
1. Customer payment and fulfilment complete successfully;
2. Merchant payable and Rider earning are posted correctly;
3. eligible Merchant/Rider amounts are uniquely reserved;
4. separate authorized actors approve money-out;
5. real provider execution returns a verified result;
6. settlement/payout becomes PAID only from that provider evidence;
7. reconciliation matches provider, resource and ledger state;
8. Admin/Ops can investigate operational failures without manual database edits;
9. every launch-readiness gate has recorded evidence.
