# Wave 1 authorization coverage and limits

Authority: DEE-SEC-001 §§4–10 and ADR-006. Backend permission is role + current SQL identity/session/membership + resource scope. A frontend role or request-supplied identity is not authorization.

The ordinary suite is `tests/integration/backend-authorization.test.ts`; durable proof is `tests/foundation/durable-foundation.test.ts`. The integration inventory discovers every registered Rider route and checks anonymous, Customer, and Admin-without-Rider denial, plus foreign Rider denial for private operational resources. Other router-family inventories and explicit cross-tenant, scope, field-projection and realtime regressions remain enabled.

| Documented resource/boundary | Enforcer / persisted authority | Regression evidence / limitation |
|---|---|---|
| Identity and own profile | `auth.middleware.ts`, `auth.postgres.ts`; users, sessions, roles | Durable registration/session/role persistence and revocation; forged identity headers denied. |
| Customer addresses | `customer.router.ts`, `customer.postgres.ts`; addresses/customer_profiles | Foreign update denied, ownership/default selection persists after reconnect. |
| Merchant profile, branches and staff | `scope.ts`, merchant/membership PostgreSQL adapters; merchant_memberships, merchant_membership_branches | Cross-merchant joins rejected in DB; freshly revoked membership removes REST/SSE access. |
| Catalogue | `catalogue.router.ts`, `catalogue.postgres.ts`; branch-owned menus/category/item FKs | Ops write denial; foreign parent reordering and override rejected; durable category/menu ownership constraint. |
| Cart/quote | Cart authentication and customer-scoped repository operations | Header impersonation denied; durable cart storage. Immutable quote/business guards remain Wave 2. |
| Orders | `orderScope`, Order router and Merchant branch scope | Foreign Customer/Merchant denial; scoped fixture allowed paths. Paid-state/cancellation policy remains Wave 2. |
| Delivery and Rider operational routes | Rider router role guard and delivery/offer parameter ownership | Every registered Rider route has denial regression; durable Rider A/B offers and assignment after reconnect. Custody/timing/business transitions remain later work. |
| Rider location and expected proof | Tracking service, Rider serializer, scoped response middleware | Completed Customer order has no Rider GPS/OTP; Rider never receives expected OTP; Finance projection removes coordinates. |
| Payments/refunds | Payment route role guards, support refund service | Ops cannot execute; Support cannot bypass approval through payment or Operations alias; provider simulation unavailable in PostgreSQL. Full policy/approval workflow remains Wave 2. |
| Ledger/statements | Finance router, `financeMerchant`, `financeRider`; ledger tables | Wrong-role and foreign statements denied; actual balanced storage persists. Economic allocation is not certified. |
| Merchant settlements | Finance/Admin execution; Merchant ownership on statements | Durable stored batch read and foreign-merchant filtering. Correct eligible batch construction/transfer remains unproved. |
| Rider payouts/earnings | Rider identity resolution; Finance/Admin execution | Durable Rider ownership/profile and payout filtering. Reservation and verified transfers remain unproved. |
| Service zones/pricing | Admin/Ops guards, configuration repositories | Wrong-role router regressions. Approved production values and commercial policy are not supplied. |
| Promotions | Server-side roles, merchant/customer context | Existing business tests retained; complete production promotion approval/funding behavior remains open. |
| Support cases and notes | `support.service.ts`, Operations router; support_cases/notes | Personal/linked-order ownership, Finance read-only, internal-note filtering, PostgreSQL empty-read/cache behavior; Support case-read audit. |
| Audit logs | Restricted Admin audit surface; audit_logs | Privileged identity mutation audit is transactional; failed login survives rollback. Purpose-specific Finance/Ops audit-read capabilities are not claimed complete. |
| Roles and privileged actions | Admin-only identity routes plus session-bound MFA | Password enrollment, encrypted credential storage, replay rejection, lockout, expiry and real HTTP role mutation proof. Missing MFA configuration cannot authorize a mutation. |
| Realtime | Authenticated channel authorization and repeated authorization | Anonymous, wildcard, mixed-channel, foreign Order/Customer/Rider/Merchant denial; session/membership revocation closes SSE; durable invalidations exclude private payloads. |
| Authentication/write throttling | Shared Redis sliding windows; DB authenticator attempt lockout | Separate limiter instances share limits; PostgreSQL tests cannot use the fixture bypass; dependency outage refuses unsafe operations. |

## Sensitive-action conditions

Provider status editing has no privileged bypass. Financial execution requires Finance/Admin, recent MFA for durable privileged mutations, and a real configured execution adapter; current production simulations are refused. Support's policy exception remains denied pending the approval implementation. Role mutation requires Admin and an explicit reason in durable mode, with mutation/audit in one transaction.

Cancellation after acceptance, reassignment/custody after pickup, high-value refund approval, maker-checker and payable reservation are **not marked proven** by role tests. Those business-state conditions remain explicitly open in the governing audit's later business repair waves.

## Coverage limit

This proves the tested authorization boundaries, not every documented permission capability. The 28 PostgreSQL tests are representative foundation tests; they are not exhaustive positive PostgreSQL tests of every route. Existing fixture tests continue to exercise allowed workflows, while unsupported production integrations return denial/unavailable responses. The audit's complete allowed-path/device/provider assurance must therefore remain open; no new permission was added to manufacture a passing result.
