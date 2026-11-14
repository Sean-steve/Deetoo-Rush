# M9 — Deetoo application integration with self-hosted Mailu

Existing identity-recovery and PostgreSQL notification-worker EMAIL paths now share a provider-selectable adapter. There are no new API endpoints, schema migrations or payment activation. No live SMTP traffic occurs until the operator explicitly selects Mailu.

## Configure production (on Contabo only)

Use an independent credential for the existing noreply mailbox and ensure Mailu permits it to send as noreply@deetooapp.com. Do not use a staff password. On the VPS, update `/srv/deetoo/shared/.env` (chmod 600):

```dotenv
DEETOO_EMAIL_PROVIDER=mailu
MAIL_SMTP_HOST=mail.deetooapp.com
MAIL_SMTP_PORT=465
MAIL_SMTP_USER=noreply@deetooapp.com
MAIL_SMTP_PASS=<enter a private unique SMTP credential>
AUTH_EMAIL_FROM=noreply@deetooapp.com
NOTIFICATION_EMAIL_FROM=noreply@deetooapp.com
```

Do not put these credentials in GitHub, web builds, chat, or shell command history. Optional other senders such as orders@ require a Mailu-approved sender alias; do not spoof staff mailboxes.

## Release and verification

1. Review PR and wait for GitHub CI to pass; merge to main only when ready for a normal Contabo deployment.
2. Deploy through the existing main CI/CD workflow. On VPS verify `pm2 status` and `curl -fsS http://127.0.0.1:3000/health/ready`.
3. From `/srv/deetoo/current`, run `pnpm email:doctor` (safe: no mail). Then run `pnpm email:doctor --send-to=your-own-test-inbox@example.com` (one intentional email).
4. Confirm Gmail shows SPF, DKIM, DMARC PASS. Test password recovery/verification with a controlled test account; confirm notifications with actual configured events and observe worker logs without printing tokens.
5. Leave payment certification and real customer transactions disabled until separately approved.

## Semantics and remaining work

- Identity messages use the same token-hash commit-before-send and generic error semantics as before.
- Notification worker preserves queued/retry/dead-letter behavior. SMTP/Resend acceptance marks SENT; it is not proof of inbox delivery.
- SMTP has no built-in idempotency; a timeout after DATA may have accepted the email. Existing worker retries can duplicate uncertain messages. Confirm provider logs before manual retry.
- Existing EMAIL event triggers were not expanded; registration welcome emails, receipts, and full templating require separate event-mapping review.
- Default `DEETOO_EMAIL_PROVIDER=resend` preserves legacy behavior. Roll back only if Resend is verified configured; do not silently simulate successful sending.
