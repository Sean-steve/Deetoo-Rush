# DeeToo Merchant — Phase 3 live frontend integration

**Branch:** `feat/merchant-backend-integration`. The approved eight-screen design is preserved. Default Merchant web entry uses `MerchantLiveApp` with shared authentication. `?merchant-prototype=1` retains the independent design preview; `?merchant-legacy=1` is a rollback-only legacy view. **Do not merge until owner approval.**

## Screen-by-screen API mapping

| Screen | Authenticated component/API bindings |
| --- | --- |
| 01 Kitchen Orders | `MerchantLiveApp.tsx` loads scoped `/merchant/orders`, `/merchant/experience/orders/history`, `/merchant/experience/orders/metrics`. `MerchantPrototype.tsx` handles accept/reject/preparing/ready, rider-only pickup, scoped SMS contact and history/date filters. |
| 02 Menu | `MerchantPrototype.tsx` and `LiveMenuEditor.tsx`: menus, categories, items, availability, modifiers, signed images, inventory and thresholds against existing catalogue and new experience APIs. |
| 03 Finance | `LiveFinance.tsx`: merchant-only ledger overview, dated chart, captured/payment-method split, transactions, settlements and CSV/PDF statements. Future payout date is never fabricated and PDF statements are not fiscal invoices. |
| 04 Business & Team | `LiveBusinessTeam.tsx`: merchant profile, invited members, roles/capability matrix, documents via authorized media URLs, administrative verification state. |
| 05 Branch Settings | `PrototypeBranch.tsx`: scoped branch profile/status/hours/policies/media, browser GPS and provider-backed location. Real maps require provider configuration. |
| 06 Security | `PrototypeSecurity.tsx`: authenticated sessions, login events, MFA, password, trust, revoke and deactivation-request APIs. Trusted devices do not bypass MFA. |
| 07 Notifications | `PrototypeNotifications.tsx`: per-user merchant inbox, individual/bulk read, archive, preferences, category filters and related-screen navigation. |
| 08 Support | `PrototypeSupport.tsx`: scoped cases, messages, secure evidence upload/read, proposed-resolution response, help articles and verified contact directory. Merchant cannot publish internal staff notes or unilaterally close cases. |

## Preservation and safety contract

All approved components stay visible. The live route must use server data, never illustrative demo identities/orders/payments. A failed service has an explicit loading/error or unconfigured status; branch switching must invalidate previous branch data. Data-mutating actions are server-authorized, scoped, and refresh after mutation. Role restrictions come from the backend, not button visibility alone.

## Outstanding Phase 4 acceptance gates

- Cross-app order/payment/inventory/dispatch/finance/support acceptance using seeded PostgreSQL and staging providers; cash/payment/refund/settlement reconciliation.
- Real provider credential certification for Mapbox, media, M-PESA, FCM, email/SMS and masked voice. A reported configuration flag does **not** prove provider health.
- Fiscal KRA/eTIMS invoices need certified third-party integration; existing settlement PDF is explicitly non-tax.
- High-volume server-side pagination/search and complete date-range filtering, native trusted-device attestation/recovery, accessibility and pixel comparison at the approved viewport.
- Latest CI lint/type/build, PostgreSQL tests, browser acceptance and CodeQL must pass before release. No merge to main without approval.
