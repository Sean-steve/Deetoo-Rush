# DeeToo Admin Next — Phase 2 Backend Capability Closure

**Branch:** feat/admin-next-backend-phase2  
**Scope:** Backend APIs, migrations and worker enforcement only. The approved 16-screen Admin Next frontend remains unchanged. Phase 3 will integrate its screens.  
**Implemented migrations:** 039 (Admin features), 040 (campaign consent/invite/MFA recovery/report schedules/measured telemetry), 041 (incident evidence).
**Source of truth:** DeeToo PostgreSQL, existing ledger, dispatch, support, private media and notification services; never browser fixtures.

## Closure checklist

| Area | Phase 2 backend contract | Runtime behavior / guard |
|---|---|---|
| Broadcast preferences | GET/PUT /auth/broadcast-consent | Authenticated user's self-service, per-channel opt-in; default is false; recipient cannot be opted in by staff. |
| Campaign approval and delivery | POST /admin/communications/campaigns/:id/approve, /send, GET /.../:id/delivery | Separate Super Admin maker/checker; approval snapshots <=250 consented recipients; send is idempotent and queues existing notifications; outbox worker rechecks consent and campaigns pause immediately before provider handoff. PENDING/QUEUED are not DELIVERED. |
| Channel delivery providers | Existing notification worker / external provider | IN_APP, SMS (Africa's Talking), EMAIL (Resend), PUSH (FCM); absent credentials block initial queueing rather than pretending success. Real delivery receipts depend on provider callback/device support. |
| Staff invitations | POST/GET /admin/security/invitations, POST /admin/security/invitations/:id/resend, POST /auth/invitations/activate | Creates PENDING staff via existing governance service, emails single-use 48h hashed-token invitation, owner activates with strong password. Emails report provider acceptance, not mailbox proof. Expired/used/revoked token cannot activate. Only SUPER_ADMIN creates. |
| MFA recovery | POST /admin/security/users/:id/mfa-reset-requests, GET /admin/security/mfa-reset-requests, POST /admin/security/mfa-reset-requests/:id/approve | Recent MFA on privileged writes; second Super Admin approves within 30 minutes; never requester or target; encrypted MFA secret deleted and all sessions revoked. User re-enrolls via existing real /auth/mfa/enroll. |
| Operational switches | GET /admin/configuration, PATCH /admin/configuration/kill-switches/:key, PATCH /admin/configuration/settings/:key | Strictly allowlisted; existing operational kill switches preserved. notification_campaign_paused gates publish and background worker. support_intake_paused gates **new customer support cases**, not existing conversations. maintenance_banner is a display indicator, *not* an outage switch. Unsupported SLA/global switches remain explicitly unsupported. |
| Saved reports | GET/POST/PATCH/DELETE /admin/reports, POST /admin/reports/:id/delivery, GET /admin/reports/:id/delivery-history | Owner-scoped WEEKLY/MONTHLY **digest notifications** are queued through existing mail outbox when email provider configured and worker running; owner auth/role checked before dispatch; delivery history persisted. This sends a sign-in notification for the saved report; it does not attach a sensitive data export to email. |
| Measured health series | GET /admin/observability/dependencies, GET /admin/observability/series | Automation worker records real DB/PostGIS/Redis status and check durations every ~60s; query bounded to 168h/500 samples. Empty results mean no observed history, not 100% uptime. |
| County delivery commercial settings | GET/PATCH /admin/geography/counties/:code/commercial | Super Admin, reason, 0..150 active polygon-backed zones; changes create authoritative zone delivery fee rules and ETA buffer consumed by checkout pricing, leaving existing signed quotes unaffected. Global fallback never uses another zone's rule. |
| Incident media evidence | GET/POST /admin/operations/incidents/:id/evidence | Admin/Ops must upload a purpose-bound private ADMIN_INCIDENT object through existing signed media API, verify upload, then attach its media ID; only owner can link and duplicate association is rejected. GET returns metadata only; signed download through existing /media/:id/read-url. |
| Prior Phase 2 capabilities | docs/admin-next/backend-phase2-implementation.md | Order/customer notes, customer address intervention, customer import, incident creation, refund/batch rejection, finance review, analytics and source-of-truth governance preserved unchanged. |

## Configuration and deployment prerequisites

Required for durable behavior: \`DEETOO_STORAGE_MODE=postgres\`, migrations 039–041 installed, working PostgreSQL/PostGIS/Redis, real authenticated sessions, recent MFA on staff privileged writes, \`pnpm workers:start\` (or the existing supervised individual workers).

| Feature | Provider configuration |
|---|---|
| Staff invitation activation emails | \`ADMIN_INVITE_BASE_URL\` (HTTPS link to future activation screen), \`RESEND_API_KEY\`, \`AUTH_EMAIL_FROM\` |
| Scheduled email report digests | \`RESEND_API_KEY\`, \`AUTH_EMAIL_FROM\`, \`worker:automation\` and \`worker:notifications\` |
| Bulk broadcast email | Resend credentials + configured notification worker |
| Bulk SMS | \`AFRICASTALKING_API_KEY\`, \`AFRICASTALKING_USERNAME\`, verified recipient mobile number |
| Bulk push | \`FCM_PROJECT_ID\`, \`FCM_CLIENT_EMAIL\`, \`FCM_PRIVATE_KEY\`, active device registration |
| MFA | 32-byte base64 \`MFA_ENCRYPTION_KEY\`; two different MFA-verified Super Admin sessions for recovery |
| Private incident evidence | Object storage bucket/region/credentials; existing verified media workflow |

**No external sends or deployment changes are claimed from repository commits alone.** A messaging provider accepting a request is marked SENT; DELIVERED requires a verifiable receipt unless in-app delivery is synchronous. Existing transactional order messages remain separate from broadcasts and do not require marketing consent; every broadcast via Admin requires affirmative channel-specific consent.

## Design and security acceptance before Phase 3 UI wiring

1. With no broadcast opt-ins, approval returns \`NO_CONSENTED_RECIPIENTS\`; channel preferences do not leak; consent withdrawal before queueing skips the recipient and after queueing cancels before provider delivery.
2. Same campaign cannot be resent with a different idempotency key; two actors are required; the outbox is durable and deduplicated.
3. Staff invite returns a PENDING identity and never exposes the raw token in API output, log or database; activate once only, revoke expired sessions, require MFA enrollment.
4. MFA recovery requires two different Super Admin users, invalidates the authenticator credentials and all refresh/access sessions, and never silently marks an MFA flag enabled.
5. Only four existing kill switches and the three documented settings are accepted; unsupported switches cannot silently change platform behavior. New customer support case creation respects pause; existing cases remain resolvable.
6. Price/ETA changes flow through the actual pricing repository and checkout; county preflight checks active orders before operating-area changes.
7. No incident evidence is accessible without verified object media and role/purpose checks.
8. Report digest goes only to a still-active authorized owner with explicit email opt-in; no full financial CSV is emailed.
9. CI includes OpenAPI route coverage, PostgreSQL migration/checksum validation, unit/integration tests, real commerce/regression services, browser screenshots and security analysis.
10. **Environmental checks remain release gates**, not assumptions: credentials, sender domain verification, opt-in enrollment UI in the Customer/Merchant/Rider applications, observed worker readiness and provider callbacks require staging sign-off.

## Known bounded limitations (not fictional successes)

- Campaign audience capped at 250 per send to avoid uncontrolled fanout. Per-recipient provider receipts depend on supported provider webhooks/device delivery evidence; current notification service already distinguishes SENT from DELIVERED.
- Outbound provider credentials cannot be tested in CI without actual sandbox or production secrets. Credentials remain an operator concern; provider failures result in retry/dead-letter states.
- Report scheduler delivers **secure owner-addressed reminders/digests**, not downloadable attachments; CSV export is a separate role-protected Admin UI action in Phase 3.
- Application-wide maintenance *shutoff*, support SLA override, global notification pause, and true five-nines service-level history are deliberately not claimed; supported controls and probes are visible.
- No API changes by themselves provide a real Customer/Merchant/Rider consent UI, staff activation page, geographical map rendering or Admin API adapters. That is Phase 3/4 application wiring.
- Domain tests and browser acceptance are not equivalent to production provider/sandbox validation. Phase 5 includes complete four-party end-to-end and security/performance acceptance.

**Ready for Phase 3 adapter design only after CI passes and production-dependent capability flags are handled as genuinely not configured.** Keep PR #51 draft/unmerged until explicit approval.
