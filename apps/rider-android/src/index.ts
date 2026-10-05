import { NativeAuthSession, SecureCredentialStore } from '@deetoo/auth-native';

export interface RiderAndroidBootstrap {
  apiBaseUrl: string;
  secureStore: SecureCredentialStore;
}

/**
 * Phase 1 Android boundary. Phase 2 supplies the React Native UI, FCM, foreground
 * location service, navigation, camera and delivery workflows around this API session.
 */
export function createRiderAndroidSession(config: RiderAndroidBootstrap): NativeAuthSession {
  if (!/^https:\/\//.test(config.apiBaseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(config.apiBaseUrl)) {
    throw new Error('Rider Android API must use HTTPS outside local development');
  }
  return new NativeAuthSession(config.apiBaseUrl.replace(/\/$/, '') + '/api/v1', 'rider', config.secureStore);
}
