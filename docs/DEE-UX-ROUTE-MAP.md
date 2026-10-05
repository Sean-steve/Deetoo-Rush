# DEE-UX-ROUTE-MAP — DeeToo Multi-Sided Experience

This route map documents the redesigned DeeToo experience without changing domain authority, API contracts, role permissions, or state machines.

## Public / acquisition site — Customer Web deployment

| Route | Experience |
| --- | --- |
| `/` | DeeToo landing page |
| `/restaurants` | Restaurant discovery entry |
| `/how-it-works` | Customer fulfilment explanation |
| `/partner` | Restaurant partner acquisition |
| `/riders` | Rider acquisition / access |
| `/business` | Business / team ordering proposition |
| `/about` | About DeeToo |
| `/help` | Public help entry |
| `/contact` | Contact routing |
| `/privacy` | Privacy policy surface |
| `/terms` | Terms surface |

Portal destinations can be configured with:
- `VITE_MERCHANT_PORTAL_URL`
- `VITE_ADMIN_PORTAL_URL`
- `VITE_RIDER_PORTAL_URL`

Local development automatically uses ports 5174 (Merchant) and 5175 (Admin/Ops).

## Customer workspace

| Route | Existing DeeToo capability |
| --- | --- |
| `/customer` | Discover restaurants |
| `/customer/cart` | Cart / bag |
| `/customer/orders` | Orders and live tracking |
| `/customer/profile` | Profile and delivery addresses |
| `/customer/security` | Sessions / account security |
| `/customer/support` | Customer support |

## Merchant workspace

The merchant deployment accepts both root routes (for a merchant subdomain) and `/merchant/*` aliases.

| Route | Existing DeeToo capability |
| --- | --- |
| `/orders` | Kitchen display / live order queue |
| `/menu` | Menu catalogue and availability |
| `/finance` | Finance and settlements |
| `/business` | Merchant business and team |
| `/branch` | Branch settings |
| `/security` | Staff sessions / security |
| `/support` | Merchant support |

## Rider experience

The production Rider is native Android rather than a browser-routed workspace. Its redesigned screen hierarchy preserves the existing flows:

1. Secure sign-in.
2. Work availability and GPS freshness.
3. Delivery offer with expected earning and expiry.
4. Active delivery / pickup navigation.
5. Pickup verification.
6. Customer navigation.
7. Delivery proof (OTP or private photo where permitted).
8. Incident / customer-unreachable reporting.
9. Earnings.
10. Offline / ready state.

The public `/riders` page is the web acquisition/access route. Native navigation should remain inside the Android application boundary.

## Admin / Operations workspace

The Admin deployment accepts `/ops/:view` and direct `/:view` routes. Availability remains role/permission controlled.

Core routes:
- `/ops/command` — overview / pulse
- `/ops/dispatch` — live dispatch and fleet
- `/ops/orders` — orders and deliveries
- `/ops/riders` — rider operations
- `/ops/merchants` — merchants and approvals
- `/ops/onboarding` — merchant onboarding
- `/ops/branches` — branches
- `/ops/zones` — service zones
- `/ops/users` — users and access
- `/ops/incidents` — incidents
- `/ops/support` — support cases
- `/ops/payments` — M-Pesa, cards and refunds
- `/ops/ledger` — financial ledger
- `/ops/accounts` — ledger accounts
- `/ops/adjustments` — financial adjustments
- `/ops/destinations` — payout destinations
- `/ops/disbursements` — disbursement attempts
- `/ops/settlements` — merchant settlements
- `/ops/payouts` — rider payouts
- `/ops/notifications` — notification operations
- `/ops/jobs` — background jobs
- `/ops/risk` — risk signals
- `/ops/configuration` — dispatch and operational controls
- `/ops/launch` — launch readiness
- `/ops/audit` — audit trail
- `/ops/overview` — system health

## Visual system

Primary brand green is sourced from the supplied DeeToo logo: **#00BF62**.

Supporting palette:
- Deep green: `#007C43`
- Night ink: `#10231A`
- Mint: `#DDFBEA`
- Lime accent: `#DDFB70`
- Gold accent: `#FFC95C`
- Coral alert/accent: `#FF7657`
- Cloud canvas: `#F6FAF7`

Gradients use the same green family and supporting accents; they are presentation only and do not encode business state.
