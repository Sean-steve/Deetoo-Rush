# DeeToo Customer Web vNext — Phase 5 Release Readiness, Staging Acceptance & Rollback

**As of 2026-10-09:** Phase 5 release tooling implemented on `feat/customer-vnext-phase5-release-readiness`; **external staging certification and production cutover NOT performed**. No staging hostname, real Safaricom sandbox credentials, protected environments or staging users were identified or supplied. A passing test using a local/synthetic payment cannot override this gate.

## Removals: NONE

The original `apps/customer-web`, approved 15-screen preview, Merchant, Rider, Admin applications, and backend endpoints stay intact. Phase 5 adds a protected release path and changes **only** the Support closure workflow: `PARTY_CONFIRMATION → RESOLVED → CLOSED` (requires an Admin/Super Admin final action). Super Admin force-close override remains reason-audited. No schema migrations or production traffic change.

## Implemented components

1. `apps/customer-web-next/src/integration/mode.ts` and Vite build: preview is the default, DEV uses opt-in connected flag, release build requires explicit channel and approvals, production is bound to the certified source SHA; build fails if any connected-mode input lacks approval.
2. `apps/api/src/modules/operations/support.service.ts`, `operations.router.ts`, Admin `SupportCaseConsole.tsx`, OpenAPI: accept/dispute remain participant-owned; case `RESOLVED` after all linked parties agree; only administrator can POST `/api/v1/admin/support/cases/:id/finalize`; Admin button appears only when ready; separate super-admin force-close still requires reason. Conversation remains visible.
3. `scripts/customer-staging-certify.ts`: read-only *staging* SQL gate verifying real CAPTURED M-PESA receipt/unique immutable capture, authenticated Daraja QUERY result, KES captured amount matching order, balanced POSTED ledger, merchant acceptance, rider delivery and earnings, plus required participant acceptance and audit note for administrator-closed case. It never generates provider events or payment.
4. `playwright.customer-next-staging.config.ts` and `tests/browser/customer-next-staging.spec.ts`: HTTPS deployed frontend + same-origin API smoke for all 15 screens, real customer login, existing verified order and support conversation, foreign customer isolation. **No route mocking.**
5. `.github/workflows/customer-release.yml`: manual/protected staging certificate; if green, package connected frontend + unchanged old Customer rollback artifact together. For `production`, require protected environment review, owner declaration, negative-payment matrix and rollback-drill approvals. **Build artifacts only; it does not deploy, change DNS or flip routing.**
6. Unit and existing PostgreSQL/Redis/CodeQL/Playwright CI checks ensure legacy build and approved preview remain available.

## Missing external prerequisites (NOT optional for a real launch)

The deployment operator must provision and confirm the following **outside Git**:

- DNS + TLS HTTPS customer staging URL (reverse proxy must serve vNext SPA and forward same-origin `/api/v1`, `/health`; refresh/deep-links must return the SPA; do not cache auth/session API responses).
- Independent PostgreSQL/PostGIS and Redis with durable volumes, backups and scheduled migrations. Never use CI's `deetoo_foundation*` test databases for certification.
- API, payment worker, outbox worker, dispatch worker, notification worker, automation worker and worker-supervisor monitored separately; job dashboards/retries/dead letter visible in Admin.
- Sandbox Daraja consumer key/secret, shortcode, passkey, initiator/security credential, webhook gateway shared secret, valid **public HTTPS callback, result and timeout URLs**. At the callback ingress, authenticate the configured secret; don't expose the internal gateway secret to customers or source control.
- Dedicated staging customer, **different second customer**, merchant/admin/rider accounts with *approved nonproduction* test branch, menu, coordinates, device, and a signed-in rider; real sandbox STK handset approved by owner.
- GitHub environment **customer-staging** variables `CUSTOMER_STAGING_URL`, `CUSTOMER_STAGING_BRANCH_ID` and secrets `CUSTOMER_STAGING_DATABASE_URL`, `CUSTOMER_STAGING_EMAIL`, `CUSTOMER_STAGING_PASSWORD`, `CUSTOMER_STAGING_OTHER_EMAIL`, `CUSTOMER_STAGING_OTHER_PASSWORD`, `CUSTOMER_STAGING_CERT_ORDER_ID`, `CUSTOMER_STAGING_CERT_CASE_ID`, `CUSTOMER_STAGING_CERT_MPESA_RECEIPT`. Supply all through the GitHub environment secret store, never chat or commits.
- GitHub environment **customer-production** with required reviewers, branch limits, `CUSTOMER_PRODUCTION_RELEASE_APPROVED`, `CUSTOMER_PRODUCTION_NEGATIVE_MATRIX_APPROVED` and `CUSTOMER_PRODUCTION_ROLLBACK_DRILL_APPROVED` secrets each explicitly `true` **only after review**.
- A real completed staging order with verified Daraja asynchronous callback, capture + balanced ledger, accepted merchant handoff, delivered rider proof and posted rider earnings. A support case linked to the same test customer must reach `CLOSED` only after all parties accepted and an admin finalized.

