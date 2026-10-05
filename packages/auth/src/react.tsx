/**
 * DEETOO - Shared React Authentication Context & Hooks
 * Provides unified authentication state, token refresh, and RBAC guards across all 4 apps (Section 53 & 54)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser, UserRole, UserStatus, LoginResponse } from '@deetoo/types';
import { DeetooApiClient } from '@deetoo/api-client';
import { hasRole, hasPermission, evaluateAccess } from './rbac';

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  clientApp: 'customer' | 'merchant' | 'rider' | 'admin';
  apiClient: DeetooApiClient;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  registerCustomer: (params: { name: string; email?: string; phone_e164?: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
  hasRole: (role: UserRole | string) => boolean;
  hasPermission: (permission: string) => boolean;
  canAccess: (context: {
    permission?: string;
    resourceOwnerId?: string;
    merchantId?: string;
    branchId?: string;
    assignedRiderId?: string;
  }) => boolean;
  forgotPassword: (identifier: string) => Promise<{ message: string; dev_token?: string }>;
  resetPassword: (params: { token: string; new_password: string }) => Promise<{ message: string }>;
  requestOtp: (phone_e164: string, purpose?: string) => Promise<{ message: string; dev_otp?: string }>;
  confirmOtp: (phone_e164: string, code: string) => Promise<{ verified: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Local storage token key per application shell
const STORAGE_PREFIX = 'deetoo_auth_';

export function AuthProvider({
  children,
  clientApp,
}: {
  children: ReactNode;
  clientApp: 'customer' | 'merchant' | 'rider' | 'admin';
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${STORAGE_PREFIX}${clientApp}_token`);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize shared API client with 401 automatic recovery
  const [apiClient] = useState<DeetooApiClient>(() => {
    const client = new DeetooApiClient({
      baseUrl: '/api/v1',
      clientApp,
      initialToken: token,
      onUnauthorized: () => {
        setUser(null);
        setToken(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`${STORAGE_PREFIX}${clientApp}_token`);
        }
      },
      onTokenRefreshed: (newToken: string) => {
        setToken(newToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`${STORAGE_PREFIX}${clientApp}_token`, newToken);
        }
      },
    });
    return client;
  });

  // Sync token to API client
  useEffect(() => {
    apiClient.setAccessToken(token);
    if (token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_PREFIX}${clientApp}_token`, token);
      }
    } else {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`${STORAGE_PREFIX}${clientApp}_token`);
      }
    }
  }, [token, clientApp, apiClient]);

  const clearError = () => setError(null);

  // Initial session hydration
  const refreshProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Attempt to load current user via access token or active session cookie
      const res = await apiClient.getMe();
      setUser(res.data);
    } catch {
      // If token expired, try one silent refresh
      try {
        const refreshRes = await apiClient.refreshToken();
        if (refreshRes.data?.accessToken) {
          setToken(refreshRes.data.accessToken);
          const meRes = await apiClient.getMe();
          setUser(meRes.data);
        } else {
          setUser(null);
          setToken(null);
        }
      } catch {
        setUser(null);
        setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (identifier: string, password: string): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.login({
        identifier,
        password,
        device_info: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });

      const authUser = res.data.user;
      const accessToken = res.data.accessToken;

      setUser(authUser);
      setToken(accessToken);
      return authUser;
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Login failed. Please check credentials.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const registerCustomer = async (params: {
    name: string;
    email?: string;
    phone_e164?: string;
    password: string;
  }): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.registerCustomer(params);
      const authUser = res.data.user;
      const accessToken = res.data.accessToken;

      setUser(authUser);
      setToken(accessToken);
      return authUser;
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Registration failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await apiClient.logout();
    } catch {
      // Continue client cleanup even if network request fails
    } finally {
      setUser(null);
      setToken(null);
      setIsLoading(false);
    }
  };

  const checkHasRole = useCallback(
    (role: UserRole | string): boolean => {
      if (!user) return false;
      return hasRole({ roles: user.roles }, role);
    },
    [user]
  );

  const checkHasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      return hasPermission({ roles: user.roles, permissions: user.permissions }, permission);
    },
    [user]
  );

  const checkCanAccess = useCallback(
    (context: {
      permission?: string;
      resourceOwnerId?: string;
      merchantId?: string;
      branchId?: string;
      assignedRiderId?: string;
    }): boolean => {
      if (!user) return false;
      return evaluateAccess(
        {
          user_id: user.id,
          roles: user.roles,
          permissions: user.permissions,
          merchant_ids: user.merchant_ids,
          branch_ids: user.branch_ids,
          rider_id: user.rider_id,
          customer_id: user.customer_id,
        },
        context
      );
    },
    [user]
  );

  const forgotPassword = async (identifier: string) => {
    return (await apiClient.forgotPassword(identifier)).data;
  };

  const resetPassword = async (params: { token: string; new_password: string }) => {
    return (await apiClient.resetPassword(params)).data;
  };

  const requestOtp = async (phone_e164: string, purpose?: string) => {
    return (await apiClient.requestOtp(phone_e164, purpose)).data;
  };

  const confirmOtp = async (phone_e164: string, code: string) => {
    const res = await apiClient.confirmOtp(phone_e164, code);
    if (res.data?.verified && user) {
      setUser({ ...user, phone_verified_at: new Date().toISOString() });
    }
    return res.data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        clientApp,
        apiClient,
        login,
        registerCustomer,
        logout,
        refreshProfile,
        clearError,
        hasRole: checkHasRole,
        hasPermission: checkHasPermission,
        canAccess: checkCanAccess,
        forgotPassword,
        resetPassword,
        requestOtp,
        confirmOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
