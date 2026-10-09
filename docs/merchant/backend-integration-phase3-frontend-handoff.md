# DeeToo Merchant — Phase 3 live frontend integration

**Branch:** `feat/merchant-backend-integration`. The approved eight-screen design is preserved. Default Merchant web entry uses `MerchantLiveApp` with shared authentication. `?merchant-prototype=1` retains the independent design preview; `?merchant-legacy=1` is a rollback-only legacy view. **Do not merge until owner approval.**

## Screen-by-screen API mapping

| Screen | Authenticated component/API bindings |
| --- | --- |
| 01 Kitchen Orders | `MerchantLiveApp.tsx` loads scoped `/merchant/orders`, `/merchant/experience/orders/history`, `/merchant/experience/orders/metrics`. `MerchantPrototype.tsx` handles accept/reject/preparing/ready, rider-only pickup, scoped SMS contact and history/date filters. |
| 02 Menu | `MerchantPrototype.tsx` and `LiveMenuEditor.tsx`: menus, categories, items, availability and modifier-group/option CRUD. Inventory is fetched for the branch but **stock adjustment and threshold controls are not yet bound to visible menu actions**; a signed branch-image upload is implemented in Branch Settings, while product-image association requires dedicated completion. |
| 03 Finance | `LiveFinance.tsx`: merchant-only ledger overview, dated chart, captured/payment-method split, transactions, settlements and CSV/PDF statements. Future payout date is never fabricated and PDF statements are not fiscal invoices. |
| 04 Business & Team | `LiveBusinessTeam.tsx`: merchant profile, invited members, roles/capability matrix, documents via authorized media URLs, administrative verification state. |
| 05 Branch Settings | `PrototypeBranch.tsx`: scoped branch profile/status/hours/policies/media and browser GPS. The existing on-screen map is an illustrative view; production interactive map tiles/geocoding integration remains unverified. |
| 06 Security | `PrototypeSecurity.tsx`: authenticated sessions, login events, MFA, password, trust, revoke and deactivation-request APIs. Trusted devices do not bypass MFA. |
| 07 Notifications | `PrototypeNotifications.tsx`: per-user merchant inbox, individual/bulk read, archive, preferences, category filters and related-screen navigation. |
| 08 Support | `PrototypeSupport.tsx`: scoped cases, messages, secure evidence upload/read, proposed-resolution response, help articles and verified contact directory. Merchant cannot publish internal staff notes or unilaterally close cases. |

## Preservation and safety contract

All approved components stay visible. The live route must use server data, never illustrative demo identities/orders/payments. A failed service has an explicit loading/error or unconfigured status; branch switching must invalidate previous branch data. Data-mutating actions are server-authorized, scoped, and refresh after mutation. Role restrictions come from the backend, not button visibility alone.

## Outstanding Phase 4 acceptance gates

- Cross-app order/payment/inventory/dispatch/finance/support acceptance using seeded PostgreSQL and staging providers; cash/payment/refund/settlement reconciliation.
- Stock adjustment/low-stock thresholds in the approved menu workflows, complete product-image associations, persistent merchant logo, and full branch settings atomic-save/partial-failure handling. Real provider credential certification for Mapbox, media, M-PESA, FCM, email/SMS and masked voice. A reported configuration flag does **not** prove provider health.
- Fiscal KRA/eTIMS invoices need certified third-party integration; existing settlement PDF is explicitly non-tax.
- High-volume server-side pagination/search and complete date-range filtering, native trusted-device attestation/recovery, accessibility and pixel comparison at the approved viewport.
- Latest CI lint/type/build, PostgreSQL tests, browser acceptance and CodeQL must pass before release. No merge to main without approval.

## Specific controls retained but still gated by a missing integration or policy

| Screen | Approved component retained | Accurate Phase 3 state / next engineering action |
|---|---|---|
| Kitchen | Mark as picked up | Visually present; rider-authoritative verification is enforced, with an explanatory response instead of a merchant spoof action. Attach rider handover status and eligibility in Phase 4. |
| Kitchen | Customer phone icon | Privately queued SMS message via existing contact relay; masked live calling requires provider and cannot reveal customer number. |
| Menu | Image on each food item | Existing media URL displayed where available; image picker/upload + permanent item media association still needs completion. |
| Menu | Inventory and low-stock threshold | Backend exists and inventory loads, but approved menu controls need complete stock/threshold dialogs and Phase 4 checkout/order concurrency acceptance. |
| Finance | Invoices | Visible tab states truthfully that KRA/eTIMS certified invoicing is not configured; PDF statement export is **not** a fiscal invoice. |
| Finance | Upcoming settlement | Shows a verified schedule only when returned by server; otherwise **Unconfirmed** instead of a made-up payment date. |
| Business | Merchant logo camera button | Visible and explains media dependency; persistent verified logo-to-profile association not completed. |
| Business | Document verification badges | Read server's review status; only authorized Admin confirms verification. |
| Branch | Live map and draggable service point | Latitude/longitude fields and browser geolocation persist through branch API, but map graphic remains illustrative until Mapbox/tile UI wiring and provider certification. |
| Branch | Multi-section Save | Sequential profile/hours/policies writes work but are not a single server transaction; partial failures must be recoverable and displayed. |
| Security | Trusted-device bypass | Button retained to manage verified remembered devices; such records explicitly do **not** bypass MFA. |
| Security | Account deactivation/reactivation | Requests administrative review; no direct merchant deactivation or self-reactivation. |
| Notifications | Contact customer | Navigates to associated order and uses privacy-safe contact workflow; no customer's raw mobile number is returned. |
| Support | Add internal note | Visible staff-only affordance; Merchant cannot create or read internal notes. |
| Support | Mark as resolved | Merchant can accept a staff-proposed resolution; Admin retains final closure authority. |
| Support | Call support | Displays only a verified contact from API, or a truthful unavailable state; masked voice integration not configured. |

**Overall:** Phase 3 has authenticated bindings, but it is **not** certified as complete end-to-end production acceptance. Missing or restricted capabilities are preserved in the UI and documented. All eight mockups still require actual visual screenshot comparison against the authenticated live view.
