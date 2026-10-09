# DeeToo Merchant — Phase 1 Backend Capability Audit and Approved-Screen Contract Map

**Audit state:** Phase 1 completed as a **static repository/code-and-schema audit** on 2026-10-09. **No backend feature was built in Phase 1.** Actual deployment credentials, enabled providers, PostgreSQL state, seed data and API behavior against a running service are **not verified**. Future phases must run contract, permission, migration and UI integration tests before claiming functionality works in production.

**Branch:** `feat/merchant-backend-integration`, forked from the approved eight-screen frontend branch `feat/merchant-frontend-flow-phase1`. **Neither branch is merged into main.** The existing prototype is activated by `?merchant-prototype=1`, uses illustrative data/local state, and is **not an integrated Merchant client**.

**Authoritative frontend inventory:** [Screens 01–04](frontend-first-phase1-screen-flow-map.md) and [Screens 05–08](frontend-first-phase2-screen-flow-map.md). **Policy: no approved screen, visual control, tab, action, form, modal or state may be removed because a backend contract is absent.** A present backend route is not equivalent to a connected frontend component.

## Legend, audit methodology and conventions

- **R — REUSE:** appropriate server route/service/schema already exists. Phase 3 still must connect it, validate response shape, permission and behavior.
- **E — EXTEND:** relevant foundation exists but the approved component requires more fields, a safer policy, provider setup, reporting, or a missing endpoint.
- **N — NEW:** no suitable endpoint/data model found in the inspected backend; implement a secure, scoped contract.
- **UI** means the approved control remains a frontend interaction; may not need a new backend endpoint.
- All endpoints below use the **`/api/v1` prefix** as mounted by `apps/api/src/app.ts` and `apps/api/src/modules/index.ts`.
- Proposed routes, tables and tests are **design proposals**, not claims of implementation. Schema additions will be incremental migrations (`035+`), not changes to already-applied migrations.
- Monetary values are **integer KES minor units**; stored/derived ledger state is authoritative. Financial graphs cannot use sample numbers or synthesize payouts. API errors and unconfigured providers must be explicit.
- Core security: server-side RBAC + scoped merchant/branch access, safe DTOs, audit trail, idempotency for commands, and verified media ownership; never rely only on hidden/disabled client controls.

## What already exists in the codebase (verified at source level)

