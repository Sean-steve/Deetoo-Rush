# Customer Web vNext — Phase B4 Connected Account, Notifications & Support

**Branch:** feat/customer-vnext-phase4-account-support
**Scope:** approved Screens 11–15, integrated using DeeToo's existing customer-scoped API. Preview visuals remain untouched, and connected mode remains a development-only opt-in.

## Removal report

**No deletions or removals.** No approved components, original customer UI, demo fixtures, backend services, authorization rules, or production database schema were removed or altered. The connected-mode placeholder routing is replaced by actual data-backed screens.

## Implementation

| Screen | Real backend contract | Delivered interface and restrictions |
| --- | --- | --- |
| 11 Profile & Addresses | GET/PATCH /customer/profile; GET /customer/addresses; POST /customer/addresses/:id/default; DELETE /customer/addresses/:id | Saved customer profile, validated server update, real addresses, default selection and deletion with confirmation. Add/edit address dialogs are available directly in the profile: new addresses require verified GPS and serviceability, and changing an existing street, town or region requires fresh GPS verification; the connected checkout address picker remains available. No fabricated wallet, saved card, rewards or membership benefits. |
| 12 Security & Devices | GET /auth/sessions; POST /auth/sessions/:id/revoke; POST /auth/sessions/revoke-all; POST /auth/password/forgot | Real active session devices, current-session indicator, per-session and all-device revocation only after confirmation, and account recovery request. No local credential handling. MFA enrollment requires the secure step-up/QR recovery experience and is **not** falsely presented as enabled. |
| 13 Notifications Center | GET /customer/support/notifications (response {notifications,total}); POST /customer/support/notifications/:id/read | Live recipient-scoped inbox, unread count, category tabs, search, read state and server-confirmed individual mark-read. No invented channel preferences, device tokens or bulk read. |
| 14 Help & Support | GET/POST /customer/support/cases | Real cases, categories, active/waiting/resolved filters, request creation and authenticated order-association verification, empty/error/loading and retry states. |
| 15 Support Conversation | GET /customer/support/cases/:id; POST /customer/support/cases/:id/notes; POST /customer/support/cases/:id/resolution-response; GET authorized attachment read-url | Authenticated case history, participant-visible notes, ongoing conversations, real message post, related customer-owned order, signed read URLs and acceptance/dispute of real proposed resolutions. No simulated support agents, status, image or refund. Attachments are *read-only* until the secure media-upload lifecycle has been separately certified. |

## Screens / states added during integration

- Explicit revocation confirmation, session sign-out, password recovery request.
- Profile edit, GPS/serviceability-backed add/edit address dialog, protected address delete confirmation, and connected shopping address selection.
- Notification read/empty/error/recipient-owned views.
- Case creation dialog with optional scoped order, persisted conversation, case state timeline, resolution review and dispute.
- Missing delivery/case, missing GPS/ETA and payment-pending states retained from Phase B3.

## Backend behavior and review gates

1. Authentication uses HttpOnly cookies, existing CSRF handling, refresh and customer role checks; no new token storage.
2. Backend customer routes verify saved address, order, notification, support case and media attachment ownership; UI never substitutes its own authorization.
3. **Support closure policy requires sign-off**: staff propose; current respondToResolution automatically closes after every required participant accepts. Original product request called for administrative final closure. Changing this requires separate backend policy update and tests; this integration does not silently change financial or case permissions.
4. Notification preferences, bulk read, opt-in for marketing/push channels, verified MFA status/enrollment, account deletion, saved card vault, DeeToo Plus and referral/rewards still lack approved customer-facing contracts. Display non-operational explanatory states, not fake toggles or sample records.
5. Support evidence upload requires media purpose, ownership, size, MIME type and signed upload lifecycle validation. Only existing media read URLs are connected here.
6. Backend service notification list is wrapped in {notifications,total} and cases list in {cases,total}; gateway matches these envelopes.
7. Refresh visibility intervals: notifications 30s, support cases 45s, active conversation 18s. No polling for signed-out customers. Mutations refetch and show errors; on uncertain message timeout, user is asked to check before retrying to reduce duplicate messages.
8. External staging M-PESA sandbox callbacks and ledger certification remain **HOLD** from Stage B2; Phase B4 does not certify production cutover.

## Acceptance

- Phase B2 and B3 real-service PostgreSQL/PostGIS/Redis workflows remain active in CI.
- Independent Playwright route acceptance for real connected Screens 11–15 is added alongside the 10 earlier connected tests and the approved visual preview tests.
- Verify real customer account data, session revocation, notification recipient protection, customer support isolation, message persistence and resolution policy on isolated staging before product release.
- Keep this PR **draft and stacked on Phase B3**. Nothing merges into production until all release gates pass.

### Run connected screens

```bash
VITE_CUSTOMER_NEXT_BACKEND_MODE=connected pnpm dev:customer-next
pnpm test:customer-next-connected
```

Default `pnpm dev:customer-next` continues to render the 15 owner-approved visual preview screens.
