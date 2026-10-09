# DeeToo Merchant — Phase 4 Acceptance & Release-Gate Record

**Scope:** Approved eight-screen Merchant web view + Customer/Rider/Admin/Finance/Support backend boundaries.  
**Integration branch:** `feat/merchant-backend-integration` — **not merged to main**.  
**Release decision:** **HOLD / NOT PRODUCTION-CERTIFIED** until the external, visual and cross-app gates below are passed with recorded evidence.

## Implemented Phase 4 hardening

| Category | Evidence | Result |
|---|---|---|
| Duplicate provider capture / Kitchen | `merchant-experience.router.ts` uses `EXISTS(payment_capture_evidence)` rather than joining captured rows or trusting mutable order.payment_id. `tests/paid-order/paid-order-transaction.test.ts` now creates two real capture-evidence records for one order and asserts exactly one history row and one count, plus finance order counts. | Automated PostgreSQL regression, subject to CI green. |
| Cross-tenant isolation | Same paid-order test signs in an actual Merchant Owner via a server-issued session and bearer token, checks own branch reads, and asserts **403** for a distinct merchant's Kitchen history, metrics and finance. | Automated denial test, subject to CI green. |
| Responsive approved UI | Playwright mobile 390×844 logs in, traverses all eight approved screens through the collapsible sidebar, asserts no demo order cards, and fails on uncaught browser errors. Existing desktop browser tests remain. | Automated browser test, subject to CI green. |
| Partial branch settings writes | `PrototypeBranch.tsx` names previously saved sections if a later sequential write fails, keeps a persistent accessible error, and refreshes backend values. No longer implies that a multi-route write was atomic. | UI integrity hardening; server-side transaction still preferable. |
| External environment and cross-app read gate | `scripts/merchant-staging-release-gate.ts`, package script `pnpm test:merchant-staging` and `.github/workflows/merchant-staging-acceptance.yml`. With provided staging credentials, reads Merchant orders/history/finance/branch/menu inventory/team/inbox/support/security, Customer addresses, Rider identity, Admin orders; denies Customer→Merchant, Rider→Merchant Finance and Merchant→Admin, and explicitly blocks if foreign-branch fixture is absent. | **NOT EXECUTED** until real staging roles/tokens and a foreign merchant branch are configured. Read-only by design. |
| Regression CI | Existing `.github/workflows/ci.yml`: TypeScript/lint/tests/build of all web apps + Android, PostgreSQL migration/auth/outbox and paid order, browser acceptance, CodeQL. | Record final CI run URL and status after all changes. |

## Required staged multi-actor acceptance (release blockers)

### A. Customer → Merchant → Rider → Finance
1. Configure a dedicated staging Merchant branch and products with tracked inventory, delivery zones, hours and availability.
2. Customer creates a real sandbox checkout. Validate quote and nonnegative stock hold in the **same** transaction. Reject concurrent oversell, duplicate checkout key and stale quote.
3. Verify sandbox M-PESA/card webhook signature and receiver/amount/currency. A failed/unverified callback must **never** make an order actionable by Merchant.
4. Merchant sees only the authorized paid order, accepts/declines, prepares and marks ready. Duplicate capture cannot inflate order queue, revenue or notifications.
5. Dispatch assigns a Rider; only the Rider/handover flow can confirm pickup. Merchant cannot spoof handover. Rider delivers; complete order visible in history.
6. Ledger conserves money in KES minor units. Verify refunds, partial refunds, commission rates, seller payable, settlement line, authorized finance approval, and provider-confirmed disbursement without duplicate payouts.

### B. Business/team, security, support and notifications
1. Merchant Owner invites Manager/Staff; test acceptance, role restrictions, branch limitation, membership revocation while page remains open, and deny staff access to finance/role modifications. No self-escalation.
2. Sessions, revoke one/all, password change, MFA enrollment/disabling with step-up, device trust and deactivation review; audited failed logins and recovery require staging scrutiny.
3. Merchant case with media evidence → Admin investigation/internal notes (not visible to Merchant) → Admin proposed resolution → Merchant accepts/disputes → authorized closure. Preserve visible but forbidden controls.
4. Merchant notification inbox with per-user read/archive state, preference channels, category filtering, low-stock event and order deep link; verify no PII leaks and fallback when delivery provider fails.

