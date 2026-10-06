import { config } from '@deetoo/config';
import { logger } from '@deetoo/utils';
import { getDbPool } from '../../db/client';
import { riderEligibilityService } from '../rider/rider-eligibility.service';
import { operationalIncidentService } from './incident.service';
import { reconciliationService } from '../finance/reconciliation.service';
import { settlementService } from '../finance/settlement.service';
import { riderPayoutService } from '../finance/rider-payout.service';
import { merchantOnboardingService } from '../merchant/merchant-onboarding.service';

export interface AutomationSweepResult {
  staleRiders?: { checked: number; transitionedToUnavailable: number };
  zones?: { branchesAssigned: number; ridersAssigned: number };
  incidents?: { orders: number; deliveries: number; payments: number };
  reconciliation?: { reconciledCount: number };
  finance?: { settlementsCreated: number; payoutsCreated: number };
  onboarding?: { readinessUpdated: number; advancedToReview: number };
}

async function recordFinanceAutomationRun(
  runType: 'RECONCILIATION' | 'BATCH_GENERATION',
  startedAt: Date,
  status: 'SUCCEEDED' | 'FAILED',
  result: Record<string, unknown> = {},
  error?: unknown,
): Promise<void> {
  if (config.storage.mode !== 'postgres') return;
  try {
    await getDbPool().query(
      `INSERT INTO finance_automation_runs(
         run_type,status,result,error_message,started_at,finished_at
       ) VALUES($1,$2,$3,$4,$5,NOW())`,
      [
        runType,
        status,
        JSON.stringify(result),
        error ? (error instanceof Error ? error.message : String(error)) : null,
        startedAt.toISOString(),
      ],
    );
  } catch (recordError) {
    logger.warn('Unable to persist finance automation run telemetry', {
      service: 'automation',
      metadata: {
        runType,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      },
    });
  }
}

async function withAutomationLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T | null> {
  if (config.storage.mode !== 'postgres') return work();

  const client = await getDbPool().connect();
  try {
    const lock = await client.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',
      [`deetoo-automation:${key}`],
    );
    if (!lock.rows[0]?.acquired) return null;
    try {
      return await work();
    } finally {
      await client.query(
        'SELECT pg_advisory_unlock(hashtextextended($1,0))',
        [`deetoo-automation:${key}`],
      );
    }
  } finally {
    client.release();
  }
}

export class AutomationService {
  async cleanupStaleRiders(): Promise<AutomationSweepResult['staleRiders'] | null> {
    return withAutomationLock('stale-riders', () =>
      riderEligibilityService.cleanupStaleRiders(),
    );
  }

  async syncMissingServiceZones(): Promise<AutomationSweepResult['zones'] | null> {
    return withAutomationLock('zone-sync', async () => {
      const db = getDbPool();

      // Branch GPS is authoritative when no explicit zone assignment exists.
      // Existing assignments are preserved as operator overrides.
      const branches = await db.query(`
        WITH inserted AS (
          INSERT INTO branch_service_zones(branch_id, service_zone_id, status)
          SELECT b.id, sz.id, 'ACTIVE'
          FROM merchant_branches b
          JOIN service_zones sz
            ON sz.status='ACTIVE'
           AND sz.boundary IS NOT NULL
           AND ST_Covers(
             sz.boundary,
             ST_SetSRID(ST_Point(b.longitude,b.latitude),4326)
           )
          WHERE b.status='ACTIVE'
            AND b.latitude IS NOT NULL
            AND b.longitude IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM branch_service_zones existing
              WHERE existing.branch_id=b.id AND existing.status='ACTIVE'
            )
          ON CONFLICT (branch_id, service_zone_id)
          DO UPDATE SET status='ACTIVE'
          RETURNING branch_id
        )
        SELECT count(DISTINCT branch_id)::int AS count FROM inserted
      `);

      // Rider GPS is used to bootstrap service-zone eligibility only when Ops
      // has not assigned any zone yet. Manual/explicit assignments stay intact.
      const riders = await db.query(`
        WITH inserted AS (
          INSERT INTO rider_service_zones(id,rider_id,zone_id)
          SELECT gen_random_uuid(), rp.id, sz.id
          FROM rider_profiles rp
          JOIN service_zones sz
            ON sz.status='ACTIVE'
           AND sz.boundary IS NOT NULL
           AND ST_Covers(
             sz.boundary,
             ST_SetSRID(ST_Point(rp.last_known_longitude,rp.last_known_latitude),4326)
           )
          WHERE rp.onboarding_status='APPROVED'
            AND rp.operational_status='ACTIVE'
            AND rp.last_known_latitude IS NOT NULL
            AND rp.last_known_longitude IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM rider_service_zones existing
              WHERE existing.rider_id=rp.id
            )
          ON CONFLICT (rider_id,zone_id) DO NOTHING
          RETURNING rider_id
        )
        SELECT count(DISTINCT rider_id)::int AS count FROM inserted
      `);

      return {
        branchesAssigned: Number(branches.rows[0]?.count || 0),
        ridersAssigned: Number(riders.rows[0]?.count || 0),
      };
    });
  }

