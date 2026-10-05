# ADR-002: Modular Monolith Backend Architecture

## Status
Accepted (Sprint 1 Baseline)

## Context
Food delivery systems often jump prematurely into distributed microservices, incurring massive operational overhead in network latency, distributed transactions, out-of-order events, and deployment complexity before domain boundaries stabilize.

## Decision
Per rule **AI-ARC-001**, Deetoo backend starts as a **Modular Monolith** within a single deployable service (`apps/api`), structured into strictly decoupled domain modules (`identity`, `customer`, `merchant`, `catalog`, `orders`, `deliveries`, `dispatch`, `payments`, `ledger`).

Cross-module communication is conducted via in-process module interfaces and outbox events, rather than ad-hoc cross-database joins or remote RPCs.

## Consequences
- ACID transactional integrity across state updates using PostgreSQL transactions.
- Zero network hop latency between domain operations.
- Clean architectural seams permit isolating any domain into an autonomous microservice in the future if scale warrants.
