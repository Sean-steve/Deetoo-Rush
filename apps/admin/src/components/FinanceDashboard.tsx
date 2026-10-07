import React, { useMemo, useState } from "react";
import {
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ChartFrame,
  InlineBanner,
  ProgressBar,
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

function QueueHealth({
  label,
  queue,
}: {
  label: string;
  queue: { calculated?: number; approved?: number; failed?: number };
}) {
  const calculated = Number(queue?.calculated || 0);
  const approved = Number(queue?.approved || 0);
  const failed = Number(queue?.failed || 0);
  const total = Math.max(1, calculated + approved + failed);
  return (
    <div className="admin-money-queue">
      <div className="admin-money-queue-head">
        <strong>{label}</strong>
        <span>{calculated + approved + failed} batches</span>
      </div>
      <ProgressBar
        label="Awaiting approval"
        value={calculated}
        max={total}
        showValue
      />
      <ProgressBar label="Approved" value={approved} max={total} showValue />
      <ProgressBar label="Failed" value={failed} max={total} showValue />
    </div>
  );
}

export function FinanceDashboard({
  mode,
}: {
  mode: "overview" | "reconciliation";
}) {
  const { apiClient } = useAuth();
  const resource = useResource<any>(
    mode === "overview"
      ? "/finance/ops/overview"
      : "/finance/ops/reconciliation",
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function runReconciliation() {
    setRunning(true);
    setRunError(null);
    try {
      await apiClient.request("/finance/ops/reconciliation/run", {
        method: "POST",
      });
      await resource.refresh();
    } catch (cause) {
      setRunError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }

  const reconciliationExceptionGroups = useMemo(() => {
    if (mode !== "reconciliation" || !resource.data?.exceptions) return [];
    const report = resource.data.exceptions;
    return [
      {
        label: "Captured payments without ledger posting",
        count: report.unreconciled_captured_payments?.length || 0,
      },
      {
        label: "Succeeded refunds without ledger reversal",
        count: report.unreconciled_succeeded_refunds?.length || 0,
      },
      {
        label: "Delivered orders missing Rider earning / posting",
        count: report.unreconciled_delivered_deliveries?.length || 0,
      },
      {
        label: "Completed orders requiring review",
        count: report.unreconciled_completed_orders?.length || 0,
      },
      {
        label: "Unbalanced ledger transactions",
        count: report.unbalanced_ledger_transactions?.length || 0,
      },
    ].filter((group) => group.count > 0);
  }, [mode, resource.data]);

  if (mode === "reconciliation") {
    const total =
      Number(resource.data?.matched || 0) +
      Number(resource.data?.pending || 0) +
      Number(resource.data?.mismatched || 0) +
      Number(resource.data?.manual_review || 0);

    return (
      <div className="space-y-6">
        <PageHeading
          title="Reconciliation"
          eyebrow="Finance control"
          subtitle="Automation does the matching. Finance works the exceptions."
          status={
            resource.data ? (
              resource.data.all_balanced ? (
                <span className="admin-health-pill is-healthy">
                  <ShieldCheck size={14} /> Balanced
                </span>
              ) : (
                <span className="admin-health-pill is-warning">
                  <TriangleAlert size={14} /> Review required
                </span>
              )
            ) : undefined
          }
          action={
            <Button
              onClick={() => void runReconciliation()}
              isLoading={running}
            >
              <RefreshCw size={15} /> Run reconciliation now
            </Button>
          }
        />

        {runError && <InlineBanner kind="danger">{runError}</InlineBanner>}

        <ResourceState resource={resource}>
          {resource.data && (
            <div className="admin-finance-layout">
              <div className="admin-finance-primary">
                <div className="admin-control-kpis">
                  <MetricCard
                    label="Matched"
                    value={resource.data.matched || 0}
                    detail="Provider and DeeToo records agree"
                  />
                  <MetricCard
                    label="Pending"
                    value={resource.data.pending || 0}
                    detail="Still inside normal processing"
                  />
                  <MetricCard
                    label="Mismatched"
                    value={resource.data.mismatched || 0}
                    detail="Requires reconciliation review"
                    status={
                      resource.data.mismatched ? (
                        <span className="admin-health-pill is-warning">
                          Review
                        </span>
                      ) : undefined
                    }
                  />
                  <MetricCard
                    label="Manual review"
                    value={resource.data.manual_review || 0}
                    detail="Human decision required"
                    status={
                      resource.data.manual_review ? (
                        <span className="admin-health-pill is-warning">
                          Action
                        </span>
                      ) : undefined
                    }
                  />
                </div>

                <ChartFrame
                  title="Reconciliation distribution"
                  description="Current payment reconciliation state across the latest Finance snapshot."
                >
                  <div className="admin-reconciliation-bars">
                    <ProgressBar
                      label="Matched"
                      value={resource.data.matched || 0}
                      max={Math.max(1, total)}
                      showValue
                    />
                    <ProgressBar
                      label="Pending"
                      value={resource.data.pending || 0}
                      max={Math.max(1, total)}
                      showValue
                    />
                    <ProgressBar
                      label="Mismatched"
                      value={resource.data.mismatched || 0}
                      max={Math.max(1, total)}
                      showValue
                    />
                    <ProgressBar
                      label="Manual review"
                      value={resource.data.manual_review || 0}
                      max={Math.max(1, total)}
                      showValue
                    />
                  </div>
                </ChartFrame>

                <Card>
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">Automation history</p>
                      <h2>Recent reconciliation runs</h2>
                    </div>
                    <RefreshCw size={19} aria-hidden="true" />
                  </div>
                  <div className="admin-automation-runs">
                    {(resource.data.last_runs || []).length ? (
                      resource.data.last_runs.map(
                        (run: any, index: number) => (
                          <div key={run.finished_at || index}>
                            <span className="admin-health-pill">
                              {run.status}
                            </span>
                            <span>
                              {run.finished_at
                                ? new Date(run.finished_at).toLocaleString()
                                : "—"}
                            </span>
                            <strong>
                              {run.result?.reconciledCount ?? 0} healed
                            </strong>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-sm text-slate-500">
                        No persisted reconciliation run has completed yet.
                      </p>
                    )}
                  </div>
                </Card>
              </div>

              <aside className="admin-finance-rail">
                <Card>
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">Exceptions</p>
                      <h2>What is broken?</h2>
                    </div>
                    <strong className="admin-action-count">
                      {reconciliationExceptionGroups.reduce(
                        (sum, group) => sum + group.count,
                        0,
                      )}
                    </strong>
                  </div>
                  {reconciliationExceptionGroups.length ? (
                    <div className="admin-finance-exceptions">
                      {reconciliationExceptionGroups.map((group) => (
                        <div key={group.label}>
                          <TriangleAlert size={16} aria-hidden="true" />
                          <span>{group.label}</span>
                          <strong>{group.count}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InlineBanner
                      kind="success"
                      title="Ledger integrity checks are balanced"
                    >
                      No reconciliation exception is present in the current
                      report.
                    </InlineBanner>
                  )}
                </Card>
              </aside>
            </div>
          )}
        </ResourceState>
      </div>
    );
  }

  const reconciliationTotal =
    Number(resource.data?.reconciliation?.matched || 0) +
    Number(resource.data?.reconciliation?.pending || 0) +
    Number(resource.data?.reconciliation?.mismatched || 0) +
    Number(resource.data?.reconciliation?.manual_review || 0);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Finance overview"
        eyebrow="Financial position"
        subtitle="Position first, queue health second, exact accounting records underneath."
        status={
          resource.data ? (
            <span
              className={`admin-health-pill ${
                resource.data.reconciliation_balanced
                  ? "is-healthy"
                  : "is-warning"
              }`}
            >
              {resource.data.reconciliation_balanced ? (
                <ShieldCheck size={14} />
              ) : (
                <TriangleAlert size={14} />
              )}
              {resource.data.reconciliation_balanced
                ? "Reconciled"
                : "Exceptions present"}
            </span>
          ) : undefined
        }
        action={
          <Button
            variant="outline"
            onClick={resource.refresh}
            isLoading={resource.loading}
          >
            Refresh
          </Button>
        }
      />

      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <section>
              <div className="admin-section-heading mb-3">
                <div>
                  <p className="eyebrow">Position</p>
                  <h2>Ledger account balances</h2>
                </div>
                <WalletCards size={20} aria-hidden="true" />
              </div>
              <div className="admin-control-kpis">
                {Object.entries(resource.data.account_balances || {}).map(
                  ([key, value]) => (
                    <MetricCard
                      key={key}
                      label={friendlyAccountName(key)}
                      value={formatMoney(Number(value))}
                    />
                  ),
                )}
              </div>
            </section>

            <div className="admin-finance-layout">
              <div className="admin-finance-primary">
                <ChartFrame
                  title="Reconciliation health"
                  description={`${resource.data.payment_count || 0} payments in the current Finance snapshot.`}
                >
                  <div className="admin-reconciliation-bars">
                    <ProgressBar
                      label="Matched"
                      value={resource.data.reconciliation?.matched || 0}
                      max={Math.max(1, reconciliationTotal)}
                      showValue
                    />
                    <ProgressBar
                      label="Pending"
                      value={resource.data.reconciliation?.pending || 0}
                      max={Math.max(1, reconciliationTotal)}
                      showValue
                    />
                    <ProgressBar
                      label="Mismatched"
                      value={resource.data.reconciliation?.mismatched || 0}
                      max={Math.max(1, reconciliationTotal)}
                      showValue
                    />
                    <ProgressBar
                      label="Manual review"
                      value={resource.data.reconciliation?.manual_review || 0}
                      max={Math.max(1, reconciliationTotal)}
                      showValue
                    />
                  </div>
                </ChartFrame>

                <Card>
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">Money-out</p>
                      <h2>Settlement & payout queues</h2>
                    </div>
                    <WalletCards size={20} aria-hidden="true" />
                  </div>
                  <div className="admin-money-queues">
                    <QueueHealth
                      label="Merchant settlements"
                      queue={resource.data.settlement_queue || {}}
                    />
                    <QueueHealth
                      label="Rider payouts"
                      queue={resource.data.payout_queue || {}}
                    />
                  </div>
                </Card>
              </div>

              <aside className="admin-finance-rail">
                <Card>
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">Automation</p>
                      <h2>Control cadence</h2>
                    </div>
                    <RefreshCw size={20} aria-hidden="true" />
                  </div>
                  <dl className="admin-health-facts">
                    <div>
                      <dt>Reconciliation</dt>
                      <dd>
                        {Math.round(
                          Number(
                            resource.data.automation
                              ?.reconciliation_interval_ms || 0,
                          ) / 60000,
                        )}{" "}
                        min
                      </dd>
                    </div>
                    <div>
                      <dt>Batch generation</dt>
                      <dd>
                        {Math.round(
                          Number(
                            resource.data.automation
                              ?.batch_generation_interval_ms || 0,
                          ) / 60000,
                        )}{" "}
                        min
                      </dd>
                    </div>
                    <div>
                      <dt>Approval model</dt>
                      <dd>
                        {String(
                          resource.data.automation?.approval_mode || "—",
                        ).replaceAll("_", " ")}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">
                    Scheduled automation remains the normal path. Manual
                    actions are recovery and control operations.
                  </p>
                </Card>
              </aside>
            </div>
          </>
        )}
      </ResourceState>
    </div>
  );
}
