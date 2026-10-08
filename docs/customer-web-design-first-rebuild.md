# DeeToo Rush — Design-First Customer Web Rebuild

> **Status:** APPROVED DIRECTION — implementation underway (Phase 1).
> **Owner:** Customer Web engineering / UI–UX.
> **Reference viewport:** 1672 × 941 (15 supplied customer design images, 2026-10-08).
> **Principle:** faithfully reproduce the approved visual direction; make only small, defensible UX improvements and include purposeful animations.
> **Change isolation:** new customer frontend alongside the existing app; do not merge the previous CSS-first redesign PR #25 as the new foundation.

## Why we're changing approach

The existing Customer frontend is constrained by an older UI structure. CSS modifications alone did not match the 15 reviewed mockups, even when CI passed. The new plan is to build a **separate, design-first frontend** and **map DeeToo's existing backend to it after the visual system is approved**. Compilation does not count as visual acceptance.

## Architecture and isolation

Proposed app structure (adapt to repository conventions without disturbing current apps):

```text
apps/
  customer-web/                 # existing production Customer frontend — preserved
  customer-web-next/            # reference-driven prototype, served independently
  merchant-web/                 # unchanged
  admin-web/                    # unchanged
  rider-android/                # unchanged
packages/
  customer-ui/                  # new frontend-only design components (when reuse warrants extraction)
  customer-api/                 # API adapters introduced in Phase 2
  ui/                           # existing shared UI — unaffected unless explicitly reviewed
  types/                        # existing contracts
```

- React + TypeScript + Vite and compatible existing package manager conventions.
- The new app must **never silently replace** or break the current Customer route.
- Phase 1 uses an explicitly labeled **demo / fixture data adapter** to show visually complete states, including paid, active and delivered orders, without creating real payments or falsely representing live rider positions.
- Presentation components accept typed view models; no direct network calls in visual components. Backend mapping switches the adapter, not the design.
- Real customer address, ETA, fees, offers, ratings, security and case data must remain server-authoritative in production.

## Design assets and fidelity

The 15 user-provided PNGs are the **source of truth** for composition; source files are supplied in the project conversation. Images are reference designs, not screenshots to paste as the user interface. Recreate the layout with semantic HTML/CSS and replace image placeholders with licensed, owned, merchant-supplied, or appropriately authored media.

**Visual foundations:**
- Fixed desktop top header: DeeToo logo, address, prominent search field, notifications, customer menu, cart.
- Clear left sidebar (≈255 px), active navigation with green tint and border accent.
- Pale mint-neutral app background, white rounded cards, near-black headings, restrained shadows and green CTAs.
- At 1672 × 941, match block geometry, card proportions, font hierarchy, restaurant imagery, spacing, and density before decoration.
- Responsive tablet and phone layouts: practical mobile navigation, safe-area awareness, keyboard and checkout usability.
- Accessibility: WCAG AA color contrast where feasible, proper landmarks, visible focus, keyboard controls, accessible dialogs, realistic loading/error/empty states, screen-reader announcements and reduced-motion support.

### Approved UX corrections (small, not a redesign)
1. Do not show fabricated discounts, personal ratings, courier location or precise ETA when unavailable.
2. Mark optional features as **Coming soon** or omit them instead of presenting nonfunctional interactive controls.
3. Keep every currency value consistently **Ksh** and show authoritative totals at checkout.
4. Make checkout progression predictable; prevent double payment submission and show quote expiry clearly.
5. Keep the support case conversation open until approved resolution and customer confirmation, per policy.
6. Avoid disruptive full-screen transitions, decorative avatars everywhere, or illustrations obscuring actions.

## Motion and microinteraction specification

| Surface | Motion | Target duration / principle |
| --- | --- | --- |
| Page enter | Subtle opacity + 6–10 px translate | 160–220 ms once per navigation |
| Restaurant/product cards | Lift + shadow / image scale on hover | 140–190 ms, keyboard focus equivalent |
| Category selection | Tint + moving selection indicator | 130–190 ms |
| Search and filtering | Debounced suggestions, no distracting spinner flashes | 180–250 ms transition; 200–300 ms debounce |
| Cart addition | Button confirmation, bag-count pop, nonblocking toast | 180–300 ms |
| Modal/drawer | Backdrop fade, panel scale/slide | 180–240 ms; trap focus and restore on close |
| Checkout step / form validation | Gentle state transition; clear error feedback | 150–220 ms |
| Order progress | Stage marker progress and event emphasis | 250–420 ms, only on real/demo state changes |
| Live map | Smooth marker updates ONLY when backend GPS supports them | Respect provider + GPS freshness |
| Delivered success | One-time small celebratory motion, then still | 400–650 ms, no repeating confetti |
| Notifications/support | Badge/bubble entrance when a new event arrives | 150–240 ms |

