import React, { useMemo, useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Badge,
  Button,
  Card,
  FormField,
  InlineBanner,
  Input,
  Select,
} from "../../../../packages/ui/src/index";
import {
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
  errorMessage,
} from "../../../../packages/ui/src/workflows";

type Coordinate = [number, number];

function geometryPolygons(geometry: any): Coordinate[][][] {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ZoneBoundaryMap({
  zones,
}: {
  zones: any[];
}) {
  const mapped = zones.filter(
    (zone) => geometryPolygons(zone.boundary_geojson).length > 0,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    mapped[0]?.id || null,
  );

  const bounds = useMemo(() => {
    const coords = mapped.flatMap((zone) =>
      geometryPolygons(zone.boundary_geojson).flatMap((polygon) =>
        polygon.flat(),
      ),
    );
    if (!coords.length) return null;
    return {
      minLng: Math.min(...coords.map(([lng]) => lng)),
      maxLng: Math.max(...coords.map(([lng]) => lng)),
      minLat: Math.min(...coords.map(([, lat]) => lat)),
      maxLat: Math.max(...coords.map(([, lat]) => lat)),
    };
  }, [mapped]);

  if (!mapped.length || !bounds) {
    return (
      <InlineBanner kind="warning" title="No polygon boundaries to draw">
        Service zones exist, but none in this response has an authoritative
        PostGIS boundary.
      </InlineBanner>
    );
  }

  const width = 900;
  const height = 440;
  const padding = 26;
  const lngSpan = Math.max(0.001, bounds.maxLng - bounds.minLng);
  const latSpan = Math.max(0.001, bounds.maxLat - bounds.minLat);
  const project = ([lng, lat]: Coordinate) => [
    padding + ((lng - bounds.minLng) / lngSpan) * (width - padding * 2),
    height -
      padding -
      ((lat - bounds.minLat) / latSpan) * (height - padding * 2),
  ];

  const pathFor = (polygon: Coordinate[][]) =>
    polygon
      .map(
        (ring) =>
          ring
            .map((coord, index) => {
              const [x, y] = project(coord);
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ") + " Z",
      )
      .join(" ");

  const selected =
    mapped.find((zone) => zone.id === selectedId) || mapped[0];

  return (
    <div className="admin-zone-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Authoritative service-zone polygon overview"
      >
        {mapped.flatMap((zone) =>
          geometryPolygons(zone.boundary_geojson).map(
            (polygon, polygonIndex) => (
              <path
                key={`${zone.id}-${polygonIndex}`}
                d={pathFor(polygon)}
                fillRule="evenodd"
                className="admin-zone-polygon"
                data-status={String(zone.status || "UNKNOWN").toLowerCase()}
                data-selected={selected?.id === zone.id ? "true" : "false"}
                role="button"
                tabIndex={0}
                aria-label={`${zone.name}, ${zone.status}`}
                onClick={() => setSelectedId(zone.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(zone.id);
                  }
                }}
              >
                <title>
                  {zone.name} · {zone.status}
                </title>
              </path>
            ),
          ),
        )}
      </svg>

      <div className="admin-zone-map-detail">
        <div>
          <span className="eyebrow">Selected service zone</span>
          <strong>{selected.name}</strong>
          <p>
            {[selected.county_name, selected.market_name]
              .filter(Boolean)
              .join(" · ") || "Hierarchy not assigned"}
          </p>
        </div>
        <StatusBadge status={selected.status} />
        <dl>
          <div>
            <dt>Branches</dt>
            <dd>{selected.branch_count || 0}</dd>
          </div>
          <div>
            <dt>Riders</dt>
            <dd>{selected.rider_count || 0}</dd>
          </div>
          <div>
            <dt>Polygon area</dt>
            <dd>
              {selected.polygon_area_square_meters
                ? `${(
                    Number(selected.polygon_area_square_meters) / 1_000_000
                  ).toFixed(1)} km²`
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function GeographyControl() {
  const { apiClient } = useAuth();
  const counties = useResource<any[]>("/admin/geography/counties");
  const markets = useResource<any[]>("/admin/geography/markets");
  const zones = useResource<any[]>("/admin/geography/zones");
  const [marketCounty, setMarketCounty] = useState("047");
  const [marketName, setMarketName] = useState("");
  const [marketBusy, setMarketBusy] = useState(false);
  const [zoneBusyId, setZoneBusyId] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleCounty(code: string, enabled: boolean) {
    setBusyCode(code);
    setError(null);
    try {
      await apiClient.request(
        `/admin/geography/counties/${encodeURIComponent(code)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        },
      );
      await Promise.all([
        counties.refresh(),
        markets.refresh(),
        zones.refresh(),
      ]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyCode(null);
    }
  }

  async function assignZoneHierarchy(
    zoneId: string,
    countyCode: string,
    marketId: string | null,
  ) {
    setZoneBusyId(zoneId);
    setError(null);
    try {
      await apiClient.request(
        `/admin/geography/zones/${encodeURIComponent(zoneId)}/hierarchy`,
        {
          method: "PATCH",
          body: JSON.stringify({
            county_code: countyCode,
            market_id: marketId,
          }),
        },
      );
      await zones.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setZoneBusyId(null);
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
        eyebrow="Serviceability control"
        subtitle="Kenya → County → Market / town → authoritative PostGIS service-zone polygon"
      />

      <InlineBanner
        kind="info"
        title="County scope is not delivery reach"
      >
        Enabling a county means DeeToo may operate there. Customer
        serviceability still requires coordinates inside an active PostGIS
        service-zone polygon.
      </InlineBanner>

      {error && <InlineBanner kind="danger">{error}</InlineBanner>}

      <ResourceState resource={zones}>
        <Card className="admin-geography-map-card">
          <div className="admin-section-heading">
            <div>
              <p className="eyebrow">Delivery boundaries</p>
              <h2>Service-zone coverage</h2>
              <p>
                Drawn from the exact polygons used by the serviceability
                engine—not a radius approximation.
              </p>
            </div>
            <MapPin size={20} aria-hidden="true" />
          </div>
          <ZoneBoundaryMap zones={zones.data || []} />
        </Card>
      </ResourceState>

      <ResourceState resource={counties}>
        <section>
          <div className="admin-section-heading mb-3">
            <div>
              <p className="eyebrow">Operating scope</p>
              <h2>Kenyan counties</h2>
              <p>
                All 47 counties are independent switches. Multiple counties
                may be enabled at once.
              </p>
            </div>
            <Badge variant="default">
              {(counties.data || []).filter((county: any) => county.enabled)
                .length}{" "}
              enabled
            </Badge>
          </div>

          <div className="admin-county-grid">
            {(counties.data || []).map((county: any) => (
              <label
                key={county.code}
                className="admin-county-toggle"
                data-enabled={county.enabled ? "true" : "false"}
              >
                <div>
                  <strong>{county.name}</strong>
                  <span>
                    {county.market_count || 0} markets ·{" "}
                    {county.active_polygon_zone_count || 0} active zones
                  </span>
                </div>
                <input
                  aria-label={`${county.enabled ? "Disable" : "Enable"} ${county.name}`}
                  type="checkbox"
                  checked={Boolean(county.enabled)}
                  disabled={busyCode === county.code}
                  onChange={(event) =>
                    void toggleCounty(county.code, event.target.checked)
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </ResourceState>

      <ResourceState resource={markets}>
        <section>
          <div className="admin-section-heading mb-3">
            <div>
              <p className="eyebrow">Hierarchy</p>
              <h2>Markets / towns</h2>
              <p>
                Markets organize service zones inside a county; they do not
                widen delivery coverage.
              </p>
            </div>
          </div>

          <Card>
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
              <FormField label="County">
                <Select
                  value={marketCounty}
                  onChange={(event) => setMarketCounty(event.target.value)}
                >
                  {(counties.data || []).map((county: any) => (
                    <option key={county.code} value={county.code}>
                      {county.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Market / town name">
                <Input
                  value={marketName}
                  onChange={(event) => setMarketName(event.target.value)}
                  placeholder="e.g. Thika"
                />
              </FormField>
              <Button
                onClick={() => void createMarket()}
                isLoading={marketBusy}
                disabled={marketName.trim().length < 2}
              >
                Add market
              </Button>
            </div>
          </Card>

          <div className="admin-market-grid">
            {(markets.data || []).map((market: any) => (
              <div key={market.id}>
                <strong>{market.name}</strong>
                <span>
                  {market.county_name} · {market.zone_count || 0} service zones
                </span>
              </div>
            ))}
          </div>
        </section>
      </ResourceState>

      <ResourceState resource={zones}>
        <section>
          <div className="admin-section-heading mb-3">
            <div>
              <p className="eyebrow">Exact records</p>
              <h2>Service-zone hierarchy</h2>
              <p>
                Assign county and market labels without changing the polygon
                boundary itself.
              </p>
            </div>
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
                    <td>
                      <Select
                        aria-label={`County for ${zone.name}`}
                        value={zone.county_code || ""}
                        disabled={zoneBusyId === zone.id}
                        onChange={(event) =>
                          void assignZoneHierarchy(
                            zone.id,
                            event.target.value,
                            null,
                          )
                        }
                      >
                        <option value="" disabled>
                          Assign county
                        </option>
                        {(counties.data || []).map((county: any) => (
                          <option key={county.code} value={county.code}>
                            {county.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      {zone.county_code ? (
                        <Select
                          aria-label={`Market for ${zone.name}`}
                          value={zone.market_id || ""}
                          disabled={zoneBusyId === zone.id}
                          onChange={(event) =>
                            void assignZoneHierarchy(
                              zone.id,
                              zone.county_code,
                              event.target.value || null,
                            )
                          }
                        >
                          <option value="">Unassigned</option>
                          {(markets.data || [])
                            .filter(
                              (market: any) =>
                                market.county_code === zone.county_code,
                            )
                            .map((market: any) => (
                              <option key={market.id} value={market.id}>
                                {market.name}
                              </option>
                            ))}
                        </Select>
                      ) : (
                        "Assign county first"
                      )}
                    </td>
                    <td>
                      <Badge
                        variant={zone.has_polygon ? "success" : "danger"}
                      >
                        {zone.has_polygon
                          ? "PostGIS polygon"
                          : "Missing polygon"}
                      </Badge>
                    </td>
                    <td>{zone.branch_count || 0}</td>
                    <td>{zone.rider_count || 0}</td>
                    <td>
                      <StatusBadge status={zone.status} />
                    </td>
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
