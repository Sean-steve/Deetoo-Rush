# DeeToo Rush — Admin Next Phase 3 API Integration

**Branch:** `feat/admin-next-backend-phase3` (stacked on completed backend Phase 2).  
**PR:** https://github.com/Sean-steve/Deetoo-Rush/pull/52  
**UI:** The 16 approved Admin screens and their tabs/cards/navigation remain; live adapters are additive. **Do not merge to main** before the user approves the integration and the stacked branches.

## Modes and runbook

**Live API mode is default.** Install and run the actual DeeToo API, with PostgreSQL/PostGIS/Redis migrations 001–041 and authenticated staff, in a separate terminal:

```bash
pnpm dev:api
pnpm dev:admin-next
# http://127.0.0.1:5178/#/command
```

Vite proxies same-origin `/api` to `http://127.0.0.1:3000` by default; override with `DEETOO_API_ORIGIN` if necessary. Authentication uses session cookies, CSRF headers, refresh and `/auth/me`, not a fabricated role picker. Recent MFA verification is offered through the real `/auth/mfa/verify` endpoint. The UI never stores API responses or tokens in localStorage.

Only for **explicit design QA**:

```bash
VITE_ADMIN_NEXT_MODE=demo pnpm dev:admin-next
```

In demo mode, actions remain reducer-backed test scenarios and fake records persist only in browser localStorage. **Live mode does not load or fallback to demo fixture data**, and server errors are shown with retry rather than silently presenting synthetic results.

## Sixteen-screen backend binding matrix

| Screen | Read resources | Real workflow boundary |
|---|---|---|
| 01 Command | orders, riders, incidents, support, financial records | Live overview derived from accepted API records; no synthetic operational event injection |
| 02 Dispatch | deliveries + riders | Rider assignment/unassignment through server; proof/OTP-dependent delivery transitions cannot be faked |
| 03 Orders | /admin/orders | Cancel, notes and scoped details; no arbitrary admin pickup/delivery advancement |
| 04 Riders | /admin/riders | Server-reviewed approval/rejection/suspension/reactivation; no self-issued active rider |
| 05 Incidents | /operations/incidents | Create, inspect, status transition and timeline notes; assignments require verified staff UUID |
| 06 Support | /operations/support/cases | Admin notes/status; party-confirmed closure from actual Customer/Merchant/Rider identities |
| 07 Merchants | /admin/merchants | Governance-managed status and branch controls; legal/owner proof still required for new business records |
| 08 Customers | /admin/customers | Audited notes, updates, deactivation, supervised pending provisioning; address creation requires geocoding |
| 09 Geography | /admin/geography/counties, /admin/service-zones | County impact checks, polygon-aware gating, commercial pricing; no text-only GIS boundaries |
| 10 Payments | /finance/ops/payments and per-payment refunds | **Dedicated live payment UI**; server-requested refunds, independent approval/rejection and provider reconciliation |
| 11 Settlements | /finance/settlements and /finance/payouts | **Dedicated live payout UI**; calculate, maker/checker approve, reject and provider-owned submission (no manual PAID) |
| 12 Financial Control | /finance/ops/overview, /finance/ops/journal, analytics | Real captured/ledger amounts in KES minor-unit converted display; unsafe demo percentage editing disabled in live |
| 13 Analytics | /admin/analytics/series, /admin/reports | Backend historical series, report definition CRUD, real buckets (not randomized graph points) |
| 14 Notifications | /admin/notifications, campaigns, templates | Inbox receipts, drafts, **separate approval before queue**, provider/consent state must be verified |
| 15 Identity | /admin/users, /auth/sessions | Staff invitations and roles via server, cross-user session revocation, MFA recovery approval; last Super Admin backend guard |
| 16 System | /admin/observability/dependencies, /admin/configuration | Measured dependency readiness and allowlisted service-enforced settings, not fictional health overrides |

For every resource, live fetch status distinguishes ready, access-restricted, and error. A failed/unauthorized resource must not be replaced with sample rows. The overview may use real loaded records when the server doesn't expose a dedicated aggregate; incomplete pagination is not represented as all-time totals.

## Canonical data and mutation safeguards

- **UUIDs**: read-side adapters retain real identifiers across order/customer/rider/delivery/payment references. Only verified UUIDs are allowed for protected actions. Server returns 400/403/409 and the UI shows that code without mutating local demo state.
- **KES amounts**: back-end **minor** units are divided by 100 only at presentation; refunds/payment writes send minor units and server validates balance/state. No client can assert payout PAID.
- **Order lifecycle**: server dispatch/OTP/proof controls stay authoritative. Support staff cannot speak on behalf of participants or mark them satisfied.
- **Coverage**: county-code backed, PostGIS-based serviceability precedes enablement; ETA/pricing change uses the server's existing zone rules.
- **Notifications**: draft, approved, queued, sent, failed, cancelled are not conflated. A provider accepting a message does not prove user/device delivery. Consent and opt-in checks run on the backend.
- **Security**: real role guards, session revocation and MFA are server controlled; the old demonstration role chooser is hidden in live mode.
- **Config**: simulated thresholds and service-health overrides remain UI-only previews; only controls with confirmed backend enforcement issue live writes.

## Known gated actions (retained visually; not falsely committed)

The approved mockups use simplified fields for some workflows. Until Phase 4 adds the necessary verified participant/merchant, geographic and cross-app context, live mode intentionally returns an actionable error for such interactions rather than inventing identities or geography:

1. Adding a new rider without verified identity and onboarding evidence.
2. Creating/editing a merchant with only partial owner/legal fields; adding a merchant branch without geocoded address and service-zone verification.
3. Creating a support case from a display name alone, assigning to free-text staff name, or simulating a participant's acceptance.
4. Adding a customer delivery address without precise verified coordinates/recipient details.
5. Creating a coverage zone without a valid serviceability polygon.
6. Manually forcing pickup or delivered status from an Admin screen without OTP/proof or a permitted server remediation command.
7. Changing unimplemented configuration keys or measured service-health status.
8. Production send/settlement/finance operations when the provider/role/MFA prerequisites are not configured.

**All UI components remain**; gated actions show the condition and do not claim success. Improving data-entry forms and participant selection is a Phase 4/5 cross-party acceptance task rather than relaxing server invariants.

## Test and release gates

- `pnpm lint`, `pnpm build:admin-next`, `pnpm test:admin-next-visual` (demo visual regression) and `playwright.admin-next-live.config.ts` (live transport/auth and 16-screen render, mocked API contract).
- Repository CI also runs migration/authorization, real database/Redis ordering and delivery, CodeQL and cross-application browser checks.
- **Not proven in Phase 3:** connected staging/provider secrets and production network, real Customer/Merchant/Rider intervention propagation, high-volume filtered pagination, every live admin action against staging, four-party sandbox consent/payout/OTP flows, production deployment, pixel-for-pixel snapshot recertification.

Phase 4: validate and connect the actual Customer, Merchant, Rider and Admin participant flows end-to-end. Phase 5: comprehensive real-database and provider-sandbox acceptance, negative-role and MFA, release hardening.