| System | Existing evidence | Practical limit |
|---|---|---|
| Auth/session/roles | `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/sessions`, `/auth/sessions/:id/revoke`, `/auth/sessions/revoke-all`, password-forgot/reset, `/auth/mfa/enroll`, `/auth/mfa/verify`; `auth.router.ts`, `auth/mfa.ts`, migrations `003`, `018` | No merchant login-history list, trusted-device lifecycle, 2FA disable/recovery workflow, authenticated change-password contract or calculated security score identified. |
| Branches/store | `/merchant/profile` GET/PATCH, `/merchant/branches` GET/POST, `/merchant/branches/:id` GET/PATCH, `/status` POST, `/opening-hours` GET/PUT, `/availability` GET; `merchant.router.ts`, migrations `001`, `004` | Existing status enum is OPEN/CLOSED/BUSY/TEMPORARILY_UNAVAILABLE, not literally Open/Paused/Closed. Additional branch service rules and image associations require review. |
| Merchant order work | `/merchant/orders` GET, `/:id` GET, `/:id/accept`, `/reject`, `/preparing`, `/ready`, `/cancel`, `/:id/pickup-status`; `merchant-orders.router.ts`; paid-order guard and branch scopes | Existing queue uses status/limit; no full history/date/search/sort/analytics DTO found. Merchant cannot issue rider-authorized pickup confirmation. |
| Realtime | `/realtime/stream`, `/realtime/events`, branch- and merchant-scoped channels; `realtime.router.ts` | Events are **invalidation hints**; clients refetch scoped REST data. They deliberately omit sensitive customer/order/payment payloads. |
| Catalogue | `/merchant/menus`, categories, items, item availability, modifier groups/options/associations, branch catalogue/overrides, sort/reorder; `catalogue.router.ts`; migration `005` | Modifiers **do exist**. Inventory/low-stock quantity, category artwork and robust SKU/search indexing require expansion. |
| Media | `/media/uploads`, `/media/uploads/:id/complete`, `/media/:id/read-url`; `MERCHANT_IMAGE` and `SUPPORT_ATTACHMENT` purposes; `media.router.ts`, `media.service.ts`, migration `028` | Requires configured private object store. Merchant image ↔ product/branch/business profile attachment, document purpose, upload moderation and ownership-scoping need work. `/merchant/upload-image` is URL persistence, not a complete signed upload. |
| Finance/settlements | `/finance/merchant/statement`, `/finance/settlements`, `/finance/ops/commercial/merchant-rate`, `/finance/ops/commercial/review-requests` POST; double-entry ledger, merchant settlements/lines, commission rules, payout destinations/disbursement; migrations `013`, `029`, `032` | Merchant statement exposes payable balance, commission rate and settlements, **not** the exact transaction-level, per-day, per-method analytics/next payout/invoice/export contracts required by mockup. Admin/Finance transaction and payout endpoints must **not** be exposed to merchants. |
| Team/access | `/merchant/team`, invitation create/accept, membership patch/revoke; `merchant.router.ts`, `merchant.service.ts`, invitations schema migration `004` | Role inheritance exists. Display names/documents/verified badges and granular role editor require work. Verify owner-only mutations on every endpoint. |
| Notifications | `/support/notifications` GET and `/support/notifications/:id/read` POST; durable `notifications` table, notification worker and FCM/email/SMS provider integrations; `operations.router.ts`, `notification.service.ts`, `external-notification.provider.ts`, migration `014` | No merchant preference center/bulk read/dismiss/paginated typed inbox API found; deployment provider setup unverified. |
| Support and disputes | Participant `/support/cases`, `/support/cases/:id`, messages, attachment read URLs, resolution response; `/trust/disputes` + evidence; staff operations support assign/status/resolve and Super Admin force-close; migrations `014`, `031`, `033`, `034` | A support **conversation backend already exists**. No help knowledge-base or official call-support directory API found. Merchant's proposed-resolution acceptance is not unilateral Admin closure. Internal notes remain staff-only. |
| Maps/geography | `/maps/geocode`, `/maps/reverse-geocode`, `/maps/autocomplete`; serviceability, zones and counties; `maps.provider.ts`, geography routers, migrations `002`, `032` | Current geocoder is explicitly **simulation-mode with Nairobi presets**, not live geocoding/tile/pin editing. A production provider integration is needed. |
| Device push registration | `/devices/register`, `/devices/unregister` and `device_registrations`; `device.router.ts`, migration `028` | A push token registry is **not** a trusted-authentication-device registry. |

## Full approved component-to-backend map

Screen numbering follows the eight reference images exactly. Every grouped item references concrete controls. A section can mix R/E/N controls; do not simplify a mixed group to "supported."

### Screen 01 — Kitchen Orders

| Component and exact interaction | Status | Existing contract / Phase 2 build requirement |
|---|---|---|
| Live new/preparing/ready summary cards and stage counts | **R/E** | `GET /merchant/orders?branch_id&status&limit`; derive counts from server-authoritative queue; add scope-safe aggregate endpoint for all states at scale. |
| Avg preparation time and percentage comparison | **N** | `GET /merchant/analytics/operations?branch_id&from&to` (proposal); order-status timeline metrics; explicit timezone and denominator. |
| All/New/Preparing/Ready/Completed tabs | **R/E** | Existing order status filtering; add **historical completed/picked-up feed**, paginated cursor, state mapping. |
| Today date picker, Oldest first selector | **E** | Add date interval, deterministic sort and cursor; avoid client-only filters on partial server pages. |
| Global search by order ID/customer | **E** | Merchant-scoped `/merchant/orders/search` or extended existing list filters; mask customer data, prevent cross-branch enumeration. |
| Four-lane board, timers, overdue badge and empty states | **R/E/UI** | Order timestamps/status, pickup status, SLA targets; realtime invalidation via branch channel; client timer is presentation only. |
| Order card ID, customer, phone icon, items, prices, special instructions | **R/E** | `GET /merchant/orders/:id`; assess fields/redaction; **contact customer** requires masked call/message relay and permissions. |
| Decline + reason modal | **R** | `POST /merchant/orders/:id/reject` with validated reason_code/note, authorized transitions and audit. |
| Accept & set preparation minutes modal | **R** | `POST /merchant/orders/:id/accept` with `preparation_minutes`; show canonical response, errors and idempotency. |
| Move Preparing, Mark ready | **R** | `POST /merchant/orders/:id/preparing`, `/ready`; stage actions tied to backend state machine. |
| Rider assigned/name, pickup target, handover code | **R/E** | `GET /merchant/orders/:id/pickup-status` / delivery status; safe rider identity, no protected OTP in public push events. |
| **Mark as picked up** visible action | **E** | Keep button; replace prototype's unilateral completion with **rider-authorized handover confirmation** flow (request/check/verify state; server decides). Do not let Merchant spoof rider pickup. |
| Store open/paused/closed pill and adjust hours | **R/E** | Branch status endpoint + hours; paused UI maps to approved operational enum via explicit business semantics. |

### Screen 02 — Menu & Availability

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| Total items, categories, visible and unavailable KPIs | **R/E** | Menu/category/item/branch-catalogue APIs; compute **effective branch availability** including overrides, not base item flag alone. |
| All/Available/Unavailable, category selector/counts, search, Filter, sort A–Z | **R/E/UI** | Catalogue endpoints already exist; add server filter/pagination/indexes if size demands, category + branch scope; filter state is UI. |
| Category grid/list and food-card images | **R/E** | `menu_items.image_url`, signed `MERCHANT_IMAGE` upload; add secure association/media URL and category thumbnail if desired. |
| Each food-card name, description, price, availability toggle, overflow | **R** | Item CRUD, availability patch, branch override; preserve prices in currency minor units and permission checks. |
| Add/edit/delete food item dialogs | **R** | `POST /merchant/menus/:menuId/items`, `PATCH/DELETE /merchant/items/:id`; careful menu selection and validation. |
| Category Add/Edit/Delete/reorder | **R** | Category CRUD/reorder endpoints already exist; finish front-end nested flows. |
| Modifiers & Add-ons editor, group options and item links | **R** | Modifier CRUD/options/association endpoints already exist; **do not build duplicates**; implement full dialog and list UI in Phase 3. |
| Item inventory, low-stock notifications, sold-out quantity threshold | **N** | Proposed `merchant_item_stock`/stock movements or per-branch inventory tables, role-bound `/merchant/inventory` APIs, atomic stock reservation/decrement & event-outbox triggers. |
| Product SKU and dynamic search | **E** | Validate DTO and index searchable SKU/name/category; robust branch-scoped query. |

### Screen 03 — Finance & Settlements

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| Total revenue, commissions, merchant payout, completed orders and growth comparisons | **E** | `GET /finance/merchant/statement` + ledger/payment/order summaries; propose `GET /finance/merchant/overview?from&to&branch_id` with correct period snapshots. |
| Daily earnings line chart and comparison legend | **N/E** | Dated order/ledger aggregation with verified captured orders, returns, refunds and timezone; **not** sum of unrelated settlement batches. |
| M-PESA/card/cash doughnut chart | **N/E** | Merchant-authorized payment-method attribution/read model including partial refunds; card/M-PESA provider records exist but no Merchant read DTO. |
| Commission breakdown, processing fees and payout amount | **E** | Existing commission rules and settlement_lines; propose transparent fee/effective-rule read DTO reconciled to ledger. Mockup calculations may be inconsistent; backend is authoritative. |
| Upcoming settlement date/estimated amount/destination | **E** | Merchant settlement status, schedule, disbursement attempts/destinations; expose **read-only merchant scope** (currently destination endpoint Admin/Finance only). Never invent a payout date. |
| Recent settlement list/details/download | **E** | `GET /finance/settlements`; add merchant-scoped detail/line view and signed report export. |
| Transactions tab: date, order ID, customer, amount, method, status, actions, search, date/status/payment filters | **N/E** | `GET /finance/merchant/transactions` + `/:id` (proposals). Reuse immutable ledger/payment tables; do **not** reuse admin-only `GET /finance/transactions` as-is. |
| Settlements/Payouts/Invoices tabs and row drilldown | **E/N** | Settlement batches exist; merchant-view payout detail requires read-only projection; invoices need policy/schema and invoice/report generation. |
| Export CSV/PDF | **N** | Authorized reporting job/document endpoint, statement format, redacted fields, signed download, audit. |
| Commercial commission review | **R** | `GET /finance/ops/commercial/merchant-rate` and `POST /finance/ops/commercial/review-requests`; merchant cannot change commission. |

