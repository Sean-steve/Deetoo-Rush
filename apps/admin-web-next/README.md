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
