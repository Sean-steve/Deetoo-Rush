# Local Development Workflow

This document outlines the standard workflow for running Deetoo locally.

## Prerequisites
- Node.js >= 20.x
- Docker & Docker Compose
- pnpm >= 9.x (or npm)

## 1. Environment Setup
Copy the template environment file:
```bash
cp .env.example .env
```
Ensure required environment variables are configured (ports, secrets, database credentials).

## 2. Infrastructure Services (PostgreSQL, PostGIS, Redis)
Start containerized PostgreSQL 16 (with PostGIS 3.4) and Redis 7:
```bash
docker-compose up -d
```
Verify services:
```bash
docker-compose ps
```

## 3. Database Migrations & Seeds
Run versioned SQL schema migrations and development baseline seeds:
```bash
npm run db:migrate
npm run db:seed
```

## 4. Launching the Development Server
Start the unified platform development server:
```bash
npm run dev
```
The server will start on `http://localhost:3000`:
- **API & Health**: `http://localhost:3000/health`, `http://localhost:3000/api/v1/system/info`
- **Frontend Workspace**: `http://localhost:3000/`

## 5. Verification Commands
- **Linting**: `npm run lint`
- **Type Checking**: `npm run check-types`
- **Test Suite**: `npm test`
- **Production Build**: `npm run build`

## Troubleshooting: sign-in reports `RATE_LIMIT_UNAVAILABLE`

All Customer, Merchant, Rider and Admin sign-ins go through the same API
authentication limiter. In PostgreSQL mode that limiter normally uses Redis.

Start or restart the Redis container, then verify a response:

```bash
docker compose up -d redis
docker compose ps redis
docker compose exec redis redis-cli ping    # PONG
```

From the host, the development `REDIS_URL` should be
`redis://127.0.0.1:6379`. If the **API itself runs in Docker Compose**
on the same service network, use `redis://redis:6379` instead.
Verify that the API process loads the intended `.env`, that the port is
reachable, and inspect `docker compose logs --tail=50 redis` if it is not.
Restart `pnpm dev:api` after correcting environment variables.

In `APP_ENV=development` only, a Redis outage now switches authentication
limiting to **bounded per-process memory counters**, retaining both the
per-IP limit and the IP+identifier limit. A warning is logged once per
outage, and shared Redis enforcement resumes when the connection recovers.
This is for single-process local development, **not a replacement for Redis**
in distributed environments. `APP_ENV=staging` and `APP_ENV=production`
continue to return 503 `RATE_LIMIT_UNAVAILABLE` when Redis is unavailable;
restore the shared Redis service, do not bypass authentication protection.

To exercise regression coverage, run:

```bash
pnpm exec tsx --test tests/unit/auth-rate-limiter.test.ts
```
