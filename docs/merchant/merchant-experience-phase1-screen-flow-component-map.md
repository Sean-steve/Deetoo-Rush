# DeeToo Merchant Experience — Phase 1 of 2
**Baseline:** the 8 supplied Merchant mockups. **Status:** UI-only prototype, isolated at `/prototype/*`, awaiting visual approval. No production APIs, authorization rules or database schema changed.

## Screen execution boundary
**Phase 1 (now):** (01) Kitchen Orders, (02) Menu & Availability, (03) Finance & Settlements, (04) Business & Team.
**Phase 2 (next):** (05) Branch Settings, (06) Security & Sessions, (07) Notifications, (08) Support & Help Center.
Navigation entries for Phase 2 are preserved and lead to an explicit next-phase state, not a broken link. `Overview` remains in the sidebar as a simple directory linking to all four completed views (a dedicated dashboard will be scoped separately).

## Approach
1. Treat approved mockups as authoritative component inventory and interaction contract.
2. Build every visible UI element, including those without an existing backend. Do **not** remove placeholders merely because data is unavailable.
3. Prototype data is explicitly simulated; localStorage is used as a nonproduction UI adapter. The branch does **not** call DeeToo APIs.
4. Validate screen navigation, data entry, dialogs, error/empty states, desktop/mobile layout and UI flows.
5. **After** frontend approval, compare every component against DeeToo backend contracts, identify missing APIs/state transitions/permissions and plan integration. Production security checks must remain authoritative.

## Phase 1: flow mapping

### 01 Kitchen Orders
`Sidebar Kitchen orders -> live order overview -> stage summary -> tab/date/sort -> order card -> Accept -> prep time dialog -> Preparing -> Mark ready -> Ready for pickup -> view rider + handover code -> Mark picked up -> pickup confirmation -> Completed`.
Alternative: `New -> Decline -> reason dialog -> decline confirmation`.
Cross flow: `New order notification -> Kitchen orders`. Search by order number, person or item; calling a customer uses `tel:`.
Never treat a prototype pickup click as a real authorization to change a dispatched delivery.

### 02 Menu & Availability
`Menu -> summary -> category -> tab availability -> search/filter/sort -> grid/list -> item -> edit/duplicate/delete/toggle availability`.
Creation: `Add Food Item -> name/category/SKU/price/description/image/inventory/modifiers/availability -> save -> catalogue card`.
Additional: `Add Category -> category sidebar`, `Modifiers & Add-ons -> food item`, `Branch Serving -> pick branches`, `Menu picker/Add Menu -> selected menu`, `Catalogue Scope -> base/branch override preview`.

### 03 Finance & Settlements
`Finance -> period selector -> overview cards -> earnings chart/legend toggle -> payment-method donut -> commission breakdown -> upcoming payout -> settlement details`.
`Transactions/Settlements/Payouts/Invoices -> filters/search/sort -> table row action -> detail dialog`.
`Export -> client-side CSV demo`; every finance figure is labeled illustrative and is **not** an authoritative ledger or payment status.

### 04 Business & Team
`Business -> business profile -> Edit profile -> save`.
`Business documents -> Add -> choose type/file -> pending document -> row options -> details/remove`.
`Team members -> tab/search/role/branch filters -> Invite -> name/email/phone/role/branch -> pending invitation -> edit/resend/deactivate/reactivate`.
`Roles & permissions -> Manage roles -> permission matrix -> save UI selection`.
Role changes in the prototype do not grant privileges; auth and authorization will be audited in the backend phase.

## Component inventory and backend integration map
Legend: **UI** = locally interactive on prototype; **Backend after approval** = require integration even when existing APIs might already exist (to be verified at mapping stage); **Additional** = likely new backend capabilities or contracts.

