import {
  SettlementCalculateSchema,
  RiderPayoutCalculateSchema,
  FinancialAdjustmentCreateSchema,
  ServiceZoneSchema,
} from "@deetoo/validation";
import { TableConfig, RowAction } from "./ResourceTable";
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
  customers: {
    title: "Customers",
    endpoint: "/admin/customers",
    searchable: true,
    pageable: true,
    offsetPaging: true,
    columns: [
      { key: "display_name", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "created_at", label: "Joined" },
    ],
    detail: (row) => `/admin/customers/${id(row)}`,
    actions: [
      {
        label: "Edit profile",
        endpoint: (row) => `/admin/customers/${id(row)}`,
        method: "PATCH",
        requiredPermission: "customer.profile.manage",
        fields: [
          { key: "first_name", label: "First name", required: false },
          { key: "last_name", label: "Last name", required: false },
          { key: "display_name", label: "Display name", required: false },
          { key: "phone", label: "Phone", required: false },
          { key: "email", label: "Email", required: false },
          { key: "reason", label: "Audit reason" },
        ],
      },
      {
        label: "Deactivate account",
        endpoint: (row) => `/admin/customers/${id(row)}`,
        method: "DELETE",
        requiredPermission: "identity.deactivate",
        fields: [{ key: "reason", label: "Deactivation reason" }],
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
        label: "Edit merchant profile",
        endpoint: (row) => `/admin/merchants/${id(row)}`,
        method: "PATCH",
        requiredPermission: "merchant.profile.manage",
        fields: [
          { key: "display_name", label: "Display name", required: false },
          { key: "legal_name", label: "Legal name", required: false },
          { key: "description", label: "Description", required: false },
          { key: "phone", label: "Phone", required: false },
          { key: "email", label: "Email", required: false },
          { key: "reason", label: "Audit reason" },
        ],
      },
      {
        label: "Deactivate merchant",
        endpoint: (row) => `/admin/merchants/${id(row)}`,
        method: "DELETE",
        requiredPermission: "identity.deactivate",
        fields: [{ key: "reason", label: "Deactivation reason" }],
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
    title: "Financial ledger",
    endpoint: "/finance/transactions",
    listKey: "transactions",
    searchable: true,
    columns: [
      { key: "id", label: "Transaction" },
      { key: "reference_id", label: "Reference" },
      { key: "description", label: "Description" },
      { key: "effective_at", label: "Effective at" },
    ],
  },
  accounts: {
    toolbar: [
      {
        label: "Request adjustment",
        endpoint: () => "/finance/adjustments",
        schema: FinancialAdjustmentCreateSchema,
        fields: [
          { key: "targetAccountId", label: "Target account ID" },
          { key: "offsetAccountId", label: "Offset account ID" },
          {
            key: "direction",
            label: "Direction",
            options: ["DEBIT", "CREDIT"],
          },
          { key: "amountMinor", label: "Amount (minor units)", type: "number" },
          {
            key: "reasonCode",
            label: "Reason",
            options: [
              "MERCHANT_CORRECTION",
              "RIDER_CORRECTION",
              "CUSTOMER_REFUND_ADJUSTMENT",
              "PAYMENT_PROCESSOR_ADJUSTMENT",
              "MANUAL_FINANCE_CORRECTION",
            ],
          },
          { key: "note", label: "Audit note" },
        ],
      },
    ],
    title: "Ledger accounts",
    endpoint: "/finance/accounts",
    listKey: "accounts",
    columns: [
      { key: "id", label: "Account" },
      { key: "type", label: "Type" },
      { key: "owner_type", label: "Owner" },
      { key: "balance_minor", label: "Balance", money: true },
    ],
    detail: (r) => `/finance/accounts/${id(r)}/entries`,
  },
  payments: {
    title: "M-PESA & card payments",
    endpoint: "/payments/admin/all",
    pageable: true,
    searchable: true,
    columns: [
      { key: "id", label: "Payment" },
      { key: "order_id", label: "Order" },
      { key: "method", label: "Method" },
      status,
      { key: "amount_minor", label: "Amount", money: true },
    ],
    detail: (r) => `/payments/admin/${id(r)}/refunds`,
    actions: [
      {
        label: "Reconcile payment",
        endpoint: (r) => `/payments/admin/${id(r)}/reconcile`,
      },
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
        when: (r) => ["CAPTURED", "PARTIALLY_REFUNDED"].includes(r.status),
      },
    ],
  },
  settlements: {
    toolbar: [
      {
        label: "Calculate settlement",
        endpoint: () => "/finance/settlements/calculate",
        schema: SettlementCalculateSchema,
        fields: [
          { key: "merchantId", label: "Merchant ID" },
          { key: "periodStart", label: "Period start", type: "date" },
          { key: "periodEnd", label: "Period end", type: "date" },
        ],
      },
    ],
    title: "Merchant settlements",
    endpoint: "/finance/settlements",
    listKey: "settlements",
    columns: [
      { key: "id", label: "Settlement" },
      { key: "merchant_id", label: "Merchant" },
      status,
      { key: "net_settlement_amount_minor", label: "Net payable", money: true },
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
    toolbar: [
      {
        label: "Calculate rider payout",
        endpoint: () => "/finance/payouts/calculate",
        schema: RiderPayoutCalculateSchema,
        fields: [
          { key: "riderId", label: "Rider ID" },
          { key: "periodStart", label: "Period start", type: "date" },
          { key: "periodEnd", label: "Period end", type: "date" },
        ],
      },
    ],
    title: "Rider payouts",
    endpoint: "/finance/payouts",
    listKey: "payouts",
    columns: [
      { key: "id", label: "Payout" },
      { key: "rider_id", label: "Rider" },
      status,
      { key: "amount_minor", label: "Amount", money: true },
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
  support: {
    title: "Support cases",
    endpoint: "/admin/operations/support/cases",
    listKey: "cases",
    columns: [
      { key: "id", label: "Case" },
      { key: "subject", label: "Subject" },
      { key: "priority", label: "Priority" },
      status,
    ],
    detail: (r) => `/admin/operations/support/cases/${id(r)}`,
    actions: [
      {
        label: "Add internal note",
        endpoint: (r) => `/admin/operations/support/cases/${id(r)}/notes`,
        body: { visibility: "INTERNAL" },
        fields: [{ key: "body", label: "Note" }],
      },
      {
        label: "Resolve case",
        endpoint: (r) => `/admin/operations/support/cases/${id(r)}/resolve`,
        fields: [
          { key: "resolutionCode", label: "Resolution code" },
          { key: "resolutionNotes", label: "Resolution notes" },
        ],
        when: (r) => !["RESOLVED", "CLOSED"].includes(r.status),
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
    endpoint: "/admin/merchants/onboarding",
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
