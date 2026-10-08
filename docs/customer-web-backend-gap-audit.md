# DeeToo Customer Web — visual mockup / backend capability audit

This document records the gap between the fifteen **visual references** and the existing
API-connected customer journey on PR #25. It is not a request to mock financial,
tracking, promotion, security, or operational state. A visual-only component must
remain omitted, explicitly informative, or disabled until its authoritative contract
is implemented and tested.

## Existing live integrations retained

- Location selection and PostGIS serviceability; public restaurant category/search/open/sort discovery.
- Merchant menu and modifier groups, cart line mutations and promotion-code application.
- Checkout quote, expiry, idempotent order creation and authoritative price breakdown.
- M-PESA/card payment orchestration, order status/timeline, conditional tracking and delivery OTP.
- Profile and verified coordinates, saved addresses, session listing and revocation.
- Persistent notifications and per-item read receipts.
- Support cases, conversations, evidence uploads, human-proposed resolutions,
  customer acceptance/dispute and cancellation review.

## UI components awaiting backend, contract extension or integration

| Screen | Mockup UI requiring work | Required contract / clarification | Priority |
|---|---|---|---|
| 01 Discover | Campaign carousel, personalized offers, discount badges | Publish campaigns, eligibility, availability windows, targeting and promo attribution; no synthetic discount claims | P2 |
| 01 Discover | Restaurant stars, review counts, “top rated”, hearts | Public verified ratings aggregates, authenticated favorites CRUD | P2 |
| 01 Discover | Dynamic personalized recommendation sections | Ranked recommendation feed based on serviceability and consent-safe signal policy | P3 |
| 02 Search | Rating, price-range, delivery-time sliders and full sort choices | Search API filter criteria and accurate ETA/price source; current supported parameters remain live | P2 |
| 02 Search | Interactive map, search-this-area, moving area bounds and pins | Map tiles/geocoding provider + bounds-based discovery query + geospatial clustering | P2 |
| 03 Restaurant | Reviews tab and restaurant ratings | Merchant/branch reviews pagination, moderation and rating aggregates | P2 |
| 03 Restaurant | Favorite, share-to-friends link, highlighted fee threshold | Favorites CRUD and deep-link metadata; fee incentives require promotion rules (native Share API can be frontend-only) | P2 |
| 04 Product | Multiple food image thumbnails and image gallery | Media model with multiple photos per item; one current item image is supported | P3 |
| 04 Product | Nutritional, allergen, dietary tags / substitution rules | Merchant-maintained catalog metadata and validation; current modifier groups remain authoritative | P2 |
| 05 Empty bag | Personalized “popular near you” food ranking | Real recommendation/cross-sell feed; restaurant discovery can be used without personalization | P3 |
| 06 Cart | “People also added” suggestions / one-tap upsell | Merchant-local complementary items feed and pricing recheck on cart mutation | P3 |
| 07 Checkout | Priority delivery, scheduled delivery, pay-on-delivery | Fulfilment slot/capacity/pricing reservation contract; cash acceptance/collection/ledger policy | P1 if product scope includes them |
| 07 Checkout | Saved cards, saved M-PESA accounts, payment defaults | Provider tokenization, PCI-safe references and user-managed payment instruments | P2 |
| 08 Orders | One-click reorder and download receipt | Reorder endpoint with catalog availability + fresh quote; receipting/tax document endpoint | P2 |
| 08 Orders | Search by food item across all historical orders | Order search/read model with item indexing (local filtering feasible for loaded page only) | P3 |
| 09 Tracking | Turn-by-turn road route, 5-minute exact ETA, rider animation | Verified GPS, routing/polyline, freshness/ETA confidence and map provider tiles; current app hides ETA without evidence | P1 |
| 09 Tracking | Rider call/chat, tracking-share links | Masked voice/contact, two-way order messaging and signed expiring share tokens | P2 |
| 10 Delivered | Separate food/restaurant/rider ratings, multi-question feedback | Expanded rating schema and moderation; current backend supports a single recorded order rating | P2 |
| 10 Delivered | Digital receipt, one-click reorder, tip rider | Financial receipt and reorder contracts; tip accounting/settlement policy | P2 |
| 11 Profile | Favorites, loyalty/rewards counters, friend referral | Favorites, loyalty ledger, referral attribution/anti-fraud | P3 |
| 11 Profile | DeeToo Plus / membership subscription | Product billing, subscription lifecycle, entitlements, refunds and support controls | P3 |
| 11 Profile | Dietary preferences, language, marketing consents | Customer preference schema, consent records and channels policy | P2 |
| 11 Profile | Saved M-PESA/card payments | Provider token vault and scoped customer CRUD | P2 |
| 12 Security | In-page 2FA enrollment, trusted devices | Auth MFA APIs exist; customer-side enrollment/challenge/recovery UX and device contracts need integration | P1 |
| 12 Security | Security PIN, cross-device failed-login activity, privacy export/delete | PIN enforcement for sensitive actions, auditable login events, privacy rights workflow and identity deletion | P1/P2 |
| 13 Notifications | Order/payment/offer categories with trustworthy server semantics | Notification category taxonomy and payload schema; current UI groups heuristically on template text | P2 |
| 13 Notifications | Push/SMS/email preference switches and enable prompt | Preferences persistence, device push registration, consent and provider capability | P2 |
| 13 Notifications | Mark-all-read and precise order deep links | Batch-read mutation and normalized order/entity target metadata (current UI uses per-message read) | P3 |
| 14 Support | Instant staffed live chat, searchable FAQs and topic knowledge base | Staff presence/queue and KB publishing/search; existing case notes are asynchronous | P2 |
| 14 Support | Automatic case categorization, urgent case ETA | Stable category catalog, routing, support SLA/status endpoint | P2 |
| 15 Conversation | Agent typing, delivery/read receipts, instant message updates | Support messaging realtime stream and read cursor (currently fetch/refresh) | P2 |
| 15 Conversation | Inline live rider status, order actions and dedicated case sidebar | Join support-case/order/tracking scoped read contract; never show guessed location | P2 |
| 15 Conversation | One-click refund and safe rider contact from conversation | Case-linked refund request/review; masked contact/approved communication workflows | P2 |

## P1 guardrails
1. Orders and payment amounts must remain server-authoritative. No fake free delivery,
   promo pricing, unsanctioned cash collection, invented ETA, or mock rider GPS.
2. New checkout types require backend capability before becoming active controls.
3. Security action switches may not imply enrolled protections unless auth actually enforces them.
4. A support case resolves through policy and all required confirmations, not a cosmetic
   frontend-only status flip.

## Implementation notes
- PR #25 scopes its stylesheet to the customer-web entry, after base CSS.
- Menu/hero photos are taken from actual merchant/catalogue records, not duplicated
  screenshots or mock vendor data.
- Order and support status filters run against already-returned records.
- The new notification view filters live records and writes read status via the current endpoint.
- The support conversation retains evidence upload, proposed resolution and customer response APIs.
- Verify customer browser layouts at 1440, 1024, 768 and 390 pixels as a visual acceptance step.
