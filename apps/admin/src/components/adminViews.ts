import { FinancialAdjustmentCreateSchema } from "@deetoo/validation";
import { TableConfig } from "./ResourceTable";
const id = (row: any) => encodeURIComponent(row.id);
const status = { key: "status", label: "Status" };
const note = { key: "note", label: "Audit note" };
export const adminViews: Record<string, TableConfig> = {
  orders: {
    title: "Orders & deliveries",
    endpoint: "/admin/orders",
    pageable: true,
    searchable: true,
    columns: [
      { key: "order_number", label: "Order" },
      { key: "customer_name", label: "Customer" },
      { key: "branch_name", label: "Kitchen" },
      status,
      { key: "total_minor", label: "Total", money: true },
    ],
    detail: (r) => `/admin/orders/${id(r)}`,
    actions: [
      {
        label: "Cancel order",
        endpoint: (r) => `/admin/orders/${id(r)}/cancel`,
        body: { reason_code: "ADMIN_INTERVENTION" },
        fields: [note],
        when: (r) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(r.status),
      },
    ],
  },
  dispatch: {
    title: "Live dispatch & fleet",
    endpoint: "/admin/dispatch/deliveries",
    refreshInterval: 5000,
    pageable: true,
    searchable: true,
    columns: [
      { key: "order_number", label: "Order" },
      { key: "branch_name", label: "Kitchen" },
      status,
      { key: "assigned_rider_name", label: "Assigned rider" },
      { key: "dropoff_address_text", label: "Destination" },
    ],
    detail: (r) => `/admin/dispatch/deliveries/${id(r)}`,
    actions: [
      {
        label: "Assign rider",
        endpoint: (r) => `/admin/dispatch/deliveries/${id(r)}/assign`,
        fields: [
          {
            key: "rider_id",
            label: "Available rider",
            optionsEndpoint: (row) =>
              `/admin/dispatch/deliveries/${id(row)}/eligible-riders`,
          },
          note,
        ],
        when: (r) =>
          ["UNASSIGNED", "OFFERED"].includes(r.status) &&
          (r.dispatch_attention_required === true ||
            Number(r.dispatch_cycle_count || 0) >= 3),
      },
      {
        label: "Retry dispatch",
        endpoint: (r) => `/admin/dispatch/deliveries/${id(r)}/trigger`,
        when: (r) =>
          ["UNASSIGNED", "OFFERED"].includes(r.status) &&
          (r.dispatch_attention_required === true ||
            Number(r.dispatch_cycle_count || 0) >= 2),
      },
      {
        label: "Release rider",
        endpoint: (r) => `/admin/dispatch/deliveries/${id(r)}/unassign`,
        fields: [{ key: "reason_code", label: "Reason code" }, note],
        when: (r) => ["ASSIGNED", "ARRIVED_PICKUP"].includes(r.status),
      },
    ],
  },
  merchants: {
    title: "Merchants & approvals",
    endpoint: "/admin/merchants",
    pageable: true,
    offsetPaging: true,
    searchable: true,
    columns: [
      { key: "display_name", label: "Merchant" },
      { key: "approval_status", label: "Approval" },
      { key: "operational_status", label: "Operations" },
    ],
    detail: (r) => `/admin/merchants/${id(r)}`,
    actions: [
      {
        label: "Edit merchant",
        endpoint: (r) => `/admin/merchants/${id(r)}`,
        method: "PATCH",
        roles: ["super_admin"],
        fields: [
          { key: "legal_name", label: "Legal name", required: false },
          { key: "display_name", label: "Trading name", required: false },
          { key: "email", label: "Email", required: false },
          { key: "phone", label: "Phone", required: false },
          { key: "description", label: "Description", required: false },
          { key: "reason", label: "Governance reason" },
        ],
      },
      {
        label: "Deactivate merchant",
        endpoint: (r) => `/admin/governance/merchants/${id(r)}/deactivate`,
        roles: ["super_admin"],
        fields: [{ key: "reason", label: "Governance reason" }],
        when: (r) => r.status !== "DISABLED",
      },
      {
        label: "Reactivate merchant",
        endpoint: (r) => `/admin/governance/merchants/${id(r)}/reactivate`,
        roles: ["super_admin"],
        fields: [{ key: "reason", label: "Governance reason" }],
        when: (r) => r.status === "DISABLED",
      },
      {
        label: "Approve merchant",
        endpoint: (r) => `/admin/merchants/${id(r)}/approve`,
        fields: [note],
        when: (r) => r.approval_status === "PENDING_REVIEW",
      },
      {
        label: "Reject merchant",
        endpoint: (r) => `/admin/merchants/${id(r)}/reject`,
        fields: [{ key: "reason", label: "Rejection reason" }],
        when: (r) => r.approval_status === "PENDING_REVIEW",
      },
    ],
  },
  branches: {
    title: "Branches",
    endpoint: "/admin/branches",
    columns: [
      { key: "name", label: "Branch" },
      { key: "merchant_id", label: "Merchant" },
      { key: "address_line1", label: "Address" },
      { key: "operational_status", label: "Status" },
    ],
    detail: (r) => `/admin/branches/${id(r)}`,
    actions: [
      {
        label: "Suspend branch",
        endpoint: (r) => `/admin/branches/${id(r)}/suspend`,
        fields: [{ key: "reason", label: "Reason" }],
      },
      {
        label: "Reactivate branch",
        endpoint: (r) => `/admin/branches/${id(r)}/reactivate`,
        fields: [{ key: "reason", label: "Reason" }],
      },
    ],
  },
  zones: {
    title: "Service zones",
    endpoint: "/admin/service-zones",
    columns: [
      { key: "name", label: "Zone" },
      { key: "city_id", label: "City" },
      status,
    ],
    actions: [
      {
        label: "Rename zone",
        endpoint: (r) => `/admin/service-zones/${id(r)}`,
        method: "PATCH",
        fields: [{ key: "name", label: "Zone name" }],
      },
    ],
  },
  ledger: {
    title: "Journal",
    endpoint: "/finance/ops/journal",
    columns: [
      { key: "event", label: "Financial event" },
      { key: "amount_minor", label: "Amount", money: true },
      { key: "effective_at", label: "Effective at" },
      status,
    ],
  },
  accounts: {
    title: "Ledger accounts",
    endpoint: "/finance/accounts",
    listKey: "accounts",
    columns: [
      { key: "account_type", label: "Account" },
      { key: "owner_type", label: "Owner type" },
      { key: "currency", label: "Currency" },
      { key: "balance_minor", label: "Balance", money: true },
    ],
    detail: (r) => `/finance/accounts/${id(r)}/entries`,
  },
  payments: {
    title: "Payments & refunds",
    endpoint: "/finance/ops/payments",
    pageable: true,
    searchable: true,
    columns: [
      { key: "order_number", label: "Order" },
      { key: "provider", label: "Provider" },
      { key: "provider_status", label: "Provider status" },
      { key: "provider_reference", label: "Provider reference" },
      { key: "internal_status", label: "Internal status" },
      { key: "reconciliation_status", label: "Reconciliation" },
      { key: "amount_minor", label: "Amount", money: true },
      { key: "captured_minor", label: "Captured", money: true },
      { key: "refunded_minor", label: "Refunded", money: true },
      { key: "failure_reason", label: "Failure" },
    ],
    detail: (r) => `/payments/admin/${id(r)}/refunds`,
    actions: [
      {
        label: "Request refund",
        endpoint: (r) => `/payments/admin/${id(r)}/refunds`,
        fields: [
          {
            key: "amount_minor",
            label: "Refund amount (minor units)",
            type: "number",
          },
          {
            key: "reason_code",
            label: "Reason",
            options: [
              "MERCHANT_REJECTED",
              "ORDER_CANCELLED",
              "ITEM_MISSING",
              "DUPLICATE_PAYMENT",
              "DELIVERY_FAILED",
              "CUSTOMER_SUPPORT_ADJUSTMENT",
              "OTHER",
            ],
          },
          note,
        ],
        when: (r) => ["CAPTURED", "PARTIALLY_REFUNDED"].includes(r.internal_status),
      },
    ],
  },
  settlements: {
    title: "Merchant settlements",
    endpoint: "/finance/settlements",
    listKey: "settlements",
    columns: [
      { key: "settlement_number", label: "Settlement" },
      { key: "merchant_id", label: "Merchant" },
      status,
      { key: "net_settlement_amount_minor", label: "Net payable", money: true },
      { key: "period_end", label: "Period end" },
    ],
    actions: [
      {
        label: "Approve settlement",
        endpoint: (r) => `/finance/settlements/${id(r)}/approve`,
        fields: [note],
        when: (r) => ["CALCULATED", "DRAFT"].includes(r.status),
      },
      {
        label: "Initiate disbursement",
        endpoint: (r) => `/finance/settlements/${id(r)}/pay`,
        fields: [{ key: "destination_id", label: "Payout destination ID" }],
        when: (r) => r.status === "APPROVED",
      },
    ],
  },
  payouts: {
    title: "Rider payouts",
    endpoint: "/finance/payouts",
    listKey: "payouts",
    columns: [
      { key: "payout_number", label: "Payout" },
      { key: "rider_id", label: "Rider" },
      status,
      { key: "amount_minor", label: "Amount", money: true },
      { key: "period_end", label: "Period end" },
    ],
    actions: [
      {
        label: "Approve payout",
        endpoint: (r) => `/finance/payouts/${id(r)}/approve`,
        fields: [note],
        when: (r) => ["CALCULATED", "DRAFT"].includes(r.status),
      },
      {
        label: "Initiate payout",
        endpoint: (r) => `/finance/payouts/${id(r)}/pay`,
        fields: [{ key: "destination_id", label: "Payout destination ID" }],
        when: (r) => r.status === "APPROVED",
      },
    ],
  },
  approvalQueue: {
    title: "Money-out approval queue",
    endpoint: "/finance/ops/money-out/approval-queue",
    columns: [
      { key: "resource_type", label: "Type" },
      { key: "reference", label: "Batch" },
      { key: "owner_id", label: "Beneficiary" },
      { key: "amount_minor", label: "Amount", money: true },
      status,
      { key: "created_at", label: "Created" },
    ],
    actions: [
      {
        label: "Approve",
        endpoint: (r) =>
          r.resource_type === "MERCHANT_SETTLEMENT"
            ? `/finance/settlements/${id(r)}/approve`
            : `/finance/payouts/${id(r)}/approve`,
        fields: [note],
      },
    ],
  },
  profitability: {
    title: "Profitability",
    endpoint: "/finance/profitability",
    listKey: "recent_orders",
    columns: [
      { key: "order_number", label: "Order" },
      { key: "gmv_minor", label: "GMV", money: true },
      { key: "gross_platform_revenue_minor", label: "Platform revenue", money: true },
      { key: "rider_cost_minor", label: "Rider cost", money: true },
      { key: "contribution_profit_minor", label: "Contribution", money: true },
      { key: "contribution_margin_pct", label: "Margin %" },
    ],
  },
  commissionRules: {
    title: "Merchant commission rules",
    endpoint: "/finance/ops/commercial/commission-rules",
    columns: [
      { key: "merchant_name", label: "Merchant" },
      { key: "percentage_display", label: "Rate" },
      { key: "fixed_fee_minor", label: "Fixed fee", money: true },
      { key: "rule_source", label: "Source" },
      { key: "effective_from", label: "Effective from" },
      status,
    ],
    toolbar: [
      {
        label: "Set platform default",
        endpoint: () => "/finance/ops/commercial/commission-rules",
        body: { merchant_id: null },
        fields: [
          { key: "percentage_rate", label: "Rate (0 to 1)", type: "number" },
          { key: "fixed_fee_minor", label: "Fixed fee (minor units)", type: "number", required: false },
        ],
      },
      {
        label: "Set merchant rule",
        endpoint: () => "/finance/ops/commercial/commission-rules",
        fields: [
          { key: "merchant_id", label: "Merchant ID" },
          { key: "percentage_rate", label: "Rate (0 to 1)", type: "number" },
          { key: "fixed_fee_minor", label: "Fixed fee (minor units)", type: "number", required: false },
        ],
      },
    ],
  },
  commercialReviews: {
    title: "Commercial review requests",
    endpoint: "/finance/ops/commercial/review-requests",
    columns: [
      { key: "merchant_name", label: "Merchant" },
      { key: "reason", label: "Request" },
      status,
      { key: "created_at", label: "Requested" },
      { key: "review_note", label: "Finance note" },
    ],
    actions: [
      {
        label: "Complete review",
        endpoint: (r) => `/finance/ops/commercial/review-requests/${id(r)}/resolve`,
        fields: [{ key: "note", label: "Review outcome / note" }],
        when: (r) => r.status === "OPEN",
      },
    ],
  },
  riderEarningRules: {
    title: "Rider earnings rules",
    endpoint: "/finance/ops/commercial/rider-earning-rules",
    columns: [
      { key: "base_amount_minor", label: "Base", money: true },
      { key: "per_kilometre_amount_minor", label: "Per km", money: true },
      { key: "waiting_amount_minor_per_minute", label: "Waiting / min", money: true },
      { key: "zone_peak_bonus_minor", label: "Zone / peak bonus", money: true },
      { key: "stacked_order_component_minor", label: "Stacked order", money: true },
      { key: "effective_from", label: "Effective from" },
      status,
    ],
    toolbar: [
      {
        label: "Create earnings rule",
        endpoint: () => "/finance/ops/commercial/rider-earning-rules",
        fields: [
          { key: "base_amount_minor", label: "Base amount (minor units)", type: "number" },
          { key: "per_kilometre_amount_minor", label: "Per-kilometre amount", type: "number" },
          { key: "included_distance_meters", label: "Included distance (metres)", type: "number" },
          { key: "waiting_amount_minor_per_minute", label: "Waiting amount / minute", type: "number" },
          { key: "included_waiting_minutes", label: "Included waiting minutes", type: "number" },
          { key: "zone_peak_bonus_minor", label: "Zone / peak bonus", type: "number" },
          { key: "stacked_order_component_minor", label: "Stacked-order component", type: "number" },
        ],
      },
    ],
  },
  incidents: {
    title: "Fleet & incidents",
    endpoint: "/admin/operations/incidents",
    listKey: "incidents",
    columns: [
      { key: "id", label: "Incident" },
      { key: "title", label: "Issue" },
      { key: "severity", label: "Severity" },
      status,
      { key: "order_id", label: "Order" },
    ],
    detail: (r) => `/admin/operations/incidents/${id(r)}`,
    actions: [
      {
        label: "Acknowledge",
        endpoint: (r) => `/admin/operations/incidents/${id(r)}/acknowledge`,
        when: (r) => r.status === "OPEN",
      },
      {
        label: "Investigate",
        endpoint: (r) => `/admin/operations/incidents/${id(r)}/investigate`,
        fields: [note],
        when: (r) => ["OPEN", "ACKNOWLEDGED"].includes(r.status),
      },
      {
        label: "Resolve",
        endpoint: (r) => `/admin/operations/incidents/${id(r)}/resolve`,
        fields: [{ key: "resolutionNotes", label: "Resolution notes" }],
        when: (r) => !["RESOLVED", "DISMISSED"].includes(r.status),
      },
    ],
  },
  // Support has a dedicated conversational workspace (SupportCaseConsole).
  governance: {
    title: "Identity governance",
    endpoint: "/admin/governance/events",
    listKey: "events",
    columns: [
      { key: "subject_type", label: "Subject" },
      { key: "action", label: "Action" },
      { key: "reason", label: "Reason" },
      { key: "actor_role", label: "Actor" },
      { key: "created_at", label: "Time" },
    ],
    toolbar: [
      {
        label: "Provision account",
        endpoint: () => "/admin/governance/provision",
        roles: ["super_admin"],
        fields: [
          {
            key: "subject_type",
            label: "Account type",
            options: ["CUSTOMER", "MERCHANT", "RIDER", "STAFF"],
          },
          { key: "name", label: "Name" },
          { key: "email", label: "Email", required: false },
          { key: "phone_e164", label: "Phone (+254…)", required: false },
          {
            key: "staff_role",
            label: "Staff role (staff only)",
            options: ["support", "ops", "finance", "admin", "super_admin"],
            required: false,
          },
          {
            key: "vehicle_type",
            label: "Vehicle type (Rider only)",
            options: ["BICYCLE", "MOTORBIKE", "CAR"],
            required: false,
          },
          {
            key: "merchant_legal_name",
            label: "Merchant legal name (merchant only)",
            required: false,
          },
          {
            key: "merchant_display_name",
            label: "Merchant trading name (merchant only)",
            required: false,
          },
          { key: "reason", label: "Governance reason" },
        ],
      },
    ],
  },
  disputes: {
    title: "Trust & disputes",
    endpoint: "/trust/disputes",
    listKey: "cases",
    columns: [
      { key: "case_number", label: "Case" },
      { key: "subject", label: "Issue" },
      { key: "review_status", label: "Trust status" },
      { key: "status", label: "Conversation" },
      { key: "order_id", label: "Order" },
      { key: "rider_id", label: "Rider" },
      { key: "created_at", label: "Opened" },
    ],
    detail: (r) => `/trust/disputes/${id(r)}`,
  },
  conduct: {
    title: "Rider conduct",
    endpoint: "/trust/conduct",
    listKey: "reports",
    columns: [
      { key: "conduct_type", label: "Report" },
      { key: "rider_id", label: "Rider" },
      { key: "order_id", label: "Order" },
      { key: "authoritative_amount_minor", label: "DeeToo amount", money: true },
      { key: "requested_amount_minor", label: "Requested", money: true },
      status,
    ],
    actions: [
      {
        label: "Review conduct",
        endpoint: (r) => `/trust/conduct/${id(r)}/review`,
        fields: [
          {
            key: "decision",
            label: "Decision",
            options: ["SUBSTANTIATED", "UNSUBSTANTIATED"],
          },
          { key: "note", label: "Review note" },
        ],
        when: (r) => ["OPEN", "INVESTIGATING"].includes(r.status),
      },
    ],
  },
  riderCashSettlements: {
    title: "Rider cash settlements",
    endpoint: "/trust/cash-settlements",
    listKey: "settlements",
    columns: [
      { key: "rider_id", label: "Rider" },
      { key: "amount_minor", label: "Amount", money: true },
      status,
      { key: "provider", label: "Provider" },
      { key: "requested_at", label: "Requested" },
    ],
    actions: [
      {
        label: "Confirm verified settlement",
        endpoint: (r) => `/trust/cash-settlements/${id(r)}/confirm`,
        fields: [
          { key: "provider_reference", label: "Verified provider reference" },
        ],
        when: (r) => ["REQUESTED", "PENDING_PROVIDER"].includes(r.status),
      },
    ],
  },
  marketplaceAdvisories: {
    title: "Marketplace advisories",
    endpoint: "/trust/advisories",
    listKey: "advisories",
    columns: [
      { key: "advisory_type", label: "Advisory" },
      { key: "scope_type", label: "Scope" },
      { key: "scope_id", label: "Target" },
      { key: "confidence", label: "Confidence" },
      status,
      { key: "generated_at", label: "Generated" },
    ],
    actions: [
      {
        label: "Review advisory",
        endpoint: (r) => `/trust/advisories/${id(r)}`,
        method: "PATCH",
        fields: [
          {
            key: "status",
            label: "Decision",
            options: ["ACKNOWLEDGED", "DISMISSED", "APPLIED"],
          },
        ],
        when: (r) => r.status === "ADVISORY",
      },
    ],
  },
  notifications: {
    title: "Notifications",
    endpoint: "/admin/operations/notifications",
    listKey: "notifications",
    columns: [
      { key: "id", label: "Notification" },
      { key: "channel", label: "Channel" },
      status,
      { key: "recipient_id", label: "Recipient" },
    ],
    actions: [
      {
        label: "Retry notification",
        endpoint: (r) => `/admin/operations/notifications/${id(r)}/retry`,
        when: (r) => ["FAILED", "DEAD_LETTER"].includes(r.status),
      },
    ],
  },
  jobs: {
    title: "Failed background jobs",
    endpoint: "/admin/operations/dead-letter-jobs",
    listKey: "jobs",
    columns: [
      { key: "id", label: "Job" },
      { key: "job_type", label: "Type" },
      status,
      { key: "attempts", label: "Attempts" },
    ],
    actions: [
      {
        label: "Retry job",
        endpoint: (r) => `/admin/operations/dead-letter-jobs/${id(r)}/retry`,
      },
    ],
  },
  onboarding: {
    title: "Merchant onboarding pipeline",
    endpoint: "/admin/merchant-onboarding",
    columns: [
      { key: "display_name", label: "Merchant" },
      { key: "stage", label: "Stage" },
      { key: "approval_status", label: "Approval" },
      { key: "status", label: "Merchant status" },
    ],
    actions: [
      {
        label: "Advance / update stage",
        endpoint: (r) => `/admin/merchants/${encodeURIComponent(r.merchant_id)}/onboarding`,
        method: "PATCH",
        fields: [
          {
            key: "stage",
            label: "Stage",
            options: ["APPLICATION","DOCUMENTS_PENDING","COMMERCIAL_TERMS","CONTENT_SETUP","MENU_QA","STAFF_TRAINING","READY_FOR_REVIEW","APPROVED","LIVE","BLOCKED"],
          },
          { key: "note", label: "Operational note" },
        ],
      },
    ],
  },
  destinations: {
    title: "Verified payout destinations",
    endpoint: "/finance/disbursements/destinations",
    listKey: "destinations",
    columns: [
      { key: "owner_type", label: "Owner type" },
      { key: "owner_id", label: "Owner" },
      { key: "method", label: "Method" },
      { key: "masked_destination", label: "Destination" },
      { key: "verified_at", label: "Verified" },
    ],
    toolbar: [
      {
        label: "Add / replace destination",
        endpoint: () => "/finance/disbursements/destinations",
        fields: [
          { key: "owner_type", label: "Owner type", options: ["MERCHANT","RIDER"] },
          { key: "owner_id", label: "Owner ID" },
          { key: "method", label: "Method", options: ["BANK_GATEWAY","MPESA_B2C"] },
          { key: "provider", label: "Provider" },
          { key: "beneficiary_reference", label: "Provider beneficiary reference" },
          { key: "masked_destination", label: "Masked destination" },
          { key: "currency", label: "Currency" },
        ],
      },
    ],
  },
  disbursements: {
    title: "Money-out attempts",
    endpoint: "/finance/disbursements",
    listKey: "attempts",
    columns: [
      { key: "resource_type", label: "Type" },
      { key: "resource_id", label: "Batch" },
      { key: "provider", label: "Provider" },
      status,
      { key: "amount_minor", label: "Amount", money: true },
      { key: "provider_reference", label: "Provider reference" },
    ],
  },
  moneyOutFailures: {
    title: "Money-out failures",
    endpoint: "/finance/disbursements?status=FAILED",
    listKey: "attempts",
    columns: [
      { key: "resource_type", label: "Type" },
      { key: "resource_id", label: "Batch" },
      { key: "provider", label: "Provider" },
      { key: "amount_minor", label: "Amount", money: true },
      { key: "failure_code", label: "Code" },
      { key: "failure_reason", label: "Failure reason" },
      { key: "updated_at", label: "Last update" },
    ],
  },
  adjustments: {
    toolbar: [
      {
        label: "Request adjustment",
        endpoint: () => "/finance/adjustments",
        schema: FinancialAdjustmentCreateSchema,
        fields: [
          { key: "targetAccountId", label: "Target account ID" },
          { key: "offsetAccountId", label: "Offset account ID" },
          { key: "direction", label: "Direction", options: ["DEBIT","CREDIT"] },
          { key: "amountMinor", label: "Amount (minor units)", type: "number" },
          { key: "reasonCode", label: "Reason", options: ["MERCHANT_CORRECTION","RIDER_CORRECTION","CUSTOMER_REFUND_ADJUSTMENT","PAYMENT_PROCESSOR_ADJUSTMENT","MANUAL_FINANCE_CORRECTION"] },
          { key: "note", label: "Audit note" },
        ],
      },
    ],
    title: "Financial adjustment approvals",
    endpoint: "/finance/adjustments",
    listKey: "adjustments",
    columns: [
      { key: "id", label: "Adjustment" },
      { key: "reason_code", label: "Reason" },
      status,
      { key: "amount_minor", label: "Amount", money: true },
      { key: "requested_by", label: "Requested by" },
    ],
    actions: [
      {
        label: "Approve & post",
        endpoint: (r) => `/finance/adjustments/${id(r)}/approve`,
        when: (r) => r.status === "REQUESTED",
      },
      {
        label: "Reject",
        endpoint: (r) => `/finance/adjustments/${id(r)}/reject`,
        fields: [{ key: "reason", label: "Rejection reason" }],
        when: (r) => r.status === "REQUESTED",
      },
    ],
  },
  risk: {
    title: "Risk signals",
    endpoint: "/admin/operations/risk-signals",
    listKey: "signals",
    columns: [
      { key: "id", label: "Signal" },
      { key: "signal_type", label: "Type" },
      { key: "severity", label: "Severity" },
      status,
    ],
    actions: [
      {
        label: "Review signal",
        endpoint: (r) => `/admin/operations/risk-signals/${id(r)}/review`,
        fields: [
          {
            key: "status",
            label: "Review status",
            options: ["DISMISSED", "CONFIRMED"],
          },
          { key: "notes", label: "Review notes" },
        ],
      },
    ],
  },
};
