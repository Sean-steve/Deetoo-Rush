# Backend integration foundation (Stage B1)

The 15 approved vNext screens remain visual fixtures until individually approved backend view models are connected.

The integration mode defaults to **preview**. In **development only**, set **VITE_CUSTOMER_NEXT_BACKEND_MODE=connected** before running **pnpm dev:customer-next**. This shows an isolated diagnostic sign-in screen **instead of** fixture-backed shopping or account screens, using the existing cookie-based DeeToo AuthProvider.

- All API operations use the existing DeetooApiClient (HttpOnly cookie credentials, CSRF and 401 refresh recovery).
- customer-gateway.ts groups verified routes, validates IDs, requires order idempotency and rejects unverified APIs.
- resource.ts provides loading, empty and error states, and rejects stale responses after unmount or query changes.
- Unsupported operations throw instead of looking successful; unverified response bodies remain unknown.
- No real orders, payments, support tickets or session revocations occur in this Phase B1 diagnostic.
- Production builds remain in approved preview mode regardless of a connected environment flag.
- Source of truth for route/gap decisions: docs/customer-web-next-backend-integration-matrix.md.

No production application, backend route, auth middleware, database migration or existing mockup has been changed.
