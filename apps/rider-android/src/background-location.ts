import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { createRiderAndroidSession } from './index';
import { riderApiOrigin } from './config';
import { riderSecureStore } from './secure-store';

export const RIDER_LOCATION_TASK = 'deetoo-rider-background-location';

TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const locations = (data as { locations?: Location.LocationObject[] }).locations || [];
  const latest = locations.at(-1);
  if (!latest) return;

  try {
    const session = createRiderAndroidSession({
      apiBaseUrl: riderApiOrigin(),
      secureStore: riderSecureStore,
    });
    const user = await session.restore();
    if (!user) return;

    await session.client.request('/rider/location', {
      method: 'POST',
      body: JSON.stringify({
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy_meters: Math.max(0, latest.coords.accuracy || 0),
        recorded_at: new Date(latest.timestamp).toISOString(),
      }),
    });
  } catch {
    // Background location is best-effort. Server freshness rules fail closed if updates stop.
  }
});

export async function ensureLocationPermissions(): Promise<void> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    throw new Error('Foreground location permission is required to work as a Rider.');
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    throw new Error('Background location permission is required while you are online.');
  }
}

export async function getFreshLocation(): Promise<Location.LocationObject> {
  await ensureLocationPermissions();
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
}

export async function startRiderLocationService(): Promise<void> {
  await ensureLocationPermissions();
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    distanceInterval: 20,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Deetoo Rider is online',
      notificationBody: 'Location is active for delivery offers and fulfilment.',
      notificationColor: '#00A651',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopRiderLocationService(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
}