### C. UX/operational gates
1. **Exact approved-image visual comparison:** collect screenshots of the authenticated desktop screens **01–08** at original reference viewport, compare with approved mockups, document deltas, and obtain product-owner sign-off. This has **not** yet been completed.
2. Inspect mobile (390×844), tablet and desktop: keyboard traversal, focus states, no inaccessible dialogs, 200% zoom, screen-reader names and reduced-motion settings.
3. Use large seed (≥500 orders, ≥200 products, many support cases) to verify **server-side** pagination, search, sort, date periods and branch invalidation. Current screens may show an initial page only; never assert full-history correctness on incomplete pages.
4. Test API/worker/database downtime, object-store upload rejection, duplicate/out-of-order webhook replay, stale browser requests, role revocation and inter-branch navigation. Run under staging logging/monitoring with trace IDs.
5. Verify real sandbox credentials for **Daraja/M-PESA, card gateway, payout/disbursement, Mapbox, storage, FCM, email and SMS**. A `CONFIGURATION_PRESENT` flag is **not** a provider health check. Masked calling needs a voice proxy; KRA/eTIMS tax-invoicing needs a verified certified integration.

## Manual staged gate

Provision these GitHub environment variables/secrets (never commit them):

- Vars: `DEETOO_STAGING_API_URL` (**ending in `/api/v1`**), `DEETOO_STAGING_BRANCH_ID`, `DEETOO_STAGING_FOREIGN_BRANCH_ID`.
- Secrets: `DEETOO_STAGING_MERCHANT_TOKEN` (Owner), `DEETOO_STAGING_CUSTOMER_TOKEN`, `DEETOO_STAGING_RIDER_TOKEN`, `DEETOO_STAGING_ADMIN_TOKEN`.

Run **Actions → Merchant Staging Acceptance Gate → Run workflow**, or securely set the same env vars and run `pnpm test:merchant-staging`. The command is read-only, never prints token values, blocks on missing vars, requires an unauthorized foreign branch fixture, and uses HTTPS except for local testing. It **does not** create orders, charge cards or prove payout callbacks.

## Rollback and deployment

- Until approved, keep the feature branch separate from `main`.
- The prior Merchant UI remains available via `?merchant-legacy=1`; the approved design reference via `?merchant-prototype=1`. These are not a substitute for restoring server/data configuration.
- Treat additive migrations `035`–`038` as **forward-compatible**; do not drop tables on rollback if inventory holds/notifications/finance may reference them.
- Keep stock-hold expiry worker operating until pending holds are released/confirmed; monitor backlog and payment callbacks before switching workers.
- Don't enable production payout/refund/provider writes simply because builds pass. Capture operations sign-off, alerts, on-call plan, safe deployment sequence and database backup before cutover.

## Unreleased components preserved as approved

| Component | Current condition |
|---|---|
| Product images and Merchant logo | Approved image affordances retained; end-to-end verified media association for every Merchant actor remains a release check. |
| Live map/drag pin | Fields and GPS controls retained; configured tile/geocoder interaction not staging-certified. |
| Finance invoices | Settlement PDF explicitly states **NOT A TAX INVOICE**; KRA/eTIMS external dependency remains. |
| Upcoming payout date | Displays `Unconfirmed` unless the server has an authoritative schedule and provider result. |
| Masked phone call | Customer SMS relay uses order scope; verified masked voice vendor unavailable. |
| Merchant support resolution/internal notes | Staff-led closure retained; Merchant cannot write staff-private notes or force-close. |
| Rider pickup | Rider owns handover verification; Merchant-side control cannot directly set picked-up. |
| Device trust / deactivation | Trust does not bypass MFA; account lifecycle requires authorized review and identity safeguards. |

**Exit criteria:** All automated CI green **plus** staging multi-actor, real-provider, accessibility, pixel-parity, security and finance reconciliation evidence. Any blocked gate means **no production merge**. Do not describe Phase 4 as a full release approval until these are met.
