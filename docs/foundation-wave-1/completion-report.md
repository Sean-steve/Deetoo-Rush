# Documentation Alignment Repair Wave 1 — Durable and Authorized Foundation

Date: 2026-09-15. Repository: `/home/jenny/Documents/ChatGPT/Deetoo`.

The foundation changes are implemented and locally verified. **This is not full documentation alignment or launch approval.** The strict audit still has open requirements, including exhaustive allowed-path PostgreSQL coverage and production assurance. Wave 2 has not been started; no UI redesign or payment/fulfilment business-flow repair is included.

## Canonical decisions

[ADR-006](../architecture/ADR-006-foundation-canonical-contracts.md) records the decisions before their corresponding implementation: PostgreSQL authority; explicit fixture adapter; opaque UUID identities; `/api/v1` compatibility policy; separate Order/Delivery/Payment aggregates; branch-owned menus; Rider profile versus user identity; least-privilege financial roles; transactional invalidations; deployment failure behavior; and privileged authenticator verification.

`PENDING_PAYMENT` is the canonical pre-capture Order state, and only verified capture should permit merchant-visible `PLACED`. **That business gate remains Wave 2.** Recording a contract does not prove its business implementation. Legacy Payment state aliases and stricter custody transitions are likewise recorded without claiming their later-wave repairs.

## Exact migrations

The verified chain contains **21 SQL files**, through `018_foundation_mfa.sql`. [All file checksums](migration-checksums.json) accompany the report.

| Changed migration | Change |
|---|---|
| `006_sprint_5_customer_discovery.sql` | Removed invalid demo category/assignment DML from the schema migration. Preserved the original in `original-migrations/006_sprint_5_customer_discovery.sql`. |
| `007a_foundation_idempotency_compat.sql` | Adds/backfills the missing identity/status/order columns needed by migration 008 and runtime idempotency storage. |
| `008a_foundation_rider_identity.sql` | Adds unique UUID Rider profile identity before dependent vehicle/delivery schema. |
| `012a_foundation_ledger_compat.sql` | Reconciles account number, transaction metadata, entry direction/currency, timestamps and minor-unit balance columns before migration 013. |
| `015_foundation_identity_outbox.sql` | Role taxonomy without user grants; missing timestamps; channel/retry/lease fields and indexes; cross-merchant membership-branch rejection. |
| `016_foundation_branch_menu_contract.sql` | One branch per menu; merchant/branch consistency; category/item parent constraints; rejects ambiguous legacy menu assignments. |
| `017_foundation_rider_constraints.sql` | Legacy Merchant role alias without grants; one vehicle/active availability session per Rider; delivery assignment FK reconciled to Rider profile UUID. |
| `018_foundation_mfa.sql` | Encrypted authenticator credentials, replay/lockout state and session-bound MFA verification timestamp. |

Existing databases with a different applied migration 006, missing historical checksums, ambiguous menus or duplicate Rider records are **not silently rewritten**. Migration application stops for verified source/data reconciliation. This work applied only to isolated local test databases. No production migration or destructive cleanup was performed.

## Code changes

The exact **106-file implementation/configuration/test manifest** is in [changed-files.md](changed-files.md), with before/after SHA-256 in [changed-files.json](changed-files.json). The repository was initially untracked; these are baseline-content comparisons, not claims about a committed Git diff.

