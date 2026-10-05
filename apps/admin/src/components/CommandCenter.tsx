import { useAuth } from "../../../../packages/auth/src/react";
import React from "react";
import { Button, Card } from "../../../../packages/ui/src/index";
import {
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
import { LocationMap, MapPoint } from "../../../../packages/ui/src/LocationMap";
import { ResourceTable } from "./ResourceTable";
import { adminViews } from "./adminViews";
export function CommandCenter() {
  const { hasRole } = useAuth();
  const canDispatch = hasRole("admin" as any) || hasRole("ops" as any);
  const overview = useResource<any>("/admin/operations/control-tower", 5000);
  const supply = useResource<any[]>("/admin/operations/supply", 10000);
  const deliveries = useResource<any[]>(
    "/admin/dispatch/deliveries?limit=100",
    5000,
  );
  const incidents = useResource<any>(
    "/admin/operations/incidents?limit=10",
    5000,
  );
  const points: MapPoint[] = (deliveries.data || []).flatMap((d: any) => [
    {
      id: `${d.id}-pickup`,
      label: d.branch_name || d.pickup_address_text,
      latitude: d.pickup_location?.latitude ?? d.pickup_location?.lat,
      longitude: d.pickup_location?.longitude ?? d.pickup_location?.lng,
      kind: "pickup" as const,
    },
    {
      id: `${d.id}-dropoff`,
      label: d.dropoff_address_text,
      latitude: d.dropoff_location?.latitude ?? d.dropoff_location?.lat,
      longitude: d.dropoff_location?.longitude ?? d.dropoff_location?.lng,
      kind: "dropoff" as const,
    },
    ...(d.last_location
      ? [
          {
            id: `${d.id}-rider`,
            label: d.assigned_rider_name || "Assigned rider",
            latitude: d.last_location.latitude ?? d.last_location.lat,
            longitude: d.last_location.longitude ?? d.last_location.lng,
            kind: "rider" as const,
          },
        ]
      : []),
  ]);
  return (
    <>
      <PageHeading
        title="Fleet command & live dispatch"
        eyebrow="Nairobi operations"
        action={
          <Button
            variant="outline"
            onClick={() => {
              void overview.refresh();
              void deliveries.refresh();
              void incidents.refresh();
              void supply.refresh();
            }}
          >
            Refresh grid
          </Button>
        }
      />
      <ResourceState resource={overview}>
        {overview.data && (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Active orders" value={overview.data.orders.active} />
            <MetricCard label="Unassigned deliveries" value={overview.data.deliveries.unassigned} />
            <MetricCard label="Available riders" value={overview.data.riders.available} />
            <MetricCard label="Delayed deliveries" value={overview.data.deliveries.delayed} />
            <MetricCard label="Orders today" value={overview.data.orders.today} />
            <MetricCard label="Completed today" value={overview.data.orders.completed_today} />
            <MetricCard label="Open incidents" value={overview.data.operational.open_incidents} />
            <MetricCard label="Open support cases" value={overview.data.operational.open_support_cases} />
          </div>
        )}
      </ResourceState>
      <div className="command-grid">
        <div>
          <Card className="mb-5">
            <h2 className="text-xl font-bold mb-4">Delivery geo-telemetry</h2>
            <ResourceState resource={deliveries}>
              <LocationMap points={points} />
            </ResourceState>
          </Card>
          <Card className="mb-5">
            <h2 className="text-xl font-bold mb-4">Zone supply / demand</h2>
            <ResourceState resource={supply}>
              <div className="space-y-2">
                {(supply.data || []).map((zone: any) => (
                  <div key={zone.zone_id} className="grid grid-cols-5 gap-3 rounded-xl bg-stone-50 p-3 text-sm">
                    <strong>{zone.name}</strong>
                    <span>Available {zone.available_riders}</span>
                    <span>Busy {zone.busy_riders}</span>
                    <span>Unassigned {zone.unassigned_deliveries}</span>
                    <span className={Number(zone.supply_gap) < 0 ? "text-rose-700 font-bold" : "text-emerald-700"}>
                      Gap {zone.supply_gap}
                    </span>
                  </div>
                ))}
              </div>
            </ResourceState>
          </Card>

          <ResourceTable
            config={{
              ...adminViews.dispatch,
              actions: canDispatch ? adminViews.dispatch.actions : undefined,
            }}
          />
        </div>
        <aside>
          <Card>
            <h2 className="text-xl font-bold mb-4">Urgent incidents</h2>
            <ResourceState resource={incidents}>
              {incidents.data?.incidents
                ?.filter(
                  (i: any) => !["RESOLVED", "DISMISSED"].includes(i.status),
                )
                .map((incident: any) => (
                  <article
                    className="p-4 rounded-xl bg-stone-50 mb-3"
                    key={incident.id}
                  >
                    <StatusBadge status={incident.status} />
                    <h3 className="font-bold mt-3">
                      {incident.title || incident.incident_type}
                    </h3>
                    <p className="text-sm mt-2">{incident.description}</p>
                    <p className="text-xs mt-2">{incident.severity}</p>
                  </article>
                ))}
              {incidents.data?.incidents?.length === 0 && (
                <p className="text-sm">No incidents reported.</p>
              )}
            </ResourceState>
          </Card>
        </aside>
      </div>
    </>
  );
}
