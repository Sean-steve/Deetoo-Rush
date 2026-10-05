# Deetoo — Backend Alignment Wave 1

Baseline: `docs/integration/completion-report.md`. Verification completed 13 September 2026. No UI redesign or new marketplace feature was introduced. Wave 2 has not started.

## Security fixes

### Rider and identity

- All **25 Rider routes** require an authenticated, active user with the explicit `rider` role. `requireRole` no longer grants an implicit Admin bypass; platform endpoints continue to list their permitted roles explicitly. A Customer receives 403; anonymous requests receive 401; Admin without Rider receives 403.
- Router parameter guards resolve the authenticated user's Rider profile and compare it with `assigned_rider_id` or `offer.rider_id` before validation, GPS updates, proof creation or other side effects. Every resource route has cross-rider regression coverage. Self-service routes derive identity from the session, ignoring caller-supplied user/Rider IDs.
- The generic delivery status endpoint rejects PICKED_UP, DELIVERED and FAILED with 409, directing callers to dedicated lifecycle actions. Existing service ownership checks remain in place.
- Removed `x-user-id` / `x-customer-id` authentication fallback. Cart and checkout now require normal authentication and Customer role; neither a demo customer nor an unverified token supplies identity.
- Both required and optional authentication check session ownership, expiry and revocation, then reload active user roles. Merchant scope comes from active operational memberships, rather than the stale identity seed membership store.

Implementation: `apps/api/src/modules/auth/{auth.middleware.ts,auth.service.ts,scope.ts}`, `cart/cart.router.ts`, `rider/rider.router.ts`.

### Equivalent boundaries

- **Customer:** explicit Customer role; existing address/order ownership checks retained. Order detail, delivery and tracking aliases use a common ownership/branch check. Order creation, cancellation and payment initiation require Customer role.
- **Merchant:** parent router authenticates before subrouters. Order lists validate requested branch; every order action validates the order's actual branch. Active owners access their merchant's branches; managers/staff require branch assignments. Revoked membership stops access immediately.
- Team reads and mutations require ownership of the selected merchant; targeted memberships must belong to it and assigned branches must belong to that merchant. Invitation acceptance remains available to its authenticated recipient before receiving a Merchant role; the recipient email is now checked.
- Merchant profile and branch administration require owner scope. Merchant users cannot change platform commission or settlement configuration through profile updates. Catalogue writes require an active owner/manager membership; the generic Merchant role cannot promote a staff membership. Branch overrides and assignments check branch scope. Category/item/modifier reorder operations validate each child's parent before touching or returning records.
- **Admin:** audited the existing explicit per-route role lists. Customer denial is exercised for every direct Admin route. Admin operations aliases retain their own guards.
- **Finance:** Customer cannot list settlements, payouts, statements or order economics. Merchant statements/settlements require a permitted merchant role plus active membership. Rider payouts/earnings resolve the actual Rider profile ID and reject foreign Rider IDs. Platform economics require Admin/Finance. Both order-payment-list aliases now enforce order ownership.
- **Support/Ops:** personal support lists/details/notes are scoped to the signed-in user without a staff bypass; linked order, delivery and payment references are authorized. Note creation checks case ownership; missing/forbidden cases now return 404/403. Unknown nonstaff roles cannot enumerate cases. Dispatch recovery, kill switches and job retry actions require Admin/Ops; payment/settlement/payout recovery requires Admin/Finance. There is no standalone `/support/*` router: support is mounted at `/customer/support/*`, `/operations/support/*` and `/admin/operations/support/*`.

Implementation: module routers under `customer`, `merchant`, `order`, `payment`, `finance`, `operations`, plus `merchant/catalogue.service.ts`, `merchant/merchant.service.ts`, `operations/support.service.ts`.

### Realtime

The only network subscription transport found was SSE; no application WebSocket subscription endpoint was found.

- `/realtime/stream`, `/realtime/events` and `/realtime/health` require session authentication. Health requires Admin/Ops.
- Stream accepts 1–20 concrete authorized channels. History requires one concrete channel; omitted channels cannot return global history. Wildcards, `all`, unknown channel types and mixed authorized/unauthorized subscriptions are denied before streaming headers are sent.
- Customer channels require the same Customer user ID; order channels require Customer order ownership. Rider channels require the same Rider user ID, not an arbitrary profile ID. Merchant/branch channels use active merchant/branch scope. Admin orders/dispatch/operations channels require Admin/Ops.
- Server generates client IDs. Each event delivery rechecks session and channel authorization; the 15-second heartbeat also rechecks it and closes revoked/expired connections. Tests prove both session revocation and merchant membership revocation close open streams.
- Network events contain only type, channel, order ID, status and timestamp. Raw domain payloads, OTPs and private profiles are not streamed or returned by history. History records the canonical publish channel; broker wildcard delivery is removed.
- The client now uses a Bearer-authenticated fetch stream instead of unauthenticated EventSource. Tokens never appear in URLs. Customer order detail and tracking refresh on authorized order events. Five-second polling/reconnection remains available on disconnect, with a 60-second reconciliation refresh while connected. Payment polling remains unchanged.

