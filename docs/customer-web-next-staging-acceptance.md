# Screens 01–07 — Real-Service Acceptance and Staging Release Gate

**Scope:** DeeToo customer shopping vNext, PR #28. **Decision: HOLD — no external staging certification or production payment approval.**

## What this gate actually executes

The `customer-shopping-real-services` GitHub Actions job starts **isolated, temporary PostgreSQL 16/PostGIS and Redis 7**, applies the real migrations, creates a test customer, merchant, branch, geofenced zone, menu, items, and saved address, and starts the **real Express API** on loopback. It executes HTTP requests using a real customer token (no route or repository stubs):

1. Public serviceability and live discovery using PostGIS.
2. Restaurant and menu-item search through actual database-backed discovery.
3. Restaurant detail and public menu visibility.
4. Authenticated cart insertion (real item), plus explicit unauthenticated denial.
5. Empty bag, cart read, quantity update, and persistent server-computed totals.
6. Valid saved address and fresh, server-authoritative checkout quote.
7. Idempotent order creation as PENDING_PAYMENT, synthetic local M-PESA initiation, real durable payment-worker processing, and paid-order status/ownership re-read.

**Important:** payment in this CI job uses `DEETOO_LOCAL_WORKFLOW=true` in `APP_ENV=test` only. This is *synthetic payment*, not a Safaricom Daraja call. The provider is prohibited by DeeToo configuration in staging or production. No money moves.

Run isolated real-service test on a dedicated test database (never point this command at a customer, shared staging, or production database):

```bash
APP_ENV=test NODE_ENV=test DEETOO_LOCAL_WORKFLOW=true DEETOO_FIXTURES=false \
DEETOO_STORAGE_MODE=postgres \
DATABASE_URL=postgres://postgres:YOUR_TEST_PASSWORD@127.0.0.1:5432/deetoo_foundation_shopping \
REDIS_URL=redis://127.0.0.1:6379/13 \
JWT_SECRET=unique-test-only-secret-32-chars-or-more \
pnpm test:customer-next-real-services
```

## External staging gates (not claimed as passed)

| External acceptance requirement | Current evidence |
| --- | --- |
| Reachable HTTPS staging API and vNext web with stable URL | **BLOCKED:** no staging deployment configuration/URL supplied or identified. |
| Isolated staging PostgreSQL, Redis and worker deployment | **BLOCKED:** CI ephemeral services are NOT a deployed staging stack. |
| M-PESA Daraja sandbox consumer key/secret, shortcode, passkey, callback gateway secret, public callback URL | **BLOCKED:** cannot access verified sandbox configuration. Placeholder values in .env.example do not qualify. |
| Sandbox STK request, authenticated callback, durable verify command, CAPTURED payment, matching ledger posting, order PLACED | **BLOCKED:** needs controlled sandbox test transaction and callback evidence. |
| Declined, expired, duplicate callbacks, mismatched amount/receiver, idempotent retry/recovery | **BLOCKED:** provider sandbox + worker and instrumentation required. |
| Cross-app Merchant/Rider confirmation after customer paid order | **BLOCKED:** needs staging merchant/rider identities and live dispatch workers. |
| 15-screen visual invariance | Existing vNext preview browser acceptance is separate; no screenshot substitutes for actual staging. |

### Go/no-go policy

A green `customer-shopping-real-services` job supports **local real-service transaction correctness only**, never M-PESA certification or production cutover. Preserve existing code and demo fixtures; no removals made. Before closing the external gates, collect a staging URL, worker deployment evidence, sandbox configuration through the secret store (never in Git or chat), dedicated non-production test identities/merchant/zone, and an authorized test payment handset. Use sandbox-only amounts and idempotency keys.

**Release status stays HOLD until actual Daraja sandbox provider callback + worker + ledger and cross-app evidence are captured.**
