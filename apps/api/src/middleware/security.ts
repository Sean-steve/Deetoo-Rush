import { Request, Response, NextFunction } from 'express';
import { config } from '@deetoo/config';

// Allowed origins for CORS in production/staging environments
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Standard Production Security Headers (Section 19)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

  // CSP: safe baseline allowing internal resources and assets. Vite's dev server unavoidably
  // injects an inline React Refresh preamble <script> into every HTML response in development --
  // that is Vite's own dev-time transform, not something in this repo's source, so it cannot be
  // moved into an external file the way index.html's own inline scripts can be. A strict
  // script-src 'self' with no 'unsafe-inline'/'unsafe-eval' therefore silently breaks every local
  // dev server (the preamble script is blocked, @vitejs/plugin-react then throws "can't detect
  // preamble", and the app never mounts -- a white screen with no server-side error at all).
  // Scoped to config.isDevelopment only; the deployed/production policy below is unchanged.
  const scriptSrc = config.isDevelopment ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:;`
  );

  // Enforce HSTS in production
  if (config.isProduction || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // 2. Explicit CORS handling with allowlist (Section 18)
  const origin = req.headers.origin;
  if (origin) {
    const configuredOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : [];
    const allowedList = [...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins];

    const isAllowed =
      (config.isDevelopment && DEFAULT_ALLOWED_ORIGINS.includes(origin)) ||
      configuredOrigins.includes(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Request-Id, Idempotency-Key, X-Client-App, X-Client-Version'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
