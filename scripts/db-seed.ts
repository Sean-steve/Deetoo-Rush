/**
 * DEETOO - Database Seed Script
 * Seeds development baseline data (roles, chart of accounts, service zones)
 * Never automatically seeds production environments!
 */

import { getDbPool } from '../apps/api/src/db/client';
import { logger } from '../packages/utils/src/index';
import { config } from '../packages/config/src/index';

// Must match every value of the real UserRole enum (packages/types/src/index.ts) exactly --
// this table is what POST /admin/users/:id/roles grants against. The previous list here had
// only 7 of the 10 real roles: merchant_owner, merchant_manager, and merchant_staff were
// missing entirely, which meant an admin could never actually grant any of them (the granting
// query looks up the role by code and finds nothing) in any real Postgres deployment -- so no
// merchant user could ever pass the owner/manager-only authorization checks
// (merchantScope/hasAnyRole in scope.ts) that most of the merchant app's write actions require.
export const SYSTEM_ROLES = [
  { id: '11111111-1111-1111-1111-111111111101', code: 'customer', name: 'Customer' },
  { id: '11111111-1111-1111-1111-111111111102', code: 'merchant', name: 'Merchant Operator' },
  { id: '11111111-1111-1111-1111-111111111108', code: 'merchant_owner', name: 'Merchant Owner' },
  { id: '11111111-1111-1111-1111-111111111109', code: 'merchant_manager', name: 'Merchant Manager' },
  { id: '11111111-1111-1111-1111-111111111110', code: 'merchant_staff', name: 'Merchant Staff' },
  { id: '11111111-1111-1111-1111-111111111103', code: 'rider', name: 'Delivery Courier' },
  { id: '11111111-1111-1111-1111-111111111104', code: 'support', name: 'Support Agent' },
  { id: '11111111-1111-1111-1111-111111111105', code: 'finance', name: 'Finance Controller' },
  { id: '11111111-1111-1111-1111-111111111106', code: 'ops', name: 'Marketplace Operations' },
  { id: '11111111-1111-1111-1111-111111111107', code: 'admin', name: 'Platform Administrator' },
];

// Matches the real LedgerAccountType enum (packages/types/src/index.ts) -- the previous list here
// was copied from the spec document's illustrative chart of accounts (ASSET_PROVIDER_RECEIVABLE,
// ASSET_CASH_BANK, LIAB_MERCHANT_PAYABLE, etc.), which was never actually implemented that way:
// the real schema's unique constraint is (account_type, owner_type, owner_id, currency) NULLS NOT
// DISTINCT, so two different PLATFORM/NULL-owner accounts sharing one account_type collide, and
// the application code has never queried by those spec-doc names at all. Only the genuinely
// platform-scoped (owner_id-less) account types are pre-seeded here; MERCHANT_PAYABLE and
// RIDER_PAYABLE are per-owner and are created on demand by LedgerRepository.getOrCreateAccount
// the first time a specific merchant or rider needs one.
export const LEDGER_SYSTEM_ACCOUNTS = [
  { id: '22222222-2222-2222-2222-222222222201', code: 'CUSTOMER_FUNDS_CLEARING', type: 'CUSTOMER_FUNDS_CLEARING', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222202', code: 'CUSTOMER_REFUND_PAYABLE', type: 'CUSTOMER_REFUND_PAYABLE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222205', code: 'PLATFORM_COMMISSION_REVENUE', type: 'PLATFORM_COMMISSION_REVENUE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222206', code: 'PLATFORM_DELIVERY_REVENUE', type: 'PLATFORM_DELIVERY_REVENUE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222207', code: 'PLATFORM_SERVICE_FEE_REVENUE', type: 'PLATFORM_SERVICE_FEE_REVENUE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222208', code: 'RIDER_DELIVERY_EXPENSE', type: 'RIDER_DELIVERY_EXPENSE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222209', code: 'PROMOTION_EXPENSE_PLATFORM', type: 'PROMOTION_EXPENSE_PLATFORM', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222210', code: 'PROMOTION_EXPENSE_MERCHANT', type: 'PROMOTION_EXPENSE_MERCHANT', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222211', code: 'PAYMENT_PROCESSOR_FEE_EXPENSE', type: 'PAYMENT_PROCESSOR_FEE_EXPENSE', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222212', code: 'REFUND_EXPENSE_PLATFORM', type: 'REFUND_EXPENSE_PLATFORM', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222213', code: 'SETTLEMENT_CLEARING', type: 'SETTLEMENT_CLEARING', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222214', code: 'RIDER_PAYOUT_CLEARING', type: 'RIDER_PAYOUT_CLEARING', ownerType: 'PLATFORM' },
  { id: '22222222-2222-2222-2222-222222222215', code: 'GENERAL_ADJUSTMENT_CLEARING', type: 'GENERAL_ADJUSTMENT_CLEARING', ownerType: 'PLATFORM' },
];

