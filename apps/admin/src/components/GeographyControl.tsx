import React, { useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../../packages/auth/src/react";
import { Badge, Button, Card } from "../../../../packages/ui/src/index";
import {
  PageHeading,
  ResourceState,
  useResource,
  errorMessage,
} from "../../../../packages/ui/src/workflows";

export function GeographyControl() {
  const { apiClient } = useAuth();
  const counties = useResource<any[]>("/admin/geography/counties");
  const markets = useResource<any[]>("/admin/geography/markets");
  const zones = useResource<any[]>("/admin/geography/zones");
  const [marketCounty, setMarketCounty] = useState("047");
  const [marketName, setMarketName] = useState("");
  const [marketBusy, setMarketBusy] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleCounty(code: string, enabled: boolean) {
    setBusyCode(code);
    setError(null);
    try {
      await apiClient.request(`/admin/geography/counties/${encodeURIComponent(code)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await Promise.all([counties.refresh(), markets.refresh(), zones.refresh()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyCode(null);
    }
  }

  async function createMarket() {
    if (!marketName.trim()) return;
    setMarketBusy(true);
    setError(null);
    try {
      await apiClient.request("/admin/geography/markets", {
        method: "POST",
        body: JSON.stringify({
          county_code: marketCounty,
          name: marketName.trim(),
          enabled: true,
        }),
      });
      setMarketName("");
      await markets.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMarketBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Operating geography"
        subtitle="Kenya → County → Market / town → Service-zone polygon"
      />

      <Card className="border-emerald-200 bg-emerald-50/60">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={20} />
          <div>
            <h3 className="font-bold text-slate-900">County scope is not delivery reach</h3>
            <p className="mt-1 text-sm text-slate-700">
              Enabling a county means DeeToo may operate there. A customer is serviceable only
              when their coordinates fall inside an active PostGIS service-zone polygon.
              Merchant branches and Riders continue to inherit zone eligibility from coordinates
              where no explicit operational override exists.
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <ResourceState resource={counties}>
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900">Kenyan operating regions</h3>
              <p className="text-sm text-slate-500">
                All 47 counties are independent switches. Multiple counties may be enabled at once.
              </p>
            </div>
            <Badge variant="default">
              {(counties.data || []).filter((county: any) => county.enabled).length} enabled
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(counties.data || []).map((county: any) => (
              <label
                key={county.code}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{county.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {county.market_count || 0} markets · {county.active_polygon_zone_count || 0} active polygon zones
                  </div>
                </div>
                <input
                  aria-label={`${county.enabled ? "Disable" : "Enable"} ${county.name}`}
                  type="checkbox"
                  className="h-5 w-5 accent-emerald-600"
                  checked={Boolean(county.enabled)}
                  disabled={busyCode === county.code}
                  onChange={(event) => void toggleCounty(county.code, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
      </ResourceState>

      <ResourceState resource={markets}>
        <section>
          <div className="mb-3">
            <h3 className="font-bold text-slate-900">Markets / towns</h3>
            <p className="text-sm text-slate-500">
              Markets organize service zones inside a county. They do not create delivery reach by themselves.
            </p>
          </div>
          <Card>
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
              <label className="text-sm font-medium text-slate-700">
                County
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={marketCounty}
                  onChange={(event) => setMarketCounty(event.target.value)}
                >
                  {(counties.data || []).map((county: any) => (
                    <option key={county.code} value={county.code}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Market / town name
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={marketName}
                  onChange={(event) => setMarketName(event.target.value)}
                  placeholder="e.g. Thika"
                />
              </label>
              <Button
                onClick={() => void createMarket()}
                isLoading={marketBusy}
                disabled={marketName.trim().length < 2}
              >
                Add market
              </Button>
            </div>
          </Card>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(markets.data || []).map((market: any) => (
              <div key={market.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{market.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {market.county_name} · {market.zone_count || 0} service zones
                </div>
              </div>
            ))}
          </div>
        </section>
      </ResourceState>

      <ResourceState resource={zones}>
        <section>
          <div className="mb-3">
            <h3 className="font-bold text-slate-900">Service-zone polygons</h3>
            <p className="text-sm text-slate-500">
              These polygons remain the authoritative delivery boundary. County and market labels
              organize operations; they do not widen a polygon.
            </p>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>County</th>
                  <th>Market / town</th>
                  <th>Boundary</th>
                  <th>Branches</th>
                  <th>Riders</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(zones.data || []).map((zone: any) => (
                  <tr key={zone.id}>
                    <td>
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <MapPin size={14} /> {zone.name}
                      </span>
                    </td>
                    <td>{zone.county_name || "Unassigned"}</td>
                    <td>{zone.market_name || "Unassigned"}</td>
                    <td>
                      <Badge variant={zone.has_polygon ? "success" : "danger"}>
                        {zone.has_polygon ? "PostGIS polygon" : "Missing polygon"}
                      </Badge>
                    </td>
                    <td>{zone.branch_count || 0}</td>
                    <td>{zone.rider_count || 0}</td>
                    <td>{zone.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </ResourceState>
    </div>
  );
}
