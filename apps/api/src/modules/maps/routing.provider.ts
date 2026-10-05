import { config } from '@deetoo/config';
import { calculateDistanceMeters } from '@deetoo/utils';
import { requireSimulationMode } from '../../db/storage-policy';
import { AppError } from '../../middleware/error-handler';

export interface RoutingOrigin {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string;
}

export interface RoutingResult {
  id: string;
  distanceMeters: number;
  durationSeconds: number;
  provider: 'GOOGLE_ROUTES' | 'SIMULATION';
}

function travelMode(vehicleType?: string): 'DRIVE' | 'BICYCLE' | 'TWO_WHEELER' {
  const normalized = String(vehicleType || '').toUpperCase();
  if (normalized === 'BICYCLE') return 'BICYCLE';
  if (normalized === 'MOTORBIKE' || normalized === 'MOTORCYCLE') return 'TWO_WHEELER';
  return 'DRIVE';
}

function durationSeconds(value: unknown): number {
  const raw = String(value || '');
  const seconds = Number.parseFloat(raw.replace(/s$/, ''));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Routes API returned an invalid duration');
  }
  return Math.ceil(seconds);
}

class RoutingProvider {
  async pickupMatrix(
    origins: RoutingOrigin[],
    pickup: { latitude: number; longitude: number },
  ): Promise<RoutingResult[]> {
    if (!origins.length) return [];

    if (config.storage.mode === 'memory') {
      requireSimulationMode();
      return origins.map((origin) => {
        const distance = Math.round(
          calculateDistanceMeters(
            origin.latitude,
            origin.longitude,
            pickup.latitude,
            pickup.longitude,
          ),
        );
        return {
          id: origin.id,
          distanceMeters: distance,
          durationSeconds: Math.max(60, Math.round(distance / 7)),
          provider: 'SIMULATION' as const,
        };
      });
    }

    const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
    if (!apiKey) {
      throw new AppError(
        503,
        'ROUTING_PROVIDER_UNCONFIGURED',
        'Google Routes API is required for durable dispatch ETA ranking',
      );
    }

    const results: RoutingResult[] = [];
    const groups = new Map<string, RoutingOrigin[]>();
    for (const origin of origins) {
      const mode = travelMode(origin.vehicleType);
      groups.set(mode, [...(groups.get(mode) || []), origin]);
    }

    for (const [mode, group] of groups) {
      const response = await fetch(
        'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'originIndex,destinationIndex,duration,distanceMeters,status,condition',
          },
          body: JSON.stringify({
            origins: group.map((origin) => ({
              waypoint: {
                location: {
                  latLng: {
                    latitude: origin.latitude,
                    longitude: origin.longitude,
                  },
                },
              },
            })),
            destinations: [
              {
                waypoint: {
                  location: {
                    latLng: {
                      latitude: pickup.latitude,
                      longitude: pickup.longitude,
                    },
                  },
                },
              },
            ],
            travelMode: mode,
            routingPreference: mode === 'BICYCLE' ? undefined : 'TRAFFIC_AWARE',
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new AppError(
          503,
          'ROUTING_PROVIDER_FAILED',
          `Google Routes route matrix failed with HTTP ${response.status}`,
          { providerResponse: detail.slice(0, 500) },
        );
      }

      const matrix = (await response.json()) as Array<{
        originIndex?: number;
        destinationIndex?: number;
        duration?: string;
        distanceMeters?: number;
        condition?: string;
        status?: { code?: number; message?: string };
      }>;

      for (const element of matrix) {
        const originIndex = element.originIndex ?? -1;
        const origin = group[originIndex];
        if (!origin || element.destinationIndex !== 0) continue;
        if (
          element.condition === 'ROUTE_NOT_FOUND' ||
          (element.status?.code != null && element.status.code !== 0)
        ) {
          continue;
        }
        if (!Number.isFinite(element.distanceMeters) || !element.duration) continue;
        results.push({
          id: origin.id,
          distanceMeters: Math.round(element.distanceMeters!),
          durationSeconds: durationSeconds(element.duration),
          provider: 'GOOGLE_ROUTES',
        });
      }
    }

    if (!results.length) {
      throw new AppError(
        503,
        'ROUTING_NO_ROUTES',
        'No eligible Rider route to the pickup could be calculated',
      );
    }
    return results;
  }

  async route(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    vehicleType?: string,
  ): Promise<RoutingResult> {
    const [result] = await this.pickupMatrix(
      [{ id: 'route', ...origin, vehicleType }],
      destination,
    );
    if (!result) {
      throw new AppError(503, 'ROUTING_NO_ROUTE', 'No route could be calculated');
    }
    return result;
  }
}

export const routingProvider = new RoutingProvider();