### Screen 04 — Business & Team

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| Business profile legal/display name/description, edit profile | **R/E** | `GET/PATCH /merchant/profile`; legal-field policy, approved metadata and verified display data. |
| Business image/camera icon | **E** | Private `MERCHANT_IMAGE` upload exists, merchants `logo_url` exists; secure attachment, preview and optional storefront image metadata. |
| Business type/address/phone/country/email | **R/E** | Merchant + branch DTOs; separate legal profile from branch contact data. Do not write branch values into legal profile accidentally. |
| Business documents: registration, KRA, food handling, verified/pending badges, Add document and row menu | **N/E** | Media objects + onboarding stage exist; missing merchant-document typed metadata, review/verification records, expiry/status and scoped upload/read APIs. |
| Team members, roles, branches, pending invitation cards | **R** | `GET /merchant/team` includes `members` **and pending `invitations`**; branch list GET, expiration metadata. |
| Member avatar/name/email/phone, status, list and role/branch/status/search filters | **R/E** | `/merchant/team`; enrich safe member display DTO/name/phone and query for scale; do not invent identities. |
| Invite user form, role + branch access, Pending status and expiry | **R** | `POST /merchant/team/invitations`, `/accept`; actual invitation expiration present (7 days). |
| Member overflow: edit role/branch and revoke | **R/E** | `PATCH /merchant/team/memberships/:id`, `POST /revoke`; **verify owner-only authorization and self/last-owner safeguards**; do not grant an unverified privilege path. |
| Roles & permissions cards and **Manage roles** | **E/N** | Static role hierarchy/RBAC exists (`packages/auth/src/rbac.ts`); granular merchant custom roles/permission editing need policy, tables and management API if approved. |
| Branch count/view profile/location | **R/E** | Branch list/details already exists; proper navigation or profile details frontend. |

### Screen 05 — Branch Settings

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| General name/contact/address/latitude/longitude/prep default/min order + Save | **R/E** | `GET/PATCH /merchant/branches/:id`, `merchant_branches`; confirm fields and schema for display name/description separate from merchant. |
| Branch operational status segmented Open/Paused/Closed | **R/E** | `POST /merchant/branches/:id/status`; map `PAUSED` to sanctioned `TEMPORARILY_UNAVAILABLE` or product-approved enum; reason/audit and live order gating. |
| Operating hours weekday switches and individual open/close pickers | **R** | `GET/PUT /merchant/branches/:id/opening-hours`, `branch_opening_hours`; business hours intervals/timezone. |
| Real map, use current location, update location and draggable pin | **E/N** | Browser GPS UI; persisted branch coordinates exist, `/maps/*` only simulation-mode; live provider/tile/geocoding plus signed key/config and boundary checks needed. |
| Preparation minutes and minimum basket | **R** | Existing branch fields `prep_default_min` and `min_order_minor` (minor units; UI Ksh needs conversion). |
| Dine-in/pickup, delivery, QR table service toggles | **N/E** | Service zones/order model exist; add explicit per-branch fulfillment capability flags, ordering eligibility rules; QR tables/orders require new contracts. |
| Branch cover image upload/display | **E** | `MERCHANT_IMAGE` signed upload exists; add branch cover media relation/public-safe CDN projection and management validation. |
| Seven section tabs incl Ordering rules and Advanced | **UI/N** | Section navigation is frontend; advanced concurrent-order limits/ordering rules need persisted branch policies and audit. |
| Multi-branch selector and new branch action | **R** | `GET/POST /merchant/branches`, scoped branch membership and onboarding permissions. |

### Screen 06 — Security & Sessions

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| Active sessions count, OS/browser/IP/current device, individual sign out | **R** | `GET /auth/sessions`, `POST /auth/sessions/:id/revoke` (current flag, device_info, IP/time), no implicit device trust. |
| Sign out of all sessions / confirmation | **R** | `POST /auth/sessions/revoke-all`; sign out frontend and invalidate tokens. |
| Login history table / View all / failures / details / last login | **E/N** | `users.last_login_at` and `audit_logs` exist, but no merchant-scoped security activity read DTO found; add `GET /auth/security/login-history` with successful/failed audit events. |
| Trusted devices count, trust/untrust list | **N** | `device_registrations` is **push token registry**, not auth trust; propose `user_trusted_auth_devices` and revocation/attestation endpoint. |
| Password change modal | **E** | Forgot/reset password flows exist, but no authenticated current-password change endpoint found; implement with current credential/MFA check, session revocation and notification. |
| Two-factor setup/status/toggle | **E** | MFA credential and enroll/verify routes exist; add `GET /auth/mfa/status`, disable/recovery/re-auth flow (and enforce MFA on sensitive operations). |
| Security strength bar | **N/E** | Defensible derived protection signals; never fabricate "Strong" based solely on static UI. |
| Account deactivate/reactivate | **E** | User status and governance audit exist; add scoped, step-up protected account lifecycle request/approval safeguards; risk to active orders/merchant ownership. |

