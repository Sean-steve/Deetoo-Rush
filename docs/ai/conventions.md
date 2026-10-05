# AI Coding & Architecture Conventions

This document captures architectural directives and coding conventions for all AI agents contributing to Deetoo.

## Canonical Rules
1. **Rule AI-ARC-001 (Modular Monolith)**:
   - All backend capabilities start inside `apps/api` as cohesive domain modules.
   - Microservices are strictly forbidden during foundation and early sprints.
2. **Rule DOM-INV-007 (Integer Money)**:
   - Never use JavaScript `number` floating-point calculations for financial amounts.
   - All monetary values must be integer minor units (`subtotal_minor`, `total_minor`).
   - Standard currency is KES (`cents`).
3. **Rule DOM-INV-001 (Single Store per Order)**:
   - A customer cart and order must reference exactly one `merchant_branch_id`. Multi-vendor carts are invalid.
4. **Rule DEE-STATE-001 (Strict State Machines)**:
   - Orders, Deliveries, and Payments must only transition via explicit lifecycle events.
   - Patching statuses arbitrarily without transition validation is prohibited.
5. **Rule DEE-API-001 (Standardized Envelope)**:
   - Successful responses wrap results in `{ "data": T, "requestId": string }`.
   - Error responses wrap results in `{ "error": { "code": string, "message": string, "request_id": string, "details"?: object } }`.
6. **Rule SEC-001 (Correlation & Audit Logs)**:
   - All HTTP requests must capture or generate `X-Request-Id`.
   - Privilege mutations must record structured audit logs.
