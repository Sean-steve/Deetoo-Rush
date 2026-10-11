# DeeToo Rush — Admin Next Backend Integration Phase 2 Implementation

**Branch:** `feat/admin-next-backend-phase2`, based on the [Phase 1 audit](backend-phase1-capability-audit.md).  
**Frontend:** all 16 user-approved Admin Next screens remain **unchanged and still frontend-only**. The backend is deliberately **not connected** to those screens until Phase 3.
**Basis:** static implementation plus GitHub CI; production environment, credentials and provider delivery are **not verified**.

## What was implemented

| Backend capability | Route (relative to `/api/v1`) | Safety requirements |
|---|---|---|
| Manual operational incident create | `POST /admin/operations/incidents` | Reuses `OperationalIncidentService.raiseIncident`, status deduplication and existing event handling; ops/admin, reason/valid IDs. |
| Internal order notes | `GET/POST /admin/orders/:id/notes` | Real order foreign key, author/created timestamps, scoped staff rights, immutable audit. |
| Internal customer notes | `GET/POST /admin/customers/:id/notes` | Sensitive note creation is Super Admin only; immutable author audit. |
| Governed customer addresses | `POST /admin/customers/:id/addresses`, `PATCH/DELETE /admin/customers/:id/addresses/:addressId` | Customer ownership, geo validation, soft-delete, single-default transaction, Super Admin reason audit. |
| Bulk customer onboarding | `POST /admin/customers/import/validate`, `POST /admin/customers/import` | Up to 100 rows, duplicate email checks, per-row rollback, existing `GovernanceService.provision` creates **PENDING** users, partial-result report. No activation email is claimed. |
| Cross-account sessions | `GET /admin/security/users/:id/sessions`, `POST /admin/security/sessions/:id/revoke` | Super Admin only, no refresh-token hashes, direct DB session revocation and reason audit. |
| Privileged roster continuity | Existing `/admin/users/:id/roles`, `/admin/users/:id/suspend`, `/admin/governance/users/:id/deactivate` | Lock + transaction guard prevents losing last ACTIVE Super Admin; prevent self suspension/deactivation. |
| Refund rejection | `POST /finance/ops/refunds/:id/reject` | Only REQUESTED, not requester, row lock, CANCELLED reservation, refund timeline, no provider command. |
| Merchant settlement draft rejection | `POST /finance/ops/settlements/:id/reject` | DRAFT/CALCULATED only; neither APPROVED nor provider PROCESSING; checker not maker. |
| Rider payout draft rejection | `POST /finance/ops/payouts/:id/reject` | DRAFT only; locked earning rows, release RESERVED earnings to ELIGIBLE, atomic audit. |
| Investigate reconciliation exception | `POST /finance/ops/reconciliation/exceptions/:id/resolve` | Tracks INVESTIGATED/ESCALATED; disallows fake PROVIDER_VERIFIED. Existing provider-backed reconcile API remains required. |
| Report definitions | `GET/POST /admin/reports`, `PATCH/DELETE /admin/reports/:id` | Per-user, max 100, strict filters, persisted cadence preference only. No scheduled email job yet. |
| Analytics series/ranking | `GET /admin/analytics/series`, `GET /admin/analytics/top-merchants` | PostgreSQL UTC-aware date limits and Africa/Nairobi buckets; money in captured minor units and clearly labeled completed GMV. |
| Admin operational inbox | `GET /admin/notifications`, `POST /admin/notifications/read-all`, `POST /admin/notifications/:type/:id/read` | Incident/support source IDs, private per-user read state, separate from outbound delivery logs. |
| Communication templates | `GET/POST /admin/communications/templates`, `PATCH /admin/communications/templates/:id` | Reviewed author/edit history, updates to drafts only, staff restrictions. |
| Communication campaigns | `GET/POST /admin/communications/campaigns`, `POST /admin/communications/campaigns/:id/approve`, `POST /admin/communications/campaigns/:id/cancel` | DRAFT → APPROVED, different Super Admin reviewer, cancellation before queueing, reason audit. |
| Campaign audience preview | `GET /admin/communications/audience-preview` | Raw active-population **estimate**, not a consent-based send count. |
| Campaign send gate | `POST /admin/communications/campaigns/:id/send` | **Explicit 409** `CAMPAIGN_DELIVERY_NOT_READY`; no silent success / unconsented blast. |
| Verified dependency readiness | `GET /admin/observability/dependencies` | Live DB/PostGIS/Redis readiness, as measured; no fictional uptime. |
| Historical telemetry gate | `GET /admin/observability/series` | Explicit 503 until a real metrics source is configured. |
| Supported operational switches | `GET /admin/configuration`, `PATCH /admin/configuration/kill-switches/:key` | Allowlist only existing `auto_dispatch_paused`, `zone_paused_all`, `payment_mpesa_paused`, `live_tracking_paused`; Super Admin only to write with audit. Unsupported flags remain visible as unsupported. |
| County change impact | `GET /admin/geography/counties/:code/impact` | Counts active orders/deliveries and real polygon-backed zones; no claim that enabling a county automatically creates service reach. |

