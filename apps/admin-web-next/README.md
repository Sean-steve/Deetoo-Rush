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
