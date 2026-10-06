import { useAuth } from "../../../../packages/auth/src/react";
import React, { useMemo } from "react";
import {
  Button,
  Card,
  ChartFrame,
  InlineBanner,
  Price,
  ProgressBar,
} from "../../../../packages/ui/src/index";
import {
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
import {
  LocationMap,
  type MapPoint,
} from "../../../../packages/ui/src/LocationMap";
import { ResourceTable } from "./ResourceTable";
import { adminViews } from "./adminViews";
import {
  AlertTriangle,
  Bike,
  ChevronRight,
  CircleDollarSign,
  FileWarning,
  Headphones,
  Radio,
  Route,
  ShieldAlert,
  Store,
} from "lucide-react";

type CommandCenterProps = {
  onNavigate?: (view: string) => void;
};

type ActionItem = {
  id: string;
  label: string;
  detail: string;
  count: number;
  target: string;
  tone: "warning" | "danger" | "info";
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

export function CommandCenter({ onNavigate }: CommandCenterProps) {
  const { hasRole } = useAuth();
  const canDispatch = hasRole("admin" as any) || hasRole("ops" as any);
  const overview = useResource<any>("/admin/operations/control-tower", 5000);
  const operations = useResource<any>("/admin/operations/overview", 10000);
  const supply = useResource<any[]>("/admin/operations/supply", 10000);
  const deliveries = useResource<any[]>(
    "/admin/dispatch/deliveries?limit=100",
    5000,
  );
  const incidents = useResource<any>(
    "/admin/operations/incidents?limit=10",
    5000,
  );

  const points: MapPoint[] = (deliveries.data || []).flatMap((delivery: any) => [
    {
      id: `${delivery.id}-pickup`,
      label: delivery.branch_name || delivery.pickup_address_text,
      latitude:
        delivery.pickup_location?.latitude ?? delivery.pickup_location?.lat,
      longitude:
        delivery.pickup_location?.longitude ?? delivery.pickup_location?.lng,
      kind: "pickup" as const,
    },
    {
      id: `${delivery.id}-dropoff`,
      label: delivery.dropoff_address_text,
      latitude:
        delivery.dropoff_location?.latitude ?? delivery.dropoff_location?.lat,
      longitude:
        delivery.dropoff_location?.longitude ?? delivery.dropoff_location?.lng,
      kind: "dropoff" as const,
    },
    ...(delivery.last_location
      ? [
          {
            id: `${delivery.id}-rider`,
            label: delivery.assigned_rider_name || "Assigned Rider",
            latitude:
              delivery.last_location.latitude ?? delivery.last_location.lat,
            longitude:
              delivery.last_location.longitude ?? delivery.last_location.lng,
            kind: "rider" as const,
          },
        ]
      : []),
  ]);

  const actionItems = useMemo<ActionItem[]>(() => {
    const snapshot = overview.data;
    const ops = operations.data;
    if (!snapshot && !ops) return [];

    return [
      {
        id: "delayed",
        label: "Delayed deliveries",
        detail: "Active deliveries beyond the control-tower delay threshold",
        count: Number(snapshot?.deliveries?.delayed || 0),
        target: "dispatch",
        tone: "danger",
        icon: Route,
      },
      {
        id: "unassigned",
        label: "Unassigned deliveries",
        detail: "Dispatch still needs a Rider",
        count: Number(snapshot?.deliveries?.unassigned || 0),
        target: "dispatch",
        tone: "warning",
        icon: Radio,
      },
      {
        id: "critical-incidents",
        label: "Critical incidents",
        detail: "Operational incidents requiring immediate review",
        count: Number(
          ops?.incidents?.critical ||
            snapshot?.operational?.critical_incidents ||
            0,
        ),
        target: "incidents",
        tone: "danger",
        icon: AlertTriangle,
      },
      {
        id: "urgent-support",
        label: "Urgent support cases",
        detail: "Participant conversations marked urgent",
        count: Number(ops?.supportCases?.urgent || 0),
        target: "support",
        tone: "warning",
        icon: Headphones,
      },
      {
        id: "risk",
        label: "Open risk signals",
        detail: "Signals awaiting human review",
        count: Number(
          ops?.riskSignals?.totalOpen ||
            snapshot?.operational?.open_risk_signals ||
            0,
        ),
        target: "risk",
        tone: "warning",
        icon: ShieldAlert,
      },
      {
        id: "failed-payments",
        label: "Failed payments today",
        detail: "Payment attempts that failed today",
        count: Number(snapshot?.payments?.failed_today || 0),
        target: "payments",
        tone: "warning",
        icon: CircleDollarSign,
      },
      {
        id: "dead-letter",
        label: "Failed background jobs",
        detail: "Dead-letter jobs awaiting retry or resolution",
        count: Number(ops?.deadLetterJobs?.total || 0),
        target: "jobs",
        tone: "warning",
        icon: FileWarning,
      },
    ]
      .filter((item) => item.count > 0)
      .sort((a, b) => {
        const severity = { danger: 2, warning: 1, info: 0 };
        return severity[b.tone] - severity[a.tone] || b.count - a.count;
      });
  }, [operations.data, overview.data]);

  const refreshAll = () => {
    void overview.refresh();
    void operations.refresh();
    void deliveries.refresh();
    void incidents.refresh();
    void supply.refresh();
  };

  return (
    <>
      <PageHeading
        title="Operations control tower"
        eyebrow="Live marketplace"
        subtitle="Health first, exceptions second, exact records underneath."
        metadata={
          overview.data?.generated_at
            ? `Snapshot ${new Date(
                overview.data.generated_at,
              ).toLocaleTimeString()}`
            : undefined
        }
        action={
          <Button variant="outline" onClick={refreshAll}>
            Refresh control tower
          </Button>
        }
      />

      <ResourceState resource={overview}>
        {overview.data && (
          <div className="admin-control-kpis">
            <MetricCard
              label="Orders today"
              value={overview.data.orders.today}
              detail={`${overview.data.orders.active} active · ${overview.data.orders.completed_today} completed`}
              status={
                overview.data.orders.cancelled_today ? (
                  <StatusBadge
                    status={`${overview.data.orders.cancelled_today} cancelled`}
                    tone="warning"
                  />
                ) : undefined
              }
            />
            <MetricCard
              label="GMV today"
              value={<Price minor={overview.data.orders.gmv_today_minor || 0} />}
              detail="Non-pending orders created today"
            />
            <MetricCard
              label="Active deliveries"
              value={overview.data.deliveries.active}
              detail={`${overview.data.deliveries.unassigned} unassigned · ${overview.data.deliveries.delayed} delayed`}
              status={
                overview.data.deliveries.delayed ? (
                  <StatusBadge status="ATTENTION" tone="danger" />
                ) : (
                  <StatusBadge status="HEALTHY" tone="success" />
                )
              }
            />
            <MetricCard
              label="Available Riders"
              value={overview.data.riders.available}
              detail={`${overview.data.riders.online} online · ${overview.data.riders.busy} busy`}
            />
          </div>
        )}
      </ResourceState>

      <div className="admin-control-grid">
        <div className="admin-control-primary">
          <Card className="admin-control-map-card">
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Marketplace movement</p>
                <h2>Live delivery geography</h2>
                <p>
                  Pickup, Rider and dropoff coordinates from active delivery
                  records. This is a coordinate overview, not a simulated road
                  route.
                </p>
              </div>
              <span className="admin-live-indicator">
                <i /> Live
              </span>
            </div>
            <ResourceState resource={deliveries}>
              <LocationMap points={points} />
            </ResourceState>
          </Card>

          <ChartFrame
            title="Zone supply vs demand"
            description="Available Riders are compared with unassigned delivery demand using the authoritative service-zone snapshot."
            empty={!supply.loading && !(supply.data || []).length}
            emptyMessage="No active zone supply data is available."
          >
            <ResourceState resource={supply} compact>
              <div className="admin-zone-health">
                {(supply.data || []).map((zone: any) => {
                  const available = Number(zone.available_riders || 0);
                  const unassigned = Number(zone.unassigned_deliveries || 0);
                  const max = Math.max(1, available, unassigned);
                  return (
                    <article
                      key={zone.zone_id}
                      className="admin-zone-health-row"
                      data-gap={Number(zone.supply_gap) < 0 ? "deficit" : "healthy"}
                    >
                      <div className="admin-zone-health-name">
                        <strong>{zone.name}</strong>
                        <span>
                          {zone.active_deliveries || 0} active deliveries ·{" "}
                          {zone.busy_riders || 0} busy Riders
                        </span>
                      </div>
                      <div className="admin-zone-health-bars">
                        <ProgressBar
                          label="Available"
                          value={available}
                          max={max}
                          showValue
                        />
                        <ProgressBar
                          label="Unassigned"
                          value={unassigned}
                          max={max}
                          showValue
                        />
                      </div>
                      <strong className="admin-zone-gap">
                        {Number(zone.supply_gap) >= 0 ? "+" : ""}
                        {zone.supply_gap} gap
                      </strong>
                    </article>
                  );
                })}
              </div>
            </ResourceState>
          </ChartFrame>
        </div>

        <aside className="admin-action-rail">
          <Card>
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Exceptions</p>
                <h2>Action required</h2>
              </div>
              <strong className="admin-action-count">
                {actionItems.reduce((total, item) => total + item.count, 0)}
              </strong>
            </div>

            {actionItems.length ? (
              <div className="admin-action-list">
                {actionItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className="admin-action-item"
                      data-tone={item.tone}
                      onClick={() => onNavigate?.(item.target)}
                    >
                      <span className="admin-action-icon">
                        <Icon size={17} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <b>{item.count}</b>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <InlineBanner kind="success" title="No current exceptions">
                The control-tower snapshot has no ranked operational exception
                requiring attention.
              </InlineBanner>
            )}
          </Card>

          <Card>
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Marketplace capacity</p>
                <h2>Supply context</h2>
              </div>
              <Bike size={20} aria-hidden="true" />
            </div>
            <ResourceState resource={overview} compact>
              {overview.data && (
                <dl className="admin-health-facts">
                  <div>
                    <dt>Approved Riders</dt>
                    <dd>{overview.data.riders.approved}</dd>
                  </div>
                  <div>
                    <dt>Open branches</dt>
                    <dd>{overview.data.merchants.open_branches}</dd>
                  </div>
                  <div>
                    <dt>Paused branches</dt>
                    <dd>{overview.data.merchants.paused_branches}</dd>
                  </div>
                  <div>
                    <dt>Approved merchants</dt>
                    <dd>{overview.data.merchants.approved}</dd>
                  </div>
                </dl>
              )}
            </ResourceState>
          </Card>

          <Card>
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Incident pulse</p>
                <h2>Newest open incidents</h2>
              </div>
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <ResourceState resource={incidents} compact>
              <div className="admin-incident-list">
                {incidents.data?.incidents
                  ?.filter(
                    (incident: any) =>
                      !["RESOLVED", "DISMISSED"].includes(incident.status),
                  )
                  .slice(0, 4)
                  .map((incident: any) => (
                    <article key={incident.id}>
                      <div>
                        <StatusBadge status={incident.status} />
                        <StatusBadge
                          status={incident.severity}
                          tone={
                            incident.severity === "CRITICAL"
                              ? "danger"
                              : incident.severity === "HIGH"
                                ? "warning"
                                : "info"
                          }
                        />
                      </div>
                      <strong>
                        {incident.title || incident.incident_type}
                      </strong>
                    </article>
                  ))}
                {!incidents.data?.incidents?.some(
                  (incident: any) =>
                    !["RESOLVED", "DISMISSED"].includes(incident.status),
                ) && (
                  <p className="text-sm text-slate-500">
                    No open incidents reported.
                  </p>
                )}
              </div>
            </ResourceState>
          </Card>
        </aside>
      </div>

      <details className="admin-dispatch-details">
        <summary>
          <Radio size={16} aria-hidden="true" />
          Live dispatch records
          <ChevronRight size={16} aria-hidden="true" />
        </summary>
        <div>
          <ResourceTable
            config={{
              ...adminViews.dispatch,
              actions: canDispatch ? adminViews.dispatch.actions : undefined,
            }}
          />
        </div>
      </details>
    </>
  );
}