### Screen 07 — Notifications Center

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| Sidebar bell unread badge, list and detail | **R/E** | `GET /support/notifications` supplies 50 most recent across recipient identities, read state, template code, payload; add cursor and typed reference metadata as needed. |
| Category counts, filter Orders/Payments/Payouts/Menu/Business/System/Support, sort, time filters, Read/Unread | **E** | Persisted notification records exist; add deterministic server category taxonomy, aggregates, pagination, filtering/query bounds. |
| Per-message Mark as read | **R** | `POST /support/notifications/:id/read`, scoped to recipient; preserve idempotency. |
| Mark all as read and dismiss/ellipsis | **N/E** | Bulk read and archive/dismiss with scoped batch auth, transaction/idempotency and pagination. |
| Notification preferences: email, push, sound | **N/E** | Push device registration and notification channels exist; add merchant preference records and preference APIs, honoring mandatory/security events. |
| Order detail/customer contact/map/Mark as preparing from notification | **E** | Use linked ID to refetch authorized order and state; no raw sensitive notification payload; transitions via order commands; contact relay/map authorization needed. |
| Push/email/SMS notifications | **E** | Provider integration code for FCM, Resend and SMS exists; environment credentials, delivery status and device registration must be verified. |
| Low-stock alert | **N** | Requires inventory events/thresholds from Screen 02. |

### Screen 08 — Support & Help Center

| Component / interaction | Status | Existing contract / required extension |
|---|---|---|
| All/Open/In progress/Awaiting reply/Resolved cards and case list/search/status tabs | **R/E** | `GET /support/cases` with participant scopes; add typed status aggregates/paging/merchant-friendly mapped states if needed. |
| Case detail, chat history, sender avatars, created time/status/category | **R** | `GET /support/cases/:id`, notes and participation visibility; frontend must separate visible/public from internal staff notes. |
| Start conversation, select category/type/subject/optional order ID/evidence | **R/E** | `POST /support/cases`, `POST /trust/disputes`; validate customer/order merchant scope and link media evidence. |
| Reply/send message, status updates, attachment chips | **R** | `POST /support/cases/:id/messages`, `/media/uploads`, complete, `/support/cases/:id/attachments/:mediaId/read-url`. |
| **Mark as resolved** and satisfaction confirmation | **R/E** | Keep visual control; participant uses `POST /support/cases/:id/resolution-response` after staff-proposed resolution. Staff `/operations/support/cases/:id/resolve`, Super Admin force-close. Do **not** let merchant force-close. |
| **Add internal note** tab | **UI / staff-only** | Retain visible affordance; merchant sees permission explanation/no submit; internal notes only `POST /operations/support/cases/:id/notes` with staff auth. |
| Ellipsis/case details/evidence download | **R/E** | Case detail/read-url exists; add optional timeline, subscriptions, escalation and better note pagination. |
| Help articles and FAQ search | **N** | Add versioned public/merchant-scoped help knowledge-base tables, CMS authoring and read/search APIs; ensure no security-sensitive leakage. |
| Call support | **N/E** | Verified support directory/contact-hours configuration and phone/relay link, never invent a help number. |
| Real-time replies, assignment and SLA | **E** | Durable support service already exists; add scoped event notifications and SLA/read-model for participant UX. |

## Cross-cutting scope, security and correctness findings requiring first action

