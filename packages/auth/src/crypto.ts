/**
 * DEETOO - Server-side Cryptography, Hashing, and JWT Signing
 * Minimum Bcrypt cost factor 10, argon2id/sha256 token hashing
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@deetoo/config';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hashes password using bcrypt with minimum cost factor 10
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies password against bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Generates cryptographically secure random hex token (e.g. for refresh tokens, password reset)
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Hashes token with SHA-256 for persistent database storage (never store plain tokens)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates numeric OTP with secure random integer
 */
export function generateNumericOtp(digits = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(crypto.randomInt(min, max + 1));
}

/**
 * Signs JWT Access Token with standard payload & short expiration (15m default)
 */
export function signAccessToken(
  payload: Record<string, unknown>,
  secret: string = config.security.jwtSecret,
  expiresIn: string | number = config.security.jwtAccessTtlSeconds
): string {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as any,
    issuer: 'deetoo-auth',
    audience: 'deetoo-platform',
  });
}

/**
 * Verifies and decodes JWT Access Token
 */
export function verifyAccessToken<T = any>(
  token: string,
  secret: string = config.security.jwtSecret
): T | null {
  try {
    return jwt.verify(token, secret, {
      issuer: 'deetoo-auth',
      audience: 'deetoo-platform',
    }) as T;
  } catch {
    return null;
  }
}
