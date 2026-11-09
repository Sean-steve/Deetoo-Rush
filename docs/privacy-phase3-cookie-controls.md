# DeeToo Phase 3 — Web cookie consent, privacy controls and acceptance

Branch: feat/privacy-phase3-cookie-consent-20261109 (independent of auth PRs #76 and #77).

## Implementation

- A single reusable component appears in canonical Customer/public, Merchant and Admin web entry points, including standalone design previews and explicit legacy rollback shells.
- First visit: equally available Reject optional / Customize / Accept all; optional categories default OFF.
- Essential session, CSRF and checkout security remain required; never presented as an opt-out checkbox.
- Optional purposes: functional convenience, analytics and marketing tracking. Marketing-site cookies DO NOT authorize direct-marketing SMS/email campaigns or admin broadcasts.
- A minimal first-party consent cookie (`deetoo_privacy_consent`) stores policy version `2026-11-09`, receipt ID, recorded date, expiry, source and boolean preferences for 180 days, host-only, Path=/, SameSite=Lax, HTTPS Secure.
- The consent receipt contains **no personal identifiers**. Guest choices remain in the browser. A new policy version or expired/malformed receipt requires a new choice.
- Global Privacy Control, when present, forces marketing and analytics to false, including previously accepted choices. User options display that restriction.
- A permanent unobtrusive Privacy choices control can reopen the panel at any time. The public footer also links to /cookies and to the setting.
- New optional analytics, advertising pixels or convenience-storage integrations MUST check `canUseCookiePurpose('analytics'|'marketing'|'functional')` or the `runWithCookieConsent` helper before initialization. Existing essential app UI storage is not deleted.
- Browser receipt storage is immediate; for users with an authenticated cookie session and readable CSRF cookie, each choice is additionally POSTed to the append-only PostgreSQL user-owned record table. Server errors do not erase locally saved opt-out choices.
- Authenticated GET `/api/v1/auth/privacy-consent` returns the user's last 20 recorded choices. No admin override endpoint exists. If a visitor made a choice before login, the browser receipt still applies; server history may not contain that anonymous choice until the user makes or resynchronizes an authenticated choice.
- Native Rider Android does NOT receive a website cookie banner. Android permissions and privacy notices are separate platform work.

## Current cookie and storage inventory

| Name or mechanism | Purpose | Managed |
|---|---|---|
| `deetoo_access_token` | Authentication | Required HttpOnly, path /api/v1 |
| `deetoo_refresh_token` | Refresh session | Required HttpOnly, path /api/v1/auth |
| `deetoo_csrf` | Prevent forged authenticated web mutations | Required, readable anti-CSRF token |
| `deetoo_privacy_consent` | Consent choice/version/expiry | Required minimal first-party record |
| Optional analytics/marketing tags | Not provisioned by Phase 3 | Block by default with consent gate if integrated later |

Browser cookies use host scoping, not TCP port scoping. Localhost Customer/Merchant/Admin ports therefore share the cookie, but separate production subdomains may prompt independently. A central consent-management service is required only if cross-domain account-level preferences become a product requirement.

## Security and release gates

1. Test first visit without cookies: no optional purposes enabled, equal reject and accept prominence.
2. Test reject, customize, accept, explicit withdrawal, reload persistence and reopen.
3. Verify Global Privacy Control blocks analytics/marketing regardless of previous choices.
4. Verify 180-day expiry, invalid/corrupt receipt, and policy-version change trigger a new prompt.
5. Verify no optional scripts initialize or store identifiers prior to permission; audit any scripts/third-party fonts loaded elsewhere before launch.
6. Verify Customer/public, Merchant and Admin working logins, CSRF protection, checkout and operational UI remain functional after rejecting all optional purposes.
7. Test authenticated PostgreSQL consent history, cross-user read denial, mutation refusal for reused receipt ID, and retention policy.
8. Confirm final legal/privacy notice, data-controller contact, vendor/cross-border-transfer descriptions, actual cookie inventory, and retention schedule with Kenya counsel/ODPC guidance. This code is not a legal certification.
9. Existing marketing email/SMS consent settings remain independent of website cookies, including transactional receipts and order notifications.

Kenya references: https://www.odpc.go.ke/data-protection-laws-kenya/ ; https://www.odpc.go.ke/rights-of-a-data-subject/index.html ; https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-01-14/source

## CI evidence

- Browser tests added to existing `pnpm test:phase1-browser` suite.
- Unit tests: default deny, Global Privacy Control, malformed/expired receipts, receipt storage, server validation.
- PostgreSQL foundation test: append-only per-user audit, immutable receipts, idempotency and persistence across reconnect.
- Production readiness remains gated on human approval of legal copy and full tracker/vendor inventory, not CI alone.