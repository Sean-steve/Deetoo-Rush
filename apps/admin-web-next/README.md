# DeeToo Rush Admin — approved design-first frontend

This isolated application is the **new Admin user experience**. Phase 1 implements approved screens 01–04 without contacting any DeeToo API.

Run locally:

\`\`\`bash
pnpm install
pnpm dev:admin-next
# open http://127.0.0.1:5178/#/command
\`\`\`

Build: \`pnpm build:admin-next\`  
Browser verification: \`pnpm test:admin-next-visual\`

## Important separation

- No imports from \`apps/admin\`, API-client, server, or authentication packages.
- Shared browser-persisted demo state for **all** Phase 1 screens.
- Deterministic fictitious Kenyan seed records; no actual platform metrics, personal data or payments.
- Navigation via hash routes: \`#/command\`, \`#/dispatch\`, \`#/orders\`, \`#/riders\`.
- Frontend-only simulated role choice (Super Admin, Operations, Support); it is **not** server-side authorization.
- All approved future navigation destinations remain visible, marked by a non-destructive message until their frontend phases.
- Reset from the top-right user menu or the demo banner.
- All map drawings are illustrative and do not present live tracking, actual routes, or verified ETAs.
- Mock state and reducer live in \`src/data.ts\`; swap this adapter for a backend integration layer only **after all 16 screens are approved**.
- Existing production Admin and DeeToo APIs remain unchanged.
- Verify screenshots from \`visual-output/admin-next/\` against the approved 1536×1024 references. Browser checks confirm structure and workflows, **not automatic pixel-by-pixel parity**.

### Phase 1 workflows
Command Center metrics use the same order/rider store as dispatch, orders and fleet. Dispatch manual assignment requires an available approved rider and an unassigned active order, and synchronizes rider availability. Reassignment releases the rider; advancing to Delivered returns the rider to Available. Orders support filtering, pagination, detail tabs, status editing, cancellation, exporting, notes and printed views. Riders support directory search, availability/status tabs, a map, profiles, adding a new rider application, approval/rejection, suspension and reactivation. Modal validation and the simulated role gates are applied to consequential actions.

### Phase 2–4
Implement the next 12 approved screens in this **same app**, consuming the **same mock store**, then proceed to backend capability mapping.

## Phase 2: approved admin workspaces (screens 05–08)

This feature branch extends the **same** standalone app with four fully interactive frontend-only screens:

- `#/incidents` — incident queue, severity/status filters, assignment, investigation notes, lifecycle, related orders/riders and audit timeline.
- `#/support` — priority inbox, multi-party conversations, private notes, simulated participant responses, admin-led resolution and satisfaction feedback.
- `#/merchants` — merchant directory, onboarding, approvals, KYC placeholder state, profile editing, branch creation, pause/resume and performance sourced from shared demo orders.
- `#/customers` — customer directory, contacts, addresses, order/support history, high-rank simulated account edits, account restrictions, soft-deletion, CSV import/export and audit notes.

The Phase 2 mock records are seeded by `src/phase2Data.ts` and stored under `DemoState.phase2` in the same localStorage key. Existing Phase 1 v1 data is migrated in place to v2, preserving order and rider updates. `Reset demo` clears all phase changes by restoring deterministic fixtures.

**Frontend-only boundaries:** attachments and merchant verification are placeholders, not actual document storage or KYC; support messages are local demo conversation events, not notifications to real parties. Customer deletion is a mock soft-delete, not real data erasure. Operational roles are simulated for workflow review and have no backend authentication. All map positions and financial examples remain illustrative. No DeeToo APIs are imported or contacted.

`pnpm test:admin-next-visual` runs both Phase 1 and Phase 2 browser suites. Phase 2 screenshot captures are available in `visual-output/admin-next/05-*.png` through `08-*.png`, at the approved 1536×1024 reference viewport. Visual parity still requires side-by-side review before design approval.

The next stage remains **Phase 3 frontend-only**, not backend integration.

## Phase 3 — Geographic and financial operations (screens 09–12)

Four complete frontend-only workspaces extend the same persisted `DemoState`, now **v3**, with backward migration of Phase 1 and 2 data. All transitions are local and do not contact payment providers, banks, geographic services or DeeToo APIs.

- `#/geography` — all 47 Kenyan counties with simulated service on/off controls, county delivery rules, new service zones, existing-order safety warnings and change history. County points on the map are schematic and **not authoritative county polygons**.
- `#/payments` — seeded order-based collection view, refund request/review lifecycle, full/partial refund accounting, per-payment reconciliation, provider-like exceptions, audit trail and CSV export. Requested/refunded amounts cannot exceed the original paid order. No real refunds are issued.
- `#/settlements` — merchant and rider share calculation from **delivered, paid** demo orders, no duplicate batching, draft/approve/reject/mark-paid lifecycle, payee allocations, immutable KES snapshot and logged demo references. No actual payouts are made.
- `#/financial` — collected and approved money-flow ledger, derived outstanding partner liabilities, refund and exception review, commercial commission/rider/reserve controls, immutable previous batches and audit history.

Roles: simulated Operations may configure coverage and reconcile demo transactions, while simulated Super Admin approves refunds, payout batches and commercial-policy changes. Real authentication and server authorization await the backend stage.

**Review gate:** 1536×1024 visual screenshots (09–12) plus cross-screen browser tests. Screenshot comparison against the approved originals remains a separate sign-off requirement. Run `pnpm dev:admin-next` and `pnpm test:admin-next-visual`.

## Phase 4 — Final Admin frontend screens 13–16

All **16 approved screens** now live in one independent `admin-web-next` app. Phase 4 extends the persisted demo store to **version 4**; existing Phase 1–3 browser data remains intact.

- `#/analytics` — operational metrics and charts calculated from current demo orders, customer/merchant records, support, incidents and finance; county and sample-date filters; CSV export; saved report filters. Scheduled reports are preferences only, **no scheduler**.
- `#/notifications` — internal notification center, unread state and navigation, composition of campaign drafts, reusable templates, simulated Super Admin send authorization and audience previews. **No real messages** are delivered.
- `#/security` — admin directory, invited accounts, role matrix, simulated account restrictions, MFA indicators and session revocation, protected last active Super Admin, auditable changes. **No live identity provider, MFA challenge, or session tokens**.
- `#/system` — component status (all fixture telemetry), incident linking, simulated platform settings with reasoned changes and audit history. Service checks are illustrative and no backend settings change.

**Configuration is a tab within Screen 16**; it is not a seventeenth screen. The new phase uses `phase4Data.ts` and the same shared browser store as the earlier screens. The top-bar simulated role selector adds Finance and Viewer roles to help review UI restrictions; role authorization remains frontend-only and is not production security.

### Visual and workflow acceptance
- `pnpm dev:admin-next` — preview on port 5178.
- `pnpm build:admin-next` — standalone build.
- `pnpm test:admin-next-visual` — browser acceptance and screenshots for **all 16 screens** at 1536×1024.
- Screenshots: `visual-output/admin-next/01-*.png` to `16-*.png`.
- Pixel-parity versus original approved mockups requires separate side-by-side design review. Phase 4 completion is **not backend approval**.

Do not merge stacked design PRs or connect real DeeToo services before the user's design acceptance. Backend mapping must inventory supported/unsupported UI capabilities, then build missing backend APIs without removing visual components.
