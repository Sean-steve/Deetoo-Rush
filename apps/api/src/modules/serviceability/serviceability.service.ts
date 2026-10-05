import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Central Serviceability Service
 * Computes location-based marketplace eligibility using PostGIS polygons (ADR-002, DEE-DOM-001)
 */

import { ServiceabilityCheckResult, ServiceabilityReasonCode, ServiceZone, ServiceZoneStatus, BranchAdminStatus, MerchantStatus, MerchantApprovalStatus } from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { logger } from '@deetoo/utils';

export class ServiceabilityService {
  /**
   * Central Serviceability Evaluation:
   * 1. Validates coordinate bounds
   * 2. Finds active service zones containing coordinate (via PostGIS ST_Contains or in-memory fallback)
   * 3. Evaluates merchant approval, active status, and branch assignment
   * 4. Returns deterministic reason codes
   */
  public async checkServiceability(lat: number, lng: number): Promise<ServiceabilityCheckResult> {
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        serviceable: false,
        zone_id: null,
        zone_name: null,
        reason_code: 'LOCATION_REQUIRED',
        eligible_branch_count: 0,
        customer_location: { latitude: lat, longitude: lng },
      };
    }

    // 1. Find active zones for coordinate
    const zones = await merchantService.findZonesForPoint(lat, lng);
    const activeZone = zones.find((z) => z.status === ServiceZoneStatus.ACTIVE);

    if (!activeZone) {
      return {
        serviceable: false,
        zone_id: null,
        zone_name: null,
        reason_code: 'OUTSIDE_SERVICE_AREA',
        eligible_branch_count: 0,
        customer_location: { latitude: lat, longitude: lng },
      };
    }

    // 2. Count eligible branches in this zone
    const allBranches = await merchantRepository.listAllBranches({
      status: BranchAdminStatus.ACTIVE,
    });

    let eligibleCount = 0;

    for (const branch of allBranches) {
      const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
      if (
        !merchant ||
        merchant.status !== MerchantStatus.ACTIVE ||
        merchant.approval_status !== MerchantApprovalStatus.APPROVED
      ) {
        continue;
      }

      const branchZones = await merchantRepository.getBranchServiceZones(branch.id);
      if (branchZones.includes(activeZone.id)) {
        eligibleCount++;
      }
    }

    if (eligibleCount === 0) {
      return {
        serviceable: false,
        zone_id: activeZone.id,
        zone_name: activeZone.name,
        reason_code: 'NO_ACTIVE_BRANCHES',
        eligible_branch_count: 0,
        customer_location: { latitude: lat, longitude: lng },
      };
    }

    return {
      serviceable: true,
      zone_id: activeZone.id,
      zone_name: activeZone.name,
      reason_code: 'SERVICEABLE',
      eligible_branch_count: eligibleCount,
      customer_location: { latitude: lat, longitude: lng },
    };
  }
}

export const serviceabilityService = transactionalService(new ServiceabilityService());
