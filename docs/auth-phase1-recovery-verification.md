# DeeToo authentication — Phase 1 implementation

Branch: feat/auth-phase1-recovery-verification-20261109 (based on main).

## User journeys

- **Customer:** canonical login offers Forgot Password → request instructions by registered email/phone → enter one-hour reset token → new password and confirmation → return to sign-in. After registration, prompt for six-digit email or SMS contact verification, with an explicit Verify Later option.
- **Merchant:** canonical live sign-in offers the same recovery flow. Authorized merchant routing and role checks are unchanged.
- **Admin:** canonical live sign-in offers the same flow. The signed-in staff profile menu now permits authenticator enrollment by current password and a fresh six-digit TOTP, without persisting the setup secret. Existing recent-MFA verification remains.
- **Rider:** keep the native Android recovery flow; require matching 8–128-character passwords and clear sensitive form fields after reset. Existing phone OTP remains, with email verification available when an email is registered. Rider approval is still controlled by Admin.
- **Backend:** existing PostgreSQL, expiring hashed reset tokens, session revocation and Resend/Africa's Talking are reused. Successful password reset invalidates *all* outstanding reset tokens for that user. Both reset requests and confirmations have IP throttling. SMS/email OTP have IP-plus-identifier throttling, a server-side resend cooldown, five allowed incorrect attempts, one-time semantics and durable audit entries.

## Security and provider dependencies

- Authentication and identity verification require the existing configured PostgreSQL and Redis. Never enable synthetic/dummy OTPs in staging or production.
- EMAIL delivery requires RESEND_API_KEY and AUTH_EMAIL_FROM. SMS requires AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME and AUTH_SMS_FROM.
- EMAIL_OTP is a contact-verification flow, not a passwordless login or an MFA bypass. Only a current email address can be verified, and confirming the code sets users.email_verified_at.
- Phone OTP remains a separate contact-verification flow and updates users.phone_verified_at.
- Both request endpoints return a generic success description to avoid account enumeration.
- TOTP requires a correctly configured MFA_ENCRYPTION_KEY. Privileged API routes retain their recent-MFA requirements.
- Contact verification is *not yet a universal login requirement*: enforcing it on previously created accounts requires staged migration and backfill; this phase does not lock existing users out.
- Existing reset links are **tokens manually entered** into the recovery flow. No third-party auto-open deep links or provider-delivery success are implied.

## Checks / acceptance

Automated: pnpm typecheck, pnpm test, pnpm build:customer, pnpm build:merchant, pnpm build:admin, pnpm typecheck:rider-android, browser acceptance and PostgreSQL CI; new unit tests cover OTP schemas, recovery route presence and sibling-token invalidation.

Before release: use staging-only real Resend/Africa's Talking delivery and accounts belonging to authorized test users. Verify correct delivery, unknown identifiers, wrong/expired codes, resend cooldown, reset replay, session revocation, password confirmation, TOTP enrollment and recovery under both provider failure and expired-session conditions. Record external-provider and device evidence. A green CI does not establish provider certification.

Separate scopes: Phase 2 handles provider certification and broader email/SMS OTP journeys; Phase 3 covers cookie consent and preferences.
