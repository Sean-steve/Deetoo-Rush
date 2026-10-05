# Stitch integration inspection

## Source and scope

Source imported from `deetoo-complete-google-studio.zip` without replacing any backend files. Original SHA-256 values are recorded in `source-baseline.json`. Stitch references are preserved under `design-reference/`; their inline scripts and sample records are reference material only.

## Architecture

React 19 / TypeScript / Vite 6, Tailwind 4, Lucide icons. A single SPA root renders four existing application containers via local React state. There is no URL router: all views originally live at `/`. Preserve those containers and each AuthProvider. Shared packages contain UI, types, validation (Zod), authentication/RBAC, API client, config, and utilities. Forms use local state and shared validation/server responses. Shared Modal currently lacks focus management; Drawer aliases Modal. Responsive behavior uses Tailwind breakpoints.

Express modular monolith at `/api/v1` with PostgreSQL/PostGIS and Redis adapters. Domain repositories also contain seeded, in-memory fallbacks. Existing payment provider adapters include development behavior. Preserving this source does not establish production readiness. AuthProvider uses separate application token storage, a shared authenticated fetch client, refresh recovery, and role/permission helpers. Realtime is SSE plus event polling, not WebSockets. Its router does not authenticate channel subscriptions. The integration leaves that backend untouched and uses authenticated endpoint refreshes for new live views; this deviation is recorded in the completion report. Existing map support is API-side geocoding/serviceability/location, not an installed frontend map renderer.

Root scripts provide Node test-runner suites via tsx; `lint` is an alias for TypeScript checking, not ESLint. Vite/esbuild produce frontend/server bundles. Docker Compose defines PostGIS/Redis; GitHub Actions contains CI. No browser automation is included. The test called cross-app E2E exercises backend services and seeded repositories, not browser journeys.

## Source discrepancy

The supplied frontend is earlier than the functional scope described in the request:

- Customer: discovery, location, address/profile/security forms, restaurant/menu/modifier browsing exist. Cart displays a future-sprint placeholder. Confirm customization only sets a success message. Payment, order and tracking screens are absent.
- Merchant: authentication and CatalogueManager exist. Branch selector is hard-coded. Operational status changes only local state. Kitchen orders are a placeholder with zero counters. No realtime subscription exists in the merchant app.
- Rider: authentication, onboarding, profile, vehicle, availability, GPS and sessions exist. Delivery offers, pickup/delivery workflow and finance screens are absent.
- Admin: authentication, user management, rider review, audit and health exist. Zones and ledger include static examples. Command center and most finance/operations screens are absent.
- Root engineering console displays hard-coded passed tests and healthy status; its Run Tests button merely starts a timer.

The user subsequently instructed completion using this source. Missing frontend workflows were connected to the existing APIs within the same application containers. These are identified as new UI connections in the completion report, not falsely described as preserved pre-existing screens.

## Stitch mapping

`screen-map.json` enumerates every supplied screen and asset with its existing component, state-based view and APIs. `stitch-navigation.json` lists all links in the reference HTML, which are not separately supplied screens. Merchant HTML reuses admin navigation; rider HTML reuses customer navigation. These inappropriate cross-role controls must not be copied.

## Design decisions

Use DESIGN.md structured palette, matching screen HTML: primary #b02700, secondary #006d42, warm surface #fbf9f6, white cards, body #1b1c1a. DESIGN.md prose instead specifies #E24A24; prioritize rendered screen sources. Epilogue headings and Manrope body. Existing Lucide remains the icon system. Do not import sample restaurant photography as real merchant media, generated portrait as a real identity, fake reviews, discounts, service guarantees, location markers or financial figures.

Responsive foundation: 640px mobile/tablet boundary, 1024px desktop boundary, 1240px content width, 16/32/48px margins; 44px minimum interactive touch targets, visible focus and reduced motion. Operational cards are denser; customer cards use generous radius and spacing.
