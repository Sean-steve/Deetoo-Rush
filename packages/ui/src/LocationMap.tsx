import React, { useState, useId } from "react";
import { EmptyState } from "./index";
export interface MapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  kind: "pickup" | "dropoff" | "rider";
}
/** Coordinate overview only: no simulated roads, locations, routes or distance estimates. */
export function LocationMap({ points }: { points: MapPoint[] }) {
  const gridId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const valid = points.filter(
    (p) =>
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180,
  );
  if (!valid.length)
    return (
      <EmptyState
        title="No live locations available"
        description="Authorized delivery locations appear here when available."
      />
    );
  const minLat = Math.min(...valid.map((p) => p.latitude)),
    maxLat = Math.max(...valid.map((p) => p.latitude));
  const minLng = Math.min(...valid.map((p) => p.longitude)),
    maxLng = Math.max(...valid.map((p) => p.longitude));
  const active = valid.find((p) => p.id === selected);
  return (
    <div className="location-map">
      <div className="flex justify-between gap-3 p-4 text-xs">
        <span>Delivery location overview</span>
        <span>{valid.length} locations · north ↑</span>
      </div>
      <svg
        viewBox="0 0 700 360"
        role="img"
        aria-label="Coordinate overview of current delivery locations"
      >
        <defs>
          <pattern
            id={gridId}
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dedbd5" />
          </pattern>
        </defs>
        <rect width="700" height="360" fill={`url(#${gridId})`} />
        {valid.map((p) => {
          const x =
            40 +
            ((p.longitude - minLng) / Math.max(0.005, maxLng - minLng)) * 620;
          const y =
            320 -
            ((p.latitude - minLat) / Math.max(0.005, maxLat - minLat)) * 280;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={p.label}
              onClick={() => setSelected(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(p.id);
                }
              }}
            >
              <title>{p.label}</title>
              <circle
                cx={x}
                cy={y}
                r="16"
                fill={
                  p.kind === "rider"
                    ? "#006d42"
                    : p.kind === "pickup"
                      ? "#b02700"
                      : "#1b1c1a"
                }
                stroke="white"
                strokeWidth="3"
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill="white"
                fontSize="12"
              >
                {p.kind === "pickup" ? "K" : p.kind === "rider" ? "R" : "D"}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="p-4 text-xs" role="status">
        {active
          ? `${active.label}: ${active.latitude.toFixed(5)}, ${active.longitude.toFixed(5)}`
          : "Select a marker. K: kitchen · R: rider · D: dropoff. Coordinate overview, not a road map."}
      </p>
    </div>
  );
}