- Prefer opacity/transforms to avoid layout shifts. Never animate prices or security facts falsely.
- Honor `prefers-reduced-motion: reduce`; disable all ornamental movement.
- No random sprites or mascots at the bottom of every screen; illustrations appear in purposeful empty/success states only.

## Phase 1 — Design-first frontend reconstruction

**Goal:** every screen visually approved, navigable using demo data, WITHOUT touching transactional backend flows.

**Sequence** (implement foundations once; avoid duplicating them):
1. **Foundation:** shared shell, design tokens, header, navigation, cards, typography, buttons, badges, product images, animation primitives; Screens **01 Discover** and **02 Search**.
2. **Shopping:** Screens **03 Restaurant**, **04 Food customization**, **05 Empty bag**, **06 Cart**, **07 Checkout**.
3. **Delivery:** Screens **08 Orders**, **09 Live tracking**, **10 Completed order/rating**.
4. **Account:** Screens **11 Profile**, **12 Security/devices**, **13 Notifications**.
5. **Support:** Screens **14 Help center** and **15 Support conversation**.

**Phase 1 exit criteria:**
- All 15 screens reachable via UI actions; no dead primary CTA in demo.
- Demo screens visually resemble their exact reference states, not merely reuse generic cards.
- Tested at **1672×941, 1440×900, 1024×768, 768×1024, 390×844**.
- Automated screenshots named by screen; visual comparison images + geometry metrics saved in CI or artifacts.
- Separate explicit sign-off for layout, content hierarchy, imagery, states, animations and responsive behavior.
- Unfinished backend-dependent controls labeled as demo/prototype; production feature availability never implied.

## Phase 2 — Backend contract mapping and integration

**Goal:** swap demo adapter for real DeeToo API adapters without rewriting visual components.

| Frontend | Existing DeeToo service/contract | Considerations |
| --- | --- | --- |
| 01–02 Discovery & search | Service-zone and public discovery endpoints | Availability, search, cuisine and open-now |
| 03 Storefront | Merchant branch, menu and operating-state endpoints | Merchant-owned media, pricing/stock |
| 04 Customization | Menu modifier groups + cart validation | Required extras, option limits, quantity |
| 05–06 Cart | Cart APIs, promotions and server pricing | Single-branch rule, fee estimates |
| 07 Checkout | Quote/order/payment orchestration | Idempotency, quote expiry, M-PESA/card, no fake COD |
| 08 Orders | Customer order history | Authoritative status and pagination |
| 09 Live tracking | Dispatch/rider location/ETA | Show map/ETA only when GPS/provider validated |
| 10 Delivered | Order completion + rating | Financial receipt and reorder only when supported |
| 11 Profile | Customer profile and PostGIS addresses | Avoid pretending loyalty/favorites/subscriptions exist |
| 12 Security | Authentication, sessions, MFA APIs | Session revocation and permissions |
| 13 Notifications | Persistent notifications + read APIs | Preferences/push channels require new contracts |
| 14–15 Support | Cases, messages, evidence and resolution APIs | Preserve human case review + customer satisfaction gate |

Integrate through a narrow `customer-api` typed adapter interface. Inventory each component as:
**(A) API exists and wired**, **(B) API exists but contract needs extension**, **(C) backend missing**, or **(D) frontend-only interaction**.
Do not emulate real GPS, invent customer balances or bypass security to match a screenshot.
Write contract and E2E tests for customer → merchant → rider → delivered flow.

**Phase 2 exit criteria:** customer session, discovery, modifier pricing, bag persistence, authoritative checkout and payments, order status, addresses, notification reads, security controls and case conversations verified end-to-end against real APIs.

## Phase 3 — QA, launch and controlled replacement

- Visual regression reviews, cross-browser/device testing, keyboard/screen-reader and reduced motion.
- Failure / latency / expiration / cancellation / offline / permissions / degraded-map tests.
- Payment and support regression gates, avoiding production payment side effects in automated tests.
- Lighthouse/performance budget, image optimization and lazy loading.
- Run existing and new Customer frontends simultaneously through QA.
- Explicit stakeholder acceptance for each of 15 screens and API coverage gaps.
- Switch traffic only when verified; preserve rollback path to existing Customer app.
- Do **not** merge/deploy automatically solely because tests compile.

## Deliverables and decision log

1. **This document** — canonical engineering/reference plan.
2. Isolated `apps/customer-web-next/` implementation on a **new branch based on main**.
3. Repeatable design system, interactive screens and demo state fixture catalog.
4. Per-screen screenshots with approval checklist.
5. Backend capability matrix and missing-feature tickets in Phase 2.
6. Verified launch checklist and rollback procedure in Phase 3.

**Decision (2026-10-08):** Preserve the 15 designs with **small professional UX corrections**, including purposeful animations. Build the frontend **first**; map the current DeeToo backend **second**. Do not continue CSS patching of the legacy customer UI as the main implementation method.