export const DEMO_SERVICE_ZONE = {
  id: '33333333-3333-3333-3333-333333333301',
  name: 'Kenya Nationwide Zone',
  city_id: 'NAIROBI',
  status: 'ACTIVE',
  config: {
    base_delivery_fee_minor: 15000,
    service_fee_minor: 5000,
    max_radius_km: 1000.0,
  },
};

async function seed() {
  if (config.isProduction) {
    logger.error('CRITICAL: Seeding is strictly prohibited in production environments!');
    process.exit(1);
  }

  logger.info('Seeding development database baseline...');
  const pool = getDbPool();

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Seed roles
      for (const role of SYSTEM_ROLES) {
        await client.query(
          `INSERT INTO roles (id, code, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO NOTHING`,
          [role.id, role.code, role.name]
        );
      }

      // Seed ledger accounts
      for (const acc of LEDGER_SYSTEM_ACCOUNTS) {
        await client.query(
          `INSERT INTO ledger_accounts (id, account_number, owner_type, account_type, currency, status)
           VALUES ($1, $2, $3, $4, 'KES', 'ACTIVE')
           ON CONFLICT (account_number) DO NOTHING`,
          [acc.id, acc.code, acc.ownerType, acc.type]
        );
      }

      // Seed service zone. boundary was previously never set here at all -- findZonesForPoint's
      // PostGIS path explicitly requires "boundary IS NOT NULL", so with no boundary this zone
      // could never match any coordinate via ST_Contains, meaning every customer/rider/branch
      // location check would silently fail OUTSIDE_SERVICE_AREA in a real Postgres deployment
      // regardless of zone size. Sets a polygon covering the whole of Kenya (approx. national
      // bounding box) so "Delivery Service Area: anywhere in Kenya" is actually configurable.
      await client.query(
        `INSERT INTO service_zones (id, name, status, city_id, config, boundary)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))
         ON CONFLICT (id) DO NOTHING`,
        [
          DEMO_SERVICE_ZONE.id,
          DEMO_SERVICE_ZONE.name,
          DEMO_SERVICE_ZONE.status,
          DEMO_SERVICE_ZONE.city_id,
          JSON.stringify(DEMO_SERVICE_ZONE.config),
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[33.5, -4.9], [41.9, -4.9], [41.9, 5.1], [33.5, 5.1], [33.5, -4.9]]],
          }),
        ]
      );

      await client.query('COMMIT');
      logger.info('Database baseline seed completed successfully.');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    // A seed failure must never be silently swallowed and reported as success -- that is
    // exactly what happened here previously (a stale column name meant every seed run since
    // some earlier schema change actually rolled back everything -- roles, ledger accounts,
    // the service zone -- while printing "Dev records pre-configured." and exiting 0). Every
    // INSERT above already uses ON CONFLICT DO NOTHING, so a real re-run against an
    // already-seeded database is a genuine no-op, not an error; there is no legitimate case
    // left where swallowing an error here is correct. Fail loudly instead.
    logger.error('Database seed failed', { metadata: { message: err.message } });
    console.error('[Seed Runner] FAILED:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
  await pool.end().catch(() => {});
}

// Run seed only when directly executed via CLI, not when imported as a module
const isDirectExecution = process.argv[1]?.includes('db-seed');
if (isDirectExecution) {
  seed();
}
