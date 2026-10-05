# Local catalogue and pricing configuration — 2026-09-24

User authorized varied menus and explicitly approved the following **local test prices**, not launch prices. Runtime remains PostgreSQL with fixtures disabled; no demo startup, schema changes, payment or order submission.

## Applied data

- Preserved Saturday Night and Weekend Brunch and their original categories/items.
- Added 48 items (24 per menu), 12 categories, 2 shared modifier groups and 5 options.
- Each menu covers breakfast, Kenyan mains, vegetarian, snacks, drinks and desserts. Item prices KES 80–1,800. Each has 23 available additions and one sold-out cheesecake.
- Mains require Regular/Large portion; Large adds KES 150. Mains/vegetarian allow up to two extras: chapati KES 50, avocado KES 100, chicken KES 200.
- Added one default delivery rule: KES 100 including 3 km, KES 30 per additional started km, minimum KES 100, cap KES 1,000, maximum distance 2,000 km. Existing Kenya boundary/branch-zone checks remain enforced.
- Added one service rule: 2.5%, minimum KES 20, maximum KES 100.
- Existing 10% merchant commission unchanged.

## Code and repeatability

`scripts/populate-local-test-catalogue.ts` is an explicit operator command requiring existing Admin actor (`DEETOO_CONFIG_ACTOR_ID`) and target merchant (`DEETOO_TEST_MERCHANT_ID`). It rejects production and fixture/memory modes. It uses a transaction, advisory lock, ownership checks, stable item SKUs, preserved existing rows and audit action `LOCAL_TEST_CATALOGUE_CONFIGURED`. Existing effective fee rules are preserved. Nothing runs automatically at startup. Newly inserted rules use the database transaction timestamp to be immediately visible within the transaction.

Run from repository root with the two IDs set:

```
node --import dotenv/config --import tsx scripts/populate-local-test-catalogue.ts
```

First successful run: 48 items, 12 categories, 2 groups, 5 options, 1 delivery rule, 1 service rule. Second run: zero additions; pre-existing item equality assertions pass. Initial attempt rolled back because JavaScript activation timestamps were later than PostgreSQL transaction `now()`; corrected before successful application.

## Verification

- `npm run typecheck`: passed.
- `NODE_ENV=test DEETOO_STORAGE_MODE=memory DEETOO_FIXTURES=true node --import tsx --test tests/unit/catalogue.test.ts tests/unit/sprint_6_cart_pricing.test.ts`: exited 0, runner reports 2 files passed. This isolated command does not change the running application's durable mode.
- `node --import dotenv/config --import tsx scripts/verify-local-test-catalogue.ts`: passed against actual local PostgreSQL. Both public menus readable; 24 additions per menu; exact sold-out and missing-required-option errors; delivery/service fee boundaries; real customer quote and immutable binding verification. All cart/quote mutations roll back; no payment submitted.
- Quote: two Beef Pilau with regular portion and extra chapati = KES 1,200; delivery KES 1,000; service KES 30; total KES 2,230.
- Logs: `/tmp/deetoo-menu-populate-0.log`, `/tmp/deetoo-menu-populate-1.log`, `/tmp/deetoo-menu-verification.log`, `/tmp/deetoo-menu-pricing-unit.log`.

## Remaining launch considerations

Review/remove clearly labelled test catalogue and approve commercial fee rules before launch. Nationwide test eligibility does not establish nationwide fulfilment capability. Previously confirmed branch-coordinate mismatches remain unresolved; actual branch locations must be supplied rather than guessed. Current quote hits the delivery cap. No branch coordinates, opening hours or approvals were changed here. GPS availability remains a separate Rider issue. No next phase started.
