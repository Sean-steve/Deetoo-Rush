# ADR-003: PostGIS Spatial Queries & Containment (SRID 4326)

## Status
Accepted (Sprint 1 Baseline)

## Context
Food delivery depends on spatial accuracy: determining whether customer addresses fall inside active merchant delivery zones, calculating road and geodesic distances, and matching candidate couriers. Approximating spatial operations with client-side bounding boxes creates order fulfillment failures at zone borders.

## Decision
PostgreSQL with the PostGIS extension is the authoritative spatial calculation engine:
1. Spatial columns store geometries/geographies using WGS84 coordinates (`SRID 4326`).
2. Service zone boundaries are stored as `MultiPolygon` geographies.
3. Zone containment queries use `ST_Covers(service_zones.boundary, addresses.location)` indexed with GIST.
4. Haversine and geodesic distances use `ST_Distance`.

## Consequences
- Highly optimized indexing via GIST indexes.
- Prevents orders from being placed outside serviceable delivery perimeters.
