# ADR-005: Redis Ephemeral Data & Safe Degradation Failure Policy

## Status
Accepted (Sprint 1 Baseline)

## Context
Redis provides sub-millisecond read/write speeds, making it ideal for high-velocity telemetry (such as rider GPS coordinate heartbeats), ephemeral sessions, and distributed rate limiting. However, relying on Redis as an authoritative state store risks business data loss during restarts or network partitions.

## Decision
Per Section 12 & 13:
1. PostgreSQL is the sole authoritative system of record. Orders, payments, ledgers, and delivery states reside strictly in Postgres.
2. Redis is strictly non-authoritative: it holds transient session caches, rate limit counters, and real-time courier location updates.
3. If Redis becomes unavailable, the system enters a degraded safe mode. Core APIs and database queries continue functioning without crashing.
4. Redis connections must implement error trapping (`client.on('error', ...)`) and lazy retries.

## Consequences
- No database transactions are compromised if Redis goes offline.
- Real-time location fallback operates smoothly during transient cache interruptions.
