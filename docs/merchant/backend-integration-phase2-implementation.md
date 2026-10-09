# Merchant Phase 2 — Backend Implementation Record

**Branch:** `feat/merchant-backend-integration` (from approved frontend).  
**Boundary:** Server-side development only; approved eight-screen preview is not API-bound. Phase 3 is required to replace demo data and wire all actions. No merge to main.

## Created database migrations

- `035_merchant_experience_capabilities.sql`: `merchant_item_inventory`, `merchant_inventory_movements`, `merchant_branch_policies`, `merchant_document_records`, `merchant_notification_preferences`, `merchant_help_articles`, `merchant_support_contacts`, `user_trusted_auth_devices`, `user_security_events`, `merchant_deactivation_requests`, and notification archive metadata.
- `036_merchant_notification_viewer_state.sql`: `merchant_notification_views` with per-user read/archive state. Important: merchant-wide notifications must not be globally marked read because one staff member clicked a button.
- An overlapping draft `035_merchant_notification_preferences.sql` was **removed** before completion to avoid duplicate schema contracts.

## New backend modules and live route definitions

All routes have the standard `/api/v1` prefix.

| Approved screen | New module | Routes / functionality created |
|---|---|---|
| 01/07 Contact customer | `merchant/merchant-contact.router.ts` | `GET /merchant/experience/orders/:orderId/contact`, `POST .../contact/message`: paid-order branch-scope messaging via existing SMS notification worker; no phone number exposed, 10 messages/hour per order, honest queued status, SMS provider required. |
| 01 Kitchen | `merchant/merchant-experience.router.ts` | `GET /merchant/experience/orders/history` (scoped, date/status/search/sort/page); `GET /merchant/experience/orders/metrics` (paid-order stage and average prep metrics). |
| 02 Menu | `merchant/merchant-inventory.router.ts` | `GET /merchant/experience/branches/:branchId/inventory`; `POST .../inventory/:itemId/adjust` (transactional/idempotent stock movement, nonnegative stock); `PUT .../inventory/:itemId/threshold`; low-stock notification insertion. Existing catalogue/modifier routes unchanged. |
| 03 Finance | `finance/merchant-finance-read.router.ts` | `GET /finance/merchant/experience/overview` (period, totals, daily series, payment method split, settlements/commission, payout destination); `GET .../transactions`; `GET .../settlements/:settlementId`; `GET .../export/transactions.csv`. Merchant Owner/Manager only. Existing ledger and commission services reused. |
| 04 Business | `merchant/merchant-experience.router.ts` and Admin router | `GET/POST /merchant/experience/documents`; staff-only `GET /admin/merchant-experience/documents`, `POST .../documents/:id/review`. Signed media upload purpose extended to `MERCHANT_DOCUMENT`. |
| 05 Branch | `merchant/merchant-experience.router.ts` | `GET/PUT /merchant/experience/branches/:branchId/policies`: delivery/pickup/dine-in/table QR capability toggles, max concurrent order setting, verified cover media link. Existing profile/status/hours API remains canonical. |
| 06 Security | `auth/merchant-security.router.ts` | `GET /auth/security/mfa/status`, `POST .../mfa/disable`, `POST .../password/change`, `GET .../login-history`, `GET .../trusted-devices`, `POST .../trusted-devices/current`, `DELETE .../trusted-devices/:id`, `POST .../deactivation-request`. Informational trusted devices do NOT bypass MFA. |
| 07 Notifications | `operations/merchant-inbox.router.ts` | `GET /merchant/inbox` typed/filtred paged feed; `POST /merchant/inbox/read-all`; `POST /merchant/inbox/:id/read`; `POST /merchant/inbox/:id/dismiss`; `GET/PUT /merchant/inbox/preferences`. Per-user state; do not globally clear merchant-shared notifications. |
| 08 Support | Merchant + Admin experience routers | `GET /merchant/experience/help/articles`, `GET .../help/contact`, staff-only article editing `PUT /admin/merchant-experience/help/articles/:slug`, contact directory `PUT .../help/contacts/:code`. Existing case discussion and staff-led resolution untouched. |