  async scanOperationalIncidents(): Promise<AutomationSweepResult['incidents'] | null> {
    return withAutomationLock('incident-scan', async () => {
      const result = await operationalIncidentService.runAllScans();
      return {
        orders: result.orderIncidents.length,
        deliveries: result.deliveryIncidents.length,
        payments: result.paymentIncidents.length,
      };
    });
  }

  async reconcileFinancials(): Promise<AutomationSweepResult['reconciliation'] | null> {
    return withAutomationLock('financial-reconciliation', async () => {
      const startedAt = new Date();
      try {
        const result = await reconciliationService.autoReconcile();
        await recordFinanceAutomationRun(
          'RECONCILIATION',
          startedAt,
          'SUCCEEDED',
          result as unknown as Record<string, unknown>,
        );
        return result;
      } catch (error) {
        await recordFinanceAutomationRun('RECONCILIATION', startedAt, 'FAILED', {}, error);
        throw error;
      }
    });
  }

  async prepareFinancialBatches(): Promise<AutomationSweepResult['finance'] | null> {
    return withAutomationLock('financial-batches', async () => {
      const startedAt = new Date();
      try {
      const db = getDbPool();
      let settlementsCreated = 0;
      let payoutsCreated = 0;

      const merchants = await db.query(`
        SELECT DISTINCT la.owner_id AS merchant_id
        FROM ledger_accounts la
        WHERE la.owner_type='MERCHANT'
          AND la.account_type='MERCHANT_PAYABLE'
          AND la.balance_minor > 0
          AND NOT EXISTS (
            SELECT 1 FROM merchant_settlements ms
            WHERE ms.merchant_id=la.owner_id
              AND ms.status IN ('DRAFT','CALCULATED','APPROVED','PROCESSING')
          )
        LIMIT 200
      `);

      for (const row of merchants.rows) {
        try {
          const settlement = await settlementService.calculateSettlement(
            row.merchant_id,
            undefined,
          );
          if (settlement.net_settlement_amount_minor > 0) settlementsCreated++;
        } catch (error) {
          logger.warn('Automated merchant settlement calculation skipped', {
            service: 'automation',
            metadata: {
              merchantId: row.merchant_id,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }

      const riders = await db.query(`
        SELECT DISTINCT candidate.rider_id
        FROM (
          SELECT re.rider_id
          FROM rider_earnings re
          WHERE re.status='ELIGIBLE'
          UNION
          SELECT la.owner_id AS rider_id
          FROM ledger_accounts la
          WHERE la.owner_type='RIDER'
            AND la.account_type='RIDER_PAYABLE'
            AND la.balance_minor > 0
        ) candidate
        WHERE NOT EXISTS (
          SELECT 1 FROM rider_payouts rp
          WHERE rp.rider_id=candidate.rider_id
            AND rp.status IN ('DRAFT','CALCULATED','APPROVED','PROCESSING')
        )
        LIMIT 500
      `);

      for (const row of riders.rows) {
        try {
          await riderPayoutService.calculatePayout(row.rider_id, undefined);
          payoutsCreated++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/No eligible earnings or payable balance/i.test(message)) {
            logger.warn('Automated rider payout calculation skipped', {
              service: 'automation',
              metadata: { riderId: row.rider_id, error: message },
            });
          }
        }
      }

      const result = { settlementsCreated, payoutsCreated };
      await recordFinanceAutomationRun(
        'BATCH_GENERATION',
        startedAt,
        'SUCCEEDED',
        result as unknown as Record<string, unknown>,
      );
      return result;
      } catch (error) {
        await recordFinanceAutomationRun('BATCH_GENERATION', startedAt, 'FAILED', {}, error);
        throw error;
      }
    });
  }

  async refreshMerchantReadiness(): Promise<AutomationSweepResult['onboarding'] | null> {
    return withAutomationLock('merchant-readiness', async () => {
      const db = getDbPool();
      const pipeline = await merchantOnboardingService.list();
      let readinessUpdated = 0;
      let advancedToReview = 0;

      for (const merchant of pipeline as any[]) {
        const readiness = merchant.readiness;
        const shouldAdvance =
          readiness?.ready_for_live === true &&
          !['READY_FOR_REVIEW','APPROVED','LIVE','BLOCKED'].includes(merchant.stage);

        const stage = shouldAdvance ? 'READY_FOR_REVIEW' : merchant.stage;
        await db.query(
          `INSERT INTO merchant_onboarding_state(
             merchant_id,stage,readiness,note,updated_by,updated_at
           ) VALUES($1,$2,$3,$4,NULL,NOW())
           ON CONFLICT(merchant_id) DO UPDATE SET
             stage=EXCLUDED.stage,
             readiness=EXCLUDED.readiness,
             note=CASE
               WHEN merchant_onboarding_state.stage<>EXCLUDED.stage
               THEN EXCLUDED.note
               ELSE merchant_onboarding_state.note
             END,
             updated_at=NOW()`,
          [
            merchant.merchant_id,
            stage,
            JSON.stringify(readiness || {}),
            shouldAdvance
              ? 'Automatically advanced after objective readiness checks passed. Final approval remains manual.'
              : merchant.note || null,
          ],
        );
        readinessUpdated++;
        if (shouldAdvance) advancedToReview++;
      }

      return { readinessUpdated, advancedToReview };
    });
  }
}

export const automationService = new AutomationService();
