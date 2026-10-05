# ADR-001: Monorepo Architecture with pnpm Workspaces & Turborepo

## Status
Accepted (Sprint 1 Baseline)

## Context
Deetoo consists of four frontend applications (`customer`, `merchant`, `rider`, `admin`), one central backend service (`api`), and shared libraries for core domain contracts, validation schemas, financial math, security policies, and UI primitives.

Managing separate repositories would create synchronization drift, schema version mismatches, and fragmented release cycles.

## Decision
We adopt a unified monorepo powered by pnpm workspaces and Turborepo:
1. Applications live under `/apps/`.
2. Reusable domain packages live under `/packages/` with the `@deetoo/*` namespace.
3. Turborepo handles task orchestration, dependency graphing, and caching.

## Consequences
- Single commit atomic updates across API contracts, validation, and clients.
- Immediate cross-app type checking.
- Requires strict boundary discipline to prevent cyclical dependencies between domain modules.
