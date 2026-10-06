import { NativeAuthSession, SecureCredentialStore } from '@deetoo/auth-native';

export interface RiderAndroidBootstrap {
  apiBaseUrl: string;
  secureStore: SecureCredentialStore;
}

export function isLocalDevelopmentApiOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:') return false;

    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host === '10.0.3.2') {
      return true;
    }

    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    // RFC1918 private LAN addresses are valid for a physical Android device
    // talking to a developer workstation on the same network.
    if (octets[0] === 10) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Native Rider API boundary.
 *
 * Release builds require HTTPS. Development builds may use Android emulator
 * host aliases or RFC1918 LAN addresses so Metro/native development can reach
 * a local API without weakening production transport requirements.
 */
export function createRiderAndroidSession(config: RiderAndroidBootstrap): NativeAuthSession {
  const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
  const isHttps = /^https:\/\//i.test(baseUrl);
  const isDevelopment =
    typeof __DEV__ !== 'undefined' && __DEV__;

  if (!isHttps && !(isDevelopment && isLocalDevelopmentApiOrigin(baseUrl))) {
    throw new Error(
      'Rider Android API must use HTTPS outside local development. ' +
      'Development may use localhost, 10.0.2.2, 10.0.3.2, or a private LAN address.',
    );
  }

  return new NativeAuthSession(baseUrl + '/api/v1', 'rider', config.secureStore);
}
