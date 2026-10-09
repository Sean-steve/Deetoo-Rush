import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Merchant Domain Service
 * Implements business logic for merchant lifecycle, branch availability, opening hours,
 * timezone evaluation, spatial service-zone matching, and team authorization.
 */

import crypto from "crypto";
import {
  Merchant,
  MerchantBranch,
  BranchOpeningHour,
  ServiceZone,
  BranchAvailability,
  MerchantStatus,
  MerchantApprovalStatus,
  BranchAdminStatus,
  BranchOperationalStatus,
  MembershipRole,
  MembershipStatus,
  InvitationStatus,
  ServiceZoneStatus,
  UserRole,
  AuditAction,
} from "@deetoo/types";
import { logger } from "@deetoo/utils";
import { AppError } from "../../middleware/error-handler";
import { authRepository } from "../auth/auth.repository";
import { merchantRepository } from "./merchant.repository";
import { getDbPool } from "../../db/client";
import { config } from "@deetoo/config";

export class MerchantService {
  // ==========================================
  // 1. Timezone & Opening Hours Evaluation
  // ==========================================

  /**
   * Evaluates current local day of week (0=Sunday ... 6=Saturday) and HH:mm in branch timezone
   */
  public getLocalTimeInTimezone(
    timezone = "Africa/Nairobi",
    referenceDate = new Date(),
  ): {
    dayOfWeek: number;
    timeString: string;
    isoString: string;
  } {
    try {
      const dayFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
      });
      const timeFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });

      const dayStr = dayFormatter.format(referenceDate);
      const timeStr = timeFormatter.format(referenceDate);

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };

      const dayOfWeek =
        dayMap[dayStr] !== undefined ? dayMap[dayStr] : referenceDate.getDay();

      return {
        dayOfWeek,
        timeString: timeStr,
        isoString: referenceDate.toISOString(),
      };
    } catch {
      // Fallback to UTC if timezone string is invalid
      const hours = String(referenceDate.getUTCHours()).padStart(2, "0");
      const mins = String(referenceDate.getUTCMinutes()).padStart(2, "0");
      return {
        dayOfWeek: referenceDate.getUTCDay(),
        timeString: `${hours}:${mins}`,
        isoString: referenceDate.toISOString(),
      };
    }
  }

  /**
   * Checks whether the given reference time falls within the branch's configured opening hours
   */
  public isWithinOpeningHours(
    openingHours: BranchOpeningHour[],
    timezone = "Africa/Nairobi",
    referenceDate = new Date(),
  ): {
    withinHours: boolean;
    currentLocalTime: string;
    matchedInterval?: BranchOpeningHour;
  } {
    const { dayOfWeek, timeString } = this.getLocalTimeInTimezone(
      timezone,
      referenceDate,
    );

    // Filter hours for current day
    const todaysHours = openingHours.filter((h) => h.day_of_week === dayOfWeek);

    if (todaysHours.length === 0) {
      return { withinHours: false, currentLocalTime: timeString };
    }

    // If marked closed for the whole day
    const closedRecord = todaysHours.find((h) => h.is_closed);
    if (closedRecord && todaysHours.length === 1) {
      return { withinHours: false, currentLocalTime: timeString };
    }

    for (const interval of todaysHours) {
      if (interval.is_closed) continue;
      if (
        interval.open_time <= timeString &&
        timeString < interval.close_time
      ) {
        return {
          withinHours: true,
          currentLocalTime: timeString,
          matchedInterval: interval,
        };
      }
    }

    return { withinHours: false, currentLocalTime: timeString };
  }

  // ==========================================
  // 2. Comprehensive Branch Availability Engine
  // ==========================================

  /**
   * Computes the real-time operational availability of a branch
   * Rule matrix:
   * 1. Merchant must exist, be APPROVED, and be ACTIVE
   * 2. Branch must be administratively ACTIVE (not SUSPENDED/DISABLED)
   * 3. Branch operational_status must be OPEN or BUSY
   * 4. Branch must have at least one active assigned service zone
   * 5. Current local time must fall within configured opening hours
   */
  public async evaluateBranchAvailability(
    branchId: string,
    referenceDate = new Date(),
  ): Promise<BranchAvailability> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "MERCHANT_BRANCH_NOT_FOUND",
        `Branch ${branchId} does not exist`,
      );
    }

    const merchant = await merchantRepository.findMerchantById(
      branch.merchant_id,
    );
    const openingHours = await merchantRepository.getOpeningHours(branchId);
    const assignedZoneIds =
      await merchantRepository.getBranchServiceZones(branchId);
    const allZones = await merchantRepository.listServiceZones();

    const reasons: string[] = [];

    // 1. Merchant Approval & Status
    const merchantApproved =
      merchant?.approval_status === MerchantApprovalStatus.APPROVED;
    if (!merchantApproved) {
      reasons.push(
        `Merchant is not approved (current approval status: ${merchant?.approval_status || "UNKNOWN"})`,
      );
    }

    const merchantActive = merchant?.status === MerchantStatus.ACTIVE;
    if (!merchantActive) {
      reasons.push(
        `Merchant is suspended or disabled (current status: ${merchant?.status || "UNKNOWN"})`,
      );
    }

    // 2. Branch Administrative Status
    const branchActive = branch.status === BranchAdminStatus.ACTIVE;
    if (!branchActive) {
      reasons.push(`Branch is administratively ${branch.status}`);
    }

    // 3. Branch Operational Status
    const opStatus = branch.operational_status;
    const operationalStatusOpen =
      opStatus === BranchOperationalStatus.OPEN ||
      opStatus === BranchOperationalStatus.BUSY;
    if (!operationalStatusOpen) {
      reasons.push(`Branch is operationally ${opStatus}`);
    }

    // 4. Active Service Zone Assignment
    const activeAssignedZones = allZones.filter(
      (z) =>
        assignedZoneIds.includes(z.id) && z.status === ServiceZoneStatus.ACTIVE,
    );
    const hasActiveZone = activeAssignedZones.length > 0;
    if (!hasActiveZone) {
      reasons.push("Branch has no active assigned service zones");
    }

    // 5. Opening Hours Check
    const hoursCheck = this.isWithinOpeningHours(
      openingHours,
      branch.timezone,
      referenceDate,
    );
    const withinHours = hoursCheck.withinHours;
    if (!withinHours) {
      reasons.push(
        `Outside operating hours (local time ${hoursCheck.currentLocalTime} in ${branch.timezone})`,
      );
    }

    // Merchant service/ordering policies have server-side effect, not just UI toggles.
    // This engine currently governs the delivery checkout channel. Pickup/QR flows
    // must acquire their own fulfillment-specific checkout contracts before launch.
    let allowsDelivery = true;
    let withinCapacity = true;
    if (config.storage.mode === "postgres") {
      const policy = await getDbPool().query(
        "SELECT delivery_enabled,max_concurrent_orders FROM merchant_branch_policies WHERE branch_id=$1",
        [branchId],
      );
      if (policy.rows[0]) {
        allowsDelivery = Boolean(policy.rows[0].delivery_enabled);
        if (!allowsDelivery) reasons.push("Merchant has disabled delivery for this branch");
        const active = await getDbPool().query(`
          SELECT COUNT(*)::int AS count FROM orders o
          JOIN payment_capture_evidence e ON e.order_id=o.id
          WHERE o.branch_id=$1 AND o.status IN ('PLACED','ACCEPTED','PREPARING','READY')`,
          [branchId],
        );
        withinCapacity = Number(active.rows[0]?.count || 0) < Number(policy.rows[0].max_concurrent_orders);
        if (!withinCapacity) reasons.push("Branch has reached its concurrent order limit");
      }
    }

    const isAvailable =
      allowsDelivery &&
      withinCapacity &&
      merchantApproved &&
      merchantActive &&
      branchActive &&
      operationalStatusOpen &&
      hasActiveZone &&
      withinHours;

    return {
      is_available: isAvailable,
      reasons,
      merchant_approved: merchantApproved,
      merchant_active: merchantActive,
      branch_active: branchActive,
      has_active_zone: hasActiveZone,
      operational_status_open: operationalStatusOpen,
      within_hours: withinHours,
      current_local_time: hoursCheck.currentLocalTime,
      timezone: branch.timezone,
    };
  }

  // ==========================================
  // 3. Spatial Matching & Point-in-Polygon
  // ==========================================

  /**
   * Ray-casting point-in-polygon algorithm for GeoJSON coordinates: [lng, lat]
   */
  public isPointInPolygon(
    lat: number,
    lng: number,
    ring: [number, number][],
  ): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0]; // lng
      const yi = ring[i][1]; // lat
      const xj = ring[j][0];
      const yj = ring[j][1];

      const intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Haversine formula for distance in kilometers
   */
  public calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Determines active service zones containing a specific coordinate
   */
  public async findZonesForPoint(
    lat: number,
    lng: number,
  ): Promise<ServiceZone[]> {
    // Try PostGIS query first if available
    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const query = `
          SELECT sz.id, sz.name, sz.city_id, sz.status, sz.config
          FROM service_zones sz
          JOIN operating_counties county
            ON county.code = sz.county_code
           AND county.enabled = TRUE
          WHERE sz.status = 'ACTIVE'
            AND sz.boundary IS NOT NULL
            AND ST_Covers(
              sz.boundary::geometry,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geometry
            )
        `;
        const res = await client.query(query, [lng, lat]);
        if (res.rows.length > 0) {
          return res.rows.map((r) => ({
            id: r.id,
            name: r.name,
            city_id: r.city_id,
            status: r.status as ServiceZoneStatus,
            config: r.config,
          }));
        }
      } finally {
        client.release();
      }
    } catch {
      // Fall through to in-memory spatial algorithm
    }

    // Ephemeral geometry evaluation
    const activeZones = await merchantRepository.listServiceZones({
      status: ServiceZoneStatus.ACTIVE,
    });
    const matching: ServiceZone[] = [];

    for (const zone of activeZones) {
      if (!zone.boundary) continue;

      const boundary = zone.boundary as any;
      if (boundary.type === "Polygon" && Array.isArray(boundary.coordinates)) {
        const ring = boundary.coordinates[0];
        if (this.isPointInPolygon(lat, lng, ring)) {
          matching.push(zone);
        }
      }
    }

    return matching;
  }

  /**
   * Find available branches that can service a customer location
   */
  public async findServiceableBranches(
    customerLat: number,
    customerLng: number,
  ): Promise<
    {
      branch: MerchantBranch;
      merchant: Merchant;
      distance_km: number;
      availability: BranchAvailability;
    }[]
  > {
    const customerZones = await this.findZonesForPoint(
      customerLat,
      customerLng,
    );
    const customerZoneIds = new Set(customerZones.map((z) => z.id));

    const allBranches = await merchantRepository.listAllBranches({
      status: BranchAdminStatus.ACTIVE,
    });

    const results: {
      branch: MerchantBranch;
      merchant: Merchant;
      distance_km: number;
      availability: BranchAvailability;
    }[] = [];

    for (const branch of allBranches) {
      const merchant = await merchantRepository.findMerchantById(
        branch.merchant_id,
      );
      if (
        !merchant ||
        merchant.status !== MerchantStatus.ACTIVE ||
        merchant.approval_status !== MerchantApprovalStatus.APPROVED
      ) {
        continue;
      }

      const branchZones = await merchantRepository.getBranchServiceZones(
        branch.id,
      );
      const sharesZone = branchZones.some((zid) => customerZoneIds.has(zid));

      const dist = this.calculateDistanceKm(
        customerLat,
        customerLng,
        branch.latitude,
        branch.longitude,
      );

      // Delivery eligibility is polygon-authoritative. Distance can rank an
      // already-serviceable branch, but must never widen the service boundary.
      if (sharesZone) {
        const availability = await this.evaluateBranchAvailability(branch.id);
        results.push({
          branch,
          merchant,
          distance_km: Math.round(dist * 10) / 10,
          availability,
        });
      }
    }

    return results.sort((a, b) => a.distance_km - b.distance_km);
  }

  // ==========================================
  // 4. Merchant Lifecycle Transitions & Approvals
  // ==========================================

  public async approveMerchant(
    merchantId: string,
    actorUserId: string,
    note?: string,
  ): Promise<Merchant> {
    const merchant = await merchantRepository.findMerchantById(merchantId);
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        `Merchant ${merchantId} not found`,
      );
    }

    if (merchant.approval_status === MerchantApprovalStatus.APPROVED) {
      return merchant;
    }

    const updated = await merchantRepository.updateMerchant(merchantId, {
      approval_status: MerchantApprovalStatus.APPROVED,
      rejection_reason: undefined,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.MERCHANT_APPROVED,
      resource_type: "MERCHANT",
      resource_id: merchantId,
      reason: note || "Merchant application reviewed and approved",
      metadata: { previous_status: merchant.approval_status },
    });

    return updated!;
  }

  public async rejectMerchant(
    merchantId: string,
    actorUserId: string,
    reason: string,
  ): Promise<Merchant> {
    const merchant = await merchantRepository.findMerchantById(merchantId);
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        `Merchant ${merchantId} not found`,
      );
    }

    const updated = await merchantRepository.updateMerchant(merchantId, {
      approval_status: MerchantApprovalStatus.REJECTED,
      rejection_reason: reason,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.MERCHANT_REJECTED,
      resource_type: "MERCHANT",
      resource_id: merchantId,
      reason,
      metadata: { previous_status: merchant.approval_status },
    });

    return updated!;
  }

  public async suspendMerchant(
    merchantId: string,
    actorUserId: string,
    reason: string,
  ): Promise<Merchant> {
    const merchant = await merchantRepository.findMerchantById(merchantId);
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        `Merchant ${merchantId} not found`,
      );
    }

    const updated = await merchantRepository.updateMerchant(merchantId, {
      status: MerchantStatus.SUSPENDED,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.MERCHANT_SUSPENDED,
      resource_type: "MERCHANT",
      resource_id: merchantId,
      reason,
    });

    return updated!;
  }

  public async reactivateMerchant(
    merchantId: string,
    actorUserId: string,
  ): Promise<Merchant> {
    const merchant = await merchantRepository.findMerchantById(merchantId);
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        `Merchant ${merchantId} not found`,
      );
    }

    const updated = await merchantRepository.updateMerchant(merchantId, {
      status: MerchantStatus.ACTIVE,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.MERCHANT_REACTIVATED,
      resource_type: "MERCHANT",
      resource_id: merchantId,
      reason: "Merchant reactivated by administrator",
    });

    return updated!;
  }

  // ==========================================
  // 5. Branch Status & Operations
  // ==========================================

  public async updateBranchOperationalStatus(
    branchId: string,
    operationalStatus: BranchOperationalStatus,
    actorUserId: string,
    reason?: string,
  ): Promise<MerchantBranch> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        `Branch ${branchId} not found`,
      );
    }

    const merchant = await merchantRepository.findMerchantById(
      branch.merchant_id,
    );
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        "Parent merchant not found",
      );
    }

    // Invariant: If branch is administratively SUSPENDED or merchant is SUSPENDED, cannot OPEN branch
    if (
      (branch.status === BranchAdminStatus.SUSPENDED ||
        merchant.status === MerchantStatus.SUSPENDED) &&
      (operationalStatus === BranchOperationalStatus.OPEN ||
        operationalStatus === BranchOperationalStatus.BUSY)
    ) {
      throw new AppError(
        409,
        "BRANCH_OPERATION_BLOCKED",
        "Cannot open branch while branch or merchant is administratively suspended",
      );
    }

    const updated = await merchantRepository.updateBranch(branchId, {
      operational_status: operationalStatus,
    });

    const actionMap: Record<BranchOperationalStatus, AuditAction> = {
      [BranchOperationalStatus.OPEN]: AuditAction.BRANCH_OPENED,
      [BranchOperationalStatus.CLOSED]: AuditAction.BRANCH_CLOSED,
      [BranchOperationalStatus.BUSY]: AuditAction.BRANCH_MARKED_BUSY,
      [BranchOperationalStatus.PAUSED]: AuditAction.BRANCH_MARKED_UNAVAILABLE,
      [BranchOperationalStatus.TEMPORARILY_UNAVAILABLE]:
        AuditAction.BRANCH_MARKED_UNAVAILABLE,
    };

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: actionMap[operationalStatus] || AuditAction.BRANCH_UPDATED,
      resource_type: "BRANCH",
      resource_id: branchId,
      reason,
      metadata: {
        previous_operational_status: branch.operational_status,
        new_operational_status: operationalStatus,
      },
    });

    return updated!;
  }

  public async suspendBranch(
    branchId: string,
    actorUserId: string,
    reason: string,
  ): Promise<MerchantBranch> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        `Branch ${branchId} not found`,
      );
    }

    const updated = await merchantRepository.updateBranch(branchId, {
      status: BranchAdminStatus.SUSPENDED,
      operational_status: BranchOperationalStatus.CLOSED,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.BRANCH_SUSPENDED,
      resource_type: "BRANCH",
      resource_id: branchId,
      reason,
    });

    return updated!;
  }

  public async reactivateBranch(
    branchId: string,
    actorUserId: string,
  ): Promise<MerchantBranch> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        `Branch ${branchId} not found`,
      );
    }

    const updated = await merchantRepository.updateBranch(branchId, {
      status: BranchAdminStatus.ACTIVE,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.ADMIN,
      action: AuditAction.BRANCH_REACTIVATED,
      resource_type: "BRANCH",
      resource_id: branchId,
      reason: "Branch reactivated by admin",
    });

    return updated!;
  }

  // ==========================================
  // 6. Access Scoping & Permissions
  // ==========================================

  public async checkUserMerchantAccess(
    userId: string,
    roles: UserRole[],
    merchantId: string,
  ): Promise<boolean> {
    // Admin, Ops, and Support have global read/write access
    if (
      roles.includes(UserRole.ADMIN) ||
      roles.includes(UserRole.OPS) ||
      roles.includes(UserRole.SUPPORT)
    ) {
      return true;
    }

    const memberships = await merchantRepository.getMembershipsForUser(userId);
    return memberships.some(
      (m) =>
        m.merchant_id === merchantId && m.status === MembershipStatus.ACTIVE,
    );
  }

  public async checkUserBranchAccess(
    userId: string,
    roles: UserRole[],
    branchId: string,
  ): Promise<boolean> {
    if (
      roles.includes(UserRole.ADMIN) ||
      roles.includes(UserRole.OPS) ||
      roles.includes(UserRole.SUPPORT)
    ) {
      return true;
    }

    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) return false;

    const memberships = await merchantRepository.getMembershipsForUser(userId);
    const membership = memberships.find(
      (m) =>
        m.merchant_id === branch.merchant_id &&
        m.status === MembershipStatus.ACTIVE,
    );

    if (!membership) return false;

    // Merchant owner has access to all branches of their merchant
    if (membership.role_code === MembershipRole.MERCHANT_OWNER) {
      return true;
    }

    // Managers and staff must be assigned to this branch
    return membership.branch_ids.includes(branchId);
  }

  // ==========================================
  // 7. Staff Invitations & Membership
  // ==========================================

  public async inviteStaff(params: {
    merchantId: string;
    email: string;
    phone_e164?: string;
    role_code: MembershipRole;
    branch_ids?: string[];
    actorUserId: string;
    actorRoles: UserRole[];
  }) {
    const merchant = await merchantRepository.findMerchantById(
      params.merchantId,
    );
    if (!merchant) {
      throw new AppError(404, "MERCHANT_NOT_FOUND", "Merchant does not exist");
    }

    // Role Hierarchy enforcement:
    // Only Merchant Owner or Admin can invite other owners or managers
    const actorMemberships = await merchantRepository.getMembershipsForUser(
      params.actorUserId,
    );
    const actorMem = actorMemberships.find(
      (m) => m.merchant_id === params.merchantId,
    );

    const isPlatformAdmin = params.actorRoles.includes(UserRole.ADMIN);
    const isOwner = actorMem?.role_code === MembershipRole.MERCHANT_OWNER;
    const isManager = actorMem?.role_code === MembershipRole.MERCHANT_MANAGER;

    if (!isPlatformAdmin && !isOwner && !isManager) {
      throw new AppError(
        403,
        "FORBIDDEN_OPERATION",
        "You do not have permission to invite staff",
      );
    }

    if (isManager && params.role_code !== MembershipRole.MERCHANT_STAFF) {
      throw new AppError(
        403,
        "FORBIDDEN_OPERATION",
        "Managers may only invite branch staff; owner approval is required for elevated roles",
      );
    }

    // Validate that branch_ids belong to this merchant
    const merchantBranches = await merchantRepository.listBranchesByMerchant(
      params.merchantId,
    );
    const validBranchIds = new Set(merchantBranches.map((b) => b.id));

    if (params.branch_ids && params.branch_ids.length > 0) {
      for (const bid of params.branch_ids) {
        if (!validBranchIds.has(bid)) {
          throw new AppError(
            400,
            "INVALID_BRANCH_ID",
            `Branch ${bid} does not belong to this merchant`,
          );
        }
      }
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const invitation = await merchantRepository.createInvitation({
      id: crypto.randomUUID(),
      merchant_id: params.merchantId,
      email: params.email.toLowerCase(),
      phone_e164: params.phone_e164,
      role_code: params.role_code,
      branch_ids: params.branch_ids || [],
      invitation_token: token,
      status: InvitationStatus.PENDING,
      expires_at: expiresAt,
      invited_by_user_id: params.actorUserId,
      created_at: new Date().toISOString(),
    });

    await authRepository.createAuditLog({
      actor_user_id: params.actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.MERCHANT_MEMBER_INVITED,
      resource_type: "MERCHANT",
      resource_id: params.merchantId,
      metadata: {
        email: params.email,
        role_code: params.role_code,
        branches: params.branch_ids,
      },
    });

    return invitation;
  }

  public async acceptInvitation(token: string, userId: string): Promise<void> {
    const invitation = await merchantRepository.findInvitationByToken(token);
    if (!invitation) {
      throw new AppError(
        404,
        "INVITATION_NOT_FOUND",
        "Invalid or expired invitation token",
      );
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new AppError(
        400,
        "INVITATION_INVALID",
        `Invitation is already ${invitation.status}`,
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await merchantRepository.updateInvitation(token, {
        status: InvitationStatus.EXPIRED,
      });
      throw new AppError(
        410,
        "INVITATION_EXPIRED",
        "This invitation has expired",
      );
    }

    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    if (
      !user.email ||
      user.email.toLowerCase() !== invitation.email.toLowerCase()
    ) {
      throw new AppError(
        403,
        "INVITATION_RECIPIENT",
        "Invitation belongs to another account",
      );
    }

    // Create membership
    await merchantRepository.createMembership({
      id: crypto.randomUUID(),
      merchant_id: invitation.merchant_id,
      user_id: userId,
      user_email: user.email || undefined,
      user_name: user.email ? user.email.split("@")[0] : "Merchant Member",
      role_code: invitation.role_code,
      status: MembershipStatus.ACTIVE,
      branch_ids: invitation.branch_ids,
      created_at: new Date().toISOString(),
    });

    // Assign role to user if not already assigned
    const roleMapping: Record<MembershipRole, UserRole> = {
      [MembershipRole.MERCHANT_OWNER]: UserRole.MERCHANT_OWNER,
      [MembershipRole.MERCHANT_MANAGER]: UserRole.MERCHANT_MANAGER,
      [MembershipRole.MERCHANT_STAFF]: UserRole.MERCHANT_STAFF,
    };

    const targetRole = roleMapping[invitation.role_code] || UserRole.MERCHANT;
    const existingRoles = await authRepository.getUserRoles(userId);
    const newRoles = Array.from(
      new Set([...existingRoles, targetRole, UserRole.MERCHANT]),
    );
    await authRepository.setUserRoles(userId, newRoles);

    // Update invitation status
    await merchantRepository.updateInvitation(token, {
      status: InvitationStatus.ACCEPTED,
    });
  }

  public async revokeMembership(
    membershipId: string,
    actorUserId: string,
  ): Promise<void> {
    const membership =
      await merchantRepository.findMembershipById(membershipId);
    if (!membership) {
      throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found");
    }

    if (membership.user_id === actorUserId) {
      throw new AppError(409, "SELF_REVOCATION_FORBIDDEN", "Owners cannot revoke their own last administrative access");
    }
    if (membership.role_code === MembershipRole.MERCHANT_OWNER && membership.status === MembershipStatus.ACTIVE) {
      const all = await merchantRepository.listMembershipsByMerchant(membership.merchant_id);
      const remaining = all.filter(m => m.id !== membership.id && m.role_code === MembershipRole.MERCHANT_OWNER && m.status === MembershipStatus.ACTIVE);
      if (remaining.length === 0) {
        throw new AppError(409, "LAST_OWNER_REQUIRED", "A merchant must retain at least one active owner");
      }
    }
    await merchantRepository.updateMembership(membershipId, {
      status: MembershipStatus.REVOKED,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.MERCHANT_MEMBER_REVOKED,
      resource_type: "MERCHANT_MEMBERSHIP",
      resource_id: membershipId,
      metadata: {
        merchant_id: membership.merchant_id,
        target_user_id: membership.user_id,
      },
    });
  }
}

export const merchantService = transactionalService(new MerchantService());
