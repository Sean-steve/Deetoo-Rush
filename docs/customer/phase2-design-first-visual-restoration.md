# Customer Phase 2 — Design-first visual restoration on the one connected Customer app

**Status:** Implemented in `feat/customer-phase2-design-parity-20261009` — pending CI/PR acceptance.  
**Visual source:** `feat/customer-web-next-design-first` `35602b4`; **live/behavior source:** existing authenticated `ConnectedCustomerShopping` and its DeeToo API gateway.  
**Entry:** `pnpm dev:customer` → `http://localhost:5173/customer`. No extra routed Customer app is introduced.

## What was restored

| Approved screens | Changes delivered in this branch | Backend truth constraints |
|---|---|---|
| 01–02 Discover/Search | Design-first DM Sans font and isolated root typography, illustrated hero badge, carousel indicator, full filters row, graphical map panel, referral rail shell and approved green/mint tokens. | Filters without backend support are visibly disabled; map has **no fake restaurant/rider pins**; referral offer availability cannot be fabricated. |
| 03–04 Restaurant/Customizer | Storefront decorative tagline, full original tab register with Reviews disabled, item badges, large modal gallery framing, single-image disabled gallery arrows, dynamic modifier selection cards, item-instructions disabled field. | Menu, modifier options/bounds and prices from DeeToo; no hardcoded fake bun/patty options; item-specific notes and review API not available. |
| 05–07 Empty Bag/Bag/Checkout | Existing EmptyBagArt retained, live same-restaurant recommended menu cards added, approved shopping/cart visual surfaces and CSS restored. | Cart updates, promos, checkout quote, idempotent order creation, M-PESA STK status, card disabled. Recommendations only from server menu; no pretend totals or payment options. |
| 08–10 Orders/Tracking/Delivered | Approved item thumbnail stack, rider-status strip and tracking action; map-shaped unavailable/verified GPS surface, rider-card design; original delivered hero/banner, order receipt and delivery checklist. | All order status/financial data remains server-authoritative. No fabricated rider name/location/ETA/merchant rating; verified GPS links only after freshness checks. |
| 11–13 Profile/Security/Notifications | Profile identity/summary, tabs, card grid, membership/quick-action rail; Security banner, device illustrations and verified session activity; Notifications illustrated banner, dated feed, status badges, preference rail and disabled bulk-read. | Profile, addresses, sessions/revoke, notification list and individual read from authenticated APIs. Favorite/Plus/card vault stats and consent preferences remain visibly unavailable. |
| 14–15 Support/Conversation | **Reuses exact design-first `PreviewAgentArt` SVG**; original hero card, full conversation panel, verified timeline separator, attachments list and order-status rail composition. | Only genuine case notes, attachments and resolution consent; no simulated support agent messages, forced closure or synthetic GPS. |

## Modified code boundaries

- `apps/customer-web/index.html` (font loading)
- `apps/customer-web/src/main.tsx` (last-loaded canonical CSS)
- `apps/customer-web-next/src/integration/live-fidelity.css` (scoped responsive, decorative and visual fidelity work)
- `apps/customer-web-next/src/integration/{LiveDiscovery,LiveShopping,LiveOrders,LiveAccount,LiveSupport}.tsx`
- `apps/customer-web-next/src/components/SupportPreview.tsx` (exports reusable approved illustration without changing its preview)
- `tests/browser/phase1-independent-apps.spec.ts` (connected 1672×941 screen-contract assertions, font and auth routing)
- This implementation note.

**No Merchant, Rider, Admin, finance, API schema, database migrations, transaction/security policy or production deploy settings are altered.** `apps/customer-web-next` remains a controlled reference/CI fixture; `apps/customer-web` is the single live Customer route.

## Run checks before main merge

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:customer
pnpm build:customer-next
pnpm build:merchant
pnpm build:admin
pnpm build:api
pnpm test:phase1-browser
```

Full six-job CI adds CodeQL, authorization/Postgres/PostGIS/Redis/merchant–rider and shopping journey checks.

## Visual acceptance gap and release HOLD

The original 15 PNG files live in the earlier user conversation and **are not stored in the repository**. This branch restores substantial missing approved design components and confirms their presence via browser assertions, **but automated pixel difference against the source PNGs and owner screen-by-screen sign-off are not asserted**. Do not report pixel parity based solely on successful builds, JSX similarity or screenshots of fixture components. Phase 3 must capture canonical vs approved outputs at 1672×941, 1440×900, 1024×768, 768×1024 and 390×844; collect visual diffs, accessibility/motion and data-state tests, and receive owner acceptance.

**Production rollout remains on HOLD** pending external protected staging, payment-provider certification and customer approval. Do not merge CSS-only “fixes” or delete visual source fixtures without reviewing the owner’s archived local Customer improvements.
