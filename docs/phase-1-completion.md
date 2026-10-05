# Phase 1 — non-demo runtime and reported marketplace blockers

2026-09-23. Repository: `/home/jenny/Downloads/Deetoo1-updated`.

## Result

Runtime and marketplace repairs are implemented. The app uses PostgreSQL/PostGIS and Redis with fixtures disabled, started with `npm run dev`. Readiness returns HTTP 200 and customer discovery returns two real database branches in Kenya Nationwide.

**The user's live Rider browser still cannot provide GPS.** Server-side online/offline checks pass; this is not a completed live-device verification. Location permission/provider support is required. No synthetic coordinates, auto-approval, or location bypass was added. Phase 2 has not started.

## Exact changes

- `package.json`: preload installed `dotenv/config` for dev/start, database commands and all three workers.
- `.env` (private, mode 0600): corrected database credential and endpoint `127.0.0.1:5433/deetoo_dev`; added matching `POSTGRES_PASSWORD`. No credentials recorded here.
- `.env.example`: matching endpoint and password placeholders.
- `docker-compose.yml`: preserve existing `deetoo1-updated_pgdata` volume, bind PostgreSQL to loopback port 5433, require password from environment. Redis unchanged.
- `apps/customer/src/CustomerApp.tsx`: ignore superseded serviceability replies, clear stale restaurant results, distinguish outage from empty results, hide unknown counts; retry refreshes serviceability and discovery together.
- `apps/customer/src/components/CustomerLocationSelector.tsx`: unknown availability is neutral, no invented active zone or branch count; remove testing/database wording.
- `apps/merchant/src/MerchantApp.tsx`: supply the merchant's actual branches to catalogue management.
- `apps/merchant/src/components/CatalogueManager.tsx`: require exactly one real branch when creating a menu; real branch radio choices for serving assignment; remove hard-coded demo branch IDs/names from scope and assignment displays; disable category/serving actions without a menu; use the existing error-message helper to expose backend errors.
- `apps/rider/src/RiderApp.tsx`: show distinct denied/unavailable/timed-out location guidance and a Retry location action, including on the main run screen. Genuine current GPS remains required.
- `apps/api/src/modules/rider/rider.postgres.ts`: remove hard-coded demo zone from durable profile creation. Existing approved Riders receive explicit operational zone assignments instead.
- `scripts/configure-kenya-launch.ts`: explicit administrator-actor command for the user-approved configuration, transactionally applied under an advisory lock. Not run automatically by app startup or migrations.
- `docs/configuration/kenya-boundary.geojson`: detailed Kenya ADM0 MultiPolygon, geoBoundaries revision `9469f09`, RCMRD GeoPortal source, declared Public Domain. Source: https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KEN/ADM0/geoBoundaries-KEN-ADM0.geojson . Metadata: https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM0/ . Includes Mombasa's coastal island location, unlike the coarse boundary initially evaluated.
- `tests/unit/runtime-availability.test.ts`: unknown/available/unavailable badge regression.
- `tests/foundation/durable-foundation.test.ts`: transactional configured-discovery probe, nationwide geometry checks, approved Rider online/offline coverage, serving-branch persistence and foreign-merchant rejection. Discovery probe rolls back zone-state changes and does not depend on prior test data.
- `dist/`: regenerated frontend and backend production bundles.

## Schema and configuration

**No application schema migrations were added or applied.** All 29 applied migration checksums match repository SQL; none pending. Migration replay was exercised in separate foundation test databases.

Existing application data was preserved. Before launch configuration a private PostgreSQL custom-format backup was written to `/tmp/deetoo-before-nationwide-20260923.dump`.

User-approved configuration:

1. Active Kenya Nationwide service area with real boundary geometry.
2. Existing active branches of approved active merchants linked to that area.
3. Existing approved, non-suspended/non-disabled Riders explicitly assigned to that area; approvals and work status preserved.
4. Default commission 10%, fixed fee zero, effective now. Merchant-specific effective rules are preserved. Merchant default basis-point field aligned to 1000 where no specific rule exists.
5. Legacy status normalization only on already-approved records: merchant operational `APPROVED` becomes `ACTIVE`; Rider operational `OFFLINE` becomes `ACTIVE` while work status remains offline.
6. Administrator-attributed audit entries, including Rider assignments and launch configuration. No payouts or real provider calls executed.