## Certification sequence

1. **Before user-facing traffic:** build and deploy the staging-connected customer bundle from **the exact reviewed Git SHA** (set `GITHUB_SHA` to the full 40-character commit before `pnpm build:customer-next`). The build emits `/.well-known/deetoo-customer-release.json` reporting `sourceSha`, `channel: staging`, and `connected: true`. The protected workflow refuses to certify an older, preview or different-SHA deployment. Keep old production Customer static assets and its routing target. Configure `APP_ENV=staging`, `DEETOO_STORAGE_MODE=postgres`, `DEETOO_FIXTURES=false`, `DEETOO_LOCAL_WORKFLOW=false`; strict CORS and callback ingress secret.
2. Verify API and worker readiness, run migrations backed up under change control, verify location/merchant/rider end-to-end from a test account and live merchant/rider devices.
3. Make one explicitly approved low-value **Safaricom sandbox** transaction; verify actual STK prompt, authenticated callback, async QUERY result, immutable capture evidence, order release, balanced ledger, merchant fulfilment, dispatch, rider arrival/pickup OTP, delivery OTP, completed order and posted earnings.
4. Test **negative provider conditions** separately and retain evidence: STK user denial, provider timeout, duplicate callback, replay mismatch, wrong amount/receiver, missing callback, offline worker recovery, refresh/session expiration, refunds. Admin/Finance must sign off no duplicate capture or ledger. Do not mark as passed solely because a tester typed approval.
5. Create an admin-reviewed support case with required participant replies and administrator final closure; ensure customer, merchant and rider conversation visibility and permissions.
6. After capturing existing staged fixture IDs/receipt, manually launch the `Customer Release Candidate — External Staging Certificate` GitHub Actions workflow, target `staging`. It runs **read-only real DB checks** and no-mock browser tests; failures block candidate artifacts.
7. Configure **customer-production** required reviewers/approvals **only after** negative-payment and rollback rehearsals. Launch workflow target `production` on **the exact reviewed commit** and enter `I_AUTHORIZE_REVIEWED_CANDIDATE`. It reruns live staging checks against that commit and generates the connected SHA-bound and legacy static bundles.
8. **Manual hosting cutover only** (not automated in this repo): upload artifact to isolated immutable release path, smoke test with a canary test cohort, pin API same-origin routing, shift e.g. 1% → 10% → 50% → 100% only after error-rate, payments, cart, login, dispatch and support dashboards remain normal.
9. Rollback: if any payment/dispatch/authorization/SLO issue, direct customer traffic to the **unchanged legacy artifact** and invalidate CDN cache. Preserve immutable orders/quotes/ledger and logs; **never database-rollback paid orders**. Stop cutover but leave payment callbacks and workers running to reconcile in-flight orders.
10. Keep `apps/customer-web` and legacy artifact for an agreed rollback window; schedule removal **only under a separate deletion report and owner approval**, never as a side effect of Phase 5.

## Exact commands

```bash
# Existing approved preview (safe default):
pnpm build:customer-next
# Real staging ONLY; requires secure env injected by the staging infrastructure:
APP_ENV=staging DEETOO_STORAGE_MODE=postgres DEETOO_FIXTURES=false DEETOO_LOCAL_WORKFLOW=false \
 pnpm certify:customer-next-staging
GITHUB_SHA=<FULL_REVIEWED_40_CHAR_COMMIT> pnpm test:customer-next-staging

# Verified staging connected artifact (protected environment step):
VITE_CUSTOMER_NEXT_BACKEND_MODE=connected DEETOO_CUSTOMER_RELEASE_CHANNEL=staging \
 DEETOO_CUSTOMER_RELEASE_APPROVED=true GITHUB_SHA=<FULL_REVIEWED_40_CHAR_COMMIT> pnpm build:customer-next

# Production artifact must additionally set GitHub SHA and matching staging-cert SHA,
# after protected production reviewer approvals. Never run without actual certificate.
pnpm build:customer-legacy-rollback
```

## Release decision

**HOLD** until a successful external staging certification workflow, production-required reviewer approvals and manual operator cutover. Existing synthetic Postgres/Redis and browser fixture CI remains excellent regression coverage but is **not a Daraja staging certificate**. No frontend replacement has been deployed or merged into main.
