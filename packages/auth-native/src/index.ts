import { DeetooApiClient } from '@deetoo/api-client';
import { AuthUser, LoginResponse } from '@deetoo/types';

export interface SecureCredentialStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Platform-neutral native session coordinator.
 *
 * Android supplies a SecureCredentialStore backed by Android Keystore/encrypted
 * storage. AsyncStorage/localStorage implementations are intentionally excluded.
 */
export class NativeAuthSession {
  readonly client: DeetooApiClient;

  constructor(
    baseUrl: string,
    clientApp: 'rider' | 'customer',
    private readonly secureStore: SecureCredentialStore,
  ) {
    this.client = new DeetooApiClient({
      baseUrl,
      clientApp,
      authTransport: 'bearer',
      onUnauthorized: () => {
        void this.secureStore.clear();
      },
    });
  }

  async login(identifier: string, password: string): Promise<AuthUser> {
    const response = await this.client.login({ identifier, password });
    await this.persistBearerCredentials(response.data);
    return response.data.user;
  }

  async restore(): Promise<AuthUser | null> {
    const refreshToken = await this.secureStore.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await this.client.refreshToken(refreshToken);
      if (!response.data.accessToken) throw new Error('Native refresh did not return an access token');
      this.client.setAccessToken(response.data.accessToken);
      const me = await this.client.getMe();
      return me.data;
    } catch {
      await this.secureStore.clear();
      this.client.setAccessToken(null);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.logout();
    } finally {
      this.client.setAccessToken(null);
      await this.secureStore.clear();
    }
  }

  private async persistBearerCredentials(data: LoginResponse): Promise<void> {
    if (!data.accessToken || !data.refreshToken) {
      throw new Error('Bearer authentication response is missing credentials');
    }
    this.client.setAccessToken(data.accessToken);
    await this.secureStore.setRefreshToken(data.refreshToken);
  }
}
