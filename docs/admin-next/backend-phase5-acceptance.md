# DeeToo Rush — Phase 5: Cross-Application Acceptance & Release Hardening

**Change branch:** `feat/admin-next-backend-phase5` (stacked on Phase 4, `feat/admin-next-backend-phase4`).  
**Release posture:** Not production-certified. Preserve the approved 15 Customer, eight Merchant, 16 Admin screens and current Rider experience.

## Acceptance scope and evidence rules

Phase 5 does not treat mocked Playwright API responses as four-party production proof. The CI acceptance ladder consists of:

1. Static/type checks, API OpenAPI coverage, unit/security tests, independent builds and Rider Android typecheck/export.
2. **Real isolated PostgreSQL/PostGIS + Redis:** customer discovery → cart → quote → checkout; local-provider payment command → verified capture → merchant order; merchant preparation → eligible rider offer → pickup code → live tracking → drop-off OTP → completed order and rider ledger.
3. **Real isolated PostgreSQL/PostGIS + Redis negative cases:** concurrent payment initiation and capture, refund exactly once, forbidden cross-customer order/tracking, invalid rider pickup/drop-off codes, unauthorized Admin cancellation, outbox rollback/retry/session revocation.
4. **Phase 5 extension of the real delivery service test:** real HTTP Admin vs legacy Operations support creation, verified participant and related-order ownership, no unauthenticated/customer access to staff routes, 404 for missing participant, 409 for wrong party/order, durable note, true paginated case totals (including empty pages), bounded numeric page inputs. Test also provisions real merchant owners and riders and asserts pending activation, DRAFT onboarding, OFFLINE rider work state and administrator governance audit entries.
5. **Browser:** all 16 live Admin routes, signed-in staff transport, no fixture fallback, actual create-case/provision request shape (intercepted contracts), outage/retry and unauthorized-customer exclusion. The visual/demo golden-screens gate still runs separately.
6. **CI CodeQL:** static code analysis. A passing CodeQL run does not prove an absence of vulnerabilities.

### Phase 5 defects hardened

| Issue | Remediation | Regression |
|---|---|---|
| Legacy `POST /operations/support/cases` accepted arbitrary participant identifiers and unverified order links, bypassing new Admin validation | Both staff case-create endpoints call the same strict PostgreSQL identity/order verification before creating conversations. The active server-side session supplies staff identity; display names are never treated as identity. | Real HTTP rejects unregistered parties and wrong-party order IDs through **both** paths. |
| `GET /operations/support/cases` reported `total` equal to the current page's length | SQL counts matching cases **before** pagination, uses parameterized limit/offset and deterministic date+ID sort | Real HTTP checks one-row page and empty offset still report consistent full total. |
| Unchecked pagination accepted invalid limit/offset inputs | Support directory request validation now bounds the page to 1–100 and offset to nonnegative integers. | Tests exercise negative, NaN and oversize limits. |
| UI could mislead operators when backend calls fail | No redesign. Browser acceptance checks live sign-in, error, retry and no demo fixture fallback. | Playwright new outage/unauthorized role checks. |
| Privileged provisioning could be mistaken for completed onboarding | Real acceptance checks merchant owner starts PENDING with merchant DRAFT/DISABLED and Rider starts PENDING, DRAFT/OFFLINE, with durable governance audit. | Isolated PostgreSQL HTTP and SQL assertions. |

## Run these tests

From the workspace root with the committed pnpm lockfile:

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm build:customer-next && pnpm build:merchant && pnpm build:admin-next
pnpm typecheck:rider-android && pnpm build:rider-android
pnpm test:admin-next-visual
pnpm test:admin-next-live
```

The GitHub `customer-shopping-real-services`, `customer-delivery-real-services` and `durable-foundation` jobs supply isolated PostGIS and Redis databases and local/test-only payment configuration. Run real-service tests only in those strictly isolated environments. **Never set synthetic payment flags on a deployed staging or production database.**

## Release acceptance matrix

| Area | CI evidence | Outstanding external acceptance |
|---|---|---|
| Customer storefront, cart, checkout, payment and order privacy | Existing browser contracts + real services tests | Device/browser staging checkout with real customer identity |
| Merchant fulfilment, inventory safeguards, onboarding | Real services + existing guards | Merchant session completes actual KYC review and branch opening on deployed staging |
| Rider offer, pickup, OTP, delivery and earnings | Real PostGIS/Redis delivery + Android export | Physical Android device, push/background-location and rider sandbox identity |
| Admin 16 approved screens | Golden-screen + live contract browser tests | Role-matrix on deployed frontend and complete API data with large datasets |
| Multi-party support | Phase 5 verified participant/ownership + durable notes | All parties confirm/dispute a real conversation; concurrency and attachment permissions |
| Payments and settlements | Local payment idempotency/ledger/refund tests | Safaricom M-PESA/Card sandbox callbacks, failed payout/refund and ledger reconciliation; no real-provider certification from CI |
| Real-time/outbox | PostgreSQL outbox/security tests + SSE | Deployed multi-client event delivery and worker recovery under disconnects |
| Geo serviceability | PostGIS route/zone tests | Geocoder and authoritative GIS boundary verification for every activated service zone |
| Scale/export | Bounded support server paging and true count | Full API-side pagination/search/export across other Admin resources, performance/load and accessibility testing |
| Release/deployment | CI checks and document | Secrets, worker process/monitoring, backups/restore drill, staged smoke test and rollback verification |

## Hard release blockers

**Do not merge for production or label READY** solely on green unit/integration/browser CI.

- Real payment provider credentials and callback ownership, money-in and money-out sandbox certification remain environment-specific.
- Four independent deployed Customer/Merchant/Rider/Admin authenticated sessions and physical Rider Android validation have not been demonstrated by isolated CI.
- GIS boundary provenance/geocoding and cross-directory full pagination/exports are not fully closed by this scope.
- High-load concurrent rider offers, support-resolution disputes, payout failure/retries and restore drills need deployed staging evidence.
- Record screenshots, exact run hashes, device/browser versions, test identities (never secrets), provider reference IDs and acceptance sign-off in a release evidence package before production rollout.

**Branch strategy:** Phase 5 changes remain a reviewable draft PR against Phase 4; Phase 4 itself stays unmerged while acceptance is underway. A Phase 4 CI pass cannot be carried forward as a Phase 5 CI pass.
