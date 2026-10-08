# Customer Web vNext — Screens 14–15 Support: UI and API integration plan

**Status:** Screens 14 and 15 implemented in isolated frontend preview; all data and actions are simulated locally. Approved reference screenshots: 14 DeeToo Help & Support Dashboard; 15 DeeToo Support Conversation Dashboard (1672 × 941).

## Implemented, with no production effects

| Component | Screen 14 Help & Support | Screen 15 Support Conversation | Production boundary |
| --- | --- | --- | --- |
| Support shell and help illustration | Header, urgent-help CTA, seven topic selectors | Return to Support | No promise of an unverified real-time agent. |
| Ticket list and status filters | All / Open / Waiting / Resolved with dynamic counts | Selected conversations, deep link per case | Sample case IDs, not actual tickets. |
| Conversation thread | Embedded case conversation with chronological messages and evidence metadata | Full conversation with read-only sample progress | No synthetic backend replies, polling, rider ETA or payment state. |
| Composer | Local messages added to selected case | Local messages added to selected case | No network send. Reset on reload. |
| Evidence | JPG/PNG/WebP/PDF selection, 5 MB limit and metadata only | Metadata in conversation and attachments rail | No bytes uploaded, no public URL shared. |
| New request | Focus-managed dialog with topic/subject/details | Same accessible dialog | Synthetic ticket inserted in local state only. |
| Resolution proposal | Customer can accept/dispute a sample proposal | Decision recorded in sample transcript | Does **not** change case status; server owns workflow. |
| Context actions | Order details, example attachment list and FAQ affordances | Sample tracker, help actions | Payment/reorder/cancel/refund requires real scoped adapters. |

Responsive layouts for 1672 × 941 and 390 × 844; reduced-motion-aware transitions, focus-visible styles, and case-specific browser-history URLs such as /support/cases/case-arrival.

## Verified existing backend routes

Mounted in apps/api/src/modules/index.ts and defined in apps/api/src/modules/operations/operations.router.ts:

- GET /api/v1/customer/support/cases — list cases scoped to authenticated customer.
- POST /api/v1/customer/support/cases — create case; server checks associated order, delivery and payment scopes.
- GET /api/v1/customer/support/cases/:id — details and case messages, scoped by viewer.
- POST /api/v1/customer/support/cases/:id/notes — append a participant-visible case message and verified media IDs.
- POST /api/v1/customer/support/cases/:id/resolution-response — reply ACCEPTED/DISPUTED to a proposed resolution.
- GET /api/v1/customer/support/cases/:id/attachments/:mediaId/read-url — authorized media read URLs.
- POST /api/v1/media/uploads and POST /api/v1/media/uploads/:id/complete — media lifecycle; validate purpose SUPPORT_ATTACHMENT and strict ownership/attachment limits against backend contracts before enabling.

An alternative participant-scoped path exists: /api/v1/support/cases, /api/v1/support/cases/:id/messages and /api/v1/support/cases/:id/resolution-response. Prefer the customer-scoped API where contract details are suitable; do not mix customer and admin endpoints casually.

### Resolution process: explicit review gate

apps/api/src/modules/operations/support.service.ts confirms:

1. resolveCase (line ~370) requires staff to **propose** resolution and resets required participant confirmations.
2. respondToResolution (line ~414) verifies participant ownership and handles accepted/disputed responses.
3. DISPUTED results in DISPUTED state. Once **all required parties accept**, current backend automatically transitions to CLOSED, without a separate final admin button.

This third behavior must be reviewed with the stated product requirement that high-authority staff oversee final closure and conversations continue until parties are satisfied. Do not silently override production statuses in the customer frontend. If explicit staff final confirmation is required, adjust backend domain policy and tests as a separately approved change.

## Pending integration and acceptance gates

1. Fetch authenticated, scoped cases and messages with pagination/cursors, request states, date localization and supported status mapping (e.g. PARTY_CONFIRMATION, DISPUTED, CLOSED).
2. Keep the full conversation as the primary support interaction; no code-only closure; expose the participant's proposed resolution and confirmation requests.
3. Implement media purpose/ownership validation and signed URLs using the existing media service. Never send raw file paths or arbitrary attachment metadata.
4. Associate orders only after authenticated order-scope verification. Fetch authoritative rider assignment and delivery status; omit unverified ETA and map claims.
5. Make request creation and message mutations idempotent with pending/success/error/rollback UI and controlled retries.
6. Respect consent and permissions for any live chat availability, push delivery or proactive notifications.
7. Compare browser screenshots to originals at 1672 × 941 and mobile 390 × 844. Browser tests and screenshots are evidence, **not automatic pixel-level approval**.
8. Merge only after the user approves all 15 screenshots and the separately approved API integration.

Run with: pnpm dev:customer-next. Browser regression: pnpm test:customer-next-visual.
