# Operating-flow Phase 1 — 2026-09-24

This is Phase 1 of the supplemental operating-flow plan, not the earlier foundation repair wave. Existing ADR-006/007 remain authoritative. No next phase is started.

## Approved decisions

- Kenya-wide coverage means nearby deliverable branches; maximum 5 km straight-line branch-to-customer radius.
- Dispatch during preparation, timed to estimated readiness. This is an approved policy, not certification of the existing dispatch implementation.
- Merchant pickup code and customer delivery OTP, with audited Ops exceptions. Known delivery-proof defects remain for the fulfilment phase.
- Keep current test prices. Commercial launch approval remains pending.
- Thika Deli coordinates: -1.036648, 37.077523. Mombasa: -4.05052, 39.667169. User supplied both. Juja Branch preserved.

## Changes

- `scripts/configure-operating-phase1.ts`: explicit local operator command requiring an existing Admin actor via DEETOO_CONFIG_ACTOR_ID. Transactional branch coordinate/geography updates, Kenya containment checks, expiry/replacement of the previous delivery rule with a 5,000 m rule, audit record, unchanged fee assertions and repeat-run safety. Successfully applied earlier: two branches changed, one rule replaced; second run made no changes. No migrations.
- `apps/api/src/modules/discovery/discovery.service.ts`: located discovery filters out branches beyond the effective pricing-rule radius; located restaurant detail rejects distant branches. Unlocated browsing does not establish delivery eligibility.
- `apps/api/src/modules/cart/pricing.service.ts`: shared fee calculator accepts a separate eligibility distance. Checkout enforces straight-line radius while retaining existing fee-distance estimate (straight-line × 1.35). This avoids charging the maximum fee just because estimated road distance exceeds a straight-line radius.
- `tests/foundation/durable-foundation.test.ts`: real PostgreSQL nearby/distant discovery, direct-detail denial, 5,000/5,001 m boundaries, fee versus eligibility distance, and full-pricing acceptance/rejection.
- `tests/integration/backend-authorization.test.ts`: reads complete SSE frames rather than assuming one network chunk equals one event. Privacy and session/membership revocation assertions retained; bounded cleanup added.
- `tests/e2e/smoke.test.ts`: closes HTTP, database and Redis resources so the API smoke test terminates.

## Prices retained for testing

Delivery KES100 including3km, KES30 per additional started estimated km, capKES1000; service2.5%, minKES20/maxKES100. Existing10% commission retained. Branch minimum basket currently0. Existing Rider implementation constants: KES150 including2km, KES30/additional km, KES5/waiting minute after10minutes. Rider and commercial prices are NOT approved launch economics.

## Verification

Final validation completed successfully; see completion results below. Earlier failures were not suppressed: two SSE chunk assumptions, smoke-test resource leak, and a road-factor/straight-line radius mismatch were repaired. Temporary processes/logs were lost during interruptions; fresh validation is required.

## Remaining launch gates

Commercial pricing and Rider pay approval; secure provider credentials and payment/refund certification; real identity-delivery/MFA setup; Rider device GPS; dispatch pickup-coordinate and proof defects; verified merchant/Rider disbursement. Existing browser smoke test requires demo credentials and cannot certify the durable app. Do not switch the normal application to demo to pass it. Full cross-role browser journey remains unverified.

## Final completion results

Approved Phase 1 configuration is implemented and verified. Commercial launch approval remains explicitly deferred at the user's request to keep test prices. Policy approval for dispatch/proof does not certify later-phase execution.

| Exact command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:unit` | 162 passed, 0 failed, 0 skipped |
| `npm run test:integration` | 209 passed, 0 failed, 0 skipped |
| `npm run test:e2e` | 1 API smoke test passed, 0 failed, 0 skipped |
| `npm run openapi:validate` | PASS; 227 paths, references resolve |
| `npm run openapi:coverage` | PASS; 261 routes match specification |
| `npm run test:foundation` | 31 passed, 0 failed, 0 skipped |
| `npm run test:paid-order` | 12 passed, 0 failed, 0 skipped |

Total: 415 passed, zero failed or skipped in the listed suites. The normal unit/integration/API-smoke commands explicitly select isolated memory fixtures; they do not certify durable production behaviour. Foundation and paid-order commands ran against newly created isolated PostgreSQL databases, fixtures disabled, Redis databases14/15. Test connection URLs were derived from local environment without printing credentials. No application database reset or migration was performed.

Live HTTP verification against `npm run dev` (durable PostgreSQL, fixtures disabled): readiness200; Thika/Mombasa/Juja each returned its own nearby branch at its stored coordinate, all distances <=5000m; Nairobi (-1.2864,36.8172) returned zero restaurants; Thika detail requested from Mombasa returned422 OUTSIDE_DELIVERY_RANGE. Actual-device browser GPS and the cross-role browser journey are not claimed as tested. Existing demo-only browser smoke was not executed against user accounts.

Machine-readable command exits: `docs/operating-phase-1-results.json`. No Phase2 work, provider transfers, credentials changes or UI redesign occurred.