Implementation: `realtime/{realtime.router.ts,event-broker.ts}`, `packages/api-client/src/index.ts`, `packages/ui/src/workflows.tsx`, `apps/customer/src/components/CustomerJourney.tsx`.

## Tests

Exact commands, run from the repository root:

| Command | Result |
|---|---|
| `npm run typecheck > /tmp/deetoo-wave-typecheck.log 2>&1` | PASS — no TypeScript diagnostics |
| `npm run build > /tmp/deetoo-wave-build.log 2>&1` | PASS — Vite client and bundled server produced |
| `npm run test:unit > /tmp/deetoo-unit.log 2>&1` | PASS — 152 passed, 0 failed, 0 skipped |
| `npm run test:integration > /tmp/deetoo-integration.log 2>&1` | PASS — 203 passed, 0 failed, 0 skipped |

Build retains the existing non-blocking client chunk-size warning (592.05 kB minified) and dependency annotation warnings. Logs are copied into this report directory. The interrupted desktop turn removed process handles; the completed logs contain the final test summaries and build completion output.

No authorization exemption, global clock override, skipped regression or deleted failing test was used. The original failing Stitch Rider regression remains and passes. Existing HTTP tests now log in normally and explicitly configure fixture opening hours; a separate test proves closed kitchens still reject checkout. Integration teardown closes database/Redis/server resources instead of forcing `process.exit(0)`; the authentication rate-limiter housekeeping interval is unreferenced so it does not keep an idle process alive.

Evidence keys used below:

- **J:** `tests/integration/core-marketplace-journey.test.ts` — “Core marketplace HTTP journey: owned address through delivery and automatic financial posting (simulated provider)”. Uses REST for the marketplace actions and provider callback; it does not directly insert the order, assign a delivery, capture payment or invoke financial posting. Repository reads independently check delivery, ledger and event results.
- **C:** same file — “Closed kitchen still rejects checkout without changing the application clock”.
- **A:** `tests/integration/backend-authorization.test.ts` — generated per-route role tests, cross-rider ownership tests, foreign order/merchant/payment/support checks, session checks, realtime isolation/revocation and catalogue-parent regressions.
- **S6/S7:** existing `sprint_6_cart_checkout.test.ts` / `sprint_7_order_lifecycle.test.ts` — cart isolation, authoritative quotes, order idempotency, snapshots and merchant state transitions.
- **U:** `tests/unit/realtime-client.test.ts` — Bearer header privacy, split network frames and denied subscriptions.

## Core Journey

**Interpretation:** PASS means the named backend behavior was exercised successfully in the local service run, not that its production persistence is certified. PARTIAL means a demonstrated behavior has a material launch gap. FAIL means a required trust property is absent. NOT_CONFIGURED means the external production capability was not available. All database names below are schema targets/read-write intent: the run logged PostgreSQL authentication failures and used memory fallback, so no row represents proof of durable PostgreSQL writes or multi-instance correctness.

All API paths below are under `/api/v1`. Service paths are under `apps/api/src/modules`. Every stage's authorization is backend-enforced as described above; private data is not authorized by its screen.

