# DeeToo Rush — Design-First Customer Web Rebuild

**Status:** Approved direction; implementation in progress  
**Approved:** 2026-10-08  
**Decision:** Rebuild the Customer Web frontend from the 15 supplied high-fidelity reference images **before** mapping the existing backend. Preserve the designs while applying small, documented UX improvements and purposeful animations.  
**Scope:** Customer web only. Merchant, Admin, Rider, payments, database and original customer application must not be broken.  
**Starting point:** New parallel `apps/customer-web-next` application; the existing `apps/customer-web` remains the production/reference implementation.  
**Prior redesign:** PR #25 (`feat/customer-web-15-screen-redesign`) is a historical comparison/reference, **not** the foundation for the new frontend. Do not merge it as a substitute for visual acceptance.

## Principles and constraints

1. **Design is the contract.** Reconstruct the 15 approved mockups (1672×941 desktop reference), not a restyle of the old app.
2. **Small UX corrections, not redesigns.** Improve semantic clarity, keyboard navigation, text contrast, usable form labels, loading/error/empty states, and avoid misleading claims. Record changes in the screen acceptance notes. Never silently replace approved composition, spacing or brand identity.
3. **Visual-first, then data.** Phase 1 components use typed, clearly identified *preview-only* fixtures. Phase 2 switches to existing DeeToo services through adapters. No fixture data in production transaction flows.
4. **One shared design system.** New customer tokens, primitives, navigation shell, food cards, status, layout patterns and motion utilities. Keep the legacy `packages/ui` and original Customer Web untouched initially.
5. **Financial and operational truth.** Live price, fees, discounts, serviceability, order state, GPS and ETA come from DeeToo's authoritative backend. Mockups are **not** proof of existing capabilities; do not invent promotions, ratings, chat availability, security settings, membership benefits or checkout methods.
6. **Progressively enhance.** Desktop reference first, then 1280/1024/768/390 widths; responsive layouts must not become squashed desktop screenshots.
7. **Accessible motion.** Microinteractions guide state, avoid distracting mascot loops, and respect `prefers-reduced-motion`. Motion must not hide essential information or block checkout.
8. **Safe rollout.** No replacement of `apps/customer-web` until the entire visual, interaction and integrated workflow gates have passed.

## 15 approved reference screens

| ID | Screen | Visual focus | Functional notes |
|---|---|---|---|
| 01 | Discover | Promo hero, browse categories, food cards, right-side map/top picks | Map and promotions use previews until contracts are verified |
| 02 | Search & Filters | Search-led hero, filter strip, restaurant results + map | Search scope/filter capability must be mapped individually |
| 03 | Restaurant Storefront | Hero, merchant identity, menu category rail, three-column products, order panel | Browse from catalog; price/availability server-controlled later |
| 04 | Food Customization | Centered split dialog, imagery, options, extras, quantity, total | Validate modifier cardinality and price on server |
| 05 | Empty Bag | Branded illustration, primary browse CTA, nearby suggestions | Empty state must work without signed-in user |
| 06 | Shopping Bag | Item rows, quantity, promotions, summary, address and upsell | Requote after edits; cross-sell may be preview-only |
| 07 | Checkout | Address, delivery, payment choices, review/total rail | Only backend-supported payment/delivery options are actionable |
| 08 | Orders | Active, previous, cancelled orders, status/track progress | Real history and state transitions required |
| 09 | Live Tracking | Large map, route, rider, order summary | **Never** fabricate ETA, route or rider position |
| 10 | Completed & Rating | Receipt, order contents, milestones, rating panel | Reorder/receipt/rating extensions require contracts |
| 11 | Profile & Addresses | Identity, tabs, addresses, payment methods, shortcuts | Membership/rewards are not activated before backend support |
| 12 | Security & Devices | Security controls, actual sessions, activity, privacy | No false 2FA or PIN state claims |
| 13 | Notifications | Grouped notifications, preference panel, read controls | Channel preferences need persistence/consent |
| 14 | Help & Support | Support categories, tickets, selected case, attachments | Existing cases remain authoritative in integration |
| 15 | Support Conversation | Inbox, dedicated message thread, order summary and actions | Asynchronous case notes must not be misrepresented as live staffed chat |

