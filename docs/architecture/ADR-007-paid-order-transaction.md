# ADR-007 — Paid-order transaction (Wave 2)

Status: implementation contract, 2026-09-15. Governing gaps: documentation audit A35–A50, A69–A81/A124; foundation ADR-006. Source: DEE-FIN-001 sections 1–9, 12–16 and canonical pending-payment decision in ADR-006. This wave does not change fulfilment or disbursement policy.

## Quote and API contract

POST /api/v1/orders consumes an owned, unexpired quote once and requires Idempotency-Key. Customer + operation + key identifies a request; a canonical request hash distinguishes exact replay (same result) from conflict (409). A consumed quote under another key returns 409. Payment initiation and refund commands require equivalent scoped keys.

Quote records freeze enriched items/modifiers, address, pricing rules, promotion/funding and commission configuration. A canonical SHA-256 binding covers the source cart, address and economic configuration. Placement revalidates availability and compares the current binding before copying the frozen items. Missing legacy binding requires a new quote. PostgreSQL serialization covers cart consumption and economic mutations; persisted quote content is immutable.

## State and authority

Order creation produces PENDING_PAYMENT, no placed_at and no merchant event. Verified capture is the only release authority: payment evidence, exact captured amount/currency, ledger posting, PLACED transition/history and outbox invalidations commit together. Merchant list/detail/mutations and dispatch require a verified capture, not merely a caller-written order state. Payment failure never releases an order. Terminal fulfilment never regresses on delayed payment results.

Provider operations use durable intent identifiers and stable provider idempotency. External uncertainty remains pending for reconciliation; a timeout is not a verified failure. Callbacks are durable evidence, deduplicated by provider/event ID with payload-hash conflicts. Reconciliation uses the same verification and economic posting path as callbacks. Simulated adapters require explicit development/test fixture mode and never constitute certification.

Card verification uses the exact raw HTTP bytes, timestamped Stripe signature and authenticated provider retrieval, checking intent, order/payment metadata, amount, currency and receiver account. M-PESA callbacks alone cannot establish capture: authenticated provider transaction evidence must establish amount, receiver and request/receipt correlation. An STK status code alone is insufficient. Missing credentials or insufficient evidence fail closed and are classified BLOCKED_BY_CONFIGURATION; no synthetic reference is substituted.

## Economic contract

Integer minor units only. Freeze merchant commission rule at quote time. Gross food includes modifiers. Merchant-funded discount reduces merchant payable; platform-funded discount is a platform promotion debit. Delivery promotions retain gross delivery revenue and record the corresponding subsidy once. Capture debit equals the verified captured amount, never a requested-amount fallback. Debit provider receivable (existing CUSTOMER_FUNDS_CLEARING account alias); credit frozen merchant payable, commission, delivery and service revenue. Current tax-inclusive pricing has no additive tax; unsupported additive tax must fail rather than disappear. Actual provider fees are posted only from verified evidence, not a guessed percentage. Ledger entries are immutable and uniquely identify the business event.

## Cancellation and refunds

Pre-accept customer cancellation and merchant rejection require full remaining refund of captured funds; pending provider intents are cancelled/voided where supported and retained for late-result reconciliation. A late capture on a cancelled/rejected order posts the captured funds and schedules a refund, never merchant release. Fulfilment history stays cancelled/rejected/completed after refund.

Refund amount is reserved under the payment lock, including unresolved requests. Manual refunds require Admin/Finance authorization and a distinct authorized approver; Support/Ops cannot execute financial movement. Automatic full pre-accept cancellation remedies follow the recorded system policy. Stable refund keys prevent duplicate external calls/effects; uncertain results remain reserved until verified. Reversals use original frozen capture allocations with cumulative integer rounding, preventing partial-refund rounding drift and duplicate summary changes. Crash/retry must recover one ledger effect and one release/refund effect.

## Verification boundary

Unit and HTTP regressions cover contract denials and fixture behaviour; PostgreSQL tests cover concurrent commands, durable evidence, rollback/crash and replay. Provider-independent adapter tests are not external sandbox certification. External capture/refund certification is reported separately. Wave 3 is not authorized by this ADR.

Implementation details resolved during repository verification: the existing Payment enum uses `PENDING` for customer interaction, retained as the ADR-006 compatibility spelling. Quote conversion takes short SHARE ROW EXCLUSIVE table locks over its source aggregates so legacy configuration writers also participate; this prioritizes correctness and limits checkout write concurrency until measured optimization. Commission is capped at food value remaining after merchant funding, preventing negative payable. Partial refund allocation floors each original entry cumulatively; any minor-unit imbalance uses an explicit platform rounding adjustment that cancels on full reversal. Provider commands never hold these locks across network calls.

System refund policy is `SYSTEM_FULL_REFUND`, with a null user actor and explicit policy audit. It covers cancellation/rejection and duplicate provider capture. Manual refunds always require an active, distinct Admin/Finance approver. A full refund before merchant acceptance closes the order as CANCELLED; completed fulfilment history stays unchanged. Operational merchant/dispatch commands require remaining captured funds. A separate late capture for an already-funded order posts provider receivable against CUSTOMER_REFUND_PAYABLE and queues return of the excess; it does not credit the merchant twice. M-PESA STK initiation without a known outcome is not blindly retried. Card initiation outside its provider idempotency window requires review; card refund recovery searches provider refund metadata before issuing a new request.
