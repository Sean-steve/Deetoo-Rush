# Customer Web vNext — Phase B3 Orders & Delivery Integration

**Scope:** Screens 08–10 on the approved design-first Customer Web vNext. Phase B2 shopping remains intact and Phase B4 account/support remains deferred. **No removals or database migrations.** Production/customer cutover remains blocked by the external staging and M-PESA sandbox acceptance gate.

## Removal report

**No removals proposed or performed.** The original approved preview (including 08–10 fixtures) is still accessible in default preview mode. No API, Rider, Merchant, Admin, database, or approved design components were deleted. The B2 connected placeholder for orders is replaced **only in connected development mode**.

## Additions (as implemented)

| Screen | Backend adapter and UI | Safeguards |
| --- | --- | --- |
| 08 Order history | Authenticated GET /api/v1/customer/orders, real newest-first cards, search by saved item/restaurant/reference, active/completed/cancelled filters and real order amount | Up to 50 recent server records; no fabricated rider/ETA, no sample records in connected mode. Refresh on focus and every 30 seconds while visible. |
| 09 Tracking | GET /api/v1/customer/orders/:id and GET /api/v1/customer/orders/:id/track, server status and timeline, rider safe identity, optional verified ETA/GPS and authenticated handover code only on arrival | Tracking polls every 12 seconds while nonterminal and visible; 404 missing delivery, declined/failed delivery, assignment delay, stale/absent GPS or routing failure all display honest statuses. No static map illustration or fabricated locations in connected mode. Fresh GPS can open verified point in OpenStreetMap. |
| 10 Completed order | Immutable order item snapshots and server amount breakdown, terminal confirmation, optional courier rating POST /api/v1/trust/ratings | Noncompleted orders cannot reach a completed receipt. Only actual delivered rider-rating API is enabled, not a mock restaurant rating. No generated PDF or claim of payment capture absent server evidence. |

**Additional genuine workflow states:** Payment-pending order deep link, waiting for rider assignment, missing delivery, stale GPS, unauthorized/deleted order, failed/cancelled delivery explanation, review-and-confirm cancellation (backend-only for PLACED), rider-rating result state, mobile error/empty/retry states. Admin and Merchant authority controls remain server-owned.

### Important contracts

- OrderStatus: PENDING_PAYMENT, PLACED, ACCEPTED, PREPARING, READY, COMPLETED, CANCELLED, REJECTED.
- DeliveryStatus independent from OrderStatus: UNASSIGNED, OFFERED, ASSIGNED, ARRIVED_PICKUP, PICKED_UP, EN_ROUTE, ARRIVED_DROPOFF, DELIVERED, CANCELLED, FAILED.
- Dispatch GET /customer/orders/:id/track may return 404 when there is not yet a delivery. This is a normal pending state, not reason to fabricate GPS.
- The authenticated dispatch DTO provides masked rider identity and optional provider-backed ETA. ETA must additionally require fresh, nonstale GPS in the browser.
- Post-acceptance cancellation is never offered by this page. Backend receives CUSTOMER_CANCELLED and remains authoritative.
- The trust rating endpoint records **rider** performance; it does not certify merchant/food reviews.

## Verification

- Existing Phase B2 connected browser regression plus new Phase B3 Playwright tests: real history references, filters, selected deep links, stale GPS/ETA suppression, 404 assignment delay, 403 foreign order denial, fresh location map link, completed receipt/real rating, mobile overflow.
- Isolated Express HTTP + PostGIS/Redis stage job updated with authenticated customer order history and tracking and foreign-customer denial, no API mocks.
- New independent PostGIS/Redis **local-workflow** CI job exercises merchant acceptance/preparation, rider dispatch, pickup verification, authorized GPS, delivery OTP, delivery completion and financial effects. The payment provider is synthetic LOCAL TEST ONLY, not a Safaricom sandbox certificate.

## Remaining release gates

1. Real external M-PESA Daraja sandbox STK/callback, durable verification and ledger reconciliation still **not performed**. Never mark production checkout ready because local payment tests passed.
2. Deployed non-production staging URL/credentials and an authorized real merchant, customer, rider and worker are needed for browser/device acceptance.
3. GPS may be returned stale or absent in real operations. The connected UI does not draw a fictitious route; a real tiles/map provider and verified route are optional future additions.
4. Order history API currently limits pages to the requested subset; richer server pagination, receipt export, restaurant ratings and rider customer messaging require future contracts.
5. Screens 11–15 will be wired in Phase B4; support links in connected mode remain honest placeholders until then.

## Run

```bash
pnpm dev:customer-next                                 # approved mockups
VITE_CUSTOMER_NEXT_BACKEND_MODE=connected pnpm dev:customer-next
pnpm test:customer-next-visual
pnpm test:customer-next-connected                       # B2+B3 mocked browser contract suite
pnpm test:customer-next-real-services                   # isolated test PostGIS + Redis only
pnpm test:local-workflow                                # isolated test PostGIS + Redis only
```

Keep this PR draft, stacked on the Phase B2 branch. **No merge until staging payments and cross-app release gates pass.**
