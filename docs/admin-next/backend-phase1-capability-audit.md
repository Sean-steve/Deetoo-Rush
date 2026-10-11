# DeeToo Rush — Admin Next Backend Integration: Phase 1 Read-only Audit

**Status:** Phase 1 source audit complete; **no DeeToo APIs connected**, no database migrations and no backend behavior changed. **Date:** 2026-10-11.  
**Audit branch:** `audit/admin-next-backend-phase1`, forked from the user-accepted 16-screen `feat/admin-next-design-first-phase4` at commit `32af9e498e83d7b21a59a948024f2decf19766c3`. Main branch is **not modified**.  
**Evidence scope:** repository source at audit branch. A registered route, service, migration or integration test is **not proof of a running production endpoint**, successfully applied migrations, provider credentials, or permission correctness in a deployed environment.

## Audit verdict and key rules

- **All 16 screens plus shared shell preserved.** Inventoried **157 distinct approved UI capabilities/interactions**: **87 R (route/service reusable)**, **48 E (extend/adapter needed)**, **16 N (new backend contract needed)**, **6 UI (no production API necessary)**. This is classification of engineering work, **not** an assertion that 87 features already function in Admin Next.
- **Production source of truth:** API/PostgreSQL + authoritative domain services. The `apps/admin-web-next/src/store.tsx` reducer/localStorage and `phase2Data.ts`, `phase3Data.ts`, `phase4Data.ts` are **fixture/demo only**, not financial/operational storage. Preserve them behind an explicit QA preview switch, and never merge demo records into live database state.
- **Strong contract mismatches:** real entities use UUIDs, statuses from `@deetoo/types`, county codes such as `047` for Nairobi, verified zone polygons, and integer **KES minor units** (e.g. 10000 minor = KES 100.00). Demo IDs like `DR78290`, demo monetary integer "KES" values, order payment shortcuts, rider earnings percentages and mock status enums are not backend-compatible by direct substitution.
- **Irreversible decisions remain server-owned:** no arbitrary order status mutation, rider-verified pickup bypass, support-party impersonation, synthetic paid payout, fabricated M-PESA success, admin MFA "toggle" that bypasses enrollment, or fake service-health mutation in production.
- **Authorization:** real roles are `super_admin`, `admin`, `ops`, `support`, `finance` plus participant roles; the prototype's `VIEWER` role and all `canAct()` checks are *not* security boundaries. Sensitive writes use current authenticated session and (when enabled) recent MFA. Backend per-route guards vary; do not infer that the simulated Super Admin/Operations rules are already equivalent.
- **Financial safety:** `calculate → approve (not the calculating actor) → submit disbursement → wait for signed/verified provider result → posted PAID`; refund `request → approval → provider outcome`; immutable double-entry ledger. Reject support/finance mock shortcuts that mark operations complete without service proof.
- **Geography safety:** county `enabled` only opens operating scope; delivery reach still requires actual active PostGIS service-zone polygons and serviceability checks. The approved schematic map must be replaced with GIS truth, not marketed as authoritative.

## Legend

| Code | Meaning |
|---|---|
| **R** | REUSE: existing suitable server route/service at code level |
| **E** | EXTEND: backend exists but DTO, policy, read model or UX contract is incomplete |
| **N** | NEW: necessary backend contract or store not identified |
| **UI** | UI-ONLY: preserve UX; no production API write should be introduced |

## Exhaustive approved-screen capability matrix

Each row identifies one visible component, screen workflow or shared contract. Endpoints are listed **relative to `/api/v1`**, unless noted as `/health` or described as a module/class. **E/N actions are implementation tasks for Phase 2—not already present.** See the JSON sidecar for a stable, machine-readable ID and exact mapping. 

### Shared shell — Shared shell

