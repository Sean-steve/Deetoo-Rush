import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { operationsRepository } from './operations.repository';

export class ControlTowerService {
  async snapshot() {
    const [{ incidents }, { cases }, { signals }] = await Promise.all([
      operationsRepository.findIncidents({ limit: 1000 }),
      operationsRepository.findSupportCases({ limit: 1000 }),
      operationsRepository.findRiskSignals({ limit: 1000 }),
    ]);
    const operational = {
      open_incidents: incidents.filter((x) => !['RESOLVED','DISMISSED'].includes(x.status)).length,
      critical_incidents: incidents.filter((x) => x.severity === 'CRITICAL' && !['RESOLVED','DISMISSED'].includes(x.status)).length,
      open_support_cases: cases.filter((x) => !['RESOLVED','CLOSED'].includes(x.status)).length,
      open_risk_signals: signals.filter((x) => x.status === 'OPEN').length,
    };

    if (config.storage.mode !== 'postgres') {
      return {
        fixture_mode: true,
        generated_at: new Date().toISOString(),
        orders: { active: 0, today: 0, completed_today: 0, cancelled_today: 0, gmv_today_minor: 0 },
        deliveries: { active: 0, unassigned: 0, delayed: 0 },
        riders: { approved: 0, online: 0, available: 0, busy: 0, suspended: 0 },
        merchants: { approved: 0, open_branches: 0, paused_branches: 0 },
        payments: { captured_today: 0, failed_today: 0 },
        finance: { contribution_today_minor: 0, merchant_settlements_processing: 0, rider_payouts_processing: 0 },
        operational,
      };
    }

    const pool=getDbPool();
    const [orders,deliveries,riders,merchants,payments,finance]=await Promise.all([
      pool.query(`SELECT
        count(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED','REJECTED'))::int AS active,
        count(*) FILTER (WHERE created_at::date=CURRENT_DATE)::int AS today,
        count(*) FILTER (WHERE status='COMPLETED' AND completed_at::date=CURRENT_DATE)::int AS completed_today,
        count(*) FILTER (WHERE status IN ('CANCELLED','REJECTED') AND created_at::date=CURRENT_DATE)::int AS cancelled_today,
        COALESCE(sum(total_minor) FILTER (WHERE created_at::date=CURRENT_DATE AND status<>'PENDING_PAYMENT'),0)::bigint AS gmv_today_minor
        FROM orders`),
      pool.query(`SELECT
        count(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED','FAILED'))::int AS active,
        count(*) FILTER (WHERE status IN ('UNASSIGNED','OFFERED'))::int AS unassigned,
        count(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED','FAILED') AND created_at < now()-interval '20 minutes')::int AS delayed
        FROM deliveries`),
      pool.query(`SELECT
        count(*) FILTER (WHERE onboarding_status='APPROVED')::int AS approved,
        count(*) FILTER (WHERE work_status<>'OFFLINE' AND operational_status='ACTIVE')::int AS online,
        count(*) FILTER (WHERE work_status='ONLINE_AVAILABLE' AND operational_status='ACTIVE')::int AS available,
        count(*) FILTER (WHERE work_status='BUSY' AND operational_status='ACTIVE')::int AS busy,
        count(*) FILTER (WHERE operational_status='SUSPENDED')::int AS suspended
        FROM rider_profiles`),
      pool.query(`SELECT
        (SELECT count(*)::int FROM merchants WHERE approval_status='APPROVED' AND status='ACTIVE') AS approved,
        count(*) FILTER (WHERE operational_status='OPEN')::int AS open_branches,
        count(*) FILTER (WHERE operational_status IN ('PAUSED','BUSY','TEMPORARILY_UNAVAILABLE'))::int AS paused_branches
        FROM merchant_branches`),
      pool.query(`SELECT
        count(*) FILTER (WHERE status='CAPTURED' AND captured_at::date=CURRENT_DATE)::int AS captured_today,
        count(*) FILTER (WHERE status='FAILED' AND created_at::date=CURRENT_DATE)::int AS failed_today
        FROM payments`),
      pool.query(`SELECT
        COALESCE((SELECT sum(contribution_profit_minor) FROM order_financial_summaries WHERE calculated_at::date=CURRENT_DATE),0)::bigint AS contribution_today_minor,
        (SELECT count(*)::int FROM merchant_settlements WHERE status='PROCESSING') AS merchant_settlements_processing,
        (SELECT count(*)::int FROM rider_payouts WHERE status='PROCESSING') AS rider_payouts_processing`),
    ]);

    const normalize=(row:any)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):Number.isNaN(Number(v))?v:Number(v)]));
    return {
      fixture_mode:false,
      generated_at:new Date().toISOString(),
      orders:normalize(orders.rows[0]),
      deliveries:normalize(deliveries.rows[0]),
      riders:normalize(riders.rows[0]),
      merchants:normalize(merchants.rows[0]),
      payments:normalize(payments.rows[0]),
      finance:normalize(finance.rows[0]),
      operational,
    };
  }

  async supplyByZone(){
    if(config.storage.mode!=='postgres') return [];
    const res=await getDbPool().query(`WITH rider_supply AS (
      SELECT rsz.zone_id,
        count(*) FILTER (WHERE rp.work_status='ONLINE_AVAILABLE' AND rp.operational_status='ACTIVE')::int AS available_riders,
        count(*) FILTER (WHERE rp.work_status='BUSY' AND rp.operational_status='ACTIVE')::int AS busy_riders
      FROM rider_service_zones rsz JOIN rider_profiles rp ON rp.id=rsz.rider_id
      GROUP BY rsz.zone_id
    ), demand AS (
      SELECT bsz.service_zone_id AS zone_id,
        count(*) FILTER (WHERE d.status IN ('UNASSIGNED','OFFERED'))::int AS unassigned_deliveries,
        count(*) FILTER (WHERE d.status NOT IN ('DELIVERED','CANCELLED','FAILED'))::int AS active_deliveries
      FROM branch_service_zones bsz
      LEFT JOIN deliveries d ON d.branch_id=bsz.branch_id
      GROUP BY bsz.service_zone_id
    )
    SELECT z.id AS zone_id,z.name,
      COALESCE(s.available_riders,0)::int AS available_riders,
      COALESCE(s.busy_riders,0)::int AS busy_riders,
      COALESCE(d.unassigned_deliveries,0)::int AS unassigned_deliveries,
      COALESCE(d.active_deliveries,0)::int AS active_deliveries,
      (COALESCE(s.available_riders,0)-COALESCE(d.unassigned_deliveries,0))::int AS supply_gap
    FROM service_zones z
    LEFT JOIN rider_supply s ON s.zone_id=z.id
    LEFT JOIN demand d ON d.zone_id=z.id
    WHERE z.status='ACTIVE'
    ORDER BY supply_gap ASC,z.name ASC`);
    return res.rows;
  }
}

export const controlTowerService=new ControlTowerService();
