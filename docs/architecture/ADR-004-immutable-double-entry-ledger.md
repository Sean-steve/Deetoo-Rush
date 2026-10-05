# ADR-004: Immutable Double-Entry Ledger System

## Status
Accepted (Sprint 1 Baseline)

## Context
Financial operations in food delivery involve three distinct stakeholders (Customer, Merchant, Rider) and platform commission/fees. Tracking balances via mutable columns (e.g. `UPDATE merchants SET balance = balance + 500`) results in silent race conditions, lost funds, un-auditable discrepancies, and reconciliation failures.

## Decision
Per rule **DOM-INV-007** and **DEE-FIN-001**:
1. All monetary movements are modeled as immutable double-entry ledger transactions (`ledger_transactions` and `ledger_entries`).
2. Every transaction must be balanced: `SUM(debit) == SUM(credit)`.
3. Account balances are computed dynamically as the net sum of ledger entries.
4. Corrective actions require reversing transactions, never mutating posted entries.
5. All monetary fields are positive integer minor units (Kenyan cents), strictly disallowing floats.

## Consequences
- Guaranteed auditability and mathematical reconciliation.
- Complete transparency for merchant settlements and rider payouts.
