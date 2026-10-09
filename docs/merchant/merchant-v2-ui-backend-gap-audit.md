# DeeToo Merchant v2 — implementation and backend-gap audit

Status: **implementation branch**, pending browser comparison and CI acceptance. Source-of-truth references: the eight Merchant desktop mockups approved on October 9, 2026 (Kitchen Orders, Menu & Availability, Finance & Settlements, Business & Team, Branch Settings, Security & Sessions, Notifications, Support & Help Center).

## Implementation approach

- Merchant-only `MerchantWorkspace` and `merchant-v2.css` isolate the visual system from Customer/Admin/Rider. The workspace includes responsive navigation, an actual branch selector, a server-backed store-status menu, page navigation search and an unread-notification counter.
- Existing route slugs remain unchanged: `/orders`, `/menu`, `/finance`, `/business`, `/branch`, `/security`, `/notifications` and `/support`.
- Reuse actual authenticated resources rather than mock totals, mock financial graphs, fabricated customer identities, invented order statuses or placeholder notification data.
- Maintain backend authorization. The Merchant cannot close support cases on the Admin's behalf. Only the resolution-confirmation/dispute actions available to a case participant are offered.
- API failures are visible as errors; display zero or unavailable where backend data are absent rather than generating demo content.

## Screen-level functional coverage and outstanding backend/UI gaps

| Screen | Connected operations | New visual controls needing backend integration or follow-up |
| --- | --- | --- |
| **01 Kitchen Orders** | Poll/realtime order feed, urgent waiting state, stage filters, accept/decline/prep time, start preparing, mark ready, rider pickup details, notification sound, refresh. | Completed/delivered order history requires historical orders feed. Actual last-week prep-time trend needs analytics endpoint. Mock's **Mark as picked up** must remain rider/dispatch-authorized and is not enabled for merchants. Order-specific top search and multi-field sorting are not yet wired. |
| **02 Menu & Availability** | Existing menu, categories, modifiers, item edit/create/delete, imagery URLs, branch-specific price/availability overrides, search and availability filtering, actual count cards. | Uploaded branch or product photo library needs signed media workflow if desired beyond saved item URLs. Stock quantities/low-stock warnings require inventory schema. Sort A–Z/list view/category imagery controls from mock need UI work or category metadata. |
| **03 Finance & Settlements** | `/finance/merchant/statement`: payable balance, commission rate, settlement list and breakdown, date/status filters, request commercial review, settlement-derived chart. | Daily order-level revenue, M-PESA/card/cash doughnut, per-order transaction ledger, processing-fee breakdown, next-payout date, payout method verification, PDF statements, invoices and export actions need dedicated read/report endpoints. **Do not sum settlement gross as gross sales without clearly labeling the settlement scope.** |
| **04 Business & Team** | Merchant profile edits, team membership/branch scopes, invitations, edits and revocation with existing RBAC. Team table, search, filters and counts use API records. | Logo/storefront photo editing, business documents/verification badges, pending invitation expiry and a granular permissions-matrix editor need media, onboarding and authorization APIs. Showing user IDs instead of names remains a data-shape limitation. |
| **05 Branch Settings** | Name, address, phone, GPS coordinates, coordinate overview, geolocation, preparation defaults, minimum order, backend store status, opening intervals and saves. | Interactive tiled map/geocoding, drag-to-place pin, branch gallery upload, in-store pickup/dine-in toggles, delivery service rules, advanced ordering constraints need relevant API contracts. Coordinate overview is **not** a street map. |
| **06 Security & Sessions** | Active sessions from `/auth/sessions`, current-device marker, device/IP display, single-session revoke and revoke-all with confirmation. | Failed/successful login history, trusted devices, 2FA enrollment, password change from portal, security strength score, account deactivation need dedicated auth/security endpoints. These are presented as unavailable, not fake controls. |
| **07 Notifications Center** | `/support/notifications`, categorized inbox (UI heuristic), search, status/time filters, single-item and sequential mark-read, referenced order/case route shortcuts. | Explicit notification type/category metadata, exact order-detail deep link, preference center, push-channel settings, backend bulk-mark-read for large inboxes and robust pagination/filter API. Categories currently inferred from text and may be imperfect. |
| **08 Support & Cases** | `/support/cases`, case list, conversation detail/notes, case creation, dispute creation, attachment upload/read URLs, replies, human-proposed resolution accept/dispute, status filters, case search. | Help article knowledge base, verified support phone number, internal staff notes (admin-only), rich typing/real-time message delivery, case assignment insights and SLA analytics need APIs. Merchant **Mark resolved** is intentionally absent because support resolution remains an admin-controlled, consent-aware workflow. |

### Shared shell/UI-only items

1. **Overview** sidebar item currently serves as a shortcut to Kitchen Orders. A full merchant overview requires separate operational/revenue summary APIs and a ninth designed page.
2. **Global search** searches Merchant navigation labels only; it is not a server-wide search for customers, order IDs, SKUs or finance records. It must not be represented as such.
3. Branch artwork is a styled icon, not a made-up restaurant photograph; actual merchant/branch cover images require a media URL on the branch resource.
4. Screen-precision gaps: a visual side-by-side screenshot regression at **1648 × 928** and responsive acceptance at tablet/mobile widths have **not yet been completed**. Use the eight supplied mockups as baselines. Assess typography, sidebar width, spacing, actual empty/loaded states, cards and modality.
5. Any code path that uses a support/media/finance endpoint must retain authenticated scope and server-side authorization; frontend hiding is never authorization.

## Acceptance checklist

- [ ] Merchant build and full `pnpm typecheck` green.
- [ ] Test existing order transitions: placed → accepted → preparing → ready → rider pickup without client-side spoofing.
- [ ] Test menu create/update/availability and branch-specific override.
- [ ] Test branch status and opening-hours save, with permission-denied responses for staff.
- [ ] Confirm finance figures against individual settlement records and avoid cross-period double counting.
- [ ] Invite/edit/revoke team member with a privileged account and verify staff cannot perform owner-only mutations.
- [ ] Revoke one noncurrent session and revoke all with confirmation.
- [ ] Mark notification read; search and filters consistent after refresh.
- [ ] Open support case, attach evidence, reply, receive proposed resolution, accept/dispute. Admin remains responsible for closing cases.
- [ ] Pixel review on all eight mockups; test loading/error/empty/long-text/large-list and reduced-motion states.
- [ ] Audit keyboard accessibility and mobile behavior across every screen.

## Engineering sequencing for remaining gaps

**Phase A (operational parity):** historical order queries, richer search, category metadata/inventory, branch media/map integration, support queue metadata.  
**Phase B (financial/reporting):** normalized merchant ledger/transaction history and payment-method split, daily charts, payout schedule, statements/exports.  
**Phase C (trust and preferences):** login audit, trusted devices/2FA, role permission editor, notification preferences, knowledge base and support SLA visibility.

Do not enable a button with a simulated mutation as a substitute for adding an authorized API endpoint.
