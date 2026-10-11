# DeeToo Rush Admin — Phase 4: Cross-Application Integration

**Scope:** integrate the approved Admin Next workflows with existing Customer, Merchant and Rider domain services through the authoritative DeeToo API.  
**Branch:** `feat/admin-next-backend-phase4` stacked on `feat/admin-next-backend-phase3`.  
**UI:** Preserve the approved 16-screen visual system and original Demo mode. No alternative Admin interface or local fallback is created.

## Implemented: cross-party workflow bindings

| Admin action | Authoritative service and data | Other-party impact / safety |
|---|---|---|
| Provision rider | `POST /admin/governance/provision` with RIDER, name, activation email, phone and vehicle | New identity is **PENDING**, rider onboarding profile **DRAFT**, and rider app must activate/verify documents before dispatch |
| Review rider | `POST /admin/riders/:id/{approve,reject,suspend,reactivate}` | Actual rider eligibility is enforced by dispatch; no simulated status assignment |
| Provision merchant/owner | Governance MERCHANT subject, owner identity, registered legal and display names, email and phone | Creates owner + merchant requiring **activation/KYC**, no instant merchant activation |
| Admin merchant corrections | `PATCH /admin/merchants/:id` with supervised reason | Real business profile correction via Super Admin governance/audit |
| Add merchant branch | `POST /admin/merchants/:id/branches` with street address and manually verified Kenya latitude/longitude | Backend automatically checks service zones; starts operationally **CLOSED** until merchant opens |
| Change branch operational availability | `POST /admin/branches/:branchId/{suspend,reactivate}` | Merchant and order eligibility come from backend; Admin cannot fabricate branch opening times |
| Govern customer | Super Admin `/admin/governance/users/:id` plus notes, status | Actual customer identity is updated; permanent privacy-sensitive delete remains blocked |
| Customer address | `POST /admin/customers/:id/addresses` with address, recipient, phone, GPS and reason | Audited address belongs to actual customer, visible to Customer app after scoped reload; serviceability still validated at checkout |
| Bulk import customers | `POST /admin/customers/import/validate` then `POST /admin/customers/import` | Duplicate preflight, per-row outcomes; only **PENDING** users with activation required |
| Create support case | **New** `POST /admin/support/cases`; explicit registered participant ID, optional linked order, priority and description | Backend verifies party record exists and that any linked order actually belongs to that party; case is participant-visible |
| Support assignment | Existing `POST /operations/support/cases/:id/assign` with actual staff UUID and `agentId`/ `agentName` DTO | No fake assignees; assign-to-me uses signed-in identity |
| Support conversation | `GET /operations/support/cases/:id` loads actual party/staff notes and resolution confirmations | Live Admin cannot simulate a Customer/Merchant/Rider reply or accept on their behalf |
| Live order/dispatch | `GET /operations/orders/unified/:id` resolves **delivery.id** before server manual assign/unassign | Rider handover/OTP/proof transitions remain Rider-domain commands, not generic Admin status patch |
| County and polygons | Active county/zone data and verified GeoJSON Polygon stored as initially **INACTIVE** zone | Cannot infer delivery reach from map pins, free-text names or a national county switch alone |
| Realtime/focus refresh | Cookie-authenticated `/realtime/stream` invalidations for operational roles, 45s bounded fallback and foreground focus refresh | All changed records are refetched from scoped REST APIs. SSE payload is not used as a record or authority. |
| Customer/merchant details | `GET /admin/customers/:id` and `GET /admin/merchants/:id/branches` | Avoids misleading empty details from directory DTOs; real branch counts, customer addresses and participant messages are loaded on demand |
| Real order links | Attach `customerId`, `merchantId`, delivery UUID and preserve server-order UUIDs in Admin adapter | Avoid matching unrelated people/merchants by potentially duplicate display names |
| Payments/payouts/ledger | Phase 3 live-only Payment and Settlement workspaces + existing finance ledger, refund and disbursement providers | Provider callback remains the only completion proof; maker/checker, minor-unit money and immutable ledger unchanged |

## Security and correctness guarantees

- `/admin/support/cases` accepts **exactly one** of `customer_id`, `merchant_id`, `rider_id`; validates the UUID against canonical PostgreSQL identity tables and cross-checks any linked order's party. Returns 404/409 on mismatch. The active session supplies staff creator identity. It does **not** trust a UI-supplied display name as identification.
- Super Admin-only Customer and Merchant provisioning/identity corrections now have corresponding frontend control restrictions; backend route authorization remains the source of truth.
- Support message threads come from scoped case detail, and participant confirmation comes from actual participant action. Impersonation buttons remain in **demo mode only**.
- Browser session refreshes on admin ops invalidation, foreground focus, or a 45-second fallback tick; state is never rebuilt from demo fixtures in live mode. Background polling is not proof that a remote app has subscribed to every event.
- Historical analytics not available from authorized server read models are shown as unavailable, **not illustrated as live production facts**.
- Merchant and customer geocoordinates are operator-entered and require independent geocoding/serviceability checks; an inactive zone's submitted polygon is **not** a verified governmental boundary.

## Acceptance and manual proof

- `pnpm lint`, `pnpm build:admin-next`, `pnpm test:admin-next-visual` — unchanged approved desktop UI and demo acceptance.
- `pnpm exec playwright test -c playwright.admin-next-live.config.ts` — mocked live identity/session and all 16 screen routes, plus `admin-next-cross-app.spec.ts` checks support party ID transfer and pending merchant onboarding.
- Repo CI covers migration authorization, PostGIS/Redis Customer checkout → Merchant fulfilment → Rider pickup OTP/delivered handover, and payment/finance regression protection.
- **Necessary Phase 5 proof:** four-party browser/mobile sandbox sessions with seeded real identities in PostgreSQL, negative-role and wrong-party tests, consent and provider credential sandbox, support multi-party agreement/dispute, merchant KYC activation and branch opening, rider onboarding/zone/vehicle, concurrent dispatch and rollback, customer address serviceability, high-volume pagination, dashboard pixel parity and accessibility.

## Known remaining operational prerequisites (do not claim production readiness)

1. Provider credentials and worker operations are **environment-specific**. CI uses local/sandbox payment; no real M-PESA/card payout, SMS, email or push delivery is claimed.
2. Some approved screens present only the current limited server page; filters over a loaded slice are **not** a complete global record count. Full API-side search/pagination/large export is Phase 5 hardening.
3. Branch coordinates and polygon GeoJSON are manually entered for now: map-picker/geocoding and authoritative GIS validation are required before production use. Newly created zone remains INACTIVE.
4. Some advanced Admin remediation (manual handover overrides, protected customer deletion, financial provider reconciliation) remains intentionally gated, never converted into unsafe status toggles.
5. Staff activation and recipient confirmation are performed by those parties. The Admin workflow cannot activate another user's identity or simulate their consent.
6. This branch modifies the Admin Next interface and cross-app API security/read binding, not the separate Customer, Merchant or Rider approved visual designs. Interoperability relies on existing canonical backend contracts; Phase 5 must verify actual device/app deployments.

**Release posture:** Phase 4 is code integration and automated contract work, not production authorization. Keep PR draft/unmerged pending CI and Phase 5 full four-party sandbox acceptance.