- **Durable repositories:** relational PostgreSQL adapters for auth, customers/addresses, merchants/memberships, catalogue, cart/quotes, Riders and payment records. Existing Order, Delivery, Finance and Operations repositories now use durable reads and reject database-error fallback. UUID generation and SQL/runtime mismatches were corrected. Stored settlement/payout records are durable; their selection/execution correctness is not claimed.
- **Transactions:** service commands share a database transaction, including repository/history/outbox writes. Nested legacy transactions use savepoints. A swallowed SQL error cannot acknowledge a transaction that PostgreSQL rolled back. Failed-login audit and rejected verification-attempt counters survive command rejection. Admin identity changes and their audit commit together.
- **Authorization/privacy:** Rider role and resource ownership remain enforced on the backend. Ops catalogue writes and refund execution are denied; Support cannot bypass approval through either payment or support-case refund routes; Finance support access is read-only. Merchant historical orders hide fulfilment PII. Rider responses hide expected OTP/proof values. Completed Customer orders expose neither Rider GPS nor delivery OTP. Support projections omit sensitive financial/contact fields and case reads are audited.
- **MFA:** password-verified `POST /api/v1/auth/mfa/enroll` and session-authenticated `POST /api/v1/auth/mfa/verify`; encrypted credentials; RFC 6238 vectors; replay counter; five-attempt lockout; five-minute session verification. PostgreSQL Admin/Finance/Ops mutations require recent MFA. No caller-supplied approval or MFA flag grants permission. Configure a separate `MFA_ENCRYPTION_KEY`; no default key exists.
- **Realtime:** authenticated/scoped SSE and history, reauthorization on delivery/heartbeat, committed invalidations rather than private payloads, stable event IDs, retryable durable leases, independent outbox worker and PostgreSQL LISTEN/NOTIFY fan-out. Reconnect uses scoped history/REST. Polling remains a fallback; UI behavior was not redesigned.
- **Runtime:** PostgreSQL is the default; memory/fixtures are explicitly selected for tests/demo and prohibited in deployed environments. Missing schema/dependencies fail readiness. Redis initializes independently of health polling and never becomes process-memory authority. Auth and authenticated-write limits use shared Redis in durable mode. Unsupported payment/maps/notification/disbursement and identity-delivery simulations fail closed.
- **Operations/CI:** migration lock/checksum/failure handling; rollback refuses fake success; transaction-scoped scheduler locks; actual local restore verification; corrected typecheck job; PostGIS/Redis foundation job; production dependency audit and CodeQL configuration. Compatible dependency fixes updated Express to 4.22.3 and qs to 6.16.0. Hosted CI/CodeQL execution is not claimed.

## Tests and reproducible evidence

All final results below have zero failures and zero skipped tests. The ordinary integration command has no known-security-failure exemption. Fixture suites and actual PostgreSQL tests are distinguished deliberately.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS; existing large-bundle warnings remain |
| `npm run test:unit` | 152 passed |
| `npm run test:integration` | 209 passed |
| `npm run test:e2e` | 1 passed; API smoke, not four-device/browser certification |
| `REDIS_URL=redis://127.0.0.1:56379 DATABASE_URL=postgres://postgres:foundation_test_only@127.0.0.1:55432/deetoo_foundation npm run test:foundation` | 28 passed against PostgreSQL/PostGIS and Redis |
| `REDIS_URL=redis://127.0.0.1:56379/1 DATABASE_URL=postgres://postgres:foundation_test_only@127.0.0.1:55432/deetoo_foundation_clean_20260915_final npm run test:foundation` | 28 passed; empty-database chain 001–018 plus compatibility migrations, then checksum replay; no fixture identities/catalogue/financial accounts seeded |
| `npm audit --omit=dev --json` | 0 reported vulnerabilities after compatible fixes |

`npm audit fix --ignore-scripts` resolved the two reported Express/qs advisories without a forced major upgrade. A later environment restart stopped both isolated database containers; connection-refused runs were rejected as verification and rerun after restarting those containers. During development, the suites caught the UUID-format assertion, missing catalogue guard import, an incorrect fixture identifier lookup, and login limiter wiring. These were corrected; no failing security regression was removed or suppressed. The payment ID assertion now verifies the canonical UUID contract while retaining its state/amount/provider assertions.

