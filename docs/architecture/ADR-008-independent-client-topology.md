# ADR-008 — Independent client deployment topology

Status: accepted for Phase 1 implementation, 2026-10-05.

## Context

Deetoo previously rendered Customer, Merchant, Rider and Admin inside one Vite SPA selected by a URL hash. That shape was useful as an integration harness but is not an acceptable production deployment boundary: all role experiences shared one browser bundle and the Rider depended on browser GPS.

## Decision

Deetoo keeps one central modular-monolith API and splits client delivery into independently deployable applications:

- Customer Web — responsive browser application.
- Merchant Web — management plus kitchen operations.
- Admin/Ops Web — desktop-first operations console.
- Rider Android — native Android boundary; React Native/device capabilities arrive in Phase 2.
- Browser Rider — development/QA simulator only.

The central API remains the only business authority. Clients never own Order, Delivery, Payment, Dispatch or financial state machines.

## Web authentication and deployment

Browser applications use HttpOnly access/refresh cookies and a double-submit CSRF token. Access credentials are not persisted in localStorage/sessionStorage.

Production web deployments MUST expose the API through a same-origin reverse proxy:

- https://deetoo.co.ke/api/v1 -> central API
- https://merchant.deetoo.co.ke/api/v1 -> central API
- https://ops.deetoo.co.ke/api/v1 -> central API

This keeps session cookies host-only to each web application rather than sharing a broad .deetoo.co.ke cookie domain.

CORS/origin policy is an exact allowlist. Wildcards and suffix matching are not authorized for credentialed browser traffic.

## Native authentication

Android uses short-lived bearer access tokens and rotating refresh credentials. Refresh credentials must be persisted only through a SecureCredentialStore backed by Android Keystore/encrypted storage. AsyncStorage, localStorage and plaintext files are prohibited.

## Realtime

Web clients may continue to use authenticated SSE invalidations followed by scoped REST refetch. Android may use foreground realtime plus FCM in Phase 2. Realtime messages are invalidations, not an alternate source of truth.

## Shared code boundaries

Compatibility packages define the intended seams:

- @deetoo/domain
- @deetoo/api-contract
- @deetoo/auth-web
- @deetoo/auth-native
- @deetoo/design-tokens
- @deetoo/ui-web
- @deetoo/ui-native

Existing packages remain temporarily available while imports migrate incrementally.

## Development harness

The root four-app hash switcher remains development-only. Production API startup does not mount Vite or serve frontend HTML.

## Consequences

- independent client release/deployment cycles;
- smaller security blast radius between web roles;
- Android can use device-native GPS/push/storage without polluting web code;
- no backend microservice split is required;
- infrastructure must provide same-origin proxy routes for each web application.
