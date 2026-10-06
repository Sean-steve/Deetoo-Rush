import React from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Card,
  Price,
  Button,
  EmptyState,
  FormField,
  Input,
  InlineBanner,
  Select,
  Textarea,
} from "../../../../packages/ui/src/index";
import {
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  errorMessage,
  useResource,
} from "../../../../packages/ui/src/workflows";

interface SettlementLine {
  id: string;
  entry_type: "ORDER" | "REFUND" | "ADJUSTMENT";
  reference_id: string;
  gross_amount_minor: number;
  commission_amount_minor: number;
  net_amount_minor: number;
  description?: string;
}

interface Settlement {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_order_value_minor?: number;
  commission_amount_minor?: number;
  promotion_amount_minor?: number;
  refund_amount_minor?: number;
  adjustment_amount_minor?: number;
  net_settlement_amount_minor?: number;
  payment_reference?: string | null;
  failure_reason?: string | null;
  lines?: SettlementLine[];
}

// Every figure rendered here comes directly from GET /finance/merchant/statement -- no invented
// or placeholder numbers. `lines` is only populated by the backend in memory-storage mode today
// (ledger.repository.ts's findSettlements does not join settlement lines in Postgres mode yet);
// the breakdown toggle below correctly shows an empty state rather than fabricating line items
// when the backend hasn't sent any.
function SettlementBreakdown({ settlement }: { settlement: Settlement }) {
  const [expanded, setExpanded] = React.useState(false);
  const rows: Array<[string, number | undefined]> = [
    ["Gross order value", settlement.gross_order_value_minor],
    ["Commission", settlement.commission_amount_minor],
    ["Platform-funded promotions", settlement.promotion_amount_minor],
    ["Refund deductions", settlement.refund_amount_minor],
    ["Adjustments", settlement.adjustment_amount_minor],
  ];
  const hasBreakdown = rows.some(([, v]) => v != null);

  return (
    <Card key={settlement.id} className="mt-3">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="font-bold">
            {settlement.period_start?.slice(0, 10)} — {settlement.period_end?.slice(0, 10)}
          </h2>
          {settlement.payment_reference && (
            <p className="text-sm text-gray-500 mt-1">
              Payment reference: {settlement.payment_reference}
            </p>
          )}
          {settlement.status === "FAILED" && settlement.failure_reason && (
            <p className="text-sm text-red-600 mt-1">{settlement.failure_reason}</p>
          )}
        </div>
        <StatusBadge status={settlement.status} />
      </div>

      <p className="mt-3 text-lg font-semibold">
        {settlement.net_settlement_amount_minor != null && (
          <Price minor={settlement.net_settlement_amount_minor} />
        )}
      </p>

      {hasBreakdown && (
        <button
          type="button"
          className="text-sm underline mt-2"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </button>
      )}

      {expanded && (
        <div className="mt-3 border-t pt-3 space-y-1">
          {rows.map(
            ([label, value]) =>
              value != null && (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-600">{label}</span>
                  <Price minor={value} />
                </div>
              ),
          )}
          <div className="mt-3">
            {settlement.lines && settlement.lines.length > 0 ? (
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="font-normal">Type</th>
                    <th className="font-normal">Reference</th>
                    <th className="font-normal text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.entry_type}</td>
                      <td className="truncate max-w-[10rem]">{line.reference_id}</td>
                      <td className="text-right">
                        <Price minor={line.net_amount_minor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">
                Line-item detail is not available for this settlement.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function MerchantFinance({ merchantId }: { merchantId: string }) {
  const { apiClient } = useAuth();
  const statement = useResource<any>(
    `/finance/merchant/statement?merchant_id=${encodeURIComponent(merchantId)}`,
  );
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");
  const [reviewReason, setReviewReason] = React.useState("");
  const [reviewBusy, setReviewBusy] = React.useState(false);
  const [reviewMessage, setReviewMessage] = React.useState<string | null>(null);

  async function requestCommercialReview() {
    setReviewBusy(true);
    setReviewMessage(null);
    try {
      await apiClient.request("/finance/ops/commercial/review-requests", {
        method: "POST",
        body: JSON.stringify({ reason: reviewReason }),
      });
      setReviewReason("");
      setReviewMessage("Commercial review requested. Finance will review your current terms.");
    } catch (cause) {
      setReviewMessage(errorMessage(cause));
    } finally {
      setReviewBusy(false);
    }
  }

  const settlements: Settlement[] = statement.data?.settlements ?? [];
  const filtered = settlements.filter((s) => {
    if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
    if (fromDate && s.period_start && s.period_start.slice(0, 10) < fromDate) return false;
    if (toDate && s.period_end && s.period_end.slice(0, 10) > toDate) return false;
    return true;
  });

  return (
    <>
      <PageHeading
        title="Finance & settlements"
        action={
          <Button variant="outline" onClick={statement.refresh}>
            Refresh statement
          </Button>
        }
      />
      <ResourceState resource={statement}>
        {statement.data && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                label="Payable balance"
                value={<Price minor={statement.data.payable_balance_minor} />}
              />
              {statement.data.commission_rate != null && (
                <MetricCard
                  label="Commission rate"
                  value={`${(statement.data.commission_rate * 100).toFixed(1)}%`}
                />
              )}
            </div>

            <Card className="mt-4">
              <h3 className="font-bold text-slate-900">Commercial terms</h3>
              <p className="mt-1 text-sm text-slate-600">
                Your current commission rate is visible above. Merchant users cannot change this
                rate directly; negotiated changes are effective-dated and controlled by Finance.
              </p>
              <div className="mt-3">
                <FormField
                  label="Request a commercial review"
                  hint="Explain why Finance should review the current effective-dated terms."
                >
                  <Textarea
                    className="min-h-24"
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    placeholder="Explain why you would like Finance to review the commercial terms."
                  />
                </FormField>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void requestCommercialReview()}
                  isLoading={reviewBusy}
                  disabled={reviewReason.trim().length < 10}
                >
                  Request review
                </Button>
                {reviewMessage && (
                  <InlineBanner kind="info">{reviewMessage}</InlineBanner>
                )}
              </div>
            </Card>

            <div className="flex flex-wrap gap-3 items-end mt-5">
              <div className="min-w-40">
                <FormField label="Status">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    <option value="DRAFT">Draft</option>
                    <option value="CALCULATED">Calculated</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="PAID">Paid</option>
                    <option value="FAILED">Failed</option>
                  </Select>
                </FormField>
              </div>
              <div>
                <FormField label="From">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </FormField>
              </div>
              <div>
                <FormField label="To">
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </FormField>
              </div>
              {(statusFilter !== "ALL" || fromDate || toDate) && (
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="grid gap-4 mt-3">
              {filtered.map((settlement) => (
                <SettlementBreakdown key={settlement.id} settlement={settlement} />
              ))}
              {!filtered.length && settlements.length > 0 && (
                <EmptyState
                  title="No settlements match these filters"
                  description="Try clearing the status or date filters above."
                />
              )}
              {!settlements.length && (
                <EmptyState
                  title="No settlements yet"
                  description="Calculated settlements will appear here."
                />
              )}
            </div>
          </>
        )}
      </ResourceState>
    </>
  );
}
