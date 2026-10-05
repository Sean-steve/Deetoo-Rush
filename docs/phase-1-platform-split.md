# Phase 1 — platform split and security foundation

Implementation branch: `phase-1-platform-split-security`

## Implemented

- Central API startup no longer serves production frontend assets.
- Root combined SPA retained only in `dev-harness.ts`.
- Independent Customer, Merchant and Admin Vite entrypoints/build outputs.
- Browser Rider classified as simulator.
- Rider Android/native API boundary introduced.
- Web access/refresh credentials moved to HttpOnly cookie transport.
- Browser access-token localStorage persistence removed.
- CSRF double-submit protection added to cookie-authenticated mutations.
- Exact-origin CORS/origin enforcement retained and strengthened.
- Native bearer auth remains separate and supports rotated refresh credentials through secure-store callbacks.
- Sensitive authenticated API classes use no-store/private cache policy.
- Customer no longer assumes a Westlands delivery location.
- Dispatch refuses missing pickup coordinates instead of substituting Nairobi.
- Admin health UI no longer fabricates dependency health on probe failure.
- pnpm is the declared package manager and CI builds Customer, Merchant, Admin and API independently.
- Shared domain/web/native compatibility package boundaries introduced.

## Production topology

| Surface | Production target |
| --- | --- |
| Customer | Responsive Web |
| Merchant | Responsive Web / Kitchen mode |
| Rider | Android |
| Admin/Ops | Desktop Web |
| API | Central modular monolith |

Recommended public routing:

- `deetoo.co.ke`
- `merchant.deetoo.co.ke`
- `ops.deetoo.co.ke`
- `api.deetoo.co.ke` for native/provider traffic

Browser deployments should reverse proxy `/api/v1` to the central API so cookies remain host-only.

## Deliberately deferred to Phase 2

- React Native Rider UI;
- Android foreground/background location service;
- FCM;
- native camera/proof uploads;
- pickup custody changes;
- delivery OTP/proof;
- private object storage implementation;
- fulfilment browser/device E2E.

## Verification gate

Phase 1 is not complete until CI/typecheck/tests/independent builds pass and browser authentication is exercised through the independent web entrypoints.