**Reference filenames (user supplied):**
`Discover Restaurants Food Delivery Dashboard.png`, `DeeToo Burger Search Dashboard.png`,
`DeeToo Burger Delivery Dashboard.png`, `Smash Burger Customization Modal.png`,
`DeeToo Empty Bag Dashboard.png`, `DeeToo Food Delivery Cart Interface.png`,
`DeeToo Checkout Experience.png`, `DeeToo Orders and Tracking Dashboard.png`,
`DeeToo Food Delivery Tracking Dashboard.png`, `DeeToo Order Delivered Dashboard.png`,
`DeeToo Profile Dashboard Interface.png`, `DeeToo Security & Devices Dashboard.png`,
`DeeToo Notifications Center Dashboard.png`, `DeeToo Help & Support Dashboard.png`,
`DeeToo Support Conversation Dashboard.png`.

> The reference PNGs were supplied in the design conversation. A repository-based baseline pipeline must import/export them under a stable reference directory before automated pixel-diff gating. Do not use full-page mockup screenshots as rendered app backgrounds.

## Phase 1 — Reconstruct all frontend screens

**Deliverable:** independent `customer-web-next` preview running in its own Vite process/port, with a coherent design system, typed fixtures, and navigable, interactive screen states. **Backend calls are not required** in this phase.

### Architecture

```text
apps/customer-web-next/
  index.html
  package.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    styles.css
    data/preview.ts
    components/         # reference-matched shell, cards and controls
    screens/            # 01 through 15
packages/customer-ui/
  package.json
  src/                 # customer-specific design tokens / components when shared code is justified
```

Use React + TypeScript + Vite and the existing monorepo's installed dependencies. CSS tokens and native browser primitives are acceptable; do not require new packages merely for animation. Shared app-specific components belong in `packages/customer-ui` only when at least two screens need them.

### Development sequence

| Wave | Screens | Entry criteria | Exit gate |
|---|---|---|---|
| Foundation | Shared header/sidebar, typography, buttons, cards; **01 Discover** | Approved reference and viewport available | Side-by-side desktop comparison and responsive navigation verified |
| Discovery | **02 Search, 03 Storefront, 04 Customization** | Foundation tokens locked | Search/filter states, category rail, modal keyboard/focus/quantity |
| Shopping | **05 Empty Bag, 06 Bag, 07 Checkout** | Catalog and modifier preview states | Cart updates, coherent totals in preview, safe CTA states |
| Delivery | **08 Orders, 09 Tracking, 10 Completed** | Order fixture matrix | Active/past/cancelled/completed states individually reviewed |
| Account | **11 Profile, 12 Security, 13 Notifications** | Forms and system states | Accessible controls, clearly labeled previews |
| Support | **14 Help, 15 Conversation** | Ticket/message fixtures | Conversation, attachments, resolution and ticket navigation previewed |

Each screen includes realistic *preview labels* and explicit fixture data; never show a fictitious payment or ETA as live.

### Motion specification

| Interaction | Motion | Reduced-motion fallback |
|---|---|---|
| Navigation active item | 140–180ms background/indicator transition | Instant state change |
| Restaurant card hover | 160–220ms translateY(-3px) / gentle shadow | Static focus treatment |
| Category/filter selection | 120–180ms border/background + optional indicator | Immediate selected state |
| Hero/section reveal | Optional one-time 220–320ms opacity/translateY(8px) | Visible instantly |
| Add to bag | 180–260ms confirmation/badge update; no deceptive cart update | Immediate badge and announcement |
| Customization dialog | 180–260ms scale/opacity + overlay | Dialog appears instantly, focus managed |
| Order-progress transitions | 200ms state highlight only when backed by actual new event | Instant status update |
| Notification badge | 120–180ms scale emphasis on new event | Static count + screen-reader announcement |
| Toast/inline feedback | 150–200ms fade and timed dismiss if noncritical | Instant appearance |
| Loading | Skeleton shimmer only for truly pending resources | Static skeleton |

