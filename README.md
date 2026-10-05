# Deetoo — Multi-Sided Food Delivery Platform

**Deetoo** is a production-grade multi-sided food delivery platform serving Kenya and East Africa. It connects Customers, Merchants, and Rider Couriers under a unified, high-reliability platform.

---

## Sprint 1: Foundation, Monorepo & Engineering Baseline

Sprint 1 establishes the rock-solid technical baseline before business feature implementation:
- **Monorepo Architecture**: Managed with `pnpm workspaces` and `Turborepo`.
- **Four Frontend Applications**:
  - `apps/customer`: Food discovery, address validation, order tracking.
  - `apps/merchant`: Restaurant kitchen console, prep-time management, store status.
  - `apps/rider`: Mobile-first courier shell, GPS telemetry, dispatch offers.
  - `apps/admin`: Operational oversight, PostGIS service zones, audit logs, ledger view.
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
npm run db:migrate
npm run db:seed
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Run Verification Suite
```bash
npm test
npm run check-types
npm run lint
npm run build
```

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
PostgreSQL is the default storage adapter. Configure `DATABASE_URL`, run `npm run db:migrate`,
and supervise `npm run worker:outbox` alongside the API. The API receives committed
PostgreSQL notifications; authenticated clients can recover via `/api/v1/realtime/events`
and canonical scoped REST APIs. Events are invalidations with stable IDs, not private snapshots.
Consumers must tolerate duplicates. Pending outbox rows retry after transport errors or expired leases.

`npm run dev:demo` explicitly enables local memory fixtures. Production and staging reject
that mode, fixture flags and missing/default credentials. Simulated payment, refund, payout,
settlement, maps and notification integrations refuse production execution until verified
adapters exist. A healthy liveness endpoint does not mean readiness; missing dependencies
or foundation schema produce HTTP 503. These controls do not imply full Wave 1 completion.

`npm run test:unit` and `npm run test:integration` exercise the explicit fixture adapter.
`DATABASE_URL=<isolated database with foundation in its name> npm run test:foundation`
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
