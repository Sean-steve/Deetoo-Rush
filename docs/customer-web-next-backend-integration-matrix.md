# DeeToo Customer Web vNext — Backend Integration Matrix (Stage B1)

**Status:** API inventory and developer-only integration foundation. The 15 screens are visually approved by the owner, but **their preview data is NOT live**. No routes, database tables, payment workflows or production apps were modified.

**Source audit:** packages/api-client/src/index.ts; packages/auth/src/react.tsx; apps/api/src/modules/index.ts; apps/api/src/modules/{auth,customer,cart,order,payment,public,trust,media,operations}/*.router.ts; apps/customer/src/CustomerApp.tsx; apps/customer-web-next/src/components/*; docs/customer-web-next-{account,support}-adapters.md.

## Explicit removal report

**No deletions or behavior removals in Stage B1.** Retain visual fixtures until the corresponding authenticated view model is certified. Candidates for *later* replacement (not approved for deletion): sample restaurant and menu catalogue; sample cart/prices/order tracking; sample customer identity, sessions and alerts; local-only support history and attachments; unimplemented promotion, referral, DeeToo Plus and saved-payment surfaces. Follow the owner's rule: report all removals BEFORE executing any deletion.

## Screen-by-screen mapping

| Screen | Approved UI boundary | Verified existing route(s) | Integration status / missing contract or new screen |
| --- | --- | --- | --- |
| 01 Discover | Hero, cuisines, restaurant grid, map and nearby | GET /api/v1/restaurants, GET /api/v1/restaurant-categories, GET /api/v1/serviceability, GET /api/v1/maps/* | Existing data APIs; adapt operational availability, serviceability, pagination and images. Hero promotions/referrals and live map search need contracts; add **location/serviceability selector**. |
| 02 Search | Cuisine/search, sorting, restaurant cards and map | GET /api/v1/restaurants?search=&category=&open_now=&sort= | Existing restaurant search; real menu-item full text and price/rating/ETA filters are not all present in this search contract. Empty, no-zone and unavailable results must use honest states. |
| 03 Restaurant | Restaurant hero, categories, item cards | GET /api/v1/restaurants/:id, GET /api/v1/public/branches/:id/menu | Existing detail/menu; adapt categories, branch hours, prices and stock. Handle **closed/unserviceable branch**. |
| 04 Item detail/customization | Modifiers, quantity, photo gallery, price | GET /api/v1/public/branches/:id/menu; POST /api/v1/cart/items | Menu modifier groups exist in shared types. Map required selections, substitutions and actual cart price; reject client-only modifiers not recognized by server. |
| 05 Empty bag | Empty illustration, recommended merchants | GET /api/v1/cart | Empty server cart is authoritative. Suggested restaurants use discovery. Handle signed-out session. |
| 06 Filled bag | Cart lines, quantities, promo, address and estimated quote | GET/POST/PATCH/DELETE /api/v1/cart, /api/v1/cart/items/:id, POST/DELETE /api/v1/cart/promo, POST /api/v1/checkout/quote | Existing cart API; server controls item totals/discounts, promo validation and availability. Handle stale cart and unavailable items. |
| 07 Checkout | Address, delivery options, payment method, total | POST /api/v1/checkout/quote, GET /api/v1/checkout/quote/:id, POST /api/v1/orders, POST /api/v1/payments/initiate, GET /api/v1/payments/order/:orderId | Real payment sequencing/authorization needs transaction-safe adapter and idempotency; no invented priority-delivery or pay-on-delivery capabilities. Add **payment pending/failure/retry/order confirmation** state screens as workflow warrants. |
| 08 Order history | Lists, tabs, search, progress | GET /api/v1/customer/orders, GET /api/v1/customer/orders/:id | List/filter via server. Map true statuses and pagination; don't fabricate rider assignments. |
| 09 Live tracking | Timeline, rider contact, map and ETA | GET /api/v1/customer/orders/:id/track; GET /api/v1/customer/orders/:id/delivery; GET /api/v1/realtime/* (verify subscriptions) | Tracking API exists; render live location/ETA only when truly present and valid. Add **assignment delay, failed delivery and cancellation review** states. |
| 10 Delivered | Receipt, order timeline, rider, rating | GET /api/v1/customer/orders/:id, GET /api/v1/payments/order/:orderId, POST /api/v1/trust/ratings | Server order/payment history authoritative. Rating schema and permissions require validation; reorder must reconfirm current menu/availability/price. |
| 11 Profile & Addresses | Personal data, saved addresses, preferences and cards | GET/PATCH /api/v1/customer/profile, GET/POST/PATCH/DELETE /api/v1/customer/addresses, POST /api/v1/customer/addresses/:id/default | Identity and address APIs exist. Add **map-assisted address verification**, default conflict/error UI. Saved card vault, Plus, rewards/referrals and other preference endpoints are unverified. |
| 12 Security & Devices | Sessions, password, MFA, privacy | GET /api/v1/auth/me, GET /api/v1/auth/sessions, POST /api/v1/auth/sessions/:id/revoke, POST /api/v1/auth/sessions/revoke-all, /api/v1/auth/password/*, /api/v1/auth/mfa/* | Existing auth security. Need **step-up confirmation**, real MFA state and recovery UX, privacy and account deletion policy + API. Never infer live security controls from mockup. |
| 13 Notifications | Inbox filters, read and delivery preferences | GET /api/v1/customer/support/notifications, POST /api/v1/customer/support/notifications/:id/read, POST /api/v1/devices/register | Customer-scoped inbox/read exist. Authenticated **preferences, consent, bulk read** and delivery channel controls not verified; do not show persistent toggles until implemented. |
| 14 Help & Support | Ticket list/filter/new request | GET/POST /api/v1/customer/support/cases, GET /api/v1/customer/support/cases/:id | Existing service; real category/status mapping, pagination, association scope and assigned agent/availability are necessary. |
| 15 Support Conversation | Persistent messages, attachments, resolutions and order side | GET /api/v1/customer/support/cases/:id, POST /api/v1/customer/support/cases/:id/notes, POST /api/v1/customer/support/cases/:id/resolution-response, authorized attachment read URL, POST /api/v1/media/uploads and complete | Existing conversation service; message delivery, attachment pre-sign/validation and resolution status authoritative. **Closure policy review:** staff propose resolutions, current service may auto-close when all participants accept; owner requested explicit high-rank oversight. Do not silently alter policy. |

## Key implementation decisions

1. **No visual redesign:** The existing vNext components remain the view layer; backend view models will replace each fixture via typed adapters when that flow is implemented.
2. **Authenticated boundary:** Reuse DeetooApiClient and the HttpOnly-cookie AuthProvider with same-origin Vite /api reverse proxy. Reject unauthorized and forbidden calls; no bearer token storage or alternative auth session.
3. **Deployed safety:** VITE_CUSTOMER_NEXT_BACKEND_MODE=connected is DEV-only and shows an isolated connection diagnostic, not mockup fixtures masquerading as real records.
4. **Single source of truth:** Server quotes, payment status, orders, zone geometry, rider positions, support case closure and actual notification delivery. Never compute authoritative money totals or ETA in the UI.
5. **Gaps:** Categorize as (a) existing route with UI adapter missing, (b) partial backend contract needing extension, (c) verified-missing backend capability, or (d) owner policy decision. The screen list above is an initial implementation inventory; verify endpoint payloads during each flow's acceptance.
6. **No speculative API:** Read response bodies whose schemas have not been inspected as unknown until validated. The gateway fails on unexpected response envelopes and unsupported calls.
7. **Security and validation:** Customer-scoped endpoints, ID validation, no unreviewed delete/financial actions, idempotency key required on order creation; mutation pending/error/rollback required before UI activation.
8. **UX gaps:** Design consistent supplemental screens on demand (location editor, loading/error/empty states, payment verification, dispatch delay, security confirmation, refund and support escalation). Report these additions AFTER implementation, per owner request.
9. **No removal:** Do not delete demonstration sources, components or old production Customer until a one-for-one live replacement passes tests and the owner approves removal.
10. **Release:** CI unit/type/browser + multi-app end-to-end acceptance for Merchant, Rider, Admin and Customer; comparison to approved designs; gradual switch only after accepted sign-off.

## Stage B1 shipped separately (draft PR against approved preview)

- New isolated integration folder with typed adapters, explicit unsupported capabilities and secure read-only customer session diagnostic.
- Vite import aliases for shared types/auth/api-client and a same-origin localhost:3000 API proxy.
- Reusable resource states and sanitized errors; stale response guards.
- Unit tests for mode, routing, contract envelopes and unavailable functionality.
- Existing Customer Web Next routes remain in preview mode by default.

## Phase B2+ suggested order

**B2 Shopping** (Screens 01–07) → **B3 orders/dispatch** (08–10) → **B4 account, notification, support** (11–15) → **B5 cross-app acceptance and cutover**.

Each B2/B3/B4 change must declare a screen, server route, request/response schema, error/permission model, visual snapshot, and measurable end-to-end acceptance gate. Track extra screens where a real workflow first demands them.
