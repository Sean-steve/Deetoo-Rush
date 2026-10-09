# DeeToo Merchant — Four Executable Backend Integration Phases

**Baseline:** Eight Merchant screens approved and implemented as an isolated frontend prototype on `feat/merchant-frontend-flow-phase1`. Integration branch `feat/merchant-backend-integration` starts from this approved frontend, not from a superseded visual-redesign branch. **No component may be removed due to missing backend support.**

**Companion audit:** [Phase 1 component-to-backend map](backend-integration-phase1-audit.md). Revisit both Phase 1 and Phase 2 frontend flow maps for every modal, tab, chart, filter, table and permission-related button before declaring a screen done.

## Phase 1 — Audit, traceability, permission baseline (**EXECUTED**)

**Goal:** classify every control in all eight approved screens as **REUSE, EXTEND, NEW or UI-only**, identify routes/migrations and security ownership, propose missing contracts, and create the implementation backlog.

**Executable checklist**
- [x] Create isolated integration branch from approved eight-screen prototype.
- [x] Inspect existing merchant, order, catalogue, finance, auth, media, maps, notification, support/trust, realtime and device routers/services.
- [x] Inspect key PostgreSQL migrations and cross-app authorization boundaries.
- [x] Map all eight approved screens to existing and missing contracts (see companion audit, 8 screen tables).
- [x] Explicitly record finance reconciliation rules, pickup authority, admin-led support closure, media/provider configuration and existing feature reuse.
- [x] Publish Phase 2–4 implementation plan and acceptance criteria.
- [ ] **Runtime baseline**, intentionally deferred until a runnable service/environment is provided: migrated schema inspection, current environment provider readiness, database role tests, and browser-vs-design screenshot comparison.
- [ ] User approval to start Phase 2 (request explicitly; do not auto-merge).

**Deliverables:** auditable documents and branch only. **No SQL or API endpoint creation in this phase.**

## Phase 2 — Implement missing backend capabilities (server first)

**Goal:** reuse existing services; fill missing contracts through guarded, reversible migrations and typed endpoints while the isolated prototype remains visually unchanged.

**Delivery slices, recommended order**

**2A — Integrity and rights before feature exposure.** Permission tests and fixes for merchant/branch ownership, team membership and invitation role hierarchy; ensure paid-order visibility; rider-authoritative pickup handover; support proposed-resolution confirmation and internal-note visibility; safe media reference authorization. Add specific deny-path integration tests before frontend binding.

**2B — Merchant operational contracts.** Extend branch-scoped order history/search/date/sort and kitchen analytics; inventory stock events and threshold notifications; branch services/fulfillment/order-rule flags; merchant-safe image/document association and review records; menu/category search/indexes as needed. Keep existing catalogue and modifier CRUD; **do not rewrite**.

**2C — Merchant finance/reporting.** Add ledger-derived merchant-only overview/daily chart/payment-method mix/transaction ledger/settlement lines/fee breakdown/payout schedule/report exports and invoices using existing ledger, commission and disbursement services; verify provider callback truth. **Never add a second ledger or permit merchant writes to financial posting.**

**2D — Account and experience contracts.** Login audit and trusted-auth-device workflow, MFA management/recovery/password change, appropriately governed deactivation; notification category/pagination/preferences/bulk read/dismiss; support article CMS, verified help contact details and event delivery; production maps provider (feature-flagged, credentials needed); global search and entity deep links.

**Phase 2 acceptance**
- [ ] Every implemented route and migration is listed against an exact screenshot control and accepted permission matrix.
- [ ] Written access policies per contract, with owner/manager/staff, different merchant/branch, unauthenticated, admin/support/rider and escalation-negative tests.
- [ ] Tables introduced only where absent; additive migrations with safe defaults and rollback/verification instructions; no alterations to previously applied migration scripts.
- [ ] Finance aggregation reconciles to double-entry ledger and settlement math in KES minor units; refunds and partial settlements tested.
- [ ] External provider integrations support explicit unavailable/sandbox states, not fake success.
- [ ] Contract tests green in memory and PostgreSQL modes where relevant; no regression in Customer/Rider/Admin flows.
- [ ] Exact **created/modified** endpoints, tables, workers, schemas and tests published in a Phase 2 report.

**No frontend mock values may be misrepresented as production after Phase 2.** This phase builds server capabilities; integration comes next.

## Phase 3 — Bind the approved eight-screen frontend to authorized backend contracts

