import React, { useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  InlineBanner,
} from "../../../../packages/ui/src/index";
import {
  MetricCard,
  PageHeading,
  ResourceState,
  errorMessage,
  useResource,
} from "../../../../packages/ui/src/workflows";

function friendlyAccountName(key: string): string {
  return key
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (value) => value.toUpperCase());
}

function formatMoney(minor: number): string {
  return `KES ${(Number(minor || 0) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function FinanceDashboard({ mode }: { mode: "overview" | "reconciliation" }) {
  const { apiClient } = useAuth();
  const resource = useResource<any>(
    mode === "overview" ? "/finance/ops/overview" : "/finance/ops/reconciliation",
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function runReconciliation() {
    setRunning(true);
    setRunError(null);
    try {
      await apiClient.request("/finance/ops/reconciliation/run", { method: "POST" });
      await resource.refresh();
    } catch (cause) {
      setRunError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }

  if (mode === "reconciliation") {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Reconciliation"
          subtitle="Automated matching is the normal workflow. Run-now is an authorized recovery/control action."
          action={
            <Button onClick={() => void runReconciliation()} isLoading={running}>
              <RefreshCw size={15} /> Run reconciliation now
            </Button>
          }
        />
        {runError && <InlineBanner kind="danger">{runError}</InlineBanner>}
        <ResourceState resource={resource}>
          {resource.data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Matched" value={resource.data.matched || 0} />
                <MetricCard label="Pending" value={resource.data.pending || 0} />
                <MetricCard label="Mismatched" value={resource.data.mismatched || 0} />
                <MetricCard label="Manual review" value={resource.data.manual_review || 0} />
              </div>
              <Card>
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    className={resource.data.all_balanced ? "text-emerald-700" : "text-amber-700"}
                    size={20}
                  />
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {resource.data.all_balanced
                        ? "Ledger integrity checks are balanced"
                        : "Exceptions require Finance review"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Scheduled reconciliation remains active. Raw payment, refund, delivery and
                      ledger exceptions are retained in Details for audit and recovery.
                    </p>
                  </div>
                </div>
              </Card>
              <Card>
                <h3 className="font-bold text-slate-900">Recent automation runs</h3>
                <div className="mt-3 space-y-2">
                  {(resource.data.last_runs || []).length ? (
                    resource.data.last_runs.map((run: any, index: number) => (
                      <div
                        key={run.finished_at || index}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm"
                      >
                        <span className="font-medium">{run.status}</span>
                        <span className="text-slate-500">
                          {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}
                        </span>
                        <span className="text-slate-500">
                          {run.result?.reconciledCount ?? 0} healed
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      No persisted automation run has completed since Phase 2 telemetry was enabled.
                    </p>
                  )}
                </div>
              </Card>
            </>
          )}
        </ResourceState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Finance overview"
        subtitle="Money movement, payables and automation health without exposing raw ledger mechanics as the default workflow."
        action={
          <Button variant="outline" onClick={resource.refresh} isLoading={resource.loading}>
            Refresh
          </Button>
        }
      />
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(resource.data.account_balances || {}).map(([key, value]) => (
                <MetricCard
                  key={key}
                  label={friendlyAccountName(key)}
                  value={formatMoney(Number(value))}
                />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <h3 className="font-bold text-slate-900">Reconciliation</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Matched</dt><dd className="font-bold">{resource.data.reconciliation?.matched || 0}</dd></div>
                  <div><dt className="text-slate-500">Pending</dt><dd className="font-bold">{resource.data.reconciliation?.pending || 0}</dd></div>
                  <div><dt className="text-slate-500">Mismatched</dt><dd className="font-bold">{resource.data.reconciliation?.mismatched || 0}</dd></div>
                  <div><dt className="text-slate-500">Manual review</dt><dd className="font-bold">{resource.data.reconciliation?.manual_review || 0}</dd></div>
                </dl>
              </Card>
              <Card>
                <h3 className="font-bold text-slate-900">Merchant settlements</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Awaiting approval</dt><dd className="font-bold">{resource.data.settlement_queue?.calculated || 0}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Approved</dt><dd className="font-bold">{resource.data.settlement_queue?.approved || 0}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Failed</dt><dd className="font-bold">{resource.data.settlement_queue?.failed || 0}</dd></div>
                </dl>
              </Card>
              <Card>
                <h3 className="font-bold text-slate-900">Rider payouts</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Awaiting approval</dt><dd className="font-bold">{resource.data.payout_queue?.calculated || 0}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Approved</dt><dd className="font-bold">{resource.data.payout_queue?.approved || 0}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Failed</dt><dd className="font-bold">{resource.data.payout_queue?.failed || 0}</dd></div>
                </dl>
              </Card>
            </div>
            <Card>
              <h3 className="font-bold text-slate-900">Automation policy</h3>
              <p className="mt-1 text-sm text-slate-600">
                Reconciliation runs every {Math.round((resource.data.automation?.reconciliation_interval_ms || 0) / 1000)} seconds.
                Settlement and payout batches are generated every {Math.round((resource.data.automation?.batch_generation_interval_ms || 0) / 60000)} minutes.
                Generation does not approve money-out: maker/checker approval remains required.
              </p>
            </Card>
          </>
        )}
      </ResourceState>
    </div>
  );
}
