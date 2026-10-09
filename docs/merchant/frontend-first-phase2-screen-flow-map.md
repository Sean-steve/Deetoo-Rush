# DeeToo Merchant — Phase 2 Frontend Screen/Flow Mapping and Backend Gap Register

**Branch:** `feat/merchant-frontend-flow-phase1` (same isolated prototype as Phase 1).  
**Scope:** Screens **05 Branch Settings**, **06 Security & Sessions**, **07 Notifications**, **08 Support & Help Center**.  
**Reference images:** `Restaurant Branch Settings Dashboard.png`, `Merchant Security & Sessions Dashboard.png`, `DeeToo Merchant Notification Center.png`, `Modern Merchant Support Dashboard.png`, as supplied on 2026-10-09.

**Access the complete eight-screen frontend preview:** `http://localhost:5174/?merchant-prototype=1` with `pnpm dev:merchant`. Or append `&screen=branch`, `&screen=security`, `&screen=notifications`, `&screen=support`. **This is a deliberately isolated frontend-only demonstration**. It does not read or modify the DeeToo backend, authentication, payments, customer data or live merchant configuration. Sample figures, names, security status, device history, support conversations and notification events are examples. Mock changes persist in browser localStorage where useful to demonstrate navigation and workflows.

**Preservation rule:** Every component on an approved design stays accounted for, even when not supported by the backend. Components are not silently removed; some remain visually represented and require deeper frontend or authorized backend functionality. Track those explicitly below.

## Screen 05 — Branch Settings

### Visible screen and navigation
- Shared navigation and top bar, branch preview card and store Open/Paused/Closed indicator; clicking *View on map* opens illustrative map preview.
- Seven section tabs: **General, Location, Operating hours, Preparation, Delivery & service, Ordering rules, Advanced**. Tabs navigate/scroll or open nested settings dialogs.
- Three-column desktop composition: **General information, Location, Operating hours**; lower panels **Preparation settings, Delivery & service options, Branch image**.
- General information: branch name, display name, business description, phone, email, and segmented store-status control.
- Location: street address, town, latitude/longitude, illustrative street map with pin/label, current GPS location action, update-location dialog.
- Operating hours: individual day rows, open/closed toggle, opening/closing times, weekday display.
- Preparation: default prep duration and minimum basket amount in KES.
- Delivery & service: dine-in/pickup, delivery, table-service toggles.
- Branch image: image preview and JPG/PNG/WebP image input with browser-side validation; 5 MB limit.
- Bottom Save branch settings action, field checking and localStorage persistence.
- Ordering rules: minimum basket and maximum concurrent orders dialog; Advanced: reset demo preferences.

### Backend mapping / unsupported components
| Component / flow | Frontend state | Backend required before production |
|---|---|---|
| Branch identity / phone / email / description | Editable, browser-persisted | Branch DTO, merchant profile vs branch ownership rules, authorized update and validation |
| Operational status cards / global pill | Shared local state | Store availability state transition endpoint, merchant permission, order-eligibility enforcement, audit |
| Days, time inputs, enable toggles | Editable and saved locally | Branch weekly hours schema, timezone/DST handling, closure exceptions, conflict and validation |
| Geolocation button | Uses browser geolocation consent | Server-side coordinate update, geo bounds/verification, address/geocoding |
| Map preview and pin | **Illustrative CSS map, not live tiles** | Geocoding/map SDK, drag-to-place pin, address reverse lookup, persisted service point |
| Preparation and minimum KES | Local values | Prepared-order SLA model, money in minor units, update API |
| Delivery, pickup, dine-in/QR toggles | Local prototype controls | Fulfillment policy, delivery zone support, QR/table business model and permissions |
| Upload branch image | Browser FileReader preview | Signed media upload, format/size moderation, media ID/CDN URL storage |
| Rules / advanced tabs | Dialog controls with local preferences | Ordering-rule schema, advanced toggles, detailed UX, safe administrative scope |
| More branches / branch selector | Single seeded Juja branch | Multi-branch list/create/switch permissions and scoped data invalidation |