| Stage | Status | API endpoint | Service/domain code | DB tables read/written | State transition | Authorization | Events/jobs/realtime | Evidence and limitation |
|---|---|---|---|---|---|---|---|---|
| Customer | PASS | `POST /auth/login`; `GET /customer/addresses` | `auth/auth.service.ts`; `customer/customer.service.ts` | `users`, roles, `sessions`, `customer_profiles`, `addresses` | Credentials → active session | Active identity, matching session, Customer role for customer APIs | Login/audit records | J, A; production seed/config problem listed below |
| Serviceable address | PASS | `GET /serviceability?lat=…&lng=…`; `GET /customer/addresses` | `serviceability/serviceability.service.ts`; customer service | `addresses`, `service_zones`, branch-zone mappings (read) | Coordinates → serviceable zone | Public geographic lookup; saved address is customer-owned | Request/response; no private subscription | J proves Nairobi zone is serviceable; PostGIS itself not verified |
| Restaurant | PASS | `GET /restaurants?lat=…&lng=…` | `discovery/discovery.service.ts` | `merchants`, `merchant_branches`, opening hours, catalogue (read) | Discovery → eligible restaurant | Public catalogue; no private order access | Request/response | J checks actual target branch is returned |
| Cart | PASS | `DELETE /cart`; `POST /cart/items` | `cart/cart.service.ts`, `cart/cart.repository.ts` | `carts`, `cart_items`, `cart_item_modifiers`, catalogue | Empty → priced cart with modifiers | Customer session; own cart | Authoritative REST refresh | J, S6, A; cross-restaurant isolation remains |
| Checkout quote | PASS | `POST /checkout/quote` | `cart/checkout.service.ts` | `checkout_quotes`; reads cart, address, hours and pricing rules | Cart → expiring quote | Customer; own cart/address | Quote response; no fulfillment yet | J, C, S6; closed kitchen still returns 409 |
| Payment initiation | NOT_CONFIGURED | `POST /orders/:id/pay` | `payment/payment.service.ts`; `payment/providers/mpesa.provider.ts` | `payments`, `payment_timeline`, payment idempotency records | Payment attempt → provider-pending simulation | Customer and order ownership | `payment.initiated` invalidations | J exercises adapter, but no real Daraja/card network payment was performed |
| Payment capture trust | FAIL | `POST /payments/providers/mpesa/callback`; card webhook equivalent | Payment service and provider verification/parsing | `payment_provider_events`, `payments`, `payment_timeline`, ledger | Simulated callback → CAPTURED | Public provider ingress; verification has development/missing-secret bypasses | Capture event and automatic financial posting | J proves local callback/posting, not authentic provider funds; must fail closed before launch |
| Order | PARTIAL | `POST /orders` | `order/order.service.ts`; order state machine/repository | `orders`, `order_items`, `order_item_modifiers`, `order_timeline`, `idempotency_keys`; cart/quote references | Quote → PLACED | Customer; own quote; idempotency key | `order.placed` on scoped channels | J, S7 prove replay returns same ID. Existing API creates order **before payment**, unlike the requested sequence |
| Merchant acceptance | PARTIAL | `POST /merchant/orders/:id/accept` | Order service `merchantAcceptOrder`; dispatch `onOrderAccepted` | `orders`, `order_timeline`, `deliveries` | PLACED → ACCEPTED; delivery initialized | Merchant role and actual branch scope | `order.accepted`; prep-based dispatch scheduling metadata | J, S7, A. Existing S7 accepts an unpaid order: capture is not an acceptance gate |
| Preparation / ready | PASS | `POST /merchant/orders/:id/preparing`; `…/ready` | Order service `merchantMarkPreparing`, `merchantMarkReady` | `orders`, `order_timeline`, `deliveries` | ACCEPTED → PREPARING → READY | Actual branch membership | `order.preparing`, `order.ready`; ready invokes dispatch | J, S7, A |
| Dispatch | PARTIAL | Triggered by `…/accept` and `…/ready`; Admin/Ops recovery exists | `order/dispatch.service.ts`: `onOrderReady`, `executeDispatchCycle`, candidate ranking | `deliveries`, `dispatch_attempts`; Rider profiles/zones/locations | UNASSIGNED → OFFERED | Internal trigger after authorized merchant action; Admin/Ops recovery only | Candidate search, offer publication; no durable worker recovery proven | J obtains a real service-generated offer; Redis/database fallback and delayed-job durability remain |
| Rider offer | PASS | `GET /rider/offers/active` | Rider router; dispatch service; delivery repository | `delivery_offers`, `deliveries` | Pending addressed offer | Explicit Rider role; authenticated Rider identity | `rider:<userId>` offer event | J, A; all 25 Rider routes tested for role denial |
| Assignment | PARTIAL | `POST /rider/offers/:offerId/accept` | Dispatch `acceptOffer`; delivery repository `atomicAssign` | `deliveries`, `delivery_offers`, `delivery_timeline`, `rider_profiles` | OFFERED → ASSIGNED; Rider → BUSY; competing offers cancelled | Addressed Rider only | Assignment invalidations for order/customer/branch/Rider/Admin | J, A; distributed atomicity not proved against PostgreSQL |
| Pickup | PARTIAL | `…/arrive-pickup`; `…/confirm-pickup`; merchant `…/pickup-status` | Dispatch `riderArrivePickup`, `riderConfirmPickup` | `deliveries`, `delivery_timeline`; Rider location cache | ASSIGNED → ARRIVED_PICKUP → PICKED_UP | Assigned Rider; merchant handover view branch-scoped | Delivery status invalidations | J uses handover code; A blocks cross-rider actions. Existing dedicated pickup code is optional, so strong handover proof remains incomplete |
| Delivery | PARTIAL | `…/start-trip`; `…/arrive-dropoff`; `…/complete` | Dispatch `riderStartTrip`, `riderArriveDropoff`, `riderCompleteDelivery` | `deliveries`, `delivery_timeline`, `delivery_proofs`; Rider state/location | PICKED_UP → EN_ROUTE → ARRIVED_DROPOFF → DELIVERED | Assigned Rider; OTP checked for OTP proof | Delivery invalidations; earnings invoked | J completes using customer's OTP. Alternative proof modes, raw delivery OTP exposure and proof-storage verification remain weaker than production proof requirements |
| Completion | PASS | `POST /rider/deliveries/:id/complete`; `GET /orders/:id` | Dispatch `updateDeliveryStatus`; order state machine | `orders`, `order_timeline`, `deliveries`, `rider_profiles` | Order READY → COMPLETED; Rider freed | Assigned Rider trigger; scoped order read | `order.completed` asserted in history | J asserts both delivered delivery and completed order; financial/DB failure atomicity remains a separate blocker |
| Ledger posting | PARTIAL | Automatic after callback and completion; `GET /finance/accounts` / transactions | `finance/financial-posting.service.ts`; `ledger.repository.ts` | `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `order_financial_summaries` | Capture → balanced posting; earning → payable posting | Internal domain operation; Admin/Finance ledger API | Idempotent posting keys; failures logged/caught | J asserts automatic capture transaction and equal debits/credits. Database errors can still become memory-only success |
| Merchant payable | PARTIAL | `GET /finance/merchant/statement?merchant_id=…` | Financial posting, commission service, ledger repository | Merchant payable ledger account/entries; financial summaries | Capture allocates merchant payable (before completion) | Merchant role plus active merchant scope, or Admin/Finance | Financial posting on capture; statement REST | J verified 136000 minor units = KES 1,360. Real settlement/disbursement and durable balance not proven |
| Rider earning | PARTIAL | `GET /finance/rider/earnings` | `rider-earnings.service.ts`; financial posting; dispatch completion | `rider_earnings`, Rider payable ledger account/entries | Delivered → earning and Rider payable | Rider's actual profile ID; Admin/Finance explicit target | Completion invokes calculation and posting | J verified 15000 minor units = KES 150. Durable payout/disbursement not proven |

Latest successful rehearsal identifiers: order `ord_mtzv7abo6wkprvr0u7ni2u8w`; payment `pay_1789307022240_3myfp`; delivery `af64ad96-7f2c-4751-b169-5dd3dae2cb0d`; capture ledger transaction `tx_1789307022391_gj6xw`. These are local simulation records, not live financial transactions.

## Remaining BLOCKERS

1. **Security:** production configuration still has development secret defaults and an unconditional seeded identity store (`packages/config/src/index.ts`, `auth/auth.repository.ts`). Provider verification includes bypasses and substring comparisons (`payment/providers/*`). Delivery reads expose OTPs on raw Rider delivery payloads and proof alternatives are insufficiently constrained. Wave 1 route/RBAC/SSE regressions pass, but these other trust boundaries prohibit a launch security sign-off.
2. **Order/data integrity:** PLACED and merchant acceptance do not require captured payment (existing S7 demonstrates this). Database failures fall back to memory; cross-service order/payment/completion/ledger state is not proven atomic or restart-safe.
3. **Payments:** M-PESA/card initiation adapters simulate provider activity; real capture, refund and disbursement integrations have not been verified. The successful rehearsal callback is test input, not proof of received money.
4. **Dispatch/delivery:** durable delayed dispatch, offer expiry/recovery and multi-instance assignment under failure are unverified; mandatory pickup and trustworthy delivery-proof policies are incomplete. Placeholder contact proxies are not a configured communication service.
5. **Ledger/financial integrity:** ledger persistence errors can be swallowed while returning memory success; capture/completion posting errors do not roll back the originating state. Real merchant settlement and Rider payout reconciliation/disbursement remain unverified.
6. **Infrastructure:** the run logged PostgreSQL password-authentication failures and Redis fallback/degradation. Realtime is a process-local broker with best-effort, nontransactional outbox persistence; it is not proven durable or shared across API instances. Production database/Redis/worker recovery must be demonstrated.
7. **UI:** no independent new UI launch blocker was established in this wave. Existing payment/contact limitations above must be resolved at their backend/provider boundary; the bundle-size warning is not treated as a launch blocker.

## Recommended Wave 2

**Establish a fail-closed production trust boundary:** prevent production from using seeded identities/development secrets or accepting unverifiable payment callbacks. This is the single next repair objective, before further marketplace or UI work. No Wave 2 repairs were started.