1. **Do not conflate frontend prototype state with backend support.** None of these eight prototype screens calls the live Merchant API yet. Server coverage R/E/N above is a static audit only.
2. **P0 authorization check before integration:** `merchant.router.ts` team subrouter uses `merchantScope(..., true)` (owner-only) for membership changes; `inviteStaff` also has hierarchy checks. Verify all paths with tests for staff/manager/owner, cross-merchant IDs and last owner, including `PATCH`/revoke. No permission shortcut in integration.
3. **P0 financial privacy:** `/finance/transactions` and ledger APIs have Admin/Finance guards; `/finance/merchant/statement` is owner/manager-scoped. New merchant finance read models must check membership and merchant/branch scope at **SQL and service levels**; no reuse of unrestricted operator projections.
4. **P0 handover integrity:** Merchant accepts/prepares/readies. Delivery/rider controls actual pickup. Prototype's "Mark as picked up" must initiate rider-verified handover (with non-spoofable state and re-fetch) rather than directly update an order status.
5. **P0 support authority:** Staff proposes; parties accept/dispute; Super Admin force-close is exceptional and audited. No merchant unilateral final close; no internal-note write.
6. **P0 provider safety:** `maps.provider.ts` explicitly calls `requireSimulationMode()`; production interactive maps require new provider implementation. Signed private media requires object-store config and reference ownership. Authentication device trust ≠ push token registration.
7. **Money and identity:** avoid floats/double-counted settlement periods, false "payment succeeded" states, payout dates without destination confirmation, unsanitized uploads, and fabricating real customer identities/phone numbers.
8. **Deployment gate:** verify actual PostgreSQL migration inventory and deployment/environment settings. Code-level presence does not prove migrated tables, active worker, configured credential or provider availability.

## Phase 2 build contracts (proposed; not implemented)

| ID | Proposed additions / reuse | Tables or modifications | Ownership and acceptance |
|---|---|---|---|
| B-01 | `GET /merchant/orders` date/status/search/page/sort + scoped operation aggregates | indexes/materialized read query as warranted | Branch membership; verified paid orders only; cursor repeatability; no cross-branch data |
| B-02 | `GET /merchant/analytics/operations` | status history projections | Authentic preparation/SLA metrics, count denominator and period |
| B-03 | Rider-verified pickup request + status mapping, contact relay | pickup handover audit linkage | Rider/dispatch authoritative; negative permission and OTP leakage tests |
| B-04 | Inventory resources, movements, threshold events | **new** item stock/stock-movement tables with branch/item keys | Idempotent stock mutation; no oversell and notification replays |
| B-05 | Private media association for business, branch, item, documents | media linkage/merchant_document records (types, review, expiry) | Signed URLs, admin verification, object storage config |
| B-06 | Merchant-safe finance overview, daily series, method split, tx detail/filter, settlement detail, payouts/invoices/exports | ledger projections + report/invoice metadata as needed; no parallel ledger | Ledger-reconciled KES minor amounts; Admin/Finance-only writes |
| B-07 | Branch service/order rules and production mapping adapter | branch fulfillment/rules + table/QR entities when approved | Server-validated enable flags, counties/zones and live provider config |
| B-08 | Login security history, trusted device CRUD, MFA status/disable/recovery, password change, deactivation requests | auth event/trusted device/recovery and lifecycle audit | MFA step-up, session invalidation, privacy and abuse controls |
| B-09 | Typed paginated notification feed, preference center, bulk read/dismiss | notification preference and archive metadata | Scoped identities/channels, outbox events, delivery fallback |
| B-10 | Help CMS and merchant support directory; conversation event enrichment | help article/version and contact config | Verified numbers, staff-owned content, participant-safe events |
| B-11 | Role matrix/invitation/member view enhancements | optional merchant custom role/permission tables after role policy review | Owner/manager hierarchy, no self-escalation, audit |
| B-12 | Global merchant search & deep links | query service/read models only | Merchant/branch scope and field redaction |

**External integrations requiring configuration review (not invented as connected):** payment gateways (Daraja/card), M-PESA payout provider/bank gateway, maps/tile geocoding, private S3-compatible bucket/CDN, FCM for push, Resend/email and SMS provider. All should fail visibly until real sandbox or production configuration is verified.

## Phase 1 deliverables — created vs not created

**Created now:** `feat/merchant-backend-integration` branch, this audit, and the [four-phase execution plan](backend-integration-four-phase-plan.md). The approved eight-screen prototype is inherited from its parent branch **unchanged**.

**Not created in Phase 1:** SQL migrations, missing API endpoints, production integration adapters, frontend API bindings, or provider credentials. Those are implementation work for Phases 2–4; claiming they exist now would be misleading.

**Required acceptance evidence for Phase 2–4:** migration up/down or verification, authorization tests across Merchant Owner/Manager/Staff, branch isolation, finance invariants, order/rider transition tests, support privacy/consent tests, media access checks, component-by-component browser flows, load/error/empty states and visual non-regression at approved viewport(s).