## Screen 06 — Security & Sessions

### Visible screen and navigation
- Branch summary **Back to dashboard** action returns to Kitchen Orders.
- Four top cards: Active sessions count, Trusted devices count, Last login, Security status/strength bar.
- Active sessions: current desktop session, Android device, Windows desktop; OS/browser/device/location/activity timestamps; trusted/current labels; per-device overflow.
- Login history: dated table, device, location, success/failure status, per-row detail menu and View all control.
- Security settings: Change password, Two-factor authentication (2FA) with state, Trusted devices.
- Danger zone: Sign out all devices and Deactivate account.
- Interactions: revoke a session, toggle trusted status, view login details, simulate new password form, 2FA switch, confirm revoke-all/deactivate/reactivate; reset demo session list.

### Backend mapping / unsupported components
| Component / flow | Frontend state | Backend required before production |
|---|---|---|
| Active session list, session menu and revoke | Local seeded data; browser-persisted | `/auth/sessions`, revoke endpoint, current-token invalidation, authenticated scoping |
| Trusted devices badges and switches | Local state only | Trust grant/revoke, device attestation, remembered-device policies |
| Last login, security score | **Illustrative** | Actual audit events and a defensible computed security posture, not a fabricated score |
| Login history, View all and event details | Local sample six events | Server-side login audit/read, paging, risk/IP/geo accuracy, failed-attempt visibility |
| Change password dialog | Demo input only; never asks for current real password | Step-up auth, current credential verification, password policy and revoke flows |
| 2FA status / toggle | Local preference only | Enrollment, TOTP or passkey, recovery codes, disable protection with step-up |
| Revoke all, including current | Local modal + state | Authenticated revoke-all and safe app sign-out |
| Deactivate / reactivate | Local modal + state | Role-based account lifecycle, impact confirmation, restoration policy, audit |
| Suspicious login notifications | Not in screen mock but related | Login security event pipeline and notification integration |

## Screen 07 — Notifications Center

### Visible screen and navigation
- Shared inbox page heading, Mark all as read, Notification settings.
- Left filter panel with **All, Orders, Payments, Payouts & settlements, Menu & availability, Business updates, System notifications, Support messages** and computed counts.
- Status filters All, Unread, Read; date filters All time, Today, This week, This month.
- Center scrollable notification list with per-type icon, title/description, relative time and unread dot; Newest/Oldest first sorting.
- Right expanded notification details: badge, date, full description, order details (ID, customer, item and amount), delivery address and illustrative map preview, View order, related screen action, Contact customer, Mark read, ellipsis actions.
- Notification preferences dialog with email/push/order sound toggles; per-item dismiss/read and related-screen navigation.
- Notification badge in sidebar/topbar updates as the demo inbox is read.

### Backend mapping / unsupported components
| Component / flow | Frontend state | Backend required before production |
|---|---|---|
| Inbox list, category type and unread counter | Typed local records / localStorage | Notification feed, semantic event categories, delivered/read state and authorization |
| Filter counts / date ranges / sorting | Local filter | API pagination/query/count and canonical time windows |
| Mark read / mark all read / dismiss | Local updates | Per-notification read, bulk read, archive/dismiss API, idempotency |
| Notification settings / push / email / sounds | Browser-only settings | Channel preferences, push subscriptions, notification policy exceptions, device permissions |
| Order detail right panel + View order | Seeded demo fields, route to Kitchen | Authorized order DTO, direct order deep-link, customer privacy |
| Customer contact | Displays mock contact only, modal | Masked/proxy calling/communications, consent and privacy policy |
| Delivery location map | **Illustrative placeholder** | Authorized maps/ETA/location disclosure contract |
| Payment/menu/support notification navigation | Routes to Phase 1/2 frontend pages | Notification context metadata and reliable entity-specific deep links |
| Low-stock notification | Sample event | Inventory balance model and low-stock event rule |

