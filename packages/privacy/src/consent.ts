/**
 * Browser-only, first-party website cookie preferences.
 *
 * Authentication, CSRF, fraud prevention and a single consent receipt are
 * essential. Optional storage/tracking is denied until positively selected.
 * Apps and analytics vendors MUST use canUseCookiePurpose() before loading.
 */
export const COOKIE_POLICY_VERSION = '2026-11-09';
export const COOKIE_RECEIPT_NAME = 'deetoo_privacy_consent';
export const COOKIE_RECEIPT_DAYS = 180;
export const COOKIE_PREFS_CHANGED = 'deetoo:cookie-preferences-changed';
export const COOKIE_PREFS_OPEN = 'deetoo:open-cookie-preferences';
export type CookiePurpose = 'functional' | 'analytics' | 'marketing';
export type ConsentSource = 'banner' | 'customize' | 'settings';
export type CookiePreferences = Record<CookiePurpose, boolean>;

export interface ConsentReceipt {
  version: string;
  recordedAt: string;
  expiresAt: string;
  source: ConsentSource;
  preferences: CookiePreferences;
}
export const DEFAULT_COOKIE_PREFERENCES: Readonly<CookiePreferences> = Object.freeze({
  functional: false,
  analytics: false,
  marketing: false,
});

export function globalPrivacySignal(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function effectivePreferences(value: CookiePreferences, privacySignal = globalPrivacySignal()): CookiePreferences {
  return {
    functional: value.functional === true,
    analytics: !privacySignal && value.analytics === true,
    marketing: !privacySignal && value.marketing === true,
  };
}

export function parseConsentReceipt(raw: string | null, now = Date.now()): ConsentReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const rec = value as Record<string, unknown>;
    if (rec.version !== COOKIE_POLICY_VERSION || typeof rec.recordedAt !== 'string'
      || typeof rec.expiresAt !== 'string' || !['banner','customize','settings'].includes(String(rec.source))) return null;
    const prefs = rec.preferences;
    if (!prefs || typeof prefs !== 'object') return null;
    const p = prefs as Record<string, unknown>;
    if (typeof p.functional !== 'boolean' || typeof p.analytics !== 'boolean' || typeof p.marketing !== 'boolean') return null;
    const expiry = Date.parse(rec.expiresAt);
    const created = Date.parse(rec.recordedAt);
    if (!Number.isFinite(expiry) || !Number.isFinite(created) || expiry <= now || created > now + 60_000) return null;
    return {
      version: COOKIE_POLICY_VERSION,
      recordedAt: rec.recordedAt,
      expiresAt: rec.expiresAt,
      source: rec.source as ConsentSource,
      preferences: { functional: p.functional, analytics: p.analytics, marketing: p.marketing },
    };
  } catch { return null; }
}
export function readCookieReceipt(): ConsentReceipt | null {
  if (typeof document === 'undefined') return null;
  const encoded = document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(COOKIE_RECEIPT_NAME + '='));
  if (!encoded) return null;
  try { return parseConsentReceipt(decodeURIComponent(encoded.slice(COOKIE_RECEIPT_NAME.length + 1))); }
  catch { return null; }
}

/** Last recorded selection: never equate an unset category with permission. */
export function canUseCookiePurpose(purpose: CookiePurpose): boolean {
  const receipt = readCookieReceipt();
  return Boolean(receipt && effectivePreferences(receipt.preferences)[purpose]);
}

/** No optional tracking script, pixel, or cookie may initialize without this gate. */
export function runWithCookieConsent(purpose: CookiePurpose, callback: () => void): boolean {
  if (!canUseCookiePurpose(purpose)) return false;
  callback();
  return true;
}

export function saveCookiePreferences(
  value: CookiePreferences,
  source: ConsentSource,
  now = Date.now(),
): ConsentReceipt {
  if (typeof document === 'undefined') throw new Error('Consent can only be recorded in a browser');
  const recordedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + COOKIE_RECEIPT_DAYS * 86400_000).toISOString();
  const receipt: ConsentReceipt = {
    version: COOKIE_POLICY_VERSION, recordedAt, expiresAt, source,
    preferences: effectivePreferences(value),
  };
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = COOKIE_RECEIPT_NAME + '=' + encodeURIComponent(JSON.stringify(receipt)) +
    '; Max-Age=' + String(COOKIE_RECEIPT_DAYS * 86400) + '; Path=/; SameSite=Lax' + secure;
  window.dispatchEvent(new CustomEvent(COOKIE_PREFS_CHANGED, { detail: receipt }));
  return receipt;
}

/** The browser receipt is immediately saved even if the optional signed-in audit sync fails. */
export async function syncAuthenticatedConsent(receipt: ConsentReceipt): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const csrfEntry = document.cookie.split(';').map(item => item.trim())
    .find(item => item.startsWith('deetoo_csrf='));
  if (!csrfEntry) return false; // Guest; no server-side identity to record.
  const csrf = decodeURIComponent(csrfEntry.slice('deetoo_csrf='.length));
  if (!csrf) return false;
  try {
    const response = await fetch('/api/v1/auth/privacy-consent', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Transport': 'cookie',
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify(receipt),
      signal: AbortSignal.timeout(12000),
    });
    return response.ok;
  } catch { return false; }
}

export function openCookiePreferences(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COOKIE_PREFS_OPEN));
}
