# Cart and tracking fixes — 2026-09-25

Implemented in Deetoo1-updated:
- Empty baskets no longer cause cross-branch conflicts. Nonempty baskets still require explicit replacement.
- Clearing/replacing a basket retires it as ABANDONED, preserving immutable quotes instead of failing on cascading deletion.
- Switching between Orders and Your bag resets the selected order view.
- Tracking shows the correct waiting/terminal order message instead of requesting nonexistent delivery records.
- Active tracking polls GPS every five seconds independently of order events; missing/overdue GPS is labelled and stale GPS produces no arrival estimate.

Clearing a basket does not cancel an existing order. Use Cancel order for that; cancelled orders remain in history. Read-only local diagnosis found one PENDING_PAYMENT order, zero deliveries and one empty ACTIVE basket. Thus no live courier journey existed to track. No payment, order cancellation or fabricated GPS was performed.

Validation: npm run typecheck, build, test:unit (163), test:integration (210), test:e2e (1 API smoke), openapi:validate, openapi:coverage, test:foundation (33), test:paid-order (15) all passed. Total422, zero failures/skips. PostgreSQL tests used fresh isolated databases and Redis14/15. See results.json for command exits. Added regressions cover switching after last-item removal/quantity0, clearing a quoted basket without deleting history, and stale-GPS ETA suppression. An initial test fixture type error was fixed by supplying required GPS accuracy. No schema migration. Actual device/browser live-delivery acceptance remains unverified.
