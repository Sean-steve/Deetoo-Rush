# DeeToo — Phase 2: SMS/email provider certification (controlled rollout)

**Stacked on Phase 1 PR #76:** feat/auth-phase1-recovery-verification-20261109.
Do not merge this branch directly to main until Phase 1 has landed; rebase Phase 2 onto main afterwards.

## What the client supplied

The client mentioned a bulk SMS partner ID, API key and sender ID, plus the portal URL:

https://sms.royaltimesexecutivemotors/partner/17684#api

This is a portal/dashboard link, not a verified SMS send API contract. It could not be independently resolved from the development environment. The hostname as written has no conventional public suffix. Do not infer the API endpoint or assume Africa's Talking request/response fields work for it. Never copy credentials into Git, browser, Android, pull requests or issues. Rotate any credential exposed publicly.

## Provider architecture

- DEETOO_SMS_PROVIDER=africastalking (default) preserves existing SMS behavior.
- DEETOO_SMS_PROVIDER=partner selects the client gateway but blocks delivery until SMS_PARTNER_CONTRACT_VERIFIED=true and all secret/contract fields are configured.
- Security OTP, password recovery and operational SMS all call the same provider.
- No silent fallback to a different gateway on network timeout: the original message may already have been sent.
- Partner transport requires public HTTPS POST, either JSON or form body, with vendor-verified field names. No secrets in URL, redirect or query string.
- HTTP 2xx alone is insufficient. Response must match the documented acceptance field/value AND a nonempty message reference.
- A provider ACCEPTED status is not proof of handset receipt.
- Resend continues handling verified email OTP and password recovery.

## Evidence required to enable the partner

Collect redacted official vendor API documentation (no credentials) showing:

1. The actual HTTPS SMS send endpoint. A dashboard URL alone is not enough.
2. Method, content type and names for partner ID, API key, sender ID, recipient and message.
3. Phone-number format, Unicode encoding limits, maximum SMS length and charges.
4. Accepted/rejected response examples, status and reference fields, provider error codes.
5. Sandbox or test destination, rate limits, delivery receipts/callback authentication.
6. Approved sender name and client authorization to use the billing account.

Map the documented field names and acceptance response into SMS_PARTNER_* environment variables defined in .env.example. Only then set SMS_PARTNER_CONTRACT_VERIFIED=true. Configure secrets server-side; never put them in public builds.

## Test and acceptance matrix

| Requirement | Automated evidence | Required external evidence |
|---|---|---|
| Africa's Talking success/failure | Contract tests with mocked fetch | Provider certification if used live |
| Partner HTTPS, gating and request mapping | Contract tests with mocked fetch | Reviewed official documentation |
| Partner success vs HTTP-200 false success | Contract tests | Real redacted accepted/rejected receipts |
| Resend acceptance | Contract tests | Approved sender/domain and test mailbox receipt |
| Phone OTP, email OTP | Existing durable tests + schema tests | SMS handset/inbox receipt, expiry, replay and failure checks |
| Password reset | Existing durable tests | One-hour token, expiry, session revocation, replay checks |
| Operational SMS | Routed through the selected adapter | Notification worker attribution and provider acceptance |
| Delivery to recipient | Cannot be proven with mock transport | SMS provider delivery report and observed device/inbox |

## Local test procedure

Inject real keys using environment secret management; do not commit a populated .env file.

Configuration check ONLY (no network send):

    pnpm identity:doctor

Only after authorization and verified recipient ownership, explicitly send a test:

    pnpm identity:doctor --send-test-sms +2547XXXXXXX
    pnpm identity:doctor --send-test-email approved-test@example.com

These commands record provider acceptance, not confirmed delivery. Inspect the provider portal and the approved test SIM/inbox.

## Certification status

Royal Times client gateway: **NOT CERTIFIED**. The dashboard URL was not independently verifiable, the formal send contract and credentials were unavailable to this build, and no real SMS was sent. Resend inbox delivery also remains unverified in the current environment. Do not enable partner mode in production until those external gates pass.

Phase 3 cookie consent is separate from this PR.