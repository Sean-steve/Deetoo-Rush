/**
 * DEETOO - Core Utilities
 * Standard money arithmetic, identifiers, and structured logging
 * Based on DEE-DOM-001, DEE-API-001, DEE-PRIV-001
 */

// ==========================================
// 1. Money Arithmetic (Integer Minor Units Only)
// ==========================================

export function toMinorUnits(wholeUnits: number): number {
  return Math.round(wholeUnits * 100);
}

export function fromMinorUnits(minorUnits: number): number {
  return minorUnits / 100;
}

export function formatKES(minorUnits: number): string {
  const whole = minorUnits / 100;
  return `KES ${whole.toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function addMoney(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Financial math violation: Inputs must be integer minor units (${a}, ${b})`);
  }
  return a + b;
}

export function subtractMoney(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Financial math violation: Inputs must be integer minor units (${a}, ${b})`);
  }
  const res = a - b;
  return res < 0 ? 0 : res;
}

export function multiplyMoney(amount_minor: number, multiplier: number): number {
  if (!Number.isInteger(amount_minor) || !Number.isInteger(multiplier)) {
    throw new Error(`Financial math violation: Inputs must be integers (${amount_minor}, ${multiplier})`);
  }
  return amount_minor * multiplier;
}

export function multiplyBasisPoints(amount_minor: number, basisPoints: number): number {
  if (!Number.isInteger(amount_minor) || !Number.isInteger(basisPoints)) {
    throw new Error('Inputs must be integer minor units and integer basis points');
  }
  // Standard financial round-half-up
  return Math.round((amount_minor * basisPoints) / 10000);
}

/**
 * Calculates straight-line Haversine distance in meters between two lat/lng coordinates,
 * optionally multiplied by a road factor (default 1.35x) to approximate real road transit distance.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  roadFactor = 1.35
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineMeters = R * c;
  return Math.round(straightLineMeters * roadFactor);
}

// ==========================================
// 2. Identifiers
// ==========================================

export function generateId(_prefix = 'id'): string {
  const runtimeCrypto = (globalThis as any)?.crypto;
  if (runtimeCrypto?.randomUUID) {
    return runtimeCrypto.randomUUID();
  }

  // React Native / Hermes (including Expo Go) may not expose Web Crypto.
  // These IDs are correlation/entity identifiers, not authentication secrets.
  // Server runtimes still take the cryptographically secure branch above.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function generateCartId(): string {
  return generateId('cart');
}

export function generateCartItemId(): string {
  return generateId('item');
}

export function generateQuoteId(): string {
  return generateId('quote');
}

export function generateRequestId(): string {
  return generateId('req');
}

export function generatePublicOrderCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `DT-${num}`;
}

// ==========================================
// 3. Structured Logging (Section 18 & DEE-PRIV-001)
// ==========================================

const SENSITIVE_KEYS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'card',
  'pan',
  'cvv',
  'cvc',
  'secret',
  'pin',
  'secret_key',
  'passkey',
  'otp',
  'mpesa_secret',
  'account_number',
  'bban',
  'iban',
  'bank_account',
  'document_url',
  'id_document',
  'id_number',
];

export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export interface StructuredLogPayload {
  level: 'debug' | 'info' | 'warn' | 'error';
  service?: string;
  requestId?: string;
  userId?: string;
  route?: string;
  method?: string;
  duration?: number;
  statusCode?: number;
  errorCode?: string;
  message: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export const logger = {
  info(message: string, context?: Partial<StructuredLogPayload>) {
    this.log('info', message, context);
  },
  warn(message: string, context?: Partial<StructuredLogPayload>) {
    this.log('warn', message, context);
  },
  error(message: string, context?: Partial<StructuredLogPayload>) {
    this.log('error', message, context);
  },
  debug(message: string, context?: Partial<StructuredLogPayload>) {
    this.log('debug', message, context);
  },
  log(level: StructuredLogPayload['level'], message: string, context: Partial<StructuredLogPayload> = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: context.service || 'deetoo-api',
      environment: process.env.APP_ENV || 'development',
      requestId: context.requestId,
      userId: context.userId,
      route: context.route,
      method: context.method,
      duration: context.duration,
      statusCode: context.statusCode,
      errorCode: context.errorCode,
      message,
      metadata: context.metadata ? (redactSensitiveData(context.metadata) as Record<string, unknown>) : undefined,
    };
    // Print structured single-line JSON
    console.log(JSON.stringify(entry));
  },
};
