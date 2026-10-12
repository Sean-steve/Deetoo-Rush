# Deetoo — Multi-Sided Food Delivery Platform

**Deetoo** is a production-grade multi-sided food delivery platform serving Kenya and East Africa. It connects Customers, Merchants, and Rider Couriers under a unified, high-reliability platform.

---

## Sprint 1: Foundation, Monorepo & Engineering Baseline

Sprint 1 establishes the rock-solid technical baseline before business feature implementation:
- **Monorepo Architecture**: Managed with `pnpm workspaces` and `Turborepo`.
- **Independent Client Applications**:
  - `apps/customer-web`: responsive Customer Web deployment.
  - `apps/merchant-web`: responsive Merchant Web / kitchen deployment.
  - `apps/admin-web`: Admin and Operations Web deployment.
  - `apps/rider-android`: Android Rider application boundary; native capabilities continue in Phase 2.
  - `apps/rider`: browser Rider simulator retained for development only.
- **Centralized Modular-Monolith API (`apps/api`)**:
  - Express-based REST API with standardized envelopes (`DEE-API-001`).
  - Correlation tracking with `X-Request-Id`.
  - Structured JSON logging.
  - Centralized error handler without information leakage.
  - Comprehensive health probes: `/health`, `/health/live`, `/health/ready`.
- **Shared Packages (`/packages/`)**:
  - `@deetoo/types`: Central domain interfaces, enums, API envelopes.
  - `@deetoo/validation`: Zod validation schemas.
  - `@deetoo/config`: Type-safe configuration with Zod validation.
  - `@deetoo/utils`: Safe integer financial math (minor units), structured logging, ID generators.
  - `@deetoo/auth`: Role-based access control matrix & permissions.
  - `@deetoo/api-client`: Unified API client with timeout, correlation ID, and retry policies.
  - `@deetoo/ui`: Design tokens (Deetoo Green `#00A651`) and component primitives.
  - `@deetoo/eslint-config`: Shared linting rules.
- **Database & Persistence**:
  - PostgreSQL 16 schema migrations (`001_initial_schema.sql`, `002_postgis_zones.sql`).
  - PostGIS 3.4 spatial containment (SRID 4326).
  - Double-Entry Ledger chart of accounts (`DEE-FIN-001`).
  - Redis 7 ephemeral caching with safe degradation failure policy.
- **Quality & CI/CD**:
  - Unit, Integration, and E2E Smoke test suites (`tests/`).
  - GitHub Actions CI workflow (`.github/workflows/ci.yml`).

---

## Quick Start

### 1. Start Infrastructure
```bash
docker-compose up -d
```

### 2. Run Database Migrations & Seeds
```bash
pnpm db:migrate
pnpm db:seed
```

### 3. Start Development Server
```bash
pnpm dev
```

### 4. Run Verification Suite
```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

---

## Admin entry point (approved 16-screen experience)

The canonical Admin web deployment now runs the approved **Admin Next** UI with real DeeToo APIs:

```bash
pnpm dev:api            # terminal 1; PostgreSQL/Redis must be ready
pnpm dev:admin          # terminal 2 → http://127.0.0.1:5175
pnpm build:admin        # produces dist/admin-web with the approved Admin UI
```

The default Admin entry is **always live**, including when `VITE_ADMIN_NEXT_MODE=demo` is present. It requires a signed-in staff identity; it never replaces failed API reads with fixture data. All 16 approved Admin screens, permissions, finance safeguards, and cross-application backend integrations remain intact.

- **Rollback:** open `http://127.0.0.1:5175/?admin-legacy=1` to explicitly load the old Admin interface for comparison; it is no longer the default and its CSS is lazy-loaded only for the rollback route.
- **Standalone design QA:** `VITE_ADMIN_NEXT_MODE=demo pnpm dev:admin-next` starts the isolated, non-authoritative design preview at `http://127.0.0.1:5178`. Without that variable, `pnpm dev:admin-next` uses real DeeToo APIs. Do not deploy the demo build as the operational Admin interface.
- **Acceptance:** `pnpm test:phase1-browser` checks the canonical entry and optional rollback; `pnpm test:admin-next-live` covers all 16 live workspaces, permissions, and API failure recovery.