## Screen 08 — Support & Help Center

### Visible screen and navigation
- Quick actions: **Start a conversation**, **Help articles**, **Call support**.
- Five summary cards: All cases, Open, In progress, Awaiting your reply, Resolved.
- Two-panel desktop workspace: left searchable case queue and status tabs; right selected case conversation.
- Case list rows: category icons, title, case ID, relative age, excerpt, status badge and chevron.
- Conversation header: case ID, title, created time, status, category, ellipsis and **Mark as resolved** control kept visible.
- Thread: Merchant/DeeToo Support identities, timestamps, chat bubbles, evidence filename chip with download symbol.
- Composer tabs **Reply** and **Add internal note**, textarea, Attach files, permitted extensions/5MB hint, send action.
- New case form: type (support/dispute/general inquiry), category, subject, optional order ID, description, evidence file selector.
- Help article modal with search and FAQs; Call support presents truthful contact options without inventing a verified telephone number.
- Case action/details modal and status filtering.

### Backend mapping / unsupported components
| Component / flow | Frontend state | Backend required before production |
|---|---|---|
| Case summaries, queue and search | Seeded local records, counts reflect local mutations | `/support/cases`, scoped pagination/search, case state and assignment |
| Case messages, send, refresh continuity | Local conversation append / browser persistence | Authenticated append/read, timestamps, real-time notifications, edit rules |
| Create support/dispute case | Functional local form | Separate support & trust/dispute workflows, evidence association and validation |
| Evidence attach and download | Local filenames only; **not uploaded** | Authorized upload, signed download/read URLs, virus scan, retention |
| Mark as resolved button | **Retained as mock confirmation; does not close a real case** | Admin-led proposed resolution, participant consent, authority and audit before closure |
| Add internal note tab | **Retained but guarded** with disclosure, not editable by merchant | Support-staff-only internal notes, server RBAC; no merchant information leak |
| Help articles / FAQ search | Functional local FAQ list | CMS knowledge base, article revisions, category search |
| Call support | Dialog without made-up phone number | Official verified number, hours, telephone integration |
| Case details/overflow | Local details | Scoped case detail, status timeline, SLA/escalation, participants |
| Case/order navigation | Local IDs | Authorized order linking and relationship data |

## Cross-screen flows completed in Phase 2

1. Global sidebar → all eight screen routes; logo/sidebar shell stays consistent.
2. Header store status ↔ Branch Settings status controls: shared React state (frontend only).
3. Branch Settings → Location dialog, GPS request, hours/service controls, image input and local save.
4. Security → session overflow, trust/revoke, login history, 2FA and danger confirmations.
5. Notifications → select → details → read/dismiss; order/menu/finance/support messages deep-link to their related screen.
6. Support → select case → read messages → compose/send → local thread update; new case → queue; Help and contact modals.
7. All Phase 1 screens remain available, and Phase 2 is introduced **without replacing live app routes** (only the `?merchant-prototype=1` preview uses it).

## Acceptance and known remaining work

- [x] Eight screens registered and navigable in an isolated frontend route.
- [x] Phase 2 visual structures and key example interactions coded.
- [x] Explicit component register records absent/pending backend endpoints and admin-only actions.
- [ ] Pixel-by-pixel comparison against the eight supplied image references at reference viewport.
- [ ] End-to-end browser acceptance of all nested Phase 2 dialogs and empty/error states.
- [ ] Frontend flow review with product owner, including privacy/role consequences.
- [ ] Replace partial placeholders in Phase 1 finance/menu/team with complete nested frontend designs.
- [ ] Backend audit across all eight screens after visual and interaction approval (separate from prototype).

**Do not merge into `main` before UX acceptance and backend integration planning.**
