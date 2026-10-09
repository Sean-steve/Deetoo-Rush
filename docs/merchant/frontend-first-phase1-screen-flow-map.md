# DeeToo Merchant — Frontend-first delivery contract

**Baseline:** eight screenshots uploaded 2026-10-09. **Phase 1:** Kitchen Orders, Menu & Availability, Finance & Settlements, Business & Team. **Phase 2 reserved:** Branch Settings, Security & Sessions, Notifications, Support & Help Center.

**Preview URL:** `http://localhost:5174/?merchant-prototype=1` (with the Merchant Vite app running). This is an **isolated standalone frontend prototype**, not connected to production APIs. Ordinary Merchant URLs continue to render the existing Merchant application. No changes were made to server APIs, database, or the shared Customer/Rider/Admin UI. Values in the prototype are demonstrative and should not be treated as live orders, financial records or authenticated users.

## Screen and flow map

- **Shell:** sidebar → any of four Phase 1 pages; Phase 2 navigation items → reserved placeholder dialog; branch switcher → branch dialog; store status → Open/Paused/Closed (local state); bell → Phase 2 reservation; profile → account dialog; global search → on-screen order filtering in Kitchen, with search scopes for other pages to be implemented.
- **Kitchen:** All/New/Preparing/Ready/Completed filters; New order → Accept & Set Prep Time dialog → Preparing → Mark Ready → Ready → Mark Picked Up confirmation → Completed. Decline → reason dialog → remove from active queue (prototype only). Rider/contact icon → customer-contact dialog. Date range/sort controls exist.
- **Menu:** item summary cards, category list, All/Available/Unavailable filters, catalogue search, sort, grid/list toggle, image placeholder, per-item status switch; Add food item → editor → catalogue; food overflow → Edit/Delete dialogs; Categories → list/add modal; Modifiers & Add-ons → preserved modal; Filter → reset.
- **Finance:** KPI cards, earnings line graph, payment-method donut, commission breakdown, upcoming settlement, recent transaction table, Transactions/Settlements/Payouts/Invoices tabs; filters, search, export, settlement details and transaction actions. Data are **explicitly illustrative**, not asserted as financially correct.
- **Business & team:** profile, document list, members, team search/status/role/branch filters, role summary; Invite member → email/role/branch form → Pending row; member overflow → edit role/branch; documents → document modal; profile/photo → modal; role management → modal. All role mutations are local only.

## Component inventory and integration gap register

Each row lists **visible controls that must be retained**, plus the backend contracts and frontend depth still outstanding. A placeholder is not a completed flow.

| Screen | UI component/control | Prototype | Backend support needed after frontend approval |
| --- | --- | --- | --- |
| Shell | DeeToo logo, navigation, active state, collapse/mobile menu, sidebar account | Present | Identity and RBAC for nav visibility; collapse persistence |
| Shell | Branch selector, branch photo and location | Branch modal | Branch list, image URL and authorized branch switching; branch preview interaction |
| Shell | Store open/paused/closed control | Local state | Authorized status write, publication, order eligibility and audit |
| Shell | Global search and Ctrl+K | Field rendered; order-filter scope | Search router, keyboard shortcut, screen-specific indexes; completed interactions |
| Shell | Notification bell, unread badge, account dropdown | Modal / local demo | Notification feed/count, account/profile/logout; Phase 2 |
| Kitchen | Four status cards incl average prep time | Counts from mock orders; prep value illustrative | Real order aggregates, prep analytics, comparison period |
| Kitchen | All/New/Preparing/Ready/Completed, date filter, sort | Local filtering/sort | Order history, date-scoped queries, pagination and sort |
| Kitchen | Four-column order board, timers and urgency labels | Local demo | Live orders, elapsed time, SLA thresholds, real-time updates |
| Kitchen | Customer name/contact/phone icon, order items, rider handover and code | Rendered / contact dialog | Order detail DTO, safe customer contact, dispatch/rider identity |
| Kitchen | Accept/set prep duration, decline reason, ready, pickup | Interactive simulated state machine | Commands with authorized state transitions and rider handover verification. **Merchant pickup control cannot override dispatch authority** |
| Menu | Item/category summary, category cards/icons/counts | Local computed | Branch-scoped menu, category media, accurate visibility rules |
| Menu | Item photographs, food card details/price/status switch | Emoji stand-ins / local toggle | Product media uploads/storage, prices/overrides and status writes |
| Menu | Search, filters, sorts, grid/list | Local functionality | Server filtering, SKUs, large dataset handling and persisted preferences |
| Menu | Add/edit/delete menu items | Local form/actions | Catalogue write contracts, validation, audit, pricing |
| Menu | Categories add/edit and modifiers/add-ons | Preserved partial modals | Real category editor, modifier groups, option rules, item linking |
| Finance | Revenue/commission/payout/orders KPIs and comparative badges | **Illustrative** | Ledger-derived measures and prior-period comparisons |
| Finance | Daily earnings chart, payout line, payment-method donut | **Illustrative** | Dated merchant ledger analytics + payment-method breakdown |
| Finance | Commission breakdown, processing fees, payout amount | **Illustrative** | Settlement fee/commission breakdown, payout reconciliation |
| Finance | Upcoming settlement, recent settlements, details | Preserved details modal | Scheduled payouts, destination verification, settled history |
| Finance | Transaction list, search, payment/status/date filters, transaction details | Local demonstration | Payment ledger, merchant transaction query, detail endpoints |
| Finance | Transactions/Settlements/Payouts/Invoices, export | Tabs + partial demo dialogs | Report API, invoices, signed PDF/CSV export; complete detailed screens |
| Team | Team/roles/branches/invitation KPIs | Local computed | Merchant memberships, roles, branches, invitation status/expiry |
| Team | Business profile/photo/edit | Present + partial modal | Profile media/editor, validation and verified business details |
| Team | Business documents, verification statuses, document menu and upload | Illustrative list + partial dialog | Merchant onboarding documents, uploads, review and audit |
| Team | Team directory, avatar, search/status/role/branch filters | Local | Membership listing, team detail, search API, RBAC |
| Team | Invite/edit membership, role and branch access | Local form | Authorized invitation lifecycle, role assignment, revoke and audit |
| Team | Roles and permissions cards, Manage roles | Preserved partial modal | Full permission matrix and role-management UI and RBAC |

## Non-negotiable preservation rule

**Do not remove or hide controls just because a server endpoint is missing.** Keep their visible design and navigation, identify incomplete workflows in this register, and finish frontend interactions before planning API integration. Never misrepresent a simulated order/payment/security action as a real operation.

## Phase 1 acceptance gates

1. All four screenshots represented at desktop with matching content hierarchy, categories, finance layout, sidebar and topbar.
2. All four screens navigable, dialogs accessible, local prototype changes visible and reversible/restartable.
3. Keyboard/tab, mobile layout, loading/empty/error/populated states and screenshot comparison reviewed.
4. Every present or partially supported control recorded above. **Current gap:** pixel-by-pixel screenshot approval and deeper nested detail workflows are still required before describing Phase 1 as visually exact.
5. No backend hooks are introduced into the isolated prototype and ordinary Merchant route behavior is unaffected.

## Phase 2

Build the remaining four attached screens in the **same isolated frontend branch**: Branch Settings, Security & Sessions, Notifications Center, Support & Help Center. Do not merge before all eight are approved. After Phase 2 perform a complete backend mapping against current authenticated APIs, permissions and database schema, with each missing endpoint traceable back to the UI control.