**Frontend evidence:** [`apps/admin-web-next/src/App.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/App.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-00-01 | Navigation and cross-screen links | **UI** | Client routes; preserve route IDs and deep-link context | No API required; typed route/query state replaces transient sessionStorage links. |
| ADM-00-02 | Admin authentication and profile | **E** | GET /auth/me; POST /auth/login; POST /auth/logout | Replace fake role selector with real cookie/token session; recover 401 and MFA step-up. |
| ADM-00-03 | Role selector and viewer mode | **E** | Roles and guards in auth.middleware.ts and @deetoo/types | Real backend roles: super_admin, admin, ops, support, finance; VIEWER is preview-only. |
| ADM-00-04 | Global search across entities | **R** | GET /operations/search | Map IDs and entity types; enforce redaction and role scopes. |
| ADM-00-05 | County selector and filter propagation | **E** | GET /admin/geography/counties; GET /admin/orders; GET /admin/riders | Use 3-digit code, URL-level filter propagation and supported county fields. |
| ADM-00-06 | Alert bell and unread count | **E** | GET /operations/incidents; GET /operations/support/cases; GET /operations/notifications | Build scoped aggregate/read model; outbound notification log != admin inbox. |
| ADM-00-07 | Live updates/invalidation | **R** | GET /realtime/stream; GET /realtime/events | Stream only invalidations; refetch authorized resources and retry on disconnect. |
| ADM-00-08 | Reset demo and simulated role / state controls | **UI** | No production mutation endpoint | Remove from live mode or keep behind explicit QA/demo flag; never reset real data. |
| ADM-00-09 | Loading, empty, errors and retry | **UI** | Request IDs + error middleware | Keep all accepted states; network abort, pagination and retry per resource. |
| ADM-00-10 | Money / dates / identifiers across all screens | **E** | @deetoo/types; @deetoo/api-client | Backend UUIDs, ISO dates, integer KES minor units and canonical enums; never use mock DR IDs or float totals. |

### Screen 01 — Operations Command Center

**Frontend evidence:** [`apps/admin-web-next/src/screens/command.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/command.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-01-01 | KPI cards: active, completed, delayed, riders | **R** | GET /operations/control-tower; GET /admin/dispatch/metrics; GET /admin/riders/metrics | Aggregate current authoritative operations. |
| ADM-01-02 | Financial summary and revenue KPI | **R** | GET /finance/ops/overview; GET /finance/profitability | Use captured financial state/ledger amounts, not order subtotal guesses. |
| ADM-01-03 | Live map and rider/order pins | **E** | GET /admin/dispatch/deliveries; GET /admin/riders; GET /realtime/stream | Add secure/map-ready live rider coordinates and provider tile/route support. |
| ADM-01-04 | Order volume/revenue graphs by period | **E** | GET /admin/orders; GET /finance/ops/overview | Historical time buckets, timezone and reconciliation-aware aggregates missing. |
| ADM-01-05 | Service/health summary | **E** | GET /health/ready; GET /operations/launch-readiness | Need per-service monitor aggregates; readiness is not fleet/service SLO. |
| ADM-01-06 | Top performing areas | **E** | GET /operations/supply; GET /admin/geography/zones | Add county/zone historical grouped reporting. |
| ADM-01-07 | Delayed deliveries with drill-down | **R** | GET /admin/dispatch/stuck; GET /admin/orders/:id | Respect delivery status vocabulary and risk/SLA evaluation. |
| ADM-01-08 | Incident and support previews | **R** | GET /operations/incidents; GET /operations/support/cases | Paginate/filter; show severity and queue counts. |

### Screen 02 — Live Dispatch & Tracking

**Frontend evidence:** [`apps/admin-web-next/src/screens/dispatch.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/dispatch.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-02-01 | Delivery queue/status/search/filters | **R** | GET /admin/dispatch/deliveries; GET /admin/dispatch/metrics | Use server pagination, allowed filter values and live event refetch. |
| ADM-02-02 | Selected delivery, order and addresses | **R** | GET /admin/dispatch/deliveries/:id; GET /operations/orders/unified/:id | Join canonical order ID and delivery ID. |
| ADM-02-03 | Eligible rider list / distance / availability | **R** | GET /admin/dispatch/deliveries/:id/eligible-riders; GET /admin/dispatch/deliveries/:id/candidates | Use server eligibility and availability, not mock proximity. |
| ADM-02-04 | Manual rider assignment / reassignment | **R** | POST /admin/dispatch/deliveries/:id/assign; POST /admin/dispatch/deliveries/:id/unassign | Reason, concurrency/idempotency and state-machine restrictions required. |
| ADM-02-05 | Trigger dispatch/scan stuck | **R** | POST /admin/dispatch/deliveries/:id/trigger; GET /admin/dispatch/stuck | Server must own workflow. |
| ADM-02-06 | Confirm operational milestone / force complete | **E** | POST /admin/dispatch/deliveries/:id/force-complete; rider delivery lifecycle endpoints | Do not expose arbitrary status updates; handover and proof-of-delivery guards. |
| ADM-02-07 | Map/satellite/routes/real-time rider positions | **E** | GET /rider/location is publish-only; GET /realtime/stream; maps provider | Real tiles/routing/provider, coordinate read authorization, stale-position handling. |
| ADM-02-08 | Escalate to incident and contact rider | **E** | GET /operations/incidents; POST /operations/support/cases | No general staffed incident-create route; build context-aware escalation, verified contact relay. |

### Screen 03 — Orders & Deliveries

**Frontend evidence:** [`apps/admin-web-next/src/screens/orders.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/orders.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-03-01 | Search/filter/sort/paginate/export list | **R** | GET /admin/orders; GET /operations/search | CSV/print can be client generated from scoped authorized data; check full export scope. |
| ADM-03-02 | Order timeline/status/line items | **R** | GET /admin/orders/:id; GET /operations/orders/unified/:id | Normalize server order and delivery timelines. |
| ADM-03-03 | Customer/merchant/rider details and navigation | **R** | GET /admin/customers/:id; GET /admin/merchants/:id; GET /admin/riders/:id | Only disclose permitted fields. |
| ADM-03-04 | Payment detail drill-down | **R** | GET /finance/ops/payments; GET /payments/order/:orderId | Never infer payment capture from order state. |
| ADM-03-05 | Assign/reassign courier | **R** | GET /admin/dispatch/deliveries; POST /admin/dispatch/deliveries/:id/assign | Resolve delivery ID associated with order before mutating. |
| ADM-03-06 | Cancel order with reason | **R** | POST /admin/orders/:id/cancel | Canonical allowed transitions, refund implications and audit evidence. |
| ADM-03-07 | General administrative status editing | **E** | POST /admin/dispatch/deliveries/:id/force-complete (restricted) | No general arbitrary order-status PATCH; preserve UI but enforce allowed domain commands. |
| ADM-03-08 | Internal order notes | **N** | No admin order-note endpoint located | Add audited order-note thread or link to support; preserve note composer. |
| ADM-03-09 | Support/communication actions | **E** | POST /operations/support/cases; participant notification service | Open scoped conversation; direct contact requires verified relay/consent. |

### Screen 04 — Riders & Fleet

**Frontend evidence:** [`apps/admin-web-next/src/screens/riders.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/riders.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-04-01 | Rider list/search/filters/metrics | **R** | GET /admin/riders; GET /admin/riders/metrics | Canonical availability/onboarding/approval states. |
| ADM-04-02 | Rider profile and details | **R** | GET /admin/riders/:id | Use user ID vs rider profile ID correctly. |
| ADM-04-03 | Rider create/onboard | **R** | POST /admin/governance/provision | Creates PENDING account; no instant activation or bypass onboarding. |
| ADM-04-04 | Approve/reject/suspend/reactivate | **R** | POST /admin/riders/:id/approve; /reject; /suspend; /reactivate | Include reason, audited guarded actions and real service-zone eligibility. |
| ADM-04-05 | Service zone assignment | **R** | POST /admin/riders/:id/zones | Server validated zones, not user-typed county names. |
| ADM-04-06 | Live track/last known location on map | **E** | POST /rider/location; GET /admin/riders/:id; GET /realtime/stream | Read-side live location, expiration and consent/scope verification. |
| ADM-04-07 | Vehicles and active assignments | **E** | GET /rider/vehicles; GET /admin/dispatch/deliveries | Add admin-safe vehicle roster and cross-reference by rider ID. |
| ADM-04-08 | Rider performance and earnings charts | **E** | GET /rider/performance; GET /trust/riders/:riderId/performance; GET /rider/earnings | Historical admin fleet analytics/period filters required. |
| ADM-04-09 | Export/new application forms | **E** | GET /admin/riders; POST /admin/governance/provision | CSV can be client side; provisioning requires phone/role/identity contracts. |

### Screen 05 — Incident Management

**Frontend evidence:** [`apps/admin-web-next/src/screens/incidents.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/incidents.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-05-01 | Incident dashboard, list, severity/type filters | **R** | GET /operations/overview; GET /operations/incidents | Server paginated incident records and counts. |
| ADM-05-02 | Incident detail, related entities | **R** | GET /operations/incidents/:id; GET /operations/orders/unified/:id | Canonical incident relations and incident timeline. |
| ADM-05-03 | Acknowledge/investigate/assign | **R** | POST /operations/incidents/:id/acknowledge; /investigate; /assign | Map accepted state changes to real workflow. |
| ADM-05-04 | Resolve/dismiss/reopen/escalate | **R** | POST /operations/incidents/:id/resolve; /dismiss; /reopen | Escalation may be severity/state-specific; no unrestricted status patch. |
| ADM-05-05 | Internal notes and timeline audit | **R** | POST /operations/incidents/:id/timeline | Role-gated note attribution. |
| ADM-05-06 | Manual Report Incident action | **N** | OperationalIncidentService.raiseIncident exists; POST /operations/incidents absent | Expose guarded creation with category, valid linked IDs and audit. |
| ADM-05-07 | Evidence/attachment display and upload | **E** | Media API exists; no incident-to-media association confirmed | Add scoped media references, signing/access policies and retention. |
| ADM-05-08 | Analytics resolution trends by category | **E** | GET /operations/incidents | Use server summaries or periodic aggregations for long time windows. |

### Screen 06 — Support & Conversations

**Frontend evidence:** [`apps/admin-web-next/src/screens/support.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/support.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-06-01 | Inbox filters, assignment and case detail | **R** | GET /operations/support/cases; GET /operations/support/cases/:id; POST .../:id/assign | Roles, pagination, priority, participant joins. |
| ADM-06-02 | Create case and link order/participant | **R** | POST /operations/support/cases | Resolve authoritative actor/party identities, not arbitrary free-text senders. |
| ADM-06-03 | Threaded participant messages | **R** | POST /support/cases/:id/messages; GET /operations/support/cases/:id | Never impersonate participants or manufacture responses. |
| ADM-06-04 | Private/internal notes | **R** | POST /operations/support/cases/:id/notes | Visibility scopes must not leak internal notes to participants. |
| ADM-06-05 | Attachments and signed download | **R** | GET /operations/support/cases/:id/attachments/:mediaId/read-url; media services | Upload association requires scoped media and storage readiness. |
| ADM-06-06 | Escalation/status/resolve | **R** | POST /operations/support/cases/:id/status; /resolve | Real statuses differ from demo; preserve full conversation. |
| ADM-06-07 | Participant accepts/disputes resolution | **R** | POST /support/cases/:id/resolution-response; POST /operations/support/cases/:id/finalize | Customer/merchant/rider must respond from own authenticated accounts. |
| ADM-06-08 | Admin exceptional force-close | **R** | POST /operations/support/cases/:id/force-close | Super Admin only with reason, visible audit and policy. |
| ADM-06-09 | Simulate participant reply button | **UI** | No live impersonation by design | Keep QA-preview-only; production requires real participant interaction. |
| ADM-06-10 | Support order/payment/rider context | **E** | GET /operations/orders/unified/:id; GET /operations/support/cases/:id | Add DTO joins and permission filtering where missing. |

### Screen 07 — Merchant Management

**Frontend evidence:** [`apps/admin-web-next/src/screens/merchants.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/merchants.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-07-01 | Merchant directory, status/filter/verification | **R** | GET /admin/merchants; GET /admin/merchants/:id | Map status vs approval_status and onboarding stage separately. |
| ADM-07-02 | Create merchant/provision owner | **R** | POST /admin/merchants; POST /admin/governance/provision | Choose controlled provisioning flow, no duplicate owner account. |
| ADM-07-03 | Approval/rejection/suspend/reactivate | **R** | POST /admin/merchants/:id/approve; /reject; /suspend; /reactivate | Require notes and real onboarding gates. |
| ADM-07-04 | Profile business/contact edit | **R** | PATCH /admin/merchants/:id | Super Admin authority for protected fields. |
| ADM-07-05 | Branch directory/create/edit/status | **R** | GET/POST /admin/merchants/:id/branches; PATCH /admin/branches/:id; POST .../suspend, /reactivate | Reconcile operational pause vs admin suspension state. |
| ADM-07-06 | KYC documents and manual verification | **R** | GET /admin/merchant-experience/documents; POST .../documents/:id/review | Preserve review state, media access, expiry and authorization. |
| ADM-07-07 | Merchant order/performance charts | **E** | GET /admin/orders; GET /finance/profitability; GET /merchant/experience/orders/metrics | Admin-scoped merchant historical read model and period filters. |
| ADM-07-08 | Merchant payouts and settlement tab | **R** | GET /finance/settlements; GET /finance/merchant/statement | Financial privacy/merchant scope; backend statuses and money minor units. |
| ADM-07-09 | Merchant branch zone assignments | **R** | POST /admin/branches/:branchId/service-zones | Polygon eligibility/hierarchy readiness. |
| ADM-07-10 | Administrative CSV exports/activity | **E** | GET /admin/merchants; GET /admin/audit; GET /admin/governance/events | Expose resource-scoped audit stream/export paging if needed. |

### Screen 08 — Customer Management

**Frontend evidence:** [`apps/admin-web-next/src/screens/customers.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/customers.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-08-01 | Directory/search/paging/detail | **R** | GET /admin/customers; GET /admin/customers/:id | Read server cursor/offset and sensitive DTOs. |
| ADM-08-02 | Customer registration/create | **R** | POST /admin/governance/provision (subject_type CUSTOMER) | Creates PENDING identity; requires activation/verification workflow. |
| ADM-08-03 | Correct customer name/email/phone | **R** | PATCH /admin/governance/users/:id | Audited Super Admin correction, prevent identifier conflicts. |
| ADM-08-04 | Restrict/suspend/reactivate/delete | **E** | POST /admin/governance/users/:id/deactivate; /reactivate | Backend PENDING/ACTIVE/SUSPENDED/DISABLED; no RESTRICTED or true DELETE contract. |
| ADM-08-05 | Address view / add / manage | **E** | GET /admin/customers/:id; /customer/addresses CRUD (self only) | Admin address mutation needs explicit audited authorization and location validation. |
| ADM-08-06 | Order history and spending | **R** | GET /admin/orders; GET /admin/orders/:id | Merchant/amount/source joins; avoid counting unpaid or refunded as spent. |
| ADM-08-07 | Support history/messages | **R** | GET /operations/support/cases (customer filter) | Deep-link real case IDs and redact other parties. |
| ADM-08-08 | Payment tab/refund history | **R** | GET /finance/ops/payments; GET /payments/admin/:id/refunds | Sensitive finance role restrictions; support display may need summary DTO. |
| ADM-08-09 | Notes and customer audit | **E** | GET /admin/governance/events; GET /admin/audit | Add customer-specific note management with author/visibility and retention. |
| ADM-08-10 | CSV import, export | **N** | Bulk admin import/provision API not found | Safe bulk invite, duplicate validation, dry run, per-record result, limits and audit. |

### Screen 09 — Geography & Service Coverage

**Frontend evidence:** [`apps/admin-web-next/src/screens/geography.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/geography.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-09-01 | 47 county list and operating toggles | **R** | GET /admin/geography/counties; PATCH /admin/geography/counties/:code | 3-digit codes, PostgreSQL-backed; enable does not guarantee delivery reach. |
| ADM-09-02 | County search/status/zone counts | **R** | GET /admin/geography/counties | Pagination optional; derived active polygon zone counts. |
| ADM-09-03 | Service markets and hierarchy | **R** | GET/POST /admin/geography/markets; PATCH /admin/geography/zones/:id/hierarchy | Market county code and zone UUID validation. |
| ADM-09-04 | Zones list/create/update/pause | **R** | GET /admin/service-zones; POST /admin/service-zones; PATCH /admin/service-zones/:id | PostGIS polygon boundaries and service status, not just point/area labels. |
| ADM-09-05 | County delivery base fee and ETA overrides | **E** | service_zones.config; /admin/geography/counties has enabled only | Define authoritative county/market/zone pricing and ETA precedence. |
| ADM-09-06 | Kenya polygon map drawing/editing | **E** | service_zones.boundary; GET /admin/geography/zones; maps.provider.ts | Production GIS boundary DTO plus mapping provider; no invented schematic as GIS truth. |
| ADM-09-07 | Readiness: nearby riders, merchants, active orders | **E** | GET /operations/supply; GET /operations/control-tower; GET /admin/orders | County-scoped aggregate and status accuracy. |
| ADM-09-08 | Impact warnings/history on disabling coverage | **E** | GET /admin/dispatch/deliveries; PATCH /admin/geography/counties/:code | Preflight impact for active orders and governed reason/audit history. |

### Screen 10 — Payments & Refunds

**Frontend evidence:** [`apps/admin-web-next/src/screens/payments.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/payments.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-10-01 | Payments list/filters/details/methods | **R** | GET /finance/ops/payments; GET /payments/admin/all; GET /payments/:id | Actual PaymentStatus and reconciliation state; provider event references. |
| ADM-10-02 | M-PESA/card lifecycle/exception audit | **R** | GET /finance/ops/payments; GET /finance/ops/reconciliation | Provider callback proof and idempotency are service-owned. |
| ADM-10-03 | Payment and order drill-down | **R** | GET /payments/order/:orderId; GET /finance/orders/:orderId | Use payment ID vs order ID distinctly. |
| ADM-10-04 | Refund creation/full and partial | **R** | POST /payments/admin/:id/refunds | amount_minor and reason_code with audited idempotency; this route creates real commands. |
| ADM-10-05 | Refund history | **R** | GET /payments/admin/:id/refunds | Map REQUESTED/APPROVED/SUCCEEDED/FAILED to UI; never assume immediate success. |
| ADM-10-06 | Refund approval | **R** | POST /payments/admin/refunds/:id/approve | Review separation and command/provider response, server role gate. |
| ADM-10-07 | Refund rejection with reason | **N** | No refund reject route/service identified | Add reject for eligible unapproved refunds, separate actor/audit guard. |
| ADM-10-08 | Per-payment reconciliation | **R** | POST /payments/admin/:id/reconcile; GET /finance/ops/reconciliation | Provider evidence requirements; do not blindly treat UI checkbox as settled. |
| ADM-10-09 | Exception resolution with custom note | **E** | GET /finance/ops/reconciliation; operations recovery routes | Need reviewer outcome/reason and durable case closure, no fake provider match. |
| ADM-10-10 | CSV export and refund/KPI graphs | **E** | GET /finance/ops/overview; GET /finance/ops/payments | Backend pagination/role-scoped export and grouped summaries. |

### Screen 11 — Settlements & Payouts

**Frontend evidence:** [`apps/admin-web-next/src/screens/settlements.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/settlements.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-11-01 | Merchant settlement list/detail | **R** | GET /finance/settlements; GET /finance/merchant/statement | Use canonical settlement lines/status and payout destination. |
| ADM-11-02 | Rider payout list/detail | **R** | GET /finance/payouts; GET /rider/earnings | Rider earnings and payouts are not a flat percentage of delivery fee. |
| ADM-11-03 | Create/calculation preview | **E** | POST /finance/settlements/calculate; POST /finance/payouts/calculate | Existing calculation is per merchant/rider and period, not global arbitrary-order batch. |
| ADM-11-04 | Approve merchant/rider payout | **R** | POST /finance/settlements/:id/approve; POST /finance/payouts/:id/approve | Self-approval blocked in services for calculated_by. |
| ADM-11-05 | Reject and release a draft batch | **N** | No finance settlement/payout reject routes identified | Guarded reject/cancel API must release reservations without duplicate payout. |
| ADM-11-06 | Initiate disbursement | **R** | POST /finance/settlements/:id/pay; POST /finance/payouts/:id/pay; GET /finance/disbursements/destinations | Destination verification, encryption and provider configured prerequisites. |
| ADM-11-07 | Paid/failed/processing state | **R** | GET /finance/disbursements; provider callback | Only provider success advances to PAID; never offer direct Mark Paid in live mode. |
| ADM-11-08 | Methodology: commission/rider rates/reserve | **E** | GET /finance/ops/commercial/commission-rules; /rider-earning-rules | Replace demo percentages with actual earning rules and ledger snapshots. |
| ADM-11-09 | Payout allocation and eligibility previews | **E** | GET /finance/ops/money-out/approval-queue; GET /finance/settlements | Add page/per-payee allocations with settled-order conflict detection. |
| ADM-11-10 | Payout CSV and audit | **E** | GET /finance/settlements; GET /finance/payouts; GET /finance/disbursements | Privacy, approved export and provider-reference masking. |

### Screen 12 — Financial Control Center

**Frontend evidence:** [`apps/admin-web-next/src/screens/financial.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/financial.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-12-01 | Ledger accounts and balances | **R** | GET /finance/accounts; GET /finance/accounts/:id/entries | Immutable double-entry accounts are authoritative. |
| ADM-12-02 | Journal entries and transaction inspector | **R** | GET /finance/transactions; GET /finance/ops/journal | Use debit/credit minor units, accounting direction and posted status. |
| ADM-12-03 | Financial KPI overview | **R** | GET /finance/ops/overview; GET /finance/profitability | Server-derived balances and liabilities. |
| ADM-12-04 | Settlement and refund reconciliation exceptions | **R** | GET /finance/ops/reconciliation; GET /finance/reconciliation/report | Use real audit evidence and provider financial state. |
| ADM-12-05 | Manual financial adjustments request/approve/reject | **R** | GET/POST /finance/adjustments; POST /finance/adjustments/:id/approve; /reject | Non-self approval and reason; preserve adjustment workflow as extra subview. |
| ADM-12-06 | Commission rule change | **R** | GET/POST /finance/ops/commercial/commission-rules | Effective periods; rate stored as fraction, not UI 15 numeric percent. |
| ADM-12-07 | Rider earning rules | **R** | GET/POST /finance/ops/commercial/rider-earning-rules | Backend rule is base/distance/wait/bonus, not demo delivery-fee share. |
| ADM-12-08 | Merchant reserve rate | **N** | No authoritative merchant reserve commercial-rule endpoint identified | Define reserve financial policy and ledger posting; no silent percentage simulation. |
| ADM-12-09 | Historical cashflow, performance charts | **E** | GET /finance/ops/overview; GET /finance/profitability | Date-series server aggregates and currencies, not synthetic bins. |
| ADM-12-10 | CSV export and audit | **E** | GET /finance/transactions; GET /admin/audit | Need complete paginated finance export, strict authorization. |

### Screen 13 — Analytics & Reports

**Frontend evidence:** [`apps/admin-web-next/src/screens/analytics.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/analytics.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-13-01 | Orders/deliveries/fleet/merchant KPIs | **R** | GET /operations/control-tower; GET /admin/riders/metrics; GET /admin/orders | Use consistent reporting dates and statuses. |
| ADM-13-02 | Revenue/refunds/payouts KPIs | **R** | GET /finance/ops/overview; GET /finance/profitability; GET /finance/ops/payments | No demo random ten-bin series in production. |
| ADM-13-03 | County/date/status filters and trend charts | **E** | GET /operations/supply; GET /finance/profitability | Historical time bucket query endpoints and server-side zone filtering. |
| ADM-13-04 | Merchant ranking and service quality | **E** | GET /admin/merchants; GET /finance/profitability; GET /trust/riders/:riderId/performance | Aggregate by branch, period, delivery and paid/refunded metrics. |
| ADM-13-05 | Cross-screen drilldown | **UI** | Reuse existing scoped detail APIs | Preserve IDs, filters and back navigation. |
| ADM-13-06 | CSV export | **E** | Existing paginated GET APIs | Dedicated export job/stream for large filtered periods and role-safe fields. |
| ADM-13-07 | Saved report definitions | **N** | No admin saved-report storage or CRUD route found | Add private report definitions with owner and shared scopes. |
| ADM-13-08 | Weekly/monthly automated report delivery | **N** | No admin report schedule/recipient pipeline found | Job scheduler, scoped signed exports, delivery preferences, retries. |

### Screen 14 — Notifications & Communications

**Frontend evidence:** [`apps/admin-web-next/src/screens/notifications.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/notifications.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-14-01 | Outbound notification register/status | **R** | GET /operations/notifications; POST /operations/notifications/:id/retry | This is provider delivery log, not a per-admin alert inbox. |
| ADM-14-02 | Admin notification inbox/read-unread/read all | **N** | Participant /support or /customer/support notification reads only | Add authenticated admin audience feed/read state, count and bulk read. |
| ADM-14-03 | Message template list/edit/create | **N** | NotificationService has renderDefaultSubject but no template CRUD | Add versioned templates, languages, safe variable substitution and approval. |
| ADM-14-04 | Compose customer/merchant/rider campaign | **N** | NotificationService.sendNotification is internal, no admin campaign API | Add campaigns/drafts, audience snapshots, opt-in/unsubscribe checks and preview. |
| ADM-14-05 | Audience count and segmentation | **E** | GET /admin/customers; GET /admin/merchants; GET /admin/riders | New privacy-aware server eligible-recipient count; not directory totals. |
| ADM-14-06 | Campaign approval/send/cancel | **N** | No campaign review/broadcast endpoint located | Dual-control where necessary, idempotent outbox, quotas/abuse guard and audit. |
| ADM-14-07 | Delivery analytics and receipts | **E** | GET /operations/notifications; outbound provider callbacks | Expose delivery receipts/rates grouped by campaign and provider. |
| ADM-14-08 | Operational alerts and deep links | **E** | GET /operations/incidents; GET /operations/support/cases; GET /operations/notifications | Generate per-user notifications from permitted entities, not global broadcast. |

### Screen 15 — Identity, Access & Security

**Frontend evidence:** [`apps/admin-web-next/src/screens/security.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/security.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-15-01 | Admin directory/detail/filter/status | **R** | GET /admin/users; GET /admin/users/:id | Filter role=staff on server and redact PII by role. |
| ADM-15-02 | Provision administrator (pending activation) | **R** | POST /admin/governance/provision (STAFF) | Creates PENDING staff account; not an actual email invitation. |
| ADM-15-03 | Send invite/activation/password setup | **N** | Governance returns requires_activation; no admin invite-delivery contract | Verified invitation lifecycle, expiry, token hashing, anti-account-enumeration. |
| ADM-15-04 | Role change | **R** | POST /admin/users/:id/roles | Super Admin only, server audited. |
| ADM-15-05 | Suspend/reactivate identity | **R** | POST /admin/users/:id/suspend; /reactivate; /admin/governance/users/:id/* | Use distinct authority for admin vs governance; block self/last Super Admin. |
| ADM-15-06 | Role/permission matrix display | **R** | @deetoo/auth ROLE_PERMISSIONS_MAP; GET /auth/me | Expose supported capability DTO/version, not frontend hardcoded grants. |
| ADM-15-07 | MFA self-enrollment/challenge | **R** | POST /auth/mfa/enroll; POST /auth/mfa/verify | Cannot enroll another admin on their behalf. |
| ADM-15-08 | Admin mandate or reset another user's MFA | **N** | No Super Admin MFA-policy/reset API located | Step-up, recovery policy, audit, cannot toggle an MFA flag directly. |
| ADM-15-09 | Own device/session inspect/revoke | **R** | GET /auth/sessions; POST /auth/sessions/:id/revoke; /revoke-all | Scoped to current user. |
| ADM-15-10 | Admin inspect/revoke another user's sessions | **N** | No admin cross-user session list/revoke endpoint found | Super Admin controlled with reason, invalidate refresh/access immediately. |
| ADM-15-11 | Last Super Admin protection and audit | **E** | GET /admin/users; GET /admin/audit; role/status write routes | Enforce invariant transactionally on backend, not only browser. |

### Screen 16 — System Health & Configuration

**Frontend evidence:** [`apps/admin-web-next/src/screens/system.tsx`](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/screens/system.tsx).

| ID | Component / workflow | Class | Existing source / endpoint | Gap / adapter requirement |
|---|---|:---:|---|---|
| ADM-16-01 | Basic health/readiness/DB/PostGIS/Redis checks | **R** | GET /health; GET /health/live; GET /health/ready | Show actual probe state, may return 503; health endpoints not full observability. |
| ADM-16-02 | Service dependency cards/latency/uptime history | **N** | No admin per-service time series/health aggregator located | Read-only observability gateway, redacted metrics with environment and freshness. |
| ADM-16-03 | Launch readiness gates | **R** | GET /operations/launch-readiness; PATCH /operations/launch-readiness/:gate | Restricted operational evidence and approval flow. |
| ADM-16-04 | Operational kill switches | **R** | GET /operations/kill-switches; POST /operations/kill-switches | Only supported keys, check active service enforcement and audit. |
| ADM-16-05 | Dispatch tuning/config | **R** | GET /admin/dispatch/config; PUT /admin/dispatch/config | Validate concurrency and safe bounds. |
| ADM-16-06 | Support SLA and numeric threshold settings | **E** | operations/sla.service.ts; dispatch config; operational_kill_switches | No unified, audited mutable settings contract for these exact UI keys. |
| ADM-16-07 | Maintenance/accept orders/support/notification toggles | **E** | GET/POST /operations/kill-switches; service config | Define exact supported switch keys and consumers; don't invent global switches. |
| ADM-16-08 | Actual service restart/health override | **UI** | No API should change measured health by fiat | Keep preview-only status simulator; real status from health probes, annotation via incident. |
| ADM-16-09 | Incident list and investigation drilldown | **R** | GET /operations/incidents; GET /operations/incidents/:id | Server-authoritative operational cases. |
| ADM-16-10 | Settings audit/config history | **E** | GET /admin/audit; GET /operations/launch-readiness; operational_kill_switches | Add filtering by switch, actor and time; include pre/post and reason. |

## High-confidence source anchors

- [API route mounts](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/index.ts#L39-L70)
- [Admin core endpoints and RBAC](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/admin/admin.router.ts#L63-L142)
- [Operations, incidents, support, notifications, kill switches](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/operations/operations.router.ts#L64-L122)
- [Finance operations and commercial rules](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/finance/finance-ops.router.ts#L82-L150)
- [Ledger, adjustments, settlements and payouts](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/finance/finance.router.ts#L73-L211)
- [Payment and refund workflows](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/payment/payment.router.ts#L289-L394)
- [County/market/zone endpoints](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/geography/geography.router.ts#L40-L219)
- [Health probes](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/health/health.router.ts#L15-L63)
- [Session APIs](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/auth/auth.router.ts#L190-L264)
- [MFA enforced on sensitive writes](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/auth/auth.middleware.ts#L120-L127)
- [Role inheritance and server guards](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/auth/auth.middleware.ts#L189-L214)
- [Settlement self-approval prohibition](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/finance/settlement.service.ts#L144-L163)
- [Rider payout self-approval prohibition](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/finance/rider-payout.service.ts#L139-L157)
- [Support party confirmation](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/operations/support.service.ts#L414-L531)
- [Actual disbursement / provider callback](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/finance/disbursement.service.ts#L67-L164)
- [County toggles require polygons](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/modules/geography/geography.router.ts#L81-L109)
- [Durable ledger schema](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/db/migrations/013_sprint_12_financial_ledger_and_settlements.sql#L7-L185)
- [Operational/support/notification storage](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/db/migrations/014_sprint_13_operations_support_notifications_risk.sql#L7-L203)
- [County/market and rules schema](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/api/src/db/migrations/032_phase2_finance_geography_controls.sql#L7-L140)
- [Existing Admin Next shared state](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/data.ts)
- [Mock role permissions](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/apps/admin-web-next/src/store.tsx)
- [Real RBAC code matrix](https://github.com/Sean-steve/Deetoo-Rush/blob/audit/admin-next-backend-phase1/packages/auth/src/rbac.ts#L84-L187)

## Phase 2 build backlog — ordered, without deleting UI

| Priority | Workstream | Implementation contract and acceptance |
|---|---|---|
| P0 | **AUTH/roles/session/MFA** | Replace simulated role selection with `/auth/me`, cookie/Bearer client, canonical permissions, negative RBAC tests, refresh and MFA; make privileged writes server-validated. |
| P0 | **Financial money and state integrity** | Canonical UUID, amount_minor, payment/refund status, ledger, provider callbacks, idempotency, concurrency guards and no self-approval. |
| P0 | **Order, delivery, rider authority** | Scope dispatch eligibility; pickup/OTP/proofs; no general status mutation; constrain client action menus. |
| P0 | **Support case participant satisfaction** | Multi-party confirmations from actual customer/merchant/rider auth; do not let admin forge party responses. |
| P0 | **Cross-entity privacy/audit** | Least privilege for customer/merchant/rider data, scoped filtering, reason audit, signed media, secret redaction. |
| P0 | **Migrations/storage/provider readiness** | Read deployed migration status, PostgreSQL/PostGIS/Redis health, worker/outbox, Daraja/card/disbursement/map/media and notification configuration in staging. |
| P1 | **Incident manual creation and notes** | Add admin create route backed by OperationalIncidentService.raiseIncident, structured manual order notes and signed incident evidence association. |
| P1 | **Customer governed extra actions** | Add audited address mutation, account restriction policy compatible with real statuses, customer note system, CSV import dry-run/idempotency. |
| P1 | **Finance review completion** | Implement refund rejection, settlement/payout draft rejection and durable exception resolution with ownership, review status and audit. |
| P1 | **Reporting read models** | Introduce server-side date/zone series, ranking and accepted KPI definitions; saved report definitions and export pagination. |
| P1 | **Communications and audience** | Admin inbox + read state, templates, campaign draft/review/approval/send, consent-safe segments, delivery receipts and retry/deduped outbox. |
| P1 | **Security admin operations** | Admin-controlled session listing/revocation with step-up, invite activation delivery and MFA policy/recovery; guard last active Super Admin transactionally. |
| P1 | **Geography rule precedence and safe toggle** | Polygon-aware county/market/zone serviceability, county fee/ETA overrides and impact preflight. |
| P2 | **Observability and system configuration** | Read-only component health/SLO history and supported immutable-audited flags; never expose false health overrides. |
| P2 | **Performance and export polish** | Complete large-dataset pagination, report downloads, accessible loading/empty/error states, real-time invalidation and permission-aware links. |

### Suggested contract endpoints to be designed in Phase 2 (not existing)

The following are **proposed**, not asserted routes. Reuse the existing services and migrations where possible, and avoid parallel finance tables: 

- `POST /admin/operations/incidents` — Manual operational incident create, related IDs, reason, audit.
- `POST /admin/orders/:id/notes; GET /admin/orders/:id/notes` — Scoped internal order notes with visibility and pagination.
- `POST /admin/incidents/:id/attachments` — Media link to incident, verified owner and signed access.
- `POST /admin/customers/:id/addresses; PATCH/DELETE /admin/customers/:id/addresses/:addressId` — Audited address intervention separate from self-service.
- `POST /admin/customers/import/validate; POST /admin/customers/import` — Dry-run bulk provisioning with row-level outcome and deduplication.
- `POST /payments/admin/refunds/:id/reject` — Reasoned pending refund rejection and financial hold release.
- `POST /finance/settlements/:id/reject; POST /finance/payouts/:id/reject` — Draft release/rejection guarded by financial reviewer.
- `POST /finance/ops/reconciliation/exceptions/:id/resolve` — Investigation closure without fabricating provider settlement.
- `GET /admin/analytics/series; GET /admin/analytics/top-entities` — Scoped historical aggregate reporting by county/time/status.
- `GET/POST /admin/reports; GET/PATCH/DELETE /admin/reports/:id` — Saved report definitions and ownership; schedule execution separate.
- `GET/PATCH /admin/notifications; POST /admin/notifications/read-all` — Staff-scoped attention inbox distinct from outbound notifications.
- `GET/POST/PATCH /admin/communications/templates; POST /admin/communications/campaigns; POST /admin/communications/campaigns/:id/approve` — Template, consent-aware audience, preview and governed send orchestration.
- `POST /admin/governance/invitations; POST /admin/governance/invitations/:id/revoke` — Staff invitation activation lifecycle without plaintext credentials.
- `GET /admin/security/users/:id/sessions; POST /admin/security/sessions/:id/revoke` — Cross-user session administration with reason/MFA, no token leaks.
- `POST /admin/security/users/:id/mfa-reset` — Secure verified MFA recovery, not an enabled boolean patch.
- `GET /admin/observability/services; GET /admin/observability/series` — Sanitized measured dependency, latency, SLO data.
- `GET/PATCH /admin/configuration` — Typed operational flag registry with preflight/audit, not arbitrary string switches.

## Integration contract & acceptance gates for Phases 2–5

**Phase 2 (implement missing backend):** add only the required incremental schema/contracts and harden extensions listed E/N. Reuse current order, support, payout, ledger and security services; no parallel truth tables. Run migration/authorization/unit/integration tests. On this phase do not replace the agreed 16-screen frontend.

**Phase 3 (connect approved frontend):** build a typed `admin-next` gateway/adapter, replace demo reducers with fetching/mutation hooks and domain DTO normalization, compose existing and new APIs per screen. Preserve every approved tab, card, chart, modal, empty/loading/error/confirmation and navigation. Use feature flags for unreleased external capabilities; show explicit actionable errors rather than fake success. Preserve preview mode only as a separate QA option.

**Phase 4 (cross-application wiring):** verify Admin interventions become visible to actual Customer, Merchant and Rider screens with correct scopes and real-time invalidations: merchant onboarding/branches, customer account/addresses, dispatched rider, order lifecycle/OTP, support messages/confirmations, refunds, merchant/rider earnings and messages. No party impersonation.

**Phase 5 (end-to-end acceptance):** run real PostgreSQL/PostGIS/Redis migrations + contract tests; browser journeys across all four clients with seeded sandbox identities; role-negative tests (anonymous, support, ops, finance, admin, super_admin, wrong-tenant), MFA freshness; concurrency/idempotency, failed providers and payout callback replay; paginated high-volume screen loads; mobile/responsive, accessibility, browser screenshot parity and release rollback checks. No claim of production readiness without configured provider and deployment evidence.

### Data/DTO reconciliation checklist

- **Order**: actual UUID + order/status + delivery UUID + payment UUID, lifecycle history, rider ID vs user ID, customer ID vs display name.
- **Money**: integer KES minor units; percentages as backend fractional decimal/basis points; explicit fee/tax/delivery split; immutable ledger and refunds.
- **Geography**: county `code` vs display name; PostGIS polygon, zone/market UUID and active flags; serviceability authoritative.
- **Communications**: participant-scoped notifications vs outbound delivery log vs bulk campaign are **different entities**.
- **Support**: internal notes vs participant-visible messages, signed attachments, required per-party confirmations and high-rank force-close.
- **Auth**: session-backed role list and permission server guards, staff provisioning PENDING and MFA step-up, no preview `VIEWER` assumption.
- **Health**: measured provider/backend readiness vs editable deployment/configuration flags; display 503 dependency state without claiming outage.

### Static audit limitations

This phase reviewed source routes, business services, schema migrations, RBAC and all 16 approved Admin Next screens. It did **not** deploy APIs, run migrations, test real credentials, exercise payment/disbursement providers, inspect staging logs or execute fresh integration tests. Confidence is high about **declared code contracts** and lower about live operational readiness. Before implementing Phase 2, verify staging schema migrations through 038, role/MFA configuration, external provider connectivity, app base URLs and internal media storage.

**Deliverables:** [machine-readable matrix](backend-phase1-capability-matrix.json) (all 157 rows), this report, and approved Phase 2 backlog. **Not delivered:** endpoint implementations, DB migrations, API wiring, mergers to main, design changes.