The 28 durable tests prove migration replay/failure/checksum rejection; identity/session/membership persistence and revocation; cross-merchant constraints; cart/address/catalogue/Rider/payment/ledger storage; order/outbox rollback; stale-cache avoidance; independent-process reads; worker failure/lease recovery and actual notification transport; Rider HTTP ownership; failed security audit persistence; support note privacy; stored settlement/payout scope; dependency failure and readiness; production-config rejection; MFA replay/expiry/lockout and privileged HTTP enforcement; and shared authentication rate limits.

[Evidence logs and command manifest](verification.json) record the completed runs. [Authorization coverage](authorization-coverage.md) states both proved boundaries and the limits of current coverage. These results do not prove that every documented business operation succeeds against PostgreSQL.

### Actual restore proof

Executed:

```sh
docker exec deetoo-foundation-postgis pg_dump -U postgres -Fc -f /tmp/deetoo-foundation-wave1.dump deetoo_foundation
docker exec deetoo-foundation-postgis createdb -U postgres deetoo_foundation_restore_20260915
docker exec deetoo-foundation-postgis pg_restore -U postgres --exit-on-error -d deetoo_foundation_restore_20260915 /tmp/deetoo-foundation-wave1.dump
SOURCE_DATABASE_URL=postgres://postgres:foundation_test_only@127.0.0.1:55432/deetoo_foundation RESTORED_DATABASE_URL=postgres://postgres:foundation_test_only@127.0.0.1:55432/deetoo_foundation_restore_20260915 npx tsx scripts/verify-foundation-restore.ts
```

**83 restored public tables matched source row counts and ordered row-content digests.** [Restore evidence](restore-verification.json). This proves a local logical dump/restore, not production PITR, encrypted backup policy, RPO/RTO or disaster recovery under load. The legacy integrity-check script no longer pretends it performed a restore.

## Remaining genuine launch blockers

1. **Security/assurance:** production MFA key provisioning, authenticator recovery/key-rotation procedure, private object storage and validated signed file access, retention/GPS purge and data-subject workflows, approved privacy/processor policies, and deployed secret/backup encryption controls remain unverified or unimplemented. CodeQL is configured; hosted scan results, DAST and independent security review remain absent. Exhaustive positive PostgreSQL coverage for every documented role/route remains open (A113/A114).
2. **Order/data integrity:** immutable quote binding, stale-cart/configuration detection, pending-payment merchant gate, concurrency/idempotency conflicts and coordinated cancellation are not repaired here.
3. **Payments:** real provider capture/callback verification, reset/OTP delivery adapters, refund approval/idempotency/reservation and real sandbox evidence are unavailable. Durable mode refuses simulated success.
4. **Dispatch/delivery:** eligibility/timing, atomic offer acceptance, custody/proof enforcement, reliable completion recovery, verified media and notification delivery remain later-wave work.
5. **Financial integrity:** allocation/formulas and recovery, merchant-specific eligible settlement selection, uniquely reserved payable/earning entries, maker-checker controls and verified transfers remain incomplete. Persistence tests do not certify financial correctness.
6. **Infrastructure/contracts:** deployed worker supervision, realistic load/failure/PITR evidence, actionable tracing/alerts and complete OpenAPI/client contract validation remain open. Existing data may require explicit migration reconciliation. Approved commercial/service-area configuration is required; local fixtures are not deployment configuration.
7. **UI/operational acceptance:** no four-app/device certification or production authenticator enrollment/recovery UI was added. Backend contracts and guards are available; no UI redesign was undertaken.

## Wave 2 readiness

**Conditional engineering readiness; not unconditional audit closure or launch readiness.** PostgreSQL, authorization, transactional events, migration replay and local failure/restore foundations are available and tested. The open assurance/coverage items above must not be relabeled complete merely because these suites pass.

The single next business repair objective remains the audit's **Correct paid-order and ledger transaction**: immutable quote → pending Order → verified provider capture → merchant-visible paid Order, with idempotent economic effects and coordinated refund/ledger recovery. Provider sandbox credentials/configuration and an explicit Wave 2 instruction are still required for that work. **Wave 2 has not begun.**