Avoid permanent bouncing mascots, continuously moving maps, auto-playing distracting carousels, giant parallax effects and simulated courier movement.

### Visual acceptance gate

For **each** screen, record: screenshot at 1672×941, reference screenshot, side-by-side, image-diff/overlay, typography/icon/spacing audit, and any justified changes. Also capture 1440×900, 1024×768, 768×1024 and 390×844.

A screen is **not approved** merely because it compiles or CI passes. Human visual approval is required on structure and appearance. State snapshots must cover menu with items, product options, empty/populated bag, checkout, active and completed orders, profile, sessions, notifications and a selected conversation. Unavailable fixtures are **not tested**, not passed.

Acceptable professional UX corrections: ensure contrast, tap targets, descriptive labels, focus ring, contextual empty/error states, truthful availability and responsive rearrangement. Deviations beyond those must be approved first.

## Phase 2 — Connect the existing backend with adapters

**Deliverable:** `packages/customer-api` adapters/hooks that provide typed screen-facing view models while preserving authoritative backend contracts.

`UI screen → view-model hook → customer-api adapter → existing @deetoo/api-client → current API`.

Track each action in a contract matrix with: source UI, request/response, auth requirements, error cases, missing endpoint, transactional invariants and test. Prioritize:

1. Delivery serviceability, restaurant discovery and menu.
2. Customer login/profile/verified address.
3. Cart mutations and catalog modifier validation.
4. Server quote, payment orchestration, order creation, idempotency and expiry.
5. Order history and dispatch/tracking (verified GPS/ETA only).
6. Notifications and read receipts.
7. Support tickets, conversation, attachments and resolution policy.
8. Sessions and sensitive security actions.

Backend gaps are explicitly labeled as unavailable/coming soon or redesigned away until supported. Treat rewards, priority delivery, pay-on-delivery, saved cards, referrals, ratings, live chat, map polylines, notification preference toggles and promo campaign badges as **contract work**, not harmless demo buttons. See `docs/customer-web-backend-gap-audit.md` on PR #25 for the legacy comparison (not on `main`).

## Phase 3 — Integrated QA and controlled replacement

**Deliverable:** production-ready, backend-connected customer frontend with rollback capability.

- Test public → authentication → serviceable address → merchant → modifiers → bag → server quote → M-PESA/card → order states → delivered → support.
- Test payment provider failures, stale quotes, item unavailable, unserviceable areas, session expiry, offline/network errors and cancellation/refund boundaries.
- Security: role isolation, backend authorization, no sensitive data in client fixtures/bundles, secure session handling.
- Accessibility: keyboard/focus traps, semantic labels, contrast, reduced motion, screen-reader announcements.
- Performance: lazy routes/media, responsive images, CLS/LCP, budgets for animations and assets.
- Verify behavior at reference sizes and real devices and complete visual sign-off.
- Cut over using reversible routing/feature flag, maintain current customer-web as rollback, and **only then** archive legacy code.

## Commands and review workflow

Suggested local preview commands after scaffold:

```bash
pnpm dev:customer-next            # new frontend preview only, port 5174
pnpm build:customer-next          # isolated output dist/customer-web-next
pnpm typecheck                    # monorepo type safety
```

**Review state:**
- [ ] Plan committed
- [ ] Fresh implementation branch and parallel app scaffold
- [ ] Screen 01 designed and captured against reference
- [ ] Screens 02–15 designed, interactive and visually approved
- [ ] Backend adapter contracts inventoried and agreed
- [ ] Backend integrations and lifecycle tested
- [ ] Full regression, accessibility, and production visual gates passed
- [ ] Controlled customer-web replacement approved

**Non-negotiable:** leave the original app functional until Phase 3 is explicitly approved.
