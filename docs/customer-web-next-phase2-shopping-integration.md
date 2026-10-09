# Customer Web vNext — Stage B2 Shopping Integration

**Scope:** Screens 01–07 only. Stacked on the accepted 15-screen design and B1 foundation. Production Customer, Merchant, Rider, Admin, databases and backend services are unchanged.

## Removal report

**Nothing removed.** Existing preview fixtures and screen components are preserved and still render when VITE_CUSTOMER_NEXT_BACKEND_MODE is absent. Approved mockup styling and animations remain untouched. Any future deletion requires reporting it to the owner before removal.

## Implemented in Phase B2

| Approved screen | Backend connection | UX safeguards |
| --- | --- | --- |
| 01 Discover | GET /restaurants, /restaurant-categories, /serviceability with selected address coords | Real opening status; no invented rating, delivery ETA, service fees or rewards. Location selector with geolocation and zone verification. |
| 02 Search | GET /restaurants?search=&category=&open_now=&sort= | Debounced queries, loading/error/empty states, only supported filters shown. No unimplemented dish full-text results. |
| 03 Restaurant | GET /restaurants/:branchId + GET /public/branches/:id/menu | Real branch and merchant profile, opening status and availability. |
| 04 Item detail | Server menu modifier groups; POST /cart/items | Enforce required/min/max choices; unavailable choices disabled; explicit approval before replacing a different restaurant's cart. Server recomputes price. |
| 05 Empty bag | GET /cart and nearby GET /restaurants | Same approved empty-state illustration; optional real nearby restaurants. |
| 06 Filled bag | GET/POST/PATCH/DELETE /cart, POST/DELETE promo | Prices and warnings from server in KES minor units; line quantity/remove, promo, clear confirmation and minimum-order enforcement. |
| 07 Checkout | Saved GET /customer/addresses, POST /checkout/quote, POST /orders, POST /payments/initiate, GET /payments/order/:id | Service-zone check; server-authored fee/discount/tax/quote expiry; order/payment idempotency; explicit MPESA prompt and status polling. Card and priority delivery disabled until secure production workflow exists. |

### Additional screens and UX states

- Saved address chooser, GPS-assisted new address with serviceability check (using existing reverse geocoding when available).
- Customer sign-in / registration in the connected shell, backed by existing HttpOnly-cookie AuthProvider.
- Merchant cart replacement confirmation, cart-clear confirmation, checkout quote expiry state.
- Payment pending/failed/success after creating a pending-payment order, with explicit MPESA phone entry and asynchronous verified status.
- Generic server loading/error/no results states; retry without falling back to demo fixtures.

### Remaining gaps

- REST discovery currently only supports existing category/restaurant search and supported sorting. Dish index, rating/price/verified ETA filters require later backend work; they are not fabricated in UI.
- Map preview has been replaced with an honest address panel in connected mode until a real provider-backed geocoded map is wired.
- No provider-hosted card tokenization yet; secure card UI not enabled. Priority delivery, referral/rewards/DeeToo Plus, marketing promotions and advanced merchant reviews await contracts.
- Payment callback processing/worker deployment and true MPESA sandbox certification still require separate environment-backed acceptance. Browser test mocks validate the client workflow, **not a live Safaricom charge**.
- Customer Screens 08–15 remain approved **preview** only and are explicitly isolated in connected mode pending B3/B4.
- Live connected mode is **development opt-in only** for safe staged acceptance; production remains the approved visual frontend pending switch decision.

## Commands

Visual preview (default): **pnpm dev:customer-next**

Connected local shopping: **VITE_CUSTOMER_NEXT_BACKEND_MODE=connected pnpm dev:customer-next** (API running separately on http://127.0.0.1:3000, existing PostgreSQL/Redis configured).

Tests: **pnpm lint**, **pnpm build:customer-next**, **pnpm test:customer-next-visual**, **pnpm test:customer-next-connected**. The latter uses an isolated mocked contract backend in Playwright, never real charges or orders.

## Release gate

1. Mocked API browser contract acceptance, existing preview visual regressions and all CI succeed.
2. Deploy API + worker stack into a seeded non-production PostgreSQL staging environment with real test merchant/menu/zone/customer/addresses and MPESA sandbox.
3. Verify branch hours, item modifiers, cross-merchant cart conflict, payment idempotency, timeout/retries and final order states against that environment.
4. Obtain owner approval for a customer traffic switch, and separately obtain prior permission before deleting/replacing any legacy code or demo fixture.
