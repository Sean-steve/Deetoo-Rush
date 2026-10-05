import * as SecureStore from 'expo-secure-store';
import type { SecureCredentialStore } from '@deetoo/auth-native';

const REFRESH_TOKEN_KEY = 'deetoo_rider_refresh_token';

export const riderSecureStore: SecureCredentialStore = {
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  },
  async clear() {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
