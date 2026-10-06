import { scopedResponseMiddleware } from '../../middleware/scoped-response';
import { withTransaction } from '../../db/transaction';
import { config } from '@deetoo/config';
const identityCommand = <T>(work: () => Promise<T>) => config.storage.mode === 'postgres' ? withTransaction(work) : work();
/**
 * DEETOO - Administration & Operations Router
 * Implements user management, account suspension/reactivation, role assignment, and audit inspection
 */

import { Router, Response, NextFunction } from 'express';
import {
  ApiResponse,
  UserRole,
  UserStatus,
  AuditAction,
  MerchantStatus,
  MerchantApprovalStatus,
  BranchAdminStatus,
  BranchOperationalStatus,
  ServiceZoneStatus,
} from '@deetoo/types';
import {
  CreateMerchantSchema,
  UpdateMerchantSchema,
  AdminApproveMerchantSchema,
  AdminRejectMerchantSchema,
  CreateBranchSchema,
  UpdateBranchSchema,
  BranchAdminStatusSchema,
  ServiceZoneSchema,
  AssignBranchZonesSchema,
  OrderCancelSchema,
  RiderApprovalSchema,
  RiderRejectionSchema,
  RiderSuspensionSchema,
  RiderZoneAssignmentSchema,
  AdminManualAssignSchema,
  AdminUnassignDeliverySchema,
  DispatchConfigUpdateSchema,
  AdminForceCompleteDeliverySchema,
  AdminResolveIncidentSchema,
} from '@deetoo/validation';
import { PERMISSIONS } from '@deetoo/auth';
import { AppError } from '../../middleware/error-handler';
import { authRepository } from '../auth/auth.repository';
import { authService } from '../auth/auth.service';
import { governanceService } from './governance.service';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { merchantOnboardingService, MerchantOnboardingStage } from '../merchant/merchant-onboarding.service';
import { orderService } from '../order/order.service';
import { riderService } from '../rider/rider.service';
import { riderEligibilityService } from '../rider/rider-eligibility.service';
import { dispatchService } from '../order/dispatch.service';
import { deliveryRepository } from '../order/delivery.repository';
import { requireAuth, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import crypto from 'crypto';

export const adminRouter = Router();
adminRouter.use(scopedResponseMiddleware);

// All admin endpoints require authentication
adminRouter.use(requireAuth);

/**
 * 1. GET /api/v1/admin/users
 * List platform users with filters & pagination (Section 41)
 */
adminRouter.get(
  '/users',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { role, status, search, limit, offset } = req.query;
      const { users, total } = await authRepository.listUsers({
        role: role as string,
        status: status as string,
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });

      const safeUsers = await Promise.all(users.map((u) => authService.toAuthUser(u)));

      const response: ApiResponse<typeof safeUsers> = {
        data: safeUsers,
        meta: {
          total_count: total,
          has_more: (offset ? parseInt(offset as string, 10) : 0) + safeUsers.length < total,
        },
        requestId: (req as any).requestId,
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 2. GET /api/v1/admin/users/:id
 * Retrieve specific user details (Section 41)
 */
adminRouter.get(
  '/users/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await authRepository.findUserById(req.params.id);
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      const safeUser = await authService.toAuthUser(user);
      const sessions = await authRepository.listUserSessions(user.id);

      res.json({
        data: {
          user: safeUser,
          sessions: sessions.map((s) => ({
            id: s.id,
            ip_address: s.ip_address,
            device_info: s.device_info,
            last_used_at: s.last_used_at,
            created_at: s.created_at,
            is_active: !s.revoked_at && new Date(s.expires_at).getTime() > Date.now(),
          })),
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. POST /api/v1/admin/users/:id/suspend
 * Suspend user account and terminate active sessions (Section 42)
 */
adminRouter.post(
  '/users/:id/suspend',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;
      const user = await authRepository.findUserById(targetUserId);
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      if (config.storage.mode === 'postgres' && (typeof req.body.reason !== 'string' || !req.body.reason.trim())) throw new AppError(400,'REASON_REQUIRED','An explicit administrative reason is required');
      const reason = req.body.reason || 'Administrative intervention';
      await identityCommand(async () => {
      await authRepository.updateUserStatus(targetUserId, UserStatus.SUSPENDED);

      // Revoke all active sessions immediately
      await authRepository.revokeAllUserSessions(targetUserId);

      await authRepository.createAuditLog({
        actor_user_id: req.session!.user_id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.ACCOUNT_SUSPENDED,
        resource_type: 'USER',
        resource_id: targetUserId,
        reason,
        request_id: (req as any).requestId,
        metadata: { target_email: user.email, target_phone: user.phone_e164 },
      });
      });

      res.json({
        data: {
          message: `User ${targetUserId} has been suspended`,
          status: UserStatus.SUSPENDED,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 4. POST /api/v1/admin/users/:id/reactivate
 * Reactivate suspended user account (Section 42)
 */
adminRouter.post(
  '/users/:id/reactivate',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;
      const user = await authRepository.findUserById(targetUserId);
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      if (config.storage.mode === 'postgres' && (typeof req.body.reason !== 'string' || !req.body.reason.trim())) throw new AppError(400,'REASON_REQUIRED','An explicit administrative reason is required');
      const reason = req.body.reason || 'Administrative reinstatement';
      await identityCommand(async () => {
      await authRepository.updateUserStatus(targetUserId, UserStatus.ACTIVE);

      await authRepository.createAuditLog({
        actor_user_id: req.session!.user_id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.ACCOUNT_REACTIVATED,
        resource_type: 'USER',
        resource_id: targetUserId,
        reason,
        request_id: (req as any).requestId,
      });
      });

      res.json({
        data: {
          message: `User ${targetUserId} has been reactivated`,
          status: UserStatus.ACTIVE,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 5. POST /api/v1/admin/users/:id/roles
 * Update user roles (Section 43)
 */
adminRouter.post(
  '/users/:id/roles',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;
      const { roles } = req.body;

      if (!Array.isArray(roles) || roles.length === 0 || roles.some(role => !Object.values(UserRole).includes(role))) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Roles must be a non-empty array of valid roles');
      }

      const user = await authRepository.findUserById(targetUserId);
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      if (config.storage.mode === 'postgres' && (typeof req.body.reason !== 'string' || !req.body.reason.trim())) throw new AppError(400,'REASON_REQUIRED','An explicit administrative reason is required');
      await identityCommand(async () => {
      await governanceService.setRoles(
        targetUserId,
        roles,
        req.body.reason,
        {
          id: req.user!.id,
          role: UserRole.SUPER_ADMIN,
          requestId: (req as any).requestId,
        },
      );

      await authRepository.createAuditLog({
        actor_user_id: req.session!.user_id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.ROLE_ASSIGNED,
        resource_type: 'USER_ROLES',
        resource_id: targetUserId,
        request_id: (req as any).requestId,
        reason: req.body.reason,
        metadata: { new_roles: roles },
      });
      });

      const updatedUser = await authService.toAuthUser(user);
      res.json({
        data: updatedUser,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 6. GET /api/v1/admin/audit
 * Inspect platform security and operational audit logs (Section 35 & 36)
 */
adminRouter.get(
  '/audit',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, offset, action, actor_user_id } = req.query;
      const { logs, total } = await authRepository.listAuditLogs({
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
        action: action as string,
        actorUserId: actor_user_id as string,
      });

      res.json({
        data: logs,
        meta: {
          total_count: total,
          has_more: (offset ? parseInt(offset as string, 10) : 0) + logs.length < total,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// Phase 1: Super Admin Governance
// ==========================================

adminRouter.get(
  '/governance/events',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await governanceService.listEvents(
        req.query.limit ? Number(req.query.limit) : 100,
      );
      res.json({ data: { events: data }, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

adminRouter.post(
  '/governance/provision',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await governanceService.provision(
        req.body,
        {
          id: req.user!.id,
          role: UserRole.SUPER_ADMIN,
          requestId: (req as any).requestId,
        },
      );
      res.status(201).json({ data, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

adminRouter.patch(
  '/governance/users/:id',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await governanceService.updateIdentity(
        req.params.id,
        req.body,
        {
          id: req.user!.id,
          role: UserRole.SUPER_ADMIN,
          requestId: (req as any).requestId,
        },
      );
      res.json({ data, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

adminRouter.post(
  '/governance/users/:id/deactivate',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await governanceService.deactivate(
        req.params.id,
        req.body.reason,
        {
          id: req.user!.id,
          role: UserRole.SUPER_ADMIN,
          requestId: (req as any).requestId,
        },
      );
      res.json({ data, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

adminRouter.post(
  '/governance/users/:id/reactivate',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await governanceService.reactivate(
        req.params.id,
        req.body.reason,
        {
          id: req.user!.id,
          role: UserRole.SUPER_ADMIN,
          requestId: (req as any).requestId,
        },
      );
      res.json({ data, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

adminRouter.post(
  '/governance/merchants/:id/deactivate',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (reason.length < 3) throw new AppError(400, 'REASON_REQUIRED', 'A meaningful reason is required');
      const merchant = await merchantRepository.findMerchantById(req.params.id);
      if (!merchant) throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      const updated = await merchantRepository.updateMerchant(req.params.id, {
        status: MerchantStatus.DISABLED,
      });
      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.SUPER_ADMIN,
        action: AuditAction.MERCHANT_SUSPENDED,
        resource_type: 'MERCHANT',
        resource_id: req.params.id,
        reason,
        request_id: (req as any).requestId,
        metadata: { governance_action: 'DEACTIVATED', previous_status: merchant.status },
      });
      res.json({ data: updated, requestId: (req as any).requestId });
    } catch (err) { next(err); }
  },
);

// ==========================================
// 7. Admin Merchant Management (Sprint 3)
// ==========================================

/**
 * GET /api/v1/admin/merchants
 */
adminRouter.get(
  '/merchants',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, approval_status, search, limit, offset } = req.query;
      const { merchants, total } = await merchantRepository.listMerchants({
        status: status as MerchantStatus,
        approval_status: approval_status as MerchantApprovalStatus,
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });

      // Augment with branch counts
      const enriched = await Promise.all(
        merchants.map(async (m) => {
          const branches = await merchantRepository.listBranchesByMerchant(m.id);
          return {
            ...m,
            branch_count: branches.length,
          };
        })
      );

      res.json({
        data: enriched,
        meta: {
          total_count: total,
          has_more: (offset ? parseInt(offset as string, 10) : 0) + enriched.length < total,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants
 */
adminRouter.post(
  '/merchants',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const validated = CreateMerchantSchema.parse(req.body);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const merchant = await merchantRepository.createMerchant({
        id,
        legal_name: validated.legal_name,
        display_name: validated.display_name,
        slug: validated.slug || validated.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: validated.description,
        phone: validated.phone,
        email: validated.email,
        logo_url: validated.logo_url,
        status: MerchantStatus.DISABLED,
        approval_status: MerchantApprovalStatus.DRAFT,
        commission_bps: validated.commission_bps || 2000,
        settlement_schedule: validated.settlement_schedule || 'WEEKLY',
        created_at: now,
        updated_at: now,
      });

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.MERCHANT_CREATED,
        resource_type: 'MERCHANT',
        resource_id: id,
        metadata: { ...validated, onboarding_stage: 'APPLICATION' },
      });

      const onboarding = config.storage.mode === 'postgres'
        ? await merchantOnboardingService.update(
            id,
            'APPLICATION',
            req.user!.id,
            'Merchant created; onboarding requirements must be completed before activation',
          )
        : null;

      res.status(201).json({
        data: { ...merchant, onboarding },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/merchants/:id
 */
adminRouter.get(
  '/merchants/onboarding',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await merchantOnboardingService.list(req.query.stage as string | undefined);
      res.json({ data, requestId: (req as any).requestId });
    } catch (error) { next(error); }
  },
);

adminRouter.get(
  '/merchants/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const merchant = await merchantRepository.findMerchantById(merchantId);
      if (!merchant) {
        throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      }

      const branches = await merchantRepository.listBranchesByMerchant(merchantId);
      const members = await merchantRepository.listMembershipsByMerchant(merchantId);

      res.json({
        data: {
          ...merchant,
          branches,
          members,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/admin/merchants/:id
 */
adminRouter.patch(
  '/merchants/:id',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const validated = UpdateMerchantSchema.parse(req.body);

      const updated = await merchantRepository.updateMerchant(merchantId, validated);
      if (!updated) {
        throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.MERCHANT_UPDATED,
        resource_type: 'MERCHANT',
        resource_id: merchantId,
        metadata: validated,
      });

      res.json({
        data: updated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants/:id/approve
 */
adminRouter.post(
  '/merchants/:id/approve',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const { note } = AdminApproveMerchantSchema.parse(req.body || {});

      const approved = await merchantService.approveMerchant(merchantId, req.user!.id, note);
      res.json({
        data: approved,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants/:id/reject
 */
adminRouter.post(
  '/merchants/:id/reject',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const { reason } = AdminRejectMerchantSchema.parse(req.body);

      const rejected = await merchantService.rejectMerchant(merchantId, req.user!.id, reason);
      res.json({
        data: rejected,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants/:id/suspend
 */
adminRouter.post(
  '/merchants/:id/suspend',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const reason = (req.body && req.body.reason) || 'Suspended by admin';

      const suspended = await merchantService.suspendMerchant(merchantId, req.user!.id, reason);
      res.json({
        data: suspended,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants/:id/reactivate
 */
adminRouter.post(
  '/merchants/:id/reactivate',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const reactivated = await merchantService.reactivateMerchant(merchantId, req.user!.id);
      res.json({
        data: reactivated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/merchants/:id/branches
 */
adminRouter.get(
  '/merchants/:id/branches',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const branches = await merchantRepository.listBranchesByMerchant(merchantId);
      const withAvailability = await Promise.all(
        branches.map(async (b) => ({
          ...b,
          availability: await merchantService.evaluateBranchAvailability(b.id),
        }))
      );

      res.json({
        data: withAvailability,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/merchants/:id/branches
 */
adminRouter.post(
  '/merchants/:id/branches',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.params.id;
      const validated = CreateBranchSchema.parse(req.body);

      const now = new Date().toISOString();
      const branchId = crypto.randomUUID();

      const newBranch = await merchantRepository.createBranch({
        id: branchId,
        merchant_id: merchantId,
        name: validated.name,
        slug: validated.slug || validated.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        email: validated.email,
        phone: validated.phone,
        address_line1: validated.address_line1,
        address_line2: validated.address_line2,
        landmark: validated.landmark,
        city: validated.city,
        region: validated.region,
        country_code: validated.country_code,
        postal_code: validated.postal_code,
        address_text: `${validated.address_line1}, ${validated.city}`,
        latitude: validated.latitude,
        longitude: validated.longitude,
        status: BranchAdminStatus.ACTIVE,
        operational_status: BranchOperationalStatus.CLOSED,
        timezone: validated.timezone,
        currency: validated.currency,
        min_order_minor: validated.min_order_minor || 0,
        prep_default_min: validated.prep_default_min || 20,
        created_at: now,
        updated_at: now,
      });

      const zones = await merchantService.findZonesForPoint(validated.latitude, validated.longitude);
      if (zones.length > 0) {
        await merchantRepository.assignBranchServiceZones(branchId, zones.map((z) => z.id));
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.BRANCH_CREATED,
        resource_type: 'BRANCH',
        resource_id: branchId,
        metadata: { name: validated.name, merchant_id: merchantId },
      });

      res.status(201).json({
        data: newBranch,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 8. Admin Branch Management
// ==========================================

/**
 * GET /api/v1/admin/branches
 */
adminRouter.get(
  '/branches',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, operational_status, search } = req.query;
      const branches = await merchantRepository.listAllBranches({
        status: status as BranchAdminStatus,
        operational_status: operational_status as BranchOperationalStatus,
        search: search as string,
      });

      const enriched = await Promise.all(
        branches.map(async (b) => {
          const merchant = await merchantRepository.findMerchantById(b.merchant_id);
          const availability = await merchantService.evaluateBranchAvailability(b.id);
          return {
            ...b,
            merchant_name: merchant?.display_name,
            availability,
          };
        })
      );

      res.json({
        data: enriched,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/branches/:branchId
 */
adminRouter.get(
  '/branches/:branchId',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.branchId;
      const branch = await merchantRepository.findBranchById(branchId);
      if (!branch) {
        throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
      }

      const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
      const availability = await merchantService.evaluateBranchAvailability(branchId);
      const openingHours = await merchantRepository.getOpeningHours(branchId);
      const zones = await merchantRepository.getBranchServiceZones(branchId);

      res.json({
        data: {
          ...branch,
          merchant,
          availability,
          opening_hours: openingHours,
          service_zones: zones,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/admin/branches/:branchId
 */
adminRouter.patch(
  '/branches/:branchId',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.branchId;
      const validated = UpdateBranchSchema.parse(req.body);

      const updated = await merchantRepository.updateBranch(branchId, validated);
      if (!updated) {
        throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.BRANCH_UPDATED,
        resource_type: 'BRANCH',
        resource_id: branchId,
        metadata: validated,
      });

      res.json({
        data: updated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/branches/:branchId/suspend
 */
adminRouter.post(
  '/branches/:branchId/suspend',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.branchId;
      const reason = (req.body && req.body.reason) || 'Suspended by admin';

      const suspended = await merchantService.suspendBranch(branchId, req.user!.id, reason);
      res.json({
        data: suspended,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/branches/:branchId/reactivate
 */
adminRouter.post(
  '/branches/:branchId/reactivate',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.branchId;
      const reactivated = await merchantService.reactivateBranch(branchId, req.user!.id);
      res.json({
        data: reactivated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/branches/:branchId/service-zones
 */
adminRouter.post(
  '/branches/:branchId/service-zones',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.branchId;
      const { service_zone_ids } = AssignBranchZonesSchema.parse(req.body);

      await merchantRepository.assignBranchServiceZones(branchId, service_zone_ids);

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.BRANCH_SERVICE_ZONE_ASSIGNED,
        resource_type: 'BRANCH',
        resource_id: branchId,
        metadata: { service_zone_ids },
      });

      const availability = await merchantService.evaluateBranchAvailability(branchId);

      res.json({
        data: { branch_id: branchId, service_zone_ids, availability },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 9. Admin Service Zone Management
// ==========================================

/**
 * GET /api/v1/admin/service-zones
 */
adminRouter.get(
  '/service-zones',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status } = req.query;
      const zones = await merchantRepository.listServiceZones({
        status: status as ServiceZoneStatus,
      });

      res.json({
        data: zones,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/service-zones
 */
adminRouter.post(
  '/service-zones',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const validated = ServiceZoneSchema.parse(req.body);
      const id = crypto.randomUUID();

      const zone = await merchantRepository.createServiceZone({
        id,
        name: validated.name,
        city_id: validated.city_id || 'NAIROBI',
        status: validated.status as ServiceZoneStatus,
        boundary: validated.boundary,
        config: validated.config,
        created_at: new Date().toISOString(),
      });

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.SERVICE_ZONE_CREATED,
        resource_type: 'SERVICE_ZONE',
        resource_id: id,
        metadata: validated,
      });

      res.status(201).json({
        data: zone,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/admin/service-zones/:id
 */
adminRouter.patch(
  '/service-zones/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const zoneId = req.params.id;
      const updated = await merchantRepository.updateServiceZone(zoneId, req.body);
      if (!updated) {
        throw new AppError(404, 'SERVICE_ZONE_NOT_FOUND', 'Service zone not found');
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.ADMIN,
        action: AuditAction.SERVICE_ZONE_UPDATED,
        resource_type: 'SERVICE_ZONE',
        resource_id: zoneId,
        metadata: req.body,
      });

      res.json({
        data: updated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/customers
 * Admin & Ops customer listing (Sprint 5)
 */
adminRouter.get(
  '/customers',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { search, limit, offset } = req.query;
      const { customerRepository } = await import('../customer/customer.repository');
      const result = await customerRepository.listAllCustomers({
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });
      res.json({
        data: result.customers,
        meta: { total: result.total },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/customers/:id
 * Admin customer profile and address inspection
 */
adminRouter.get(
  '/customers/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.params.id;
      const { customerRepository } = await import('../customer/customer.repository');
      const profile = await customerRepository.getProfileByUserId(customerId);
      if (!profile) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer profile not found');
      }
      const addresses = await customerRepository.listAddressesByCustomerId(customerId);
      res.json({
        data: {
          profile,
          addresses,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// Admin Orders Monitoring & Operations (Sprint 7)
// ==========================================

/**
 * GET /api/v1/admin/orders
 * Admin global order search, filtering, and timeline inspection
 */
adminRouter.get(
  '/orders',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, branch_id, customer_id, search, limit, page } = req.query;

      const result = await orderService.getAdminOrders({
        status: status as any,
        branch_id: branch_id as string,
        customer_id: customer_id as string,
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        page: page ? parseInt(page as string, 10) : 1,
      });

      res.json({
        success: true,
        data: result.orders,
        meta: {
          total: result.total,
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/orders/:id
 * Admin detailed order snapshot and lifecycle audit history
 */
adminRouter.get(
  '/orders/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);

      res.json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/orders/:id/cancel
 * Admin emergency order cancellation with operational audit note
 */
adminRouter.post(
  '/orders/:id/cancel',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const validated = OrderCancelSchema.parse(req.body);

      const order = await orderService.adminCancelOrder(
        { id: req.user!.id, email: req.user!.email },
        orderId,
        validated.reason_code || validated.reasonCode || 'ADMIN_INTERVENTION',
        validated.note
      );

      res.json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// RIDER FLEET & OPERATIONS MANAGEMENT (Sprint 8)
// ==========================================

/**
 * GET /api/v1/admin/riders/metrics
 * Fleet overview metrics: total, pending, approved, online, available, suspended, stale
 */
adminRouter.get(
  '/riders/metrics',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const metrics = await riderService.getFleetMetrics();
      res.json({
        data: metrics,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/riders
 * List riders with filtering, searching, and pagination
 */
adminRouter.get(
  '/riders',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        onboardingStatus,
        operationalStatus,
        workStatus,
        vehicleType,
        serviceZoneId,
        search,
        page,
        limit,
      } = req.query;

      const result = await riderService.listAdminRiders({
        onboardingStatus: onboardingStatus as any,
        operationalStatus: operationalStatus as any,
        workStatus: workStatus as any,
        vehicleType: vehicleType as any,
        serviceZoneId: serviceZoneId as any,
        search: search as any,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      res.json({
        data: result.riders,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/cleanup-stale
 * Trigger background/scheduled stale location sweep
 */
adminRouter.post(
  '/riders/cleanup-stale',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await riderEligibilityService.cleanupStaleRiders();
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/riders/:id
 * Retrieve comprehensive rider details, vehicle, sessions, eligibility, and location
 */
adminRouter.get(
  '/riders/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const detail = await riderService.getAdminRiderDetail(riderId);
      res.json({
        data: detail,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/:id/approve
 * Administrative approval of rider onboarding (DRAFT / PENDING_REVIEW -> APPROVED)
 */
adminRouter.post(
  '/riders/:id/approve',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const validated = RiderApprovalSchema.parse(req.body || {});
      const adminUserId = req.user!.id;

      const profile = await riderService.approveRider(adminUserId, riderId, validated.note);
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/:id/reject
 * Administrative rejection of rider onboarding
 */
adminRouter.post(
  '/riders/:id/reject',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const validated = RiderRejectionSchema.parse(req.body);
      const adminUserId = req.user!.id;

      const profile = await riderService.rejectRider(
        adminUserId,
        riderId,
        validated.reason_code,
        validated.note
      );
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/:id/suspend
 * Operational suspension of rider (forces OFFLINE and revokes dispatch eligibility)
 */
adminRouter.post(
  '/riders/:id/suspend',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const validated = RiderSuspensionSchema.parse(req.body);
      const adminUserId = req.user!.id;

      const profile = await riderService.suspendRider(
        adminUserId,
        riderId,
        validated.reason,
        validated.note
      );
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/:id/reactivate
 * Operational reactivation of suspended rider
 */
adminRouter.post(
  '/riders/:id/reactivate',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const adminUserId = req.user!.id;

      const profile = await riderService.reactivateRider(adminUserId, riderId);
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/riders/:id/zones
 * Assign service zones to rider
 */
adminRouter.post(
  '/riders/:id/zones',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = req.params.id;
      const validated = RiderZoneAssignmentSchema.parse(req.body);
      const adminUserId = req.user!.id;

      const assigned = await riderService.assignServiceZones(
        adminUserId,
        riderId,
        validated.service_zone_ids || validated.zone_ids || []
      );
      res.json({
        data: { service_zone_ids: assigned },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// Sprint 9: Dispatch & Delivery Operations Endpoints
// ==========================================

/**
 * GET /api/v1/admin/dispatch/deliveries
 * List deliveries with filters, status, attention flags, and search
 */
adminRouter.get(
  '/dispatch/deliveries',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, assigned_rider_id, branch_id, attention_required, search, page, limit } = req.query;

      const result = await deliveryRepository.listDeliveries({
        status: status as any,
        assigned_rider_id: assigned_rider_id as string,
        branch_id: branch_id as string,
        attention_required: attention_required !== undefined ? attention_required === 'true' : undefined,
        search: search as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      res.json({
        data: result.deliveries,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/deliveries/:id
 * Detailed delivery view with offers, full timeline, and attempts
 */
adminRouter.get(
  '/dispatch/deliveries/:id',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const delivery = await deliveryRepository.findById(id);
      if (!delivery) {
        throw new AppError(404, 'DELIVERY_NOT_FOUND', `Delivery ${id} not found`);
      }

      const offers = await deliveryRepository.getOffersByDeliveryId(id);
      const timeline = await deliveryRepository.getTimelineByDeliveryId(id);
      const attempts = await deliveryRepository.getAttemptsByDeliveryId(id);

      res.json({
        data: {
          delivery,
          offers,
          timeline,
          attempts,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/deliveries/:id/eligible-riders
 * Ranked Riders that currently pass the same dispatch eligibility gates.
 */
adminRouter.get(
  '/dispatch/deliveries/:id/eligible-riders',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const delivery = await deliveryRepository.findById(req.params.id);
      if (!delivery) {
        throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
      }

      const candidates = await dispatchService.findAndRankCandidates(
        delivery.pickup_location,
        Math.max(
          delivery.current_search_radius_meters || config.dispatch.initialSearchRadius,
          config.dispatch.maxSearchRadius,
        ),
      );

      res.json({
        data: candidates.map((candidate) => ({
          value: candidate.riderId,
          label:
            `${candidate.riderName || candidate.riderId} · ` +
            `${Math.max(0.1, candidate.distanceToPickupMeters / 1000).toFixed(1)} km · ` +
            `${Math.max(1, Math.round(candidate.estimatedPickupEtaSeconds / 60))} min ETA`,
          rider_id: candidate.riderId,
          rider_name: candidate.riderName,
          distance_meters: candidate.distanceToPickupMeters,
          eta_seconds: candidate.estimatedPickupEtaSeconds,
          score: candidate.score,
        })),
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/admin/dispatch/deliveries/:id/assign
 * Operations manual courier assignment
 */
adminRouter.post(
  '/dispatch/deliveries/:id/assign',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validated = AdminManualAssignSchema.parse(req.body);
      const adminUser = { id: req.user!.id, email: req.user!.email };

      const assigned = await dispatchService.adminManualAssign(
        id,
        validated.rider_id,
        adminUser,
        validated.note
      );

      res.json({
        data: {
          delivery: assigned,
          message: 'Courier manually assigned to delivery',
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/dispatch/deliveries/:id/unassign
 * Operations manual courier unassignment (reassignment or cancellation)
 */
adminRouter.post(
  '/dispatch/deliveries/:id/unassign',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validated = AdminUnassignDeliverySchema.parse(req.body);
      const adminUser = { id: req.user!.id, email: req.user!.email };

      const unassigned = await dispatchService.adminUnassign(
        id,
        adminUser,
        validated.reason_code,
        validated.note,
        validated.retrigger_dispatch !== false
      );

      res.json({
        data: {
          delivery: unassigned,
          message: 'Courier unassigned successfully',
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/dispatch/deliveries/:id/trigger
 * Force execution of dispatch matching cycle
 */
adminRouter.post(
  '/dispatch/deliveries/:id/trigger',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await dispatchService.executeDispatchCycle(id);

      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/metrics
 * Returns real-time dispatch and SLA metrics
 */
adminRouter.get(
  '/dispatch/metrics',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const metrics = await deliveryRepository.getDispatchMetrics();
      res.json({
        data: metrics,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/config
 * Returns current dispatch engine configuration
 */
adminRouter.get(
  '/dispatch/config',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const cfg = dispatchService.getConfig();
      res.json({
        data: cfg,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/admin/dispatch/config
 * Update dispatch engine parameters
 */
adminRouter.put(
  '/dispatch/config',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const validated = DispatchConfigUpdateSchema.parse(req.body);
      const updated = dispatchService.updateConfig(validated as any);
      res.json({
        data: updated,
        message: 'Dispatch configuration updated successfully',
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// Sprint 10 Delivery Lifecycle & Ops Monitoring
// ==========================================

/**
 * GET /api/v1/admin/dispatch/stuck
 * Scan active deliveries against SLA thresholds and return stuck delivery alerts
 */
adminRouter.get(
  '/dispatch/stuck',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const stuckAlerts = await dispatchService.scanStuckDeliveries();
      res.json({
        data: {
          stuckDeliveries: stuckAlerts,
          count: stuckAlerts.length,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/dispatch/deliveries/:id/force-complete
 * Operations manual override to force complete a stuck delivery
 */
adminRouter.post(
  '/dispatch/deliveries/:id/force-complete',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validated = AdminForceCompleteDeliverySchema.parse(req.body);
      const adminUserId = req.user!.id;
      const adminName = req.user!.email || 'Operations Admin';

      const completed = await dispatchService.adminForceCompleteDelivery(
        id,
        adminUserId,
        adminName,
        validated.reason,
        validated.note
      );

      res.json({
        data: completed,
        message: 'Delivery force completed successfully and order marked COMPLETED',
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/incidents
 * Retrieve delivery incident reports (e.g. failed handoffs, unreachable customers)
 */
adminRouter.get(
  '/dispatch/incidents',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, delivery_id } = req.query;
      const incidents = await deliveryRepository.listIncidents({
        status: status as string,
        delivery_id: delivery_id as string,
      });

      res.json({
        data: incidents,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/admin/dispatch/incidents/:id/resolve
 * Operations resolves a reported delivery incident
 */
adminRouter.post(
  '/dispatch/incidents/:id/resolve',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validated = AdminResolveIncidentSchema.parse(req.body);
      const adminUserId = req.user!.id;

      const resolved = await dispatchService.adminResolveIncident(
        id,
        adminUserId,
        validated.resolution_action,
        validated.note
      );

      res.json({
        data: resolved,
        message: 'Delivery incident resolved successfully',
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/admin/dispatch/deliveries/:id/proofs
 * Retrieve proof-of-delivery records (photos, signatures, OTP logs)
 */
adminRouter.get(
  '/dispatch/deliveries/:id/proofs',
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const proofs = await deliveryRepository.getProofsByDeliveryId(id);

      res.json({
        data: proofs,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);








adminRouter.patch(
  '/merchants/:id/onboarding',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const allowed = new Set(['APPLICATION','DOCUMENTS_PENDING','COMMERCIAL_TERMS','CONTENT_SETUP','MENU_QA','STAFF_TRAINING','READY_FOR_REVIEW','APPROVED','LIVE','BLOCKED']);
      const stage = String(req.body?.stage || '').toUpperCase();
      if (!allowed.has(stage)) throw new AppError(400, 'MERCHANT_ONBOARDING_STAGE_INVALID', 'Unsupported onboarding stage');
      const data = await merchantOnboardingService.update(
        req.params.id,
        stage as MerchantOnboardingStage,
        req.user!.id,
        req.body?.note ? String(req.body.note).slice(0, 1000) : undefined,
        req.body?.assigned_to ? String(req.body.assigned_to) : undefined,
      );
      res.json({ data, requestId: (req as any).requestId });
    } catch (error) { next(error); }
  },
);

adminRouter.get(
  '/dispatch/deliveries/:id/candidates',
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const delivery = await deliveryRepository.findById(req.params.id);
      if (!delivery) throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
      const candidates = await dispatchService.findAndRankCandidates(
        delivery.pickup_location,
        delivery.current_search_radius_meters || dispatchService.getConfig().initialSearchRadius,
      );
      res.json({
        data: candidates.map((candidate) => ({
          rider_id: candidate.riderId,
          rider_name: candidate.riderName,
          vehicle_type: candidate.vehicleType,
          distance_to_pickup_meters: candidate.distanceToPickupMeters,
          estimated_pickup_eta_seconds: candidate.estimatedPickupEtaSeconds,
          score: candidate.score,
          rank: candidate.rank,
        })),
        requestId: (req as any).requestId,
      });
    } catch (error) { next(error); }
  },
);