All new durable tables are in additive migration **`039_admin_next_backend_capabilities.sql`**: notes, reports, communication templates/campaigns and unique recipients, Admin notification read receipts, cross-cutting action audit, configuration metadata. Existing `ledger_*`, `payments`, `refunds`, `orders`, `deliveries`, `merchant_settlements` and `rider_payouts` remain the system of record.

### What intentionally remains incomplete / must not be represented as active

These are **backend gaps still open after this Phase 2 iteration** and must be addressed before any claim that all approved Admin features work against real services:

1. **Campaign delivery**: consent/subscription enrollment, durable audience snapshot, unsubscribe, rate limits, verified outbound provider credentials, deduplicated fan-out worker, delivery receipts, marketing permission enforcement, bounce handling. All external sending stays blocked.
2. **Scheduled report distribution**: actual scheduler, recipient/destination authorization, job audit and delivery worker. The saved cadence currently stores a preference only.
3. **Staff invitation activation**: true invitation token issuance/delivery/expiry and account activation; provisioning is PENDING only, not an email.
4. **Administrative MFA recovery/mandatory policy**: no fake enabled-boolean toggle. Requires identity verification, step-up, audit and real cryptographic enrollment flow.
5. **Historical service observability**: real per-service uptime/latency/incident history from a metrics system. Only current DB/PostGIS/Redis probes are functional.
6. **Platform configuration flags not yet consumed** (support intake, notification delivery, maintenance, SLA target): cannot show as controlling production until services enforce them. Supported legacy kill switches are exposed instead.
7. **Geographic pricing/ETA precedence and provider map boundaries**: existing service zone config and PostGIS boundaries need canonical policy resolution and actual map provider configuration.
8. **Incident evidence associations, structured administrative export jobs and full role-scoped history aggregates** need additional contracts/tests.
9. **Full negative-role/state/concurrency contract tests** and staging API checks for all new routes should precede Phase 3 feature enablement.
10. **No production rollout**: migrations and configuration must be checked on staging/production independently of source checks.

### Testing & API contract policy

- New endpoint inventory is registered in `openapi/openapi.yaml` and `scripts/openapi-coverage-check.ts`.
- New `tests/integration/admin-next-phase2-contract.test.ts` confirms the router capability inventory and anonymous denial for every newly registered endpoint.
- Full GitHub CI includes typecheck/lint, OpenAPI validation/coverage, existing payment/delivery and marketplace regressions, PostGIS/Redis and migration tests.
- CI success validates integration-level regressions in the test environment, **not** real Daraja/card payouts, real messaging provider setup, production MFA or UI/backend wiring.
- The approved frontend's dummy `DemoState` must stay separate from live API data. Phase 3 creates typed adapters for UUIDs, KES minor units, canonical status enums and serviceability polygon IDs.

## Suggested integration handoff order (Phase 3)

1. Real auth, roles/MFA/session errors and global Admin API request client.
2. Orders, dispatch, riders, incident lifecycle and support-participant confirmations.
3. Merchant and customer details/governance including notes, addresses and importing.
4. Geography and system configuration; preflight/safe mutations.
5. Payments, refunds, settlement calculation, approval, provider-backed paid state and ledger.
6. Analytics and report definitions.
7. Internal admin alerts, campaigns/communication templates; **disable actual Send UI** behind actionable readiness state until consent + provider workflow is implemented.
8. Four-party cross-application E2E acceptance (later Phase 4/5).

**No approved visual components are removed.** Controls with missing high-risk capabilities remain visible but communicate the exact reason for unavailability. This phase does **not** connect the new Admin frontend.
