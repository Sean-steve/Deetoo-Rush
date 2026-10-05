# Local workflow verification — 2026-09-26

## Scope and behavior
User approved local payments and deferring authenticator checks to verify the workflow. The normal PostgreSQL application is used (`npm run dev`), not the memory demo.

`DEETOO_LOCAL_WORKFLOW=true` selects explicitly synthetic M-PESA/card providers. No money moves, no STK request is sent and no Stripe checkout is opened. Initiation and verification run through the existing durable payment worker, payment evidence, Order release, ledger and refund services. Synthetic references and evidence are labelled `local-test` / `local_test`. New initiation commands are marked explicitly; pre-existing unmarked external attempts cannot become synthetic captures. External callbacks are rejected by local providers. Existing unresolved external attempts require cancellation/reconciliation; create a fresh order to test payment.

Only in this mode, recent-MFA enforcement is deferred for privileged writes. Login, role, session and ownership checks remain. Startup refuses this mode in staging/production (including NODE_ENV=production), memory storage or with a non-loopback database. The server binds to 127.0.0.1. A visible banner and checkout text identify local simulation. Production behavior is unchanged with the flag off.

Pending authenticator enrollment now preserves its key on repeat setup. The phone's actual configured key/time has not been verified. Customer cancellation no longer requires the optional note; the existing rule still permits cancellation only before merchant acceptance. Admin cancellation remains separately authorized.

## Code and configuration
- `packages/config/src/index.ts`, `.env.example`, local `.env`: explicit guarded local mode (no secrets recorded here).
- `server.ts`, `apps/api/src/modules/health/health.router.ts`, `src/App.tsx`: loopback binding, mode indicator and visible notice.
- `apps/api/src/modules/auth/auth.middleware.ts`, `mfa.ts`: locally deferred recent-MFA gate; stable pending enrollment key.
- `apps/admin/src/components/AuthenticatorPanel.tsx`: time-based authenticator/code guidance.
- `apps/customer/src/components/CustomerJourney.tsx`: optional cancellation note; local payment guidance.
- `apps/api/src/modules/payment/providers/local.provider.ts`, `provider-registry.ts`: guarded synthetic adapters and external-reference rejection.
- `apps/api/src/modules/payment/payment.service.ts`, `payment-worker.ts`: mark new local initiations; enqueue durable verification immediately; incompatible external attempts enter REVIEW.
- `apps/api/src/db/redis.ts`: distinguish InMemoryCache from ioredis so Rider search uses the correct Redis command arguments.
- `apps/api/src/modules/order/delivery.repository.ts`: serialize dispatch candidate snapshots as JSON, preventing PostgreSQL transaction failure.
- `apps/api/src/modules/order/dispatch.service.ts`: pickup uses actual branch coordinates; no fabricated dispatch coordinates; missing delivery OTP cannot pass validation.
- `apps/api/src/modules/order/order.service.ts`: include dispatch failure detail in supported log metadata.
- Tests: new `tests/unit/local-workflow-config.test.ts`, `tests/local-workflow/local-workflow.test.ts`; pending-key assertion in `tests/foundation/durable-foundation.test.ts`.
- `package.json`: isolated `test:local-workflow` command.

**Migrations: none.** Existing migrations through 027 were applied to fresh isolated verification databases. Existing user orders were not deleted or auto-cancelled.

## Verification
Runner: `node docs/verification/local-workflow/run.mjs` (`--resume` retains successful checks after interruption). It quietly loads local connection settings, disables local mode for ordinary regression suites, creates isolated PostgreSQL databases and enables local mode only for the new workflow suite. Redis test databases: 13–15. Exact results and command logs are beside this report.

| Command | Final result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| npm run test:unit | 164 passed |
| npm run test:integration | 210 passed |
| npm run test:e2e | 1 API smoke test passed |
| npm run openapi:validate | PASS |
| npm run openapi:coverage | PASS |
| npm run test:foundation | 33 passed |
| npm run test:paid-order | 15 passed |
| npm run test:local-workflow | 4 passed |

**427 passed, 0 failed, 0 skipped.** Initial local run timed out due to an open test Redis connection; cleanup fixed. The complete transaction test exposed real Redis argument and PostgreSQL JSON-encoding defects; both fixed. Test expectation corrected to distinguish terminal Order COMPLETED from Delivery DELIVERED. No failing test was suppressed.

The PostgreSQL local suite verifies both payment methods, concurrent idempotent capture/release, merchant visibility only after capture, unauthenticated/foreign-customer denial, customer and admin cancellation over HTTP, full refund allocation reversal and one ledger posting per capture/refund. The delivery test uses real PostgreSQL/Redis/services: quote → pending Order → local payment → PLACED → merchant acceptance/preparation → automatic offer → Rider assignment → READY → pickup code → en route → authorized live coordinates → dropoff → OTP → Delivery DELIVERED / Order COMPLETED → Rider earning and merchant payable. Invalid pickup code, wrong/missing OTP and foreign tracking are rejected.

## Using the local app
1. Open http://localhost:3000 and confirm the LOCAL WORKFLOW TEST banner.
2. Create a fresh order; choose M-PESA or card. For M-PESA enter a valid Kenyan phone format. Payment completes locally after the worker processes it; there is no phone prompt or charge.
3. Cancel before acceptance as Customer, or use authorized Admin cancellation; the worker processes the local refund.
4. For delivery, keep an approved Rider online with fresh location near the serving branch. Merchant accepts/prepares/readies the order; Rider accepts the offer, uses the merchant pickup code and customer delivery OTP.

Running processes use existing commands: `npm run dev`, `npm run worker:payments`, `npm run worker:outbox`, `npm run worker:dispatch`. The workers are necessary for payment, scheduled dispatch and event delivery. Local logs and PIDs are saved alongside this report.

## Remaining verification
- Daraja/Stripe sandbox and live-provider certification remain BLOCKED_BY_CONFIGURATION; simulated evidence is not provider certification.
- Actual browser/device GPS, authenticator enrollment on the user's phone and multi-device UI acceptance are not certified by these service/API tests.
- Merchant settlement/Rider payout transfer to external accounts is outside this local payment-to-delivery check.
- Before deployment, turn off local mode and restart all processes; certify external providers and normal MFA enforcement. Local test financial records must not be treated as live money.
