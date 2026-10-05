import { Request, Response, NextFunction } from 'express';
import { config } from '@deetoo/config';
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  readCookie,
} from '../modules/auth/auth.transport';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
];

function configuredOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
}

function isAllowedOrigin(origin: string): boolean {
  if (configuredOrigins().includes(origin)) return true;
  return config.isDevelopment && DEFAULT_ALLOWED_ORIGINS.includes(origin);
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function requiresSensitiveNoStore(path: string): boolean {
  return [
    '/api/v1/auth',
    '/api/v1/admin',
    '/api/v1/customer',
    '/api/v1/merchant',
    '/api/v1/rider',
    '/api/v1/orders',
    '/api/v1/payments',
    '/api/v1/finance',
    '/api/v1/operations',
    '/api/v1/realtime',
  ].some((prefix) => path.startsWith(prefix));
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  res.setHeader('Vary', 'Origin');

  const scriptSrc = config.isDevelopment
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self'";
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none';`,
  );

  if (config.isProduction || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  if (requiresSensitiveNoStore(req.path)) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
  }

  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Request-Id, Idempotency-Key, X-Client-App, X-Client-Version, X-Auth-Transport, X-CSRF-Token',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  // CSRF is required only for browser-cookie authenticated mutations. Native
  // Android clients authenticate with bearer tokens and are not subject to CSRF.
  if (isUnsafeMethod(req.method) && readCookie(req, ACCESS_COOKIE_NAME)) {
    const csrfCookie = readCookie(req, CSRF_COOKIE_NAME);
    const csrfHeader = req.header('X-CSRF-Token');
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      res.status(403).json({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'CSRF token validation failed',
          request_id: req.headers['x-request-id'] || null,
        },
      });
      return;
    }

    if (origin && !isAllowedOrigin(origin)) {
      res.status(403).json({
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Request origin is not allowed',
          request_id: req.headers['x-request-id'] || null,
        },
      });
      return;
    }
  }

  next();
}
