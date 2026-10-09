# Canonical DeeToo Customer Web — 15 Screens on Main

**Decision (2026-10-09): one Customer-facing application.** The canonical Customer URL is `/customer` on the existing `apps/customer-web` (port 5173 in development). Public landing/information routes remain on that same web build. Merchant uses its approved eight-screen live entry.

## Entry point and route ownership
- `apps/customer-web/src/main.tsx` renders `ConnectedCustomerShopping` (15 approved designs, authenticated DeeToo API adapters) for `/customer` and `/customer/*`. It no longer renders the earlier `CustomerApp`.
- Internal discovery, search, bag, checkout, orders, tracking, delivered history, profile, security, notifications, support and conversation links stay under `/customer/*` and survive deep-link refreshes.
- `/customer?auth=login` and `/customer?auth=register` from the public site open the correct actual authentication form, not the old Customer shell.
- The approved 15-screen visual prototype in `apps/customer-web-next` is **test/design fixture source only**, not a second customer-facing portal. The **connected** implementation from that directory is imported and served through the canonical Customer build. Its independent preview build remains for CI screenshot regression/approved-reference comparison, not deployment to a second domain or customer route.
- The previous `apps/customer/src/CustomerApp.tsx` and other earlier UI source is not routed or shipped from the canonical entrypoint. Leave it unchanged pending review of the owner's **14 unpublished local Customer commits**; migrate any unique capabilities before a separate, audited code deletion. This protects otherwise invisible local changes while ensuring there is one **active** Customer interface.
- The Merchant live experience remains the default in `apps/merchant-web`, not a preview.

## Verification
```bash
pnpm dev:api
pnpm dev:customer  # http://localhost:5173/customer is the connected 15-screen Customer UI
pnpm dev:merchant  # new connected eight-screen Merchant UI
pnpm typecheck
pnpm build:customer
pnpm build:merchant
pnpm test:phase1-browser
```
The CI-only customer preview fixture is not the public Customer portal. No screenshots or mock payments can stand in for backend-connected acceptance.

## Deployment guard
**Main branch integration is not authorization to deploy or initiate real payments.** Existing Customer vNext Phase 5 external staging / M-PESA Daraja / SHA-bound release certification and Merchant Phase 4 multi-actor staging sign-off remain required. Preserve existing hosting rollback artifacts until certified; do not change production DNS/cutover as part of this code merge.

## Local unpublished commits
The development laptop currently has 14 additional Customer UI commits that change the previous `apps/customer/src/CustomerApp.tsx` and related CSS; they are not on remote `main` and were **not** incorporated into this PR. Preserve them in a separate branch and audit their functionality against the canonical screens before selectively porting features. The additional `503d014 local` commit contains only `apps/rider-android/.expo/*` device metadata and must not be included in an application release.