Source integration is not production release sign-off. Provider sandbox evidence, real device validation, environment-specific security checks, and staging acceptance remain prerequisites before production rollout.

---

## Merchant portal operational setup

The Merchant portal runs at `http://localhost:5174` with `pnpm dev:merchant`.
The Overview is a separate operational dashboard; Kitchen Orders retains its own navigation entry.

**Database:** When an API shows `MERCHANT_SCHEMA_MIGRATION_REQUIRED` or the Merchant
portal reports a missing notification/policy table, use the same `DATABASE_URL` as
the running DeeToo API, and run `pnpm db:status` followed by `pnpm db:migrate`.
The Merchant experience needs migrations **035–038**, and the approved branch
display-name/description save workflow additionally uses **047**. Do not run migrations
against another environment or erase Docker/PostgreSQL volumes to fix a schema mismatch.

**Merchant media — local development:** Branch photos are private S3-compatible
media, not images saved directly in PostgreSQL. An optional local S3 service is
included in Docker Compose behind the `media` profile; it leaves PostgreSQL and
Redis unchanged. Configure **your existing local `.env`** with:

```dotenv
OBJECT_STORAGE_BUCKET=deetoo-local-private
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_ACCESS_KEY_ID=deetoo_local
OBJECT_STORAGE_SECRET_ACCESS_KEY=<choose_a_unique_local_password_at_least_8_chars>
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

Then start **only** the media service and create the private bucket:

```sh
docker compose --profile media up -d minio
pnpm media:setup:local
```

Restart `pnpm dev:api` so it loads the new environment, and keep
`pnpm dev:merchant` running at `http://localhost:5174`. The `miniodata` Docker
volume persists images; do **not** run `docker compose down -v`. The service
listens only on loopback `127.0.0.1:9000` (S3 API) and `:9001` (console).
The Community MinIO image uses `MINIO_API_CORS_ALLOW_ORIGIN` configured in
Compose to restrict browser origins. It does **not** support the standard
per-bucket `PutBucketCors` API. The bucket remains private; uploaded images
are accessed through short-lived, user-authorized URLs.

The pinned community image is only for **local development**; it is not a
recommendation for production object storage. In staging/production use a
maintained private S3-compatible provider with scoped service credentials,
HTTPS and managed access/CORS policies. A successful presigned PUT still must
be verified by the DeeToo API before the image can be published.

**Local image source notice (October 2026):** Anonymous pulls from the
original `quay.io/minio/minio` repository now return HTTP 401. The optional
Compose `media` profile defaults to `dappros/minio:RELEASE.2025-09-07T16-13-09Z`,
a **third-party mirror** listed as an unmodified copy of the historical
community release. This is **local development only**. If you do not trust this
mirror, set `DEETOO_LOCAL_MEDIA_IMAGE` to an independently verified image
you control before running Compose. Do not deploy the mirror to production.
`pnpm media:setup:local` must only run after the container starts and port
9000 is accepting connections. No database reset is required.

**Merchant roles and branches:** Authorized Merchant Staff can now toggle
an item’s availability for their assigned branch (separate
`MENU_AVAILABILITY_WRITE` capability). They cannot change prices, delete
items or create menus. Owners and Managers retain existing catalogue editing
permissions. Apply migration **048** via `pnpm db:migrate` to enable the new
capability in the merchant role policy table. The sidebar branch selector
contains **Add branch** for authorized owners; branch creation starts closed.
The `Menu & availability` screen can initialize a menu for a newly created
branch. Food item Add/Edit now supports verified photos; a short-lived signed
storage read is made available only after a photo is linked to an active menu.

**Saved branch photos across apps:** The `Branch settings > Branch image`
upload is a branch cover, not an organization-wide merchant logo. After
uploading, select **Save branch settings** to publish. Merchant Overview,
sidebar, operations headers, Branch Settings, and the current-branch card in
Business & Team use the same verified, branch-authorized cover. Customer
discovery and restaurant detail return the stable
`/api/v1/media/branches/:id/cover` URL for **approved active branches** with
a verified published cover; that endpoint issues a short-lived signed redirect.
Until a cover is verified and saved, the existing image fallback stays in
place. The separate merchant company logo remains independent.