The configuration command is repeatable without duplicate Kenya zones or default commission rules. New branches/Riders still require deliberate zone assignment; this command does not silently approve new accounts.

## Verification

- `npm run typecheck`: pass.
- `npm run build`: pass. Existing bundle-size and dependency annotation warnings remain.
- `node --import tsx --test tests/unit/runtime-availability.test.ts`: 1 passed, 0 failed.
- `npm run test:foundation`, with `DATABASE_URL` set programmatically to isolated `deetoo_foundation_marketplace_final_20260923` and `REDIS_URL` database 15: **31 passed, 0 failed, 0 skipped**. Final log: `/tmp/deetoo-phase1-complete-foundation.log`. Secret connection values deliberately omitted.
- Migration replay and mismatch/rollback safeguards passed in the foundation suite. No tests were deleted or suppressed.
- Earlier runs exposed and led to repair of the durable demo-zone default and test isolation/import issues. Their failures are superseded by the final passing run.
- Controlled clean Docker stop/start: readiness 503 during outage, then 200; workers reconnect. Browser showed unknown availability/error without a false empty result. Retry refreshed both discovery and availability after recovery.
- Bounded stability check: 180 readiness/discovery/serviceability requests over 62 seconds, no failed responses.
- Nationwide serviceability: Nairobi, Limuru, Mombasa, Kisumu, Lodwar and Mandera serviceable. Outside-country test points remain excluded.
- Browser observed Zone Active and two restaurants. User-created `Saturday Night` menu belongs to `Thika Deli`; `Morning Delis` category persists. Creation audit records exist. User data retained.
- Explicit serving-branch regression verifies correct assignment persists and foreign merchant assignment is rejected.
- Live commission service: food subtotal 10000 minor units yields commission 1000 minor units (10%). Merchant finance browser verification after a fresh authenticated navigation remains incomplete; the underlying commission error is resolved.
- Approved Rider integration: missing assignment denied; valid assignment, active vehicle and test GPS allow online, repeated online reuses session, offline ends session. Actual user-device GPS is unavailable and was not simulated.
- API and workers restarted with final backend source; final readiness 200 and database-backed discovery confirmed.

The complete memory-adapter unit/integration suite was not rerun for this phase. The PostgreSQL foundation suite is the durable integration evidence above; this report is not a full launch certification.

## Startup runbook

From the repository root:

```sh
docker compose up -d postgres redis
npm run dev
```

In separate terminals/processes:

```sh
npm run worker:outbox
npm run worker:payments
npm run worker:dispatch
```

Check `http://localhost:3000/health/ready` for HTTP 200. Do not use `dev:demo` for product verification. Keep `.env` private. Workers are independent processes; API startup does not start them automatically. Production process supervision is a later infrastructure deliverable.

For a deliberate, authorized reapplication of the recorded configuration, set `DEETOO_CONFIG_ACTOR_ID` to an existing administrator UUID, then run:

```sh
node --import dotenv/config --import tsx scripts/configure-kenya-launch.ts
```

Do not use this command to invent approvals or replace merchant-specific commercial agreements.

## Remaining readiness limitations

- Live Rider availability is blocked by the current browser/device's location supply. Allow site/device location access and retry in a supported location-enabled browser or phone. The code now explains the failure category; the online guard is retained.
- Correct real branch coordinates before relying on distance-based pricing/dispatch: `Thika Deli` currently stores `-4.0435,39.6682`; `Mombasa` stores `22.38474,3.36473`, outside Kenya. Physical restaurant coordinates cannot be inferred safely from names alone.
- Historical PostgreSQL backend exit code 2 caused one recovery before the controlled test. No new unexpected recurrence was observed, but its original cause remains unproven. The clean restart/stability results are bounded evidence. `pg_amcheck` was unavailable because its extension is absent; no consistency-check pass is claimed.
- Nationwide serviceability does not certify long-distance delivery economics or the complete paid-order journey. Payment/provider, delivery integrity and settlement work remain in later phases.

Phase 2 has not started. Code/runtime repair is complete for this scope; GPS-dependent live Rider readiness and real branch-location configuration remain open operational prerequisites.
