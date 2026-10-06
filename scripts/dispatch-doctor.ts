import { config } from '@deetoo/config';
import { getDbPool, closeDbPool } from '../apps/api/src/db/client';
import { riderLocationStore } from '../apps/api/src/db/redis';
import { operationsRepository } from '../apps/api/src/modules/operations/operations.repository';
import { riderEligibilityService } from '../apps/api/src/modules/rider/rider-eligibility.service';
import { deliveryRepository } from '../apps/api/src/modules/order/delivery.repository';
import { dispatchService } from '../apps/api/src/modules/order/dispatch.service';

if (config.storage.mode !== 'postgres') {
  throw new Error('dispatch:doctor requires PostgreSQL storage');
}

const db = getDbPool();

try {
  const availableRiderIds = await riderLocationStore.listAvailableRiders();
  const paused = await operationsRepository.isKillSwitchActive('auto_dispatch_paused');

  const riders = await db.query(`
    SELECT
      rp.id,
      rp.user_id,
      rp.first_name,
      rp.last_name,
      rp.onboarding_status,
      rp.operational_status,
      rp.work_status,
      rp.last_known_latitude,
      rp.last_known_longitude,
      rp.last_location_at,
      COALESCE(
        (
          SELECT array_agg(rsz.zone_id ORDER BY rsz.zone_id)
          FROM rider_service_zones rsz
          WHERE rsz.rider_id=rp.id
        ),
        ARRAY[]::uuid[]
      ) AS zone_ids
    FROM rider_profiles rp
    WHERE rp.work_status IN ('ONLINE_AVAILABLE','ONLINE_UNAVAILABLE','BUSY')
    ORDER BY rp.updated_at DESC
    LIMIT 50
  `);

  const riderRows = [];
  for (const row of riders.rows) {
    const live = await riderLocationStore.getLiveLocation(row.id);
    const eligibility = await riderEligibilityService.isRiderEligibleForDispatch(row.id);
    const activeDelivery = await deliveryRepository.findActiveByRiderId(row.id);
    riderRows.push({
      rider_id: row.id,
      user_id: row.user_id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      onboarding: row.onboarding_status,
      operational: row.operational_status,
      work_status: row.work_status,
      in_redis_available_geo: availableRiderIds.includes(row.id),
      dispatch_eligible: eligibility.eligible,
      eligibility_reasons: eligibility.reasons.join(',') || 'NONE',
      vehicle_valid: eligibility.details.vehicleValid,
      user_active: eligibility.details.userActive,
      zone_valid: eligibility.details.zoneValid,
      location_fresh: eligibility.details.locationFresh,
      active_delivery_id: activeDelivery?.id || null,
      active_delivery_status: activeDelivery?.status || null,
      zones: row.zone_ids,
      db_last_location_at: row.last_location_at,
      live_location: live
        ? `${live.latitude},${live.longitude}`
        : null,
      live_accuracy_m: live?.accuracyMeters ?? null,
      live_age_seconds: live
        ? Math.max(0, Math.round((Date.now() - new Date(live.receivedAt).getTime()) / 1000))
        : null,
    });
  }

  const deliveries = await db.query(`
    SELECT
      d.id AS delivery_id,
      d.order_id,
      d.status,
      d.assigned_rider_id,
      d.dispatch_not_before,
      d.dispatch_started_at,
      d.dispatch_cycle_count,
      d.current_search_radius_meters,
      d.dispatch_attention_required,
      d.attention_reason,
      d.pickup_latitude,
      d.pickup_longitude,
      d.created_at,
      (
        SELECT count(*)::int
        FROM delivery_offers o
        WHERE o.delivery_id=d.id
      ) AS offer_count,
      (
        SELECT o.status
        FROM delivery_offers o
        WHERE o.delivery_id=d.id
        ORDER BY o.offered_at DESC
        LIMIT 1
      ) AS latest_offer_status,
      (
        SELECT o.rider_id
        FROM delivery_offers o
        WHERE o.delivery_id=d.id
        ORDER BY o.offered_at DESC
        LIMIT 1
      ) AS latest_offer_rider_id,
      (
        SELECT o.expires_at
        FROM delivery_offers o
        WHERE o.delivery_id=d.id
        ORDER BY o.offered_at DESC
        LIMIT 1
      ) AS latest_offer_expires_at
    FROM deliveries d
    WHERE d.status IN ('UNASSIGNED','OFFERED','ASSIGNED')
    ORDER BY d.created_at DESC
    LIMIT 50
  `);

  console.log('DeeToo dispatch diagnostics');
  console.log(JSON.stringify({
    environment: config.environment,
    storageMode: config.storage.mode,
    localWorkflow: config.localWorkflow,
    autoDispatchPaused: paused,
    googleRoutesConfigured: Boolean(process.env.GOOGLE_ROUTES_API_KEY),
    routingMode: config.localWorkflow ? 'SIMULATION_LOCAL_WORKFLOW' :
      process.env.GOOGLE_ROUTES_API_KEY ? 'GOOGLE_ROUTES' : 'BLOCKED_NO_PROVIDER',
    redisAvailableRiderCount: availableRiderIds.length,
  }, null, 2));

  console.log('\nRiders visible to dispatch:');
  if (riderRows.length) console.table(riderRows);
  else console.log('No online/busy Riders found in PostgreSQL.');

  console.log('\nOpen deliveries:');
  if (deliveries.rows.length) console.table(deliveries.rows);
  else console.log('No UNASSIGNED/OFFERED/ASSIGNED deliveries found.');

  const eligibleNow = deliveries.rows.filter((delivery) =>
    ['UNASSIGNED', 'OFFERED'].includes(delivery.status) &&
    (!delivery.dispatch_not_before ||
      new Date(delivery.dispatch_not_before).getTime() <= Date.now())
  );

  if (eligibleNow.length) {
    console.log('\nRead-only candidate checks for dispatchable deliveries:');
    for (const delivery of eligibleNow.slice(0, 10)) {
      const candidates = await dispatchService.findAndRankCandidates(
        {
          lat: Number(delivery.pickup_latitude),
          lng: Number(delivery.pickup_longitude),
        },
        Number(delivery.current_search_radius_meters || config.dispatch.maxSearchRadius),
      );
      console.log(JSON.stringify({
        delivery_id: delivery.delivery_id,
        status: delivery.status,
        radius_m: Number(delivery.current_search_radius_meters || config.dispatch.maxSearchRadius),
        candidate_count: candidates.length,
        candidates: candidates.map((candidate) => ({
          rider_id: candidate.riderId,
          rider_name: candidate.riderName,
          distance_m: candidate.distanceToPickupMeters,
          eta_seconds: candidate.estimatedPickupEtaSeconds,
          score: candidate.score,
        })),
      }, null, 2));
    }
  } else {
    console.log('\nNo delivery is currently past dispatch_not_before.');
  }

  if (!availableRiderIds.length) {
    console.warn(
      '\nNo Rider is currently present in the Redis available geo index. ' +
      'Open the Rider app, go online, and keep GPS fresh.',
    );
  }

  if (paused) {
    console.warn('\nAuto-dispatch is paused by the auto_dispatch_paused kill switch.');
  }

  if (!config.localWorkflow && !process.env.GOOGLE_ROUTES_API_KEY) {
    console.warn(
      '\nDurable dispatch has no routing provider. Set GOOGLE_ROUTES_API_KEY, ' +
      'or use DEETOO_LOCAL_WORKFLOW=true only for local development.',
    );
  }
} finally {
  await closeDbPool();
}
