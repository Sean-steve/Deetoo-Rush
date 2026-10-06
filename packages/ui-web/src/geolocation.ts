export interface BrowserCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

export interface BrowserLocationOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

function locationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable location access for DeeToo in your browser settings.';
    case error.POSITION_UNAVAILABLE:
      return 'Your device could not determine its current location.';
    case error.TIMEOUT:
      return 'Getting your current location timed out. Try again where GPS or network location is available.';
    default:
      return error.message || 'Unable to determine your current location.';
  }
}

export function getBrowserCurrentLocation(
  options: BrowserLocationOptions = {},
): Promise<BrowserCoordinates> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return Promise.reject(
      new Error('Current location requires HTTPS, or localhost during development.'),
    );
  }
  if (!navigator.geolocation) {
    return Promise.reject(
      new Error('This browser or device does not provide geolocation.'),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      (error) => reject(new Error(locationErrorMessage(error))),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        timeout: options.timeoutMs ?? 15_000,
        maximumAge: options.maximumAgeMs ?? 30_000,
      },
    );
  });
}
