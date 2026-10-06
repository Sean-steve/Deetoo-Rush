import React, { useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  InlineBanner,
} from "../../../../packages/ui/src/index";
import {
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  errorMessage,
  useResource,
} from "../../../../packages/ui/src/workflows";

function money(minor: number | null | undefined): string {
  return `KES ${(Number(minor || 0) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function rate(value: number | null | undefined): string {
  return value == null ? "Not enough data" : `${(value * 100).toFixed(1)}%`;
}

export function RiderWalletPanel() {
  const { apiClient } = useAuth();
  const wallet = useResource<any>("/rider/wallet");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function settle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const amountMinor = Math.round(Number(amount) * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error("Enter a valid positive settlement amount.");
      }
      await apiClient.request("/rider/wallet/cash/settlements", {
        method: "POST",
        body: JSON.stringify({ amount_minor: amountMinor }),
      });
      setAmount("");
      setMessage("Cash settlement request created. It remains pending until DeeToo verifies the provider receipt.");
      await wallet.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="Rider wallet"
        eyebrow="Earnings & cash accountability"
        subtitle="The ledger remains the accounting source of truth. Cash is separate from earned pay and must be settled through an auditable flow."
        action={
          <Button variant="outline" onClick={wallet.refresh} isLoading={wallet.loading}>
            Refresh
          </Button>
        }
      />
      {error && <ErrorState message={error} />}
      {message && <InlineBanner kind="success">{message}</InlineBanner>}
      <ResourceState resource={wallet}>
        {wallet.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Available earnings" value={money(wallet.data.available_earnings_minor)} />
              <MetricCard label="Pending earnings" value={money(wallet.data.pending_earnings_minor)} />
              <MetricCard label="Adjustments" value={money(wallet.data.adjustments_minor)} />
              <MetricCard label="Cash collected" value={money(wallet.data.cash_collected_minor)} />
              <MetricCard label="Cash owed to DeeToo" value={money(wallet.data.cash_owed_minor)} />
              <MetricCard
                label="Next payout"
                value={
                  wallet.data.next_payout
                    ? money(wallet.data.next_payout.amount_minor)
                    : "No payout queued"
                }
              />
              <MetricCard
                label="Settlement status"
                value={wallet.data.settlement_status || "No cash settlement"}
              />
            </div>

            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">Cash controls</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Cash threshold: {money(wallet.data.cash_threshold_minor)}. Crossing it can restrict new cash-heavy work without blocking legitimate digital-paid deliveries.
                  </p>
                </div>
                <StatusBadge status={wallet.data.cash_restricted ? "RESTRICTED" : "CLEAR"} />
              </div>
              <InlineBanner
                className="mt-4"
                kind={wallet.data.ledger_reconciled ? "success" : "warning"}
                title={
                  wallet.data.ledger_reconciled
                    ? "Wallet reconciles to the ledger"
                    : "Wallet reconciliation requires review"
                }
              >
                Difference: {money(wallet.data.reconciliation_difference_minor)}.
              </InlineBanner>

              {wallet.data.cash_owed_minor > 0 && (
                <form onSubmit={settle} className="mt-5 max-w-md space-y-3">
                  <FormField label="Cash amount to settle (KES)" required>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                  </FormField>
                  <Button type="submit" isLoading={busy}>
                    Settle cash
                  </Button>
                </form>
              )}
            </Card>
          </>
        )}
      </ResourceState>
    </div>
  );
}

export function RiderPerformancePanel() {
  const performance = useResource<any>("/rider/performance");

  return (
    <div className="space-y-5">
      <PageHeading
        title="Performance"
        eyebrow="Explainable operating signals"
        subtitle="No single customer rating or opaque score automatically suspends a Rider. Enforcement always requires authorized human review."
        action={
          <Button variant="outline" onClick={performance.refresh} isLoading={performance.loading}>
            Refresh
          </Button>
        }
      />
      <ResourceState resource={performance}>
        {performance.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Completion rate" value={rate(performance.data.completion_rate)} />
              <MetricCard label="Offer acceptance" value={rate(performance.data.offer_acceptance_rate)} />
              <MetricCard label="Pickup punctuality" value={rate(performance.data.pickup_punctuality_rate)} />
              <MetricCard label="Delivery punctuality" value={rate(performance.data.delivery_punctuality_rate)} />
              <MetricCard
                label="Customer rating"
                value={
                  performance.data.customer_rating == null
                    ? "No verified ratings"
                    : `${performance.data.customer_rating.toFixed(2)} / 5 (${performance.data.customer_rating_count})`
                }
              />
              <MetricCard
                label="Confirmed conduct incidents"
                value={performance.data.confirmed_conduct_incidents}
              />
              <MetricCard label="Cancellation rate" value={rate(performance.data.cancellation_rate)} />
              <MetricCard label="GPS reliability" value={rate(performance.data.gps_reliability_rate)} />
            </div>
            <Card>
              <h3 className="font-bold text-slate-900">How these metrics are calculated</h3>
              <div className="mt-3 space-y-3">
                {Object.entries(performance.data.definitions || {}).map(([key, definition]) => (
                  <div key={key}>
                    <p className="text-sm font-semibold">
                      {key.replaceAll("_", " ")}
                    </p>
                    <p className="text-sm text-slate-500">{String(definition)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Sample sizes: {Object.entries(performance.data.sample_sizes || {})
                  .map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`)
                  .join(" · ")}
              </p>
            </Card>
          </>
        )}
      </ResourceState>
    </div>
  );
}
