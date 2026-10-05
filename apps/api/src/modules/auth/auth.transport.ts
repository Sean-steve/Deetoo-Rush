import crypto from 'crypto';
import { Request, Response } from 'express';
import type { CookieOptions } from 'express';
import { config } from '@deetoo/config';

export type AuthTransport = 'cookie' | 'bearer' | 'legacy';

export const ACCESS_COOKIE_NAME = 'deetoo_access_token';
export const REFRESH_COOKIE_NAME = 'deetoo_refresh_token';
export const CSRF_COOKIE_NAME = 'deetoo_csrf';

const sharedCookieOptions: Pick<CookieOptions, 'secure' | 'sameSite'> = {
  secure: config.isProduction,
  sameSite: 'lax',
};

const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: true,
  path: '/api/v1',
  maxAge: config.security.jwtAccessTtlSeconds * 1000,
};

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: true,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const CSRF_COOKIE_OPTIONS: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: false,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export function readCookie(req: Request, name: string): string | null {
  const parsed = (req as any).cookies?.[name];
  if (typeof parsed === 'string' && parsed) return parsed;
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getAuthTransport(req: Request): AuthTransport {
  const value = req.header('X-Auth-Transport')?.toLowerCase();
  if (value === 'cookie' || value === 'bearer') return value;
  return 'legacy';
}

export function getRefreshToken(req: Request): string | null {
  if (getAuthTransport(req) !== 'cookie' && req.body?.refreshToken) {
    return req.body.refreshToken;
  }
  return readCookie(req, REFRESH_COOKIE_NAME);
}

export function applyAuthTransport<T extends {
  accessToken?: string;
  refreshToken: string;
}>(req: Request, res: Response, result: T): Omit<T, 'accessToken' | 'refreshToken'> | T {
  const transport = getAuthTransport(req);
  if (transport === 'cookie') {
    if (!result.accessToken) {
      throw new Error('Cookie authentication requires an access token');
    }
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(32).toString('base64url'), CSRF_COOKIE_OPTIONS);
    const { accessToken: _accessToken, refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }
  if (transport === 'legacy') {
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
  }
  return result;
}

export function clearAuthTransport(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, { ...sharedCookieOptions, httpOnly: true, path: '/api/v1' });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...sharedCookieOptions, httpOnly: true, path: '/api/v1/auth' });
  res.clearCookie(CSRF_COOKIE_NAME, { ...sharedCookieOptions, httpOnly: false, path: '/' });
}