**Goal:** replace isolated mock-data handlers with authenticated API calls without changing approved screen structures, layouts or removing any control. Implement adapters in the Merchant client; reuse shared fetch, auth, RBAC and realtime patterns.

**Screen integration order**
1. **01 Kitchen:** scoped order feed, realtime invalidation, accept/decline/prep/ready and pickup verification state; authenticated customer relay; filters/timers.
2. **02 Menu:** catalogue/modifiers, effective branch availability, images/inventory and CRUD.
3. **05 Branch:** profile/branch picker, store status, opening hours, rules/fulfillment, location and media.
4. **04 Business & team:** profile, verification documents, branch/team/roles/invitations.
5. **06 Security:** session list/revoke, login history, trusted auth devices, MFA, password and account actions.
6. **07 Notifications:** typed inbox/filters, read and preferences, context-specific deep links.
7. **08 Support:** case queue/conversations/attachments, article/support contacts and staff-led resolution confirmation.
8. **03 Finance:** accurate KPIs, trends, payment methods, commission and payout scheduling, transactions/reports/invoices.

**Interaction rules**
- Render *loading, empty, loaded, saving, success, recoverable failure, forbidden and unconfigured-provider* states for **every actionable component**.
- For role-restricted controls, preserve their design and show a permission explanation or workflow request path; **do not remove them**.
- Never display fabricated revenue, paid status, OTP or customer identity; use server values or honest unavailable state.
- Prevent stale request races on branch change and avoid cross-tenant caches; refetch on invalidation.
- All state mutations use backend commands with idempotent/retry-safe behavior; frontend is not authoritative.
- No support internal notes for merchant, no merchant-direct rider pickup spoof, no merchant commission changes.

**Phase 3 acceptance**
- [ ] Each row in the audit links to a component file, API route, role and a passing interaction test.
- [ ] All eight screens operate against API fixtures and a seeded PostgreSQL environment.
- [ ] No mock handlers remain on the integrated route; optional offline demos explicitly labeled as demos and separate.
- [ ] Visual non-regression for all approved desktop screens plus tablet/mobile behavior.
- [ ] No shared Customer/Rider/Admin runtime breakage.

## Phase 4 — Cross-app acceptance, hardening and merge decision

**Goal:** prove an end-to-end merchant experience that works across Customers, Admin, Merchant, Rider, Finance and Operations before approval to merge.

**Acceptance scenarios**
1. Branch onboarding → approval → opening hours/location/services → menu/category/modifiers/images → customer discovery.
2. Customer order + verified payment → Merchant notification → accept/decline with reasons → preparing/ready → Rider assigned and verified pickup → delivery → completed history.
3. Commission contract → ledger posting → M-PESA/card/cash breakdown → transaction drilldown → refund/adjustment effects → settlement approval → provider disbursement callback → merchant payout view/export.
4. Merchant Owner invites Manager/Staff → membership acceptance → branch access changes → blocked unauthorized actions and no escalation.
5. Device/login lifecycle: sessions, revoke-all, trusted device, 2FA and password update including step-up and audit.
6. Notification preferences, push inbox persistence, read/dismiss/delivery fallback and deep links.
7. Support case with evidence → admin investigation/internal notes → proposal → merchant satisfied/disputed response → admin close, plus trust dispute.
8. Provider failures (M-PESA, email/SMS, maps, storage, queue, payment callback), permission revocation while open, duplicate/out-of-order events, stale browser requests, large catalogues/queues, mobile access, accessibility and performance.

**Release gates**
- [ ] CI TypeScript/lint/unit/integration/Playwright, PostgreSQL migration test, RBAC abuse suite, finance conservation and idempotency checks green.
- [ ] Actual provider readiness checklist and fallback handling verified in staging; no secrets in repository.
- [ ] Pixel comparison and UX sign-off for all eight screenshots; all controls accounted for; no silent deletion.
- [ ] Rollout/rollback steps, observability/dashboard alerts, operations runbooks and seeded demo account behavior documented.
- [ ] Final inventory of **reused vs extended vs newly created** components/API/schema/workers and any remaining dependencies published.
- [ ] User approves merge; only then merge into `main`. Keep the approved prototype/reference docs available for regression.

## Reporting convention for every subsequent phase

Each phase must publish a repository artifact with these columns:

`screen → component → status (reuse/extend/new/UI) → source route/schema → created/modified code → permissions → test evidence → remaining dependency`.

Explicitly distinguish **present in repository** vs **tested against PostgreSQL** vs **provider configured** vs **end-to-end verified**. "Implemented" never means only a rendered button.
