# Customer Web vNext — Screens 11–13: implementation and API adapter inventory

**Status:** implemented visually and interactively on the isolated Customer Web vNext preview; backend **not connected**.
**Reference:** Approved mockups 11 Profile Dashboard, 12 Security & Devices, 13 Notifications Center (1672 × 941).
**Safety:** Existing Customer/Merchant/Rider/Admin apps, backend routes, session state and data schema remain untouched.

## Implemented components

| Screen | Interaction coverage | Data scope |
| --- | --- | --- |
| 11 Profile | Profile information, local edit/validation, add/edit/remove/default sample addresses, payment method sample cards, section jumping, marketing toggle, quick links, Plus introduction | Component-local; changes reset on reload. No geocoding/payment tokenization/subscriptions. |
| 12 Security & Devices | Password/2FA/PIN status cards, sample login events, device menus, session revoke informational affordances, privacy controls | Informational only. No real credential changes, sign-outs, device revocations or account deletion. |
| 13 Notifications Center | Category filters, unread indicators, mark-one/all read, channel/preference toggles, click-through navigation | Component-local only. No browser push permissions, SMS, email or subscription calls. |

## Verified backend route candidates (authentication/roles must be reviewed in integration)

| Surface | Actual existing routes | Next integration requirement |
| --- | --- | --- |
| Identity | GET /api/v1/auth/me | Fetch authenticated identity and replace the Test User fixture. |
| Customer profile | GET and PATCH /api/v1/customer/profile | Use validated writes, server refetch, error/conflict handling. |
| Saved addresses | GET and POST /api/v1/customer/addresses; GET/PATCH/DELETE /api/v1/customer/addresses/:id; POST /api/v1/customer/addresses/:id/default | Use real address records, PostGIS geometry/serviceability and atomic default change. |
| Sessions | GET /api/v1/auth/sessions; POST /api/v1/auth/sessions/:id/revoke; POST /api/v1/auth/sessions/revoke-all | Read server sessions, verify current session and require destructive confirmation with fail-closed handling. |
| Password/MFA | POST /api/v1/auth/password/forgot; POST /api/v1/auth/password/reset; POST /api/v1/auth/mfa/enroll; POST /api/v1/auth/mfa/verify | Build secure re-auth and confirmation flows; never infer real enabled state. |
| Notifications | GET /api/v1/customer/support/notifications; POST /api/v1/customer/support/notifications/:id/read; alternatively recipient-scoped GET /api/v1/support/notifications | Server-authoritative inbox, recipient scoping, loading/errors, idempotent read. |
| Push device registration | POST /api/v1/devices/register | Do not activate until verified browser permission, consent and token lifecycle. |
| Notification preferences and bulk read | No specific preferences or customer bulk-read route verified | Establish authenticated preferences API and bulk-read or safe per-item handling. |
| Payment instruments / Plus / referral rewards | No corresponding customer-facing adapters verified in these three screens | Leave preview-only until product and secure storage policies are established. |
| Privacy settings and account deletion | No purpose-built authenticated customer deletion/settings flow verified | Require product/legal/security approval, re-auth, audit and policy-consistent handling. |

Source paths verified: apps/api/src/modules/index.ts; apps/api/src/modules/customer/customer.router.ts; apps/api/src/modules/auth/auth.router.ts; apps/api/src/modules/operations/operations.router.ts; apps/api/src/modules/operations/device.router.ts.

## Gate before production mapping

1. Replace sample view models with authenticated customer API adapters and proper loading/empty/error states.
2. Keep current visual components unchanged while mapping real data and validating input. Confirm role and recipient authorization server-side.
3. For destructive security operations, confirm explicitly and only report success after the server confirms.
4. Persist customer preferences only after validated channel-specific consent. Implement push registration separately.
5. Compare browser captures at 1672 × 941 against each reference PNG. Passing CI alone is not pixel-level approval.
6. Do not merge the vNext app into the production Customer route before all 15 screens and acceptance gates are approved.

Run: pnpm dev:customer-next (http://localhost:5174); pnpm test:customer-next-visual (screenshots and interactions).