Delivery and capacity rules are **now evaluated server-side** in `merchant.service.ts` for the existing delivery availability engine. Optional `MAPBOX_ACCESS_TOKEN` switches geocoding/reverse/autocomplete from explicitly simulated presets to a real provider; tile-rendering remains a frontend/external task.

Cross-cutting: route registration in `apps/api/src/modules/index.ts`; media purpose/scope updates; map provider changes; existing Merchant and Admin route reuse; OpenAPI additions and coverage script updates.

## Existing services intentionally reused / NOT rewritten

- Merchant order status and rider handover authority: `merchant-orders.router.ts`, paid-order guard, rider delivery lifecycle. No merchant-side pickup spoof action added.
- Menu CRUD, category/item/modifier groups/options and branch availability.
- Branch create/GET/PATCH/status/opening hours.
- Merchant profile/team invitations and membership RBAC.
- Double-entry ledger, merchant settlement batches/lines, commission rules and payment/disbursement infrastructure.
- Session list/revocation and MFA enrollment/verification.
- Signed media storage, persistent support case conversations and proposed-resolution response; internal case notes remain staff-only.
- Notifications/outbox and merchant/rider-scoped realtime invalidation channels.

## Remaining dependencies and **not yet fully implemented**

This is a **backend capability slice**, not a claim of 100% fulfillment of every frontend component:

1. **Business/device security:** no independently verified complete login-failure attribution, 2FA recovery codes, native attestation, account reactivation pipeline, or defensible security-strength model. Trusted devices are explicitly informational.
2. **Kitchen/rider:** masked *voice calling* (queued SMS messaging exists), rider-authorized handover request/approval UI contract, stage-specific overdue SLA rules and dashboard growth comparisons remain to be completed or verified. Existing rider pickup workflow remains authoritative.
3. **Inventory:** new manual stock adjustments and threshold alerts do not yet prove automatic stock decrement/reservation against concurrent customer checkout; do not label this "stock-safe ordering" before cross-app tests.
4. **Finance:** merchant CSV exists; tax-compliant invoices, PDF rendering, historical comparative growth, confirmed future payout scheduling and full refund-aware reconciliation of every new projection need further validation. Upcoming settlement deliberately reports *unconfirmed* where no authoritative schedule exists.
5. **Merchant roles:** granular custom role editor is not implemented; existing owner/manager/staff hierarchy remains. Granular invitation, owner self-revocation and last-owner security should be verified with tests.
6. **Map/providers:** integration requires production map/tile credentials and live provider selection. Notification preferences are **persisted but not yet applied to merchant-wide push/email fan-out**; FCM/SMS/email/private bucket/payment gateway settings must be validated in staging, not inferred from provider code.
7. **Support:** KB editor/contact directory contracts exist but verified help content/contact info must be provisioned. End-to-end attachment upload, realtime reply notifications and merchant resolution UI binding are Phase 3/4 work.
8. **Frontend:** all approved screens are still isolated local demo UX. No claim of backend connectivity or end-to-end visual acceptance until Phase 3.
9. **Runtime:** PostgreSQL migration/authorization CI alone does not prove every new SQL query executes successfully with seeded real orders, invoices, payouts, authentication providers or third-party integrations. Add per-route PostgreSQL integration tests before release.

## Verification

- CI includes lint/typecheck/test/build; independent browser acceptance; PostgreSQL migration/authorization/outbox; CodeQL. See branch latest Actions run for exact status and logs.
- New negative-route guard tests in `tests/integration/merchant-phase2-guards.test.ts` cover authentication/role errors and explicit 503 for unsupported memory-mode writes.
- Treat new PostgreSQL route happy paths as **needing further seeded runtime acceptance**. Do not assert full production validation from the presence of a handler.

## Decision and next phase

Phase 3: connect approved Merchant components to the existing plus new server contracts, preserve every component, add loading/empty/error/unconfigured states and actor-aware disabled actions; implement/deepen missing nested interactions without fabrication. Phase 4: prove cross-app order/payment/stock/pickup/settlement/support chains in real PostgreSQL and configured provider sandbox. Do **not** merge until the owner approves.
