import { createHash } from 'node:crypto';
import { config } from '@deetoo/config';
import { currentTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';

export function canonicalHash(value: unknown): string {
  function canonical(v: any): any {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])]));
    return v;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

// Short checkout transactions block concurrent source mutations, including older admin
// configuration routes. No provider/network operation belongs inside this boundary.
export async function lockQuoteSources(): Promise<void> {
  if (config.storage.mode === 'memory') return;
  const client = currentTransaction();
  if (!client) throw new Error('Quote binding requires a transaction');
  await client.query(`LOCK TABLE carts, cart_items, cart_item_modifiers, addresses,
    merchant_branches, branch_opening_hours, branch_service_zones, service_zones,
    menus, menu_categories, menu_items, modifier_groups, modifier_options,
    item_modifier_groups, menu_item_branch_overrides, modifier_option_branch_overrides,
    delivery_pricing_rules, service_fee_rules, promotions, merchant_commission_rules
    IN SHARE ROW EXCLUSIVE MODE`);
}

export function requireIdempotencyKey(key?: string): string {
  if (!key || !key.trim() || key.length > 128) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A non-empty Idempotency-Key of at most 128 characters is required');
  return key;
}

export async function lockCommand(scope: string): Promise<void> {
  if (config.storage.mode === 'memory') return;
  const client = currentTransaction();
  if (!client) throw new Error('Command requires a transaction');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [scope]);
}
