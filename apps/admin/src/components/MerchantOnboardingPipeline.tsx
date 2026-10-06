import React, { useMemo, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  FormField,
  InlineBanner,
  ProgressBar,
  SearchInput,
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
import {
  CheckCircle2,
  Circle,
  FileCheck2,
  Landmark,
  Store,
  Users,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";

const lifecycleStages = [
  "APPLICATION",
  "DOCUMENTS_PENDING",
  "COMMERCIAL_TERMS",
  "CONTENT_SETUP",
  "MENU_QA",
  "STAFF_TRAINING",
  "READY_FOR_REVIEW",
  "APPROVED",
  "LIVE",
  "BLOCKED",
];

const readinessChecks = [
  {
    key: "branch_ready",
    label: "Branch setup",
    description: "Active branch with delivery coordinates",
    icon: Store,
  },
  {
    key: "menu_ready",
    label: "Menu & content",
    description: "Active menu with available items assigned to a branch",
    icon: UtensilsCrossed,
  },
  {
    key: "staff_ready",
    label: "Staff readiness",
    description: "Active merchant owner membership",
    icon: Users,
  },
  {
    key: "commercial_ready",
    label: "Commercial terms",
    description: "Commission and settlement schedule configured",
    icon: Landmark,
  },
  {
    key: "payout_ready",
    label: "Payout destination",
    description: "Active, verified merchant payout destination",
    icon: WalletCards,
  },
] as const;

function stageLabel(stage?: string): string {
  return String(stage || "APPLICATION")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (value) => value.toUpperCase());
}

function readinessCount(readiness: any): number {
  return readinessChecks.filter((check) => Boolean(readiness?.[check.key]))
    .length;
}

function blockerLabels(readiness: any): string[] {
  return readinessChecks
    .filter((check) => !readiness?.[check.key])
    .map((check) => check.label);
}

export function MerchantOnboardingPipeline() {
  const { apiClient } = useAuth();
  const resource = useResource<any[]>("/admin/merchant-onboarding", 10000);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [stage, setStage] = useState("APPLICATION");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = resource.data || [];
    if (!query) return list;
    return list.filter((item: any) =>
      [
        item.display_name,
        item.stage,
        item.approval_status,
        item.status,
        item.note,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [resource.data, search]);

  const summary = useMemo(() => {
    const list = resource.data || [];
    return {
      total: list.length,
      ready: list.filter((item: any) => item.readiness?.ready_for_live).length,
      blocked: list.filter(
        (item: any) =>
          item.stage === "BLOCKED" || !item.readiness?.ready_for_live,
      ).length,
      live: list.filter((item: any) => item.stage === "LIVE").length,
    };
  }, [resource.data]);

  function choose(item: any) {
    setSelected(item);
    setStage(item.stage || "APPLICATION");
    setNote(item.note || "");
    setAssignedTo(item.assigned_to || "");
    setError(null);
  }

  async function updateStage() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(
        `/admin/merchants/${encodeURIComponent(
          selected.merchant_id,
        )}/onboarding`,
        {
          method: "PATCH",
          body: JSON.stringify({
            stage,
            note: note.trim() || undefined,
            assigned_to: assignedTo.trim() || undefined,
          }),
        },
      );
      await resource.refresh();
      const refreshed = (
        (await apiClient.request<any[]>("/admin/merchant-onboarding")).data ||
        []
      ).find((item: any) => item.merchant_id === selected.merchant_id);
      if (refreshed) choose(refreshed);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Merchant onboarding"
        eyebrow="Activation pipeline"
        subtitle="Lifecycle stage and activation readiness are separate. A merchant can only move to review, approval or live when every authoritative readiness check passes."
        action={
          <Button
            variant="outline"
            onClick={resource.refresh}
            isLoading={resource.loading}
          >
            Refresh pipeline
          </Button>
        }
      />

      <ResourceState resource={resource}>
        <div className="admin-control-kpis">
          <MetricCard
            label="Merchants in pipeline"
            value={summary.total}
            detail="All onboarding records"
          />
          <MetricCard
            label="Activation ready"
            value={summary.ready}
            detail="All five readiness checks complete"
            status={
              summary.ready ? (
                <StatusBadge status="READY" tone="success" />
              ) : undefined
            }
          />
          <MetricCard
            label="Incomplete / blocked"
            value={summary.blocked}
            detail="At least one activation requirement missing"
            status={
              summary.blocked ? (
                <StatusBadge status="ATTENTION" tone="warning" />
              ) : undefined
            }
          />
          <MetricCard
            label="Live"
            value={summary.live}
            detail="Merchant lifecycle stage is live"
          />
        </div>

        <div className="admin-onboarding-toolbar">
          <SearchInput
            aria-label="Search merchant onboarding"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch("")}
            placeholder="Search merchant, stage or status"
          />
          <span>{rows.length} merchants</span>
        </div>

        <div className="admin-onboarding-grid">
          {rows.map((item: any) => {
            const complete = readinessCount(item.readiness);
            const blockers = blockerLabels(item.readiness);
            return (
              <button
                type="button"
                key={item.merchant_id}
                className="admin-onboarding-card"
                data-ready={item.readiness?.ready_for_live ? "true" : "false"}
                onClick={() => choose(item)}
              >
                <div className="admin-onboarding-card-head">
                  <div>
                    <span className="eyebrow">{stageLabel(item.stage)}</span>
                    <h2>{item.display_name}</h2>
                  </div>
                  <StatusBadge
                    status={
                      item.readiness?.ready_for_live
                        ? "READY"
                        : item.stage === "BLOCKED"
                          ? "BLOCKED"
                          : "INCOMPLETE"
                    }
                    tone={
                      item.readiness?.ready_for_live
                        ? "success"
                        : item.stage === "BLOCKED"
                          ? "danger"
                          : "warning"
                    }
                  />
                </div>

                <ProgressBar
                  label="Activation readiness"
                  value={complete}
                  max={readinessChecks.length}
                  showValue
                />

                <div className="admin-onboarding-checks">
                  {readinessChecks.map((check) => {
                    const Icon = check.icon;
                    const done = Boolean(item.readiness?.[check.key]);
                    return (
                      <span key={check.key} data-complete={done ? "true" : "false"}>
                        {done ? (
                          <CheckCircle2 size={14} aria-hidden="true" />
                        ) : (
                          <Circle size={14} aria-hidden="true" />
                        )}
                        {check.label}
                      </span>
                    );
                  })}
                </div>

                {blockers.length ? (
                  <p className="admin-onboarding-blocker">
                    Blocked by: {blockers.join(", ")}
                  </p>
                ) : (
                  <p className="admin-onboarding-ready">
                    Ready for activation review.
                  </p>
                )}

                <footer>
                  <span>{item.approval_status}</span>
                  <span>{item.status}</span>
                  {item.updated_at && (
                    <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                  )}
                </footer>
              </button>
            );
          })}

          {!rows.length && (
            <Card className="col-span-full">
              <EmptyState
                title="No onboarding records"
                description="No merchants match this pipeline view."
                icon={FileCheck2}
              />
            </Card>
          )}
        </div>
      </ResourceState>

      <Drawer
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.display_name || "Merchant onboarding"}
        description={selected ? stageLabel(selected.stage) : undefined}
        size="lg"
        side="right"
        footer={
          selected ? (
            <Button fullWidth isLoading={busy} onClick={() => void updateStage()}>
              Save onboarding update
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="admin-onboarding-inspector">
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Activation readiness</p>
                <h2>
                  {readinessCount(selected.readiness)} /{" "}
                  {readinessChecks.length} complete
                </h2>
              </div>
              <StatusBadge
                status={
                  selected.readiness?.ready_for_live ? "READY" : "INCOMPLETE"
                }
                tone={
                  selected.readiness?.ready_for_live ? "success" : "warning"
                }
              />
            </div>

            <div className="admin-readiness-list">
              {readinessChecks.map((check) => {
                const Icon = check.icon;
                const done = Boolean(selected.readiness?.[check.key]);
                return (
                  <div key={check.key} data-complete={done ? "true" : "false"}>
                    <span>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <p>{check.description}</p>
                    </div>
                    {done ? (
                      <CheckCircle2 size={19} aria-label="Complete" />
                    ) : (
                      <Circle size={19} aria-label="Incomplete" />
                    )}
                  </div>
                );
              })}
            </div>

            {!selected.readiness?.ready_for_live && (
              <InlineBanner
                kind="warning"
                title="Activation is blocked"
              >
                Complete{" "}
                {blockerLabels(selected.readiness).join(", ")} before moving
                this merchant to Ready for review, Approved or Live.
              </InlineBanner>
            )}

            <Card className="admin-onboarding-update">
              <FormField label="Lifecycle stage">
                <Select
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
                >
                  {lifecycleStages.map((value) => (
                    <option key={value} value={value}>
                      {stageLabel(value)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Assigned operator (optional)">
                <input
                  className="deetoo-field w-full border border-slate-200 px-3"
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  placeholder="Operator user ID"
                />
              </FormField>

              <FormField label="Operational note">
                <Textarea
                  value={note}
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What changed, what is blocked, or what should the next operator know?"
                />
              </FormField>
            </Card>

            {error && <ErrorState message={error} />}
          </div>
        )}
      </Drawer>
    </>
  );
}
