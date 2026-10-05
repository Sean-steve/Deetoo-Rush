# ADR-006 — Canonical foundation contracts

Status: accepted for Documentation Alignment Repair Wave 1, 2026-09-13.
Authority: user-authorized reconciliation of the supplied v1 documentation, using the documentation-alignment audit as the gap analysis. This decision does not declare the audited defects repaired.

## Scope and ordering

Wave 1 covers durable storage/schema, authentication/authorization, active-lifecycle privacy, fail-closed deployment, transactional event infrastructure and CI. Paid checkout/provider/refund/ledger business orchestration remains Wave 2; dispatch/custody execution remains Wave 3; financial disbursement remains Wave 4. Infrastructure must refuse unsupported production simulation rather than claim success.

## State contracts

Order, Delivery and Payment remain separate aggregates. Adopt the consolidated specification's PENDING_PAYMENT Order state (already present in shared types). Only verified capture may produce merchant-visible PLACED; wiring that payment gate is Wave 2. Payment INITIATED/PENDING_CUSTOMER are canonical wire names, with documented legacy CREATED/PENDING equivalents, not another parallel state machine. Preserve EXPIRED where supported by the explicit provider timeout policy. Refund success never rewrites fulfilment status.

For custody ambiguity use the stricter individual State Machines/Dispatch contract: pickup is explicit, post-pickup failure preserves custody, and ordinary post-pickup cancellation/reassignment is prohibited. Wave 1 records this contract; operational transition repairs belong to Wave 3. Current state types alone are not proof these invariants hold.

## API contract

The canonical version prefix is /api/v1 (consolidated specification). Existing semantically equivalent route names remain compatibility surfaces to avoid a frontend redesign; their actual methods, authentication and scopes must be inventoried and tested. No prefix implies permission. Individual-document /v1 route examples are requirements for capability and authorization, not a second independently maintained backend.

Financial reads belong to Finance/Admin, with purpose-limited Support/Ops summaries. Ops cannot directly execute refunds. Support cannot bypass configured amount/reason approval. Until the Wave 2 approval workflow exists, unsupported privileged financial execution must fail closed; a role grant is not approval. Finance support-case access is read-only. Catalogue mutation belongs to scoped merchant Owner/Manager or Admin; Ops has read-only catalogue access. Sensitive location reads require a relevant active delivery or audited operational purpose.

## Schema contract

PostgreSQL is the authority, including membership/session revocation. Memory fixtures are an explicitly selected development/test adapter, never a database-error fallback. Database errors propagate; no acknowledged mutation is preserved only in a local Map. Redis remains ephemeral; absence does not authorize unsafe dispatch.

Preserve the original source/hash of a migration when separating invalid fixture DML from schema (006); an already applied checksum mismatch is refused, never silently adopted. Apply additive compatibility migrations where the old chain omitted prerequisites. Canonical entity identities are opaque UUIDs for persisted relational rows; fixture-only human-readable IDs are not production identifiers. Existing relational foreign keys, integer minor units, currency, UTC timestamps, and historical snapshots remain mandatory. Do not replace the relational model with a generic JSON document store.

Menus are canonically branch-owned as specified in both domain documents. Migration 005's merchant-level shared-menu model is a recorded legacy deviation, not retroactive authority. Reconciliation must preserve existing data and ownership, and must not silently assign one merchant's menu to another branch. Shared-template/product expansion is not authorized in Wave 1.

## Events and deployment

Domain state/history and its outbox record commit together. An independent worker leases pending outbox rows, retries failures, and marks completion only after dispatch. Delivery is at-least-once: stable event IDs and consumer idempotency are required. SSE is permitted by the individual API specification; reconnect reads canonical REST state.

Production requires explicit secrets and durable dependencies. Readiness returns failure when required dependencies/schema are unavailable. Migration failure is nonzero; rollback cannot merely erase migration history. Never infer restore success from a database connection failure.

## Acceptance and later-wave boundary

Wave 1 is complete only with real PostgreSQL migration/failure/restart tests, documented authorization matrix coverage and durable event replay evidence. Canonical decisions are not completion evidence. Remaining unsupported operations are reported explicitly. Wave 2 starts only after the user authorizes it; no provider/payment business repair is included here.

## Branch menu reconciliation rule (2026-09-14)

A durable menu has exactly one branch belonging to its merchant. Retain the compatibility
`assigned_branch_ids` field as a one-element array. A legacy menu with one unambiguous
assignment may be backfilled; existing branch ownership wins only if all assignments agree.
Unassigned or shared legacy menus stop the migration for explicit data reconciliation,
without deleting or silently reassigning records. No automatic shared-menu cloning is authorized.
Fixture data retains its old shared-menu model solely for compatibility tests; it is not deployment data.

## Privileged step-up and identity delivery (2026-09-15)

A11/S14 require backend MFA. Use RFC 6238 authenticator TOTP (SHA-1, six digits,
30 seconds, one interval of clock tolerance), with encrypted credentials, durable
replay counters and a five-minute session-bound verification window. Mutating
Admin/Finance/Ops requests require recent verification. Authenticator enrollment
requires the account password; an enabled credential cannot be replaced through
ordinary enrollment. Recovery requires a separately approved recovery design.
`MFA_ENCRYPTION_KEY` is a separate 32-byte base64 key; absent configuration refuses
MFA enrollment/verification. Fixture-only tests retain their explicit simulated
adapter. OTP/SMS and password-reset delivery remain unavailable in durable mode
until a real delivery adapter exists; never acknowledge simulated delivery.

Durable Rider references use `rider_profiles.id`; authentication and private Rider
channel addresses use `users.id`. Migration 017 reconciles legacy delivery FKs.
Scheduler locks in PostgreSQL are transaction-scoped advisory locks and must be
acquired inside the enclosing command; they release on commit/rollback rather
than pretending a process-local timer is a distributed lease. Outbox leases are
separate durable rows. Authentication rate windows are shared Redis sorted sets.
