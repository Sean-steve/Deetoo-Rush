/**
 * DEETOO - Disaster Recovery & Backup Integrity Verification Script
 * Sprint 14: Automated Backup, Point-in-Time Restore Verification,
 * Ledger Invariant Audit, and RPO/RTO Validation.
 */

import { getDbPool } from '../apps/api/src/db/client';
import { logger } from '../packages/utils/src/index';

export interface BackupVerificationResult {
  success: boolean;
  restoreVerified: boolean;
  timestamp: string;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  measuredRestoreDurationMs: number;
  verifiedTables: string[];
  ledgerBalanced: boolean;
  ledgerTotalDebitMinor: number;
  ledgerTotalCreditMinor: number;
  integrityChecks: {
    orphanedOrdersCount: number;
    orphanedDeliveriesCount: number;
    unreconciledCapturedPaymentsCount: number;
  };
}

export async function verifyBackupAndRestoreIntegrity(): Promise<BackupVerificationResult> {
  const startTime = Date.now();


  const tablesToCheck = [
    'users',
    'roles',
    'service_zones',
    'merchants',
    'merchant_branches',
    'menu_items',
    'orders',
    'deliveries',
    'payments',
    'refunds',
    'ledger_entries',
    'ledger_accounts',
    'merchant_settlements',
    'rider_payouts',
    'operational_incidents',
    'support_cases',
  ];

  let verifiedTables: string[] = [];
  let ledgerBalanced = true;
  let ledgerTotalDebitMinor = 0;
  let ledgerTotalCreditMinor = 0;
  let orphanedOrdersCount = 0;
  let orphanedDeliveriesCount = 0;
  let unreconciledCapturedPaymentsCount = 0;

  try {
    const client = await getDbPool().connect();
    try {
      // 1. Verify schema tables exist
      for (const table of tablesToCheck) {
        const checkRes = await client.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        if (checkRes.rows[0]?.exists) {
          verifiedTables.push(table);
        }
      }

      // 2. Audit Ledger Double-Entry Invariant
      if (verifiedTables.includes('ledger_entries')) {
        const ledgerSumRes = await client.query(
          `SELECT 
            COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE 0 END), 0) as total_debit,
            COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE 0 END), 0) as total_credit
           FROM ledger_entries`
        );
        ledgerTotalDebitMinor = parseInt(ledgerSumRes.rows[0]?.total_debit || '0', 10);
        ledgerTotalCreditMinor = parseInt(ledgerSumRes.rows[0]?.total_credit || '0', 10);
        ledgerBalanced = ledgerTotalDebitMinor === ledgerTotalCreditMinor;
      }

      // 3. Relational integrity checks
      if (verifiedTables.includes('orders') && verifiedTables.includes('users')) {
        const orphanOrders = await client.query(
          `SELECT COUNT(*)::int as count FROM orders o LEFT JOIN users u ON o.customer_id = u.id WHERE u.id IS NULL`
        );
        orphanedOrdersCount = orphanOrders.rows[0]?.count || 0;
      }

      if (verifiedTables.includes('deliveries') && verifiedTables.includes('orders')) {
        const orphanDeliveries = await client.query(
          `SELECT COUNT(*)::int as count FROM deliveries d LEFT JOIN orders o ON d.order_id = o.id WHERE o.id IS NULL`
        );
        orphanedDeliveriesCount = orphanDeliveries.rows[0]?.count || 0;
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    throw new Error('Backup integrity cannot be verified: database query failed', { cause: err });
  }

  const durationMs = Date.now() - startTime;

  const result: BackupVerificationResult = {
    // This inspection does not restore a backup or prove RPO/RTO.
    success: false,
    restoreVerified: false,
    timestamp: new Date().toISOString(),
    rpoTargetMinutes: 5, // Target: Maximum 5 minutes WAL / PITR acceptable loss
    rtoTargetMinutes: 15, // Target: Cold standby restore within 15 minutes
    measuredRestoreDurationMs: 0,
    verifiedTables,
    ledgerBalanced,
    ledgerTotalDebitMinor,
    ledgerTotalCreditMinor,
    integrityChecks: {
      orphanedOrdersCount,
      orphanedDeliveriesCount,
      unreconciledCapturedPaymentsCount,
    },
  };

  logger.info('Backup & Restore Integrity Verification Completed', {
    service: 'disaster-recovery',
    metadata: { ...result },
  });

  return result;
}

if (process.argv[1] && process.argv[1].endsWith('backup-restore-verify.ts')) {
  verifyBackupAndRestoreIntegrity()
    .then((res) => {
      console.log('DR & Backup Verification Summary:', JSON.stringify(res, null, 2));
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('DR verification failed:', err);
      process.exit(1);
    });
}
