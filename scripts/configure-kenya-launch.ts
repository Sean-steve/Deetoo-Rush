import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getDbPool, closeDbPool } from '../apps/api/src/db/client';
import { withTransaction } from '../apps/api/src/db/transaction';
import { authRepository } from '../apps/api/src/modules/auth/auth.repository';
import { riderService } from '../apps/api/src/modules/rider/rider.service';
import { config } from '../packages/config/src/index';
import { UserRole } from '../packages/types/src/index';

// Explicit operator command. Never run automatically at boot or during migrations.
const actor = process.env.DEETOO_CONFIG_ACTOR_ID;
try {
  if (config.storage.mode !== 'postgres' || config.storage.fixtures) throw new Error('Requires durable non-fixture storage');
  if (!actor || !(await authRepository.getUserRoles(actor)).includes(UserRole.ADMIN)) throw new Error('An existing administrator actor is required');
  const boundary = JSON.parse(await readFile(new URL('../docs/configuration/kenya-boundary.geojson', import.meta.url), 'utf8'));
  await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('deetoo.kenya-launch-configuration'))");
    const valid = await client.query('SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS valid', [JSON.stringify(boundary)]);
    if (!valid.rows[0].valid) throw new Error('Invalid Kenya boundary');
    // Legacy imports mixed approval/work statuses into operational status fields.
    // Preserve existing approvals and work status; never approve pending accounts here.
    await client.query("UPDATE merchants SET status='ACTIVE' WHERE status='APPROVED' AND approval_status='APPROVED'");
    await client.query("UPDATE rider_profiles SET operational_status='ACTIVE' WHERE operational_status='OFFLINE' AND onboarding_status='APPROVED'");
    const existing = await client.query("SELECT id FROM service_zones WHERE name='Kenya Nationwide' AND city_id='KE' FOR UPDATE");
    const zoneId = existing.rows[0]?.id || randomUUID();
    await client.query(`INSERT INTO service_zones(id,name,status,city_id,config,boundary)
      VALUES($1,'Kenya Nationwide','ACTIVE','KE',$2,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3),4326))::geography)
      ON CONFLICT(id) DO UPDATE SET status='ACTIVE',boundary=EXCLUDED.boundary,config=EXCLUDED.config`,
      [zoneId, {source:'RCMRD GeoPortal / geoBoundaries KEN ADM0 (9469f09), public domain',scope:'Kenya nationwide; user authorized 2026-09-23'}, JSON.stringify(boundary)]);
    await client.query(`INSERT INTO branch_service_zones(branch_id,service_zone_id,status)
      SELECT b.id,$1,'ACTIVE' FROM merchant_branches b JOIN merchants m ON m.id=b.merchant_id
      WHERE b.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED'
      ON CONFLICT(branch_id,service_zone_id) DO UPDATE SET status='ACTIVE'`, [zoneId]);
    const riders = await client.query(`SELECT r.id,COALESCE(jsonb_agg(z.zone_id) FILTER(WHERE z.zone_id IS NOT NULL),'[]') AS zones
      FROM rider_profiles r LEFT JOIN rider_service_zones z ON z.rider_id=r.id
      WHERE r.onboarding_status='APPROVED' AND r.operational_status NOT IN ('SUSPENDED','DISABLED') GROUP BY r.id`);
    for (const rider of riders.rows) {
      if (!rider.zones.includes(zoneId)) await riderService.assignServiceZones(actor, rider.id, [...rider.zones, zoneId]);
    }
    // Preserve merchant-specific contractual overrides; configure the approved default only.
    const rule = await client.query("SELECT id,percentage_rate,fixed_fee_minor FROM merchant_commission_rules WHERE merchant_id IS NULL AND status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now()) ORDER BY effective_from DESC LIMIT 1");
    if (!rule.rows[0] || Number(rule.rows[0].percentage_rate) !== 0.10 || Number(rule.rows[0].fixed_fee_minor) !== 0) {
      await client.query("UPDATE merchant_commission_rules SET effective_until=now(),status='INACTIVE' WHERE merchant_id IS NULL AND status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now())");
      await client.query("INSERT INTO merchant_commission_rules(id,merchant_id,percentage_rate,fixed_fee_minor,effective_from,status) VALUES($1,NULL,0.10,0,now(),'ACTIVE')", [randomUUID()]);
    }
    await client.query(`UPDATE merchants m SET commission_bps=1000 WHERE NOT EXISTS
      (SELECT 1 FROM merchant_commission_rules r WHERE r.merchant_id=m.id AND r.status='ACTIVE' AND r.effective_from<=now() AND (r.effective_until IS NULL OR r.effective_until>now()))`);
    await authRepository.createAuditLog({actor_user_id:actor,actor_role:UserRole.ADMIN,action:'LAUNCH_CONFIGURATION_APPLIED',resource_type:'SERVICE_ZONE',resource_id:zoneId,metadata:{coverage:'Kenya nationwide',defaultCommissionBps:1000,fixedFeeMinor:0,source:'Explicit user request 2026-09-23'}});
    console.log('Kenya coverage, eligible branch/Rider assignments and 10% default commission configured.');
  });
} finally {
  await closeDbPool();
}