**Availability audit fix:** Branch-specific item toggles previously wrote
`branch_uuid:item_uuid` into a UUID-only audit log column, raising
`invalid input syntax for type uuid` after the override write. The audit
now uses the item's UUID resource ID and retains both UUIDs in metadata.
No new migration is required for this correction; restart the API after
pulling the fix.

**Notifications:** Earlier portal builds compared a VARCHAR notification
recipient to a UUID viewer. Pull the latest API change and restart
`pnpm dev:api` after updating; no data migration or database reset is needed
for this specific SQL type mismatch.

The catalogue availability switch writes a **branch-specific availability override**
and reloads the effective branch catalogue; it does not globally remove the menu
item. Branch settings saves report partial success if a later independent endpoint
fails. Failed notification reads remain visible with Retry and never substitute demo data.

---

## Architecture Documentation
- [ADR-001: Monorepo Structure](docs/architecture/ADR-001-monorepo-structure.md)
- [ADR-002: Modular Monolith](docs/architecture/ADR-002-modular-monolith.md)
- [ADR-003: PostGIS Spatial Queries](docs/architecture/ADR-003-postgis-geospatial-containment.md)
- [ADR-004: Immutable Double-Entry Ledger](docs/architecture/ADR-004-immutable-double-entry-ledger.md)
- [ADR-005: Redis Ephemeral Failure Policy](docs/architecture/ADR-005-redis-ephemeral-failure-policy.md)
- [Local Development Workflow](docs/development/local-setup.md)
- [AI Coding Conventions](docs/ai/conventions.md)

## Documentation alignment foundation

Canonical contracts are recorded in [ADR-006](docs/architecture/ADR-006-foundation-canonical-contracts.md).
PostgreSQL is the default storage adapter. Configure `DATABASE_URL`, run `pnpm db:migrate`,
and supervise `pnpm worker:outbox` alongside the API. The API receives committed
PostgreSQL notifications; authenticated clients can recover via `/api/v1/realtime/events`
and canonical scoped REST APIs. Events are invalidations with stable IDs, not private snapshots.
Consumers must tolerate duplicates. Pending outbox rows retry after transport errors or expired leases.

`pnpm dev:demo` explicitly enables local memory fixtures. Production and staging reject
that mode, fixture flags and missing/default credentials. Simulated payment, refund, payout,
settlement, maps and notification integrations refuse production execution until verified
adapters exist. A healthy liveness endpoint does not mean readiness; missing dependencies
or foundation schema produce HTTP 503. These controls do not imply full Wave 1 completion.

`pnpm test:unit` and `pnpm test:integration` exercise the explicit fixture adapter.
`DATABASE_URL=<isolated database with foundation in its name> pnpm test:foundation`
runs migrations and PostgreSQL durability/failure tests. It creates test records and must
not target a live database. CI runs this suite against a fresh PostGIS database.
Migration failures and checksum changes stop with a nonzero exit. Legacy history without
checksums requires verification of the originally applied SQL; the runner does not certify it.
`db:rollback` refuses to erase history without verified down migrations. The backup inspector
cannot claim a restore or RPO/RTO proof; database failures are errors, never simulated success.


Privileged Admin/Finance/Ops mutations in PostgreSQL mode require authenticator
verification within five minutes. Configure `MFA_ENCRYPTION_KEY` with a separate
32-byte base64 secret, enroll using `POST /api/v1/auth/mfa/enroll` with the current
password, add the returned `otpauth` URI to an authenticator, and verify through
`POST /api/v1/auth/mfa/verify` with a six-digit code. These endpoints require an
active session. Enabled authenticators cannot be replaced through enrollment;
recovery and key rotation require an approved operational procedure. Test secrets
must never be copied into deployments. Authentication limits use shared Redis and
fail closed when unavailable.