| Screen | Component / action in design | Prototype behavior | Backend requirement to map later |
| --- | --- | --- | --- |
| Shared | DeeToo branding, sidebar, group headers, page highlight, collapse/mobility | UI | none (navigation only) |
| Shared | Overview, Kitchen, Menu, Finance, Business, Branch, Security, Notifications, Support links | UI; Phase 2 links have explicit next-phase state | routed feature ownership + authentication |
| Shared | Branch selector, branch card, restaurant photograph/location | UI, simulated branch switch | merchant/branch listing, media and branch-scoped query invalidation |
| Shared | Store open/paused/closed dropdown | UI, simulated state | authorized store-status mutation + audit |
| Shared | Global context search and Ctrl/Cmd+K | UI (current screen filtering and page suggestions) | order/product/staff/finance search endpoints, pagination |
| Shared | Notifications bell, unread badge and popup | UI, local read toggle | real notification feed, read receipt and push |
| Shared | Merchant avatar/profile dropdown, exit/reset prototype | UI | auth profile/session menu (not part of prototype) |
| Shared | Adjust operating hours modal | UI, local form | branch opening-hours API + timezone validation |
| Kitchen | New, Preparing, Ready and Avg prep time metric cards + arrows | UI | live order counters and preparation analytics |
| Kitchen | Status tabs All/New/Preparing/Ready/Completed | UI | historical and live order queries |
| Kitchen | Today/date selection, oldest/newest sort | UI | date filters, sorting and stable cursors |
| Kitchen | Four color-coded lanes, stage counts, empty states | UI | order state machine, realtime/SSE/poll |
| Kitchen | Order card ID/time/customer/quantity/price/instructions | UI | scoped order read DTO, item/variant detail |
| Kitchen | Waiting timer and response urgency | UI with local timer | server timestamps and preparation targets |
| Kitchen | Customer phone/call icon | UI tel link | privacy-limited contact/communication policy |
| Kitchen | Decline button and reason dialog | UI state transition | decline endpoint, validation, reason auditing |
| Kitchen | Accept & set prep time dialog | UI state transition | acceptance/prep mutation/idempotency |
| Kitchen | Mark ready | UI state transition | ready/handover event, dispatch triggers |
| Kitchen | Rider assigned/name/ETA/handover code | UI | dispatch projection and pickup handoff security |
| Kitchen | Mark picked up / order detail modal | UI simulation **only** | rider/dispatch authority boundary; do not give merchants unilateral production pickup rights |
| Kitchen | Completed lane, order history and filters | UI with local transitions | historical orders API, retention/pagination |
| Menu | Summary tiles for total/categories/visible/unavailable | UI | catalogue and availability counts |
| Menu | All/Available/Unavailable/Categories/Modifiers tabs | UI | categories, modifier groups and item projections |
| Menu | Categories sidebar/icons/counts + Add + Manage | UI | category CRUD, ordering, images |
| Menu | Menu selector and Add Menu | UI | multi-menu management/lifecycle |
| Menu | Catalogue Scope selector | UI selector | base catalogue vs branch override API |
| Menu | Branch Serving dialog and selectors | UI selection | branch/menu mapping |
| Menu | Refresh | UI, local repaint | cache/refetch, mutation coherence |
| Menu | Search/filter by price/sort/grid/list | UI | paginated catalogue query/filter/sort |
| Menu | Food cards/images/labels/descriptions/price/category | UI | product asset storage/optimized URLs + visibility |
| Menu | Availability toggles | UI persisted local | stock/merchant/branch availability mutation |
| Menu | More actions edit/duplicate/delete with confirmation | UI | CRUD + authorization + item lifecycle |
| Menu | Add/Edit item form (SKU/price/stock/image/modifiers) | UI | product schema, signed uploads, modifier validation |
| Menu | Modifier creation/assignment | UI | modifier group/options mapping, price rules |
| Finance | Date range selector and period controls | UI | filterable transaction/settlement analytics |
| Finance | Revenue/commission/payout/orders tiles with change indicators | UI illustrative values | ledger-backed, reconciled aggregates and period comparison |
| Finance | Earnings chart with revenue/payout legends | UI illustrative series | daily time series and payout projections |
| Finance | Payment-method donut (M-PESA/card/cash) | UI illustrative breakdown | settled payment method aggregation |
| Finance | Commission breakdown + fees | UI illustrative | commercial terms + ledger itemization; reconcile net arithmetic |
| Finance | Upcoming settlement ETA/card/details | UI illustrative | payout scheduling/status endpoint |
| Finance | Recent settlements + download icon | UI details | statement PDF/CSV and signed retrieval |
| Finance | Transactions/Settlements/Payouts/Invoices tabs | UI | read APIs / invoice generation |
| Finance | Filters (method/type/status/date), search, sortable table | UI | server-side querying/pagination |
| Finance | Row actions / transaction detail dialog | UI | full payment/order lookup under RBAC |
| Finance | Export action | UI generates clearly simulated CSV | authorized audited export with reliable server figures |
| Business | Team/Roles/Branches/Pending invites summary cards | UI | membership/role/branch/invite aggregates |
| Business | Business photo + camera/edit action | UI image selection placeholder | merchant media upload and persisted asset URLs |
| Business | Legal/display name, description, address, phone, email, country/type | UI editable form | business profile DTO, verification restrictions |
| Business | Business documents upload/status/list/row actions | UI filename simulation | secure documents, verification workflow, document downloads |
| Business | Invite team member | UI creates pending record | secure invitation tokens, expiry/revoke/resend and email delivery |
| Business | Team tabs/search/filters/table with role/status/actions | UI | role membership scopes/query |
| Business | Staff edit/access, deactivate/reactivate, resend invite | UI | RBAC assignment/revocation and audit |
| Business | Roles & permissions cards and Manage Roles matrix | UI local permission preview | server-defined roles, policy boundaries, audit, privilege escalation safety |

### Unsupported or partial UI distinctions (nothing is deleted)
- Global search currently filters the current screen and suggests navigation labels. Cross-resource server search is not active.
- Operating hours, branch choice, menu serving and roles are prototype UI states, not authoritative business rules.
- Remote stock photos stand in for uploaded Merchant/branch/product imagery. Production photos require a media pipeline.
- Doc-upload UI records filename only, not bytes. Verification status is illustrative.
- Finance chart/donut, commission line items and payouts are illustrative; **none may be treated as real money movement**.
- The photo selection control and some data-driven server actions will receive real uploads and mutations only in integration.
- Phase 2 screen links remain visible throughout Phase 1 and will become complete screens next.

## Acceptance gates
- [ ] `pnpm typecheck` and `pnpm build:merchant` pass.
- [ ] Browser tests cover end-to-end transitions for all four Phase 1 screens.
- [ ] Browser test confirms four Phase 2 sidebar links are retained.
- [ ] Compare desktop UI visually to each approved 1648×928 reference image; check typography/spacing/card metrics/images.
- [ ] Repeat at 1440, 1024, 768 and 390 widths; ensure no inaccessible actions/overflow.
- [ ] Keyboard navigation, dialog focus and Escape; reduced-motion and screenreader labels.
- [ ] User accepts Phase 1 visual and flow fidelity **before** starting Phase 2.
- [ ] Backend mapping begins **only after** all eight frontend screens are approved.

## Access
Run `pnpm dev:merchant` then visit `http://localhost:5174/prototype/orders`; use the sidebar for the other pages. The existing `/orders`, `/menu`, `/finance`, `/business`, etc. continue to render the existing backend-connected Merchant implementation on this branch.
