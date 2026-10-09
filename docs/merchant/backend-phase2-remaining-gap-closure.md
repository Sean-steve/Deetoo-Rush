# DeeToo Merchant — Phase 2 Remaining Backend Gap Closure

**Implementation branch:** `feat/merchant-backend-integration` (from approved eight-screen frontend).  
**Release boundary:** No merge. Approved prototype screens and component layouts are untouched. Phase 3 binds UI controls to these backend contracts, and Phase 4 validates cross-app workflows and configured external services.

## Implemented in this continuation

| Remaining requirement | Created / modified | Backend behavior, authority and limits |
| --- | --- | --- |
| **Automatic stock reservation at checkout** | `037_merchant_checkout_inventory_reservations.sql`, `order.repository.ts` | Reservations and available stock decrements occur in the **same SQL transaction as order snapshot creation**. Concurrent tracked-cart reservations lock inventory rows and reject insufficient stock. Repeated capture confirms a hold once, cancellation/rejection restores stock once. Untracked products retain prior behavior until staff opt into inventory via a stock record. |
| **Unpaid reservations / expiry** | `merchant/stock-expiry.service.ts`, `scripts/automation-worker.ts` | Worker checks payment-pending holds every minute by default, uses `FOR UPDATE SKIP LOCKED` and an atomic cancellation/timeline/stock restore. It never expires a confirmed paid hold or a provider-captured order. Capture after expiry follows existing cancellation/refund coordination; optimistic order-status guard prevents a racing payment event from reviving an expired order. |
| **Refund-aware finance reporting** | `finance/merchant-finance-read.router.ts` | Uses `EXISTS` for proof of capture instead of a multiplicative evidence join. Totals include recorded succeeded refunds; method grouping distinguishes captured, refunded and net-captured minor units. Kept merchant/branch authorization and existing immutable ledger/settlement engine. |
| **Merchant PDF exports** | `finance/merchant-statement-pdf.ts`, `finance/merchant-finance-read.router.ts`, OpenAPI | New `GET /finance/merchant/experience/settlements/:settlementId/statement.pdf`. Merchant Owner/Manager only, merchant-specific settlement check, paginated PDF with ledger fields and explicit **NOT A TAX INVOICE** statement. No fictitious tax registration/KRA/eTIMS certificate. |
| **Customer privacy and contact** | `merchant-contact.router.ts` and existing Phase 2 integrations | Merchant contact is scoped to an authorized paid order and queues a rate-limited SMS without returning customer telephone numbers or asserting message delivery. Provider keys must be configured. Masked voice calls remain unavailable and are reported as such. |
| **Owner-managed granular access** | `038_merchant_role_capability_controls.sql`, `merchant-role-policy.service.ts`, experience role routes, selected enforcement points | `GET /merchant/experience/roles/capabilities`, `PUT /merchant/experience/roles/capabilities/:role`. Owner may **restrict** existing platform-granted Manager/Staff capabilities; server checks apply to orders, catalogue, inventory, branch policies, documents, finance and staff invitations. Owner role cannot be edited; no grant can exceed base RBAC. Other platform-governed actions retain existing hard-coded privileges. |
| **Provider configuration visibility** | `GET /merchant/experience/providers/readiness` | Credential-presence checks for Mapbox, object storage, FCM, SMS, email and M-PESA. Returns no secrets and deliberately **never** claims successful provider health or completed sandbox certification. |
| **PostgreSQL and PDF tests** | `tests/paid-order/paid-order-transaction.test.ts`, `tests/foundation/durable-foundation.test.ts`, `tests/unit/merchant-statement-pdf.test.ts`, CI workflow | Tests cover reservation, oversell rollback, verified capture confirmation, timed expiry/refill, durable role denials/restoration, PDF xref offsets/pagination/disclaimer. CI PostgreSQL workflow now executes the paid-order test suite after migrations/foundation. |

## Existing capabilities reused; no duplicate systems

- Provider-verified payment capture, refund coordination, double-entry ledger and existing merchant settlement payouts.
- Checkout quote, order state machine, branch availability, paid-order guard and rider-authoritative pickup.
- Catalogue CRUD and modifiers, branch status/hours, merchant team invitations and membership hierarchy.
- Session revocation/MFA, signed media, notification delivery infrastructure and staff-led support conversations.
- Maps/geocoding adapter (live only with configured Mapbox token), private object-store upload and outgoing provider workers.

## API/documentation changes

- New finance PDF route and role matrix/configuration routes are registered in `openapi/openapi.yaml`.
- Additive schema migrations `037` and `038` extend earlier `035`–`036` work. Applied historic migrations were not edited.
- Privilege policies are **restrictive**: an allowed override never elevates someone beyond the platform’s existing role-check paths.
- Customer contact remains opt-in via authorized workflow; no customer phone number appears in Merchant payloads.
- Every backend endpoint continues to enforce ownership at query, router and/or service level, not merely client-side hiding.

## Release dependencies that cannot be falsely declared complete

1. **KRA/eTIMS compliant tax invoices:** PDF **settlement statements** work, but fiscal invoice issuance needs the actual certified eTIMS integration, legal tax/seller identity, invoice numbering and valid test/production credentials. A PDF alone is not a Kenyan tax invoice.
2. **External provider verification:** SMS, FCM, object storage, Mapbox and M-PESA require real sandbox/production keys and authenticated staging probes. The readiness endpoint reports presence, **not successful provider connectivity**. Masked telephone calling also requires a suitable relay provider.
3. **Operations readiness:** Dynamic role controls cover the specified Merchant action families; validate authorization against the full production privilege matrix and cross-app regression suite. Security MFA recovery/attestation and full deactivation/reactivation lifecycle require dedicated trust/runbook acceptance.
4. **Finance reconciliation:** Refund-aware projections use succeeded refunds and summary state; final provider/ledger/settlement conservation must be certified against seeded multi-merchant refunds, adjustments and actual payout callbacks. No estimated payout date will be fabricated.
5. **Frontend integration:** The approved eight-screen prototype still uses mock data. **Phase 3 must wire its controls to these endpoints** and preserve the entire approved component inventory, including honestly disabled/unconfigured states.

## Acceptance

- [x] Backend changes are isolated on the approved integration branch.
- [x] Inventory hold/expiry, financial reporting, PDF statements, provider readiness and restricted-role matrix committed.
- [x] PostgreSQL foundation and paid-order CI coverage configured.
- [ ] Confirm final CI lint/typecheck/unit, paid-order PostgreSQL, browser and CodeQL results on the branch head.
- [ ] External sandbox/provider credentials and KRA/eTIMS certified tax invoicing tests.
- [ ] Complete Phase 3 live frontend integration and Phase 4 cross-app acceptance.

**Do not merge or treat a credential-present/unconfigured backend as live production service.**
