import {
  merchantRoles,
  merchantScope,
  branchScope,
  hasAnyRole,
  deny,
} from "../auth/scope";
/**
 * DEETOO - Merchant API Router
 * Endpoints for merchant profile, branch operations, opening hours, team memberships and invitations
 */

import { Router, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  ApiResponse,
  UserRole,
  MerchantStatus,
  MerchantApprovalStatus,
  BranchAdminStatus,
  BranchOperationalStatus,
  AuditAction,
} from "@deetoo/types";
import {
  CreateMerchantSchema,
  UpdateMerchantSchema,
  CreateBranchSchema,
  UpdateBranchSchema,
  UpdateBranchOperationalStatusSchema,
  BatchOpeningHoursSchema,
  InviteStaffSchema,
  UpdateMembershipSchema,
} from "@deetoo/validation";
import { AppError } from "../../middleware/error-handler";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { authRepository } from "../auth/auth.repository";
import { merchantRepository } from "./merchant.repository";
import { merchantService } from "./merchant.service";
import { catalogueRouter } from "./catalogue.router";
import { merchantOrderRouter } from "./merchant-orders.router";

export const merchantRouter = Router();
merchantRouter.use(requireAuth);
merchantRouter.use((req, res, next) => {
  // A recipient may accept their own invitation before acquiring a merchant role.
  if (
    req.method === "POST" &&
    /^\/team\/invitations\/[^/]+\/accept$/.test(req.path)
  )
    return next();
  return requireRole(...merchantRoles, "admin", "ops")(req, res, next);
});
merchantRouter.use("/team", async (req: AuthenticatedRequest, _res, next) => {
  try {
    if (/^\/invitations\/[^/]+\/accept$/.test(req.path)) return next();
    const merchantId = await resolveMerchantId(req);
    await merchantScope(req.user!, merchantId, true);
    const target = req.path.match(/^\/memberships\/([^/]+)/);
    if (target) {
      const membership = await merchantRepository.findMembershipById(target[1]);
      if (!membership || membership.merchant_id !== merchantId) deny();
    }
    for (const id of req.body?.branch_ids || []) {
      const branch = await merchantRepository.findBranchById(id);
      if (!branch || branch.merchant_id !== merchantId) deny();
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Mount Catalogue Sub-router (Sprint 4: Menus, Categories, Items, Modifiers, Options, Overrides)
merchantRouter.use("/", catalogueRouter);

// Mount Merchant Orders Sub-router (Sprint 7: Incoming Queue, Accept/Reject, Prep, Ready)
merchantRouter.use("/orders", merchantOrderRouter);

// All merchant endpoints require authentication
merchantRouter.use(requireAuth);

/**
 * Helper to resolve the active merchant ID for the user
 */
export async function resolveMerchantId(
  req: AuthenticatedRequest,
): Promise<string> {
  const queryMerchantId = req.query.merchant_id as string;
  const userId = req.user!.id;

  // If user is Admin/Ops, allow explicit merchant_id query
  const isPlatformAdmin =
    req.user!.roles.includes(UserRole.ADMIN) ||
    req.user!.roles.includes(UserRole.OPS);
  if (queryMerchantId && isPlatformAdmin) {
    return queryMerchantId;
  }

  // Find user memberships
  const memberships = (
    await merchantRepository.getMembershipsForUser(userId)
  ).filter((m) => m.status === "ACTIVE");
  if (memberships.length === 0) {
    throw new AppError(
      403,
      "NO_MERCHANT_MEMBERSHIP",
      "User is not associated with any merchant organization",
    );
  }

  if (queryMerchantId) {
    const hasAccess = memberships.some(
      (m) => m.merchant_id === queryMerchantId,
    );
    if (!hasAccess && !isPlatformAdmin) {
      throw new AppError(
        403,
        "ACCESS_DENIED",
        `User does not have access to merchant ${queryMerchantId}`,
      );
    }
    return queryMerchantId;
  }

  // Default to first active merchant
  return memberships[0].merchant_id;
}

// ==========================================
// 1. Profile & Onboarding
// ==========================================

/**
 * GET /api/v1/merchant/profile
 */
merchantRouter.get(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const merchant = await merchantRepository.findMerchantById(merchantId);
      if (!merchant) {
        throw new AppError(
          404,
          "MERCHANT_NOT_FOUND",
          "Merchant profile not found",
        );
      }

      const response: ApiResponse<typeof merchant> = {
        data: merchant,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/profile
 */
merchantRouter.patch(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await merchantScope(req.user!, merchantId, true);
      const validated = UpdateMerchantSchema.parse(req.body);
      if (!hasAnyRole(req.user!, ["admin"])) {
        if (
          req.body.commission_bps !== undefined ||
          req.body.settlement_schedule !== undefined
        )
          deny();
        delete validated.commission_bps;
        delete validated.settlement_schedule;
      }

      const updated = await merchantRepository.updateMerchant(
        merchantId,
        validated,
      );
      if (!updated) {
        throw new AppError(404, "MERCHANT_NOT_FOUND", "Merchant not found");
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.MERCHANT_UPDATED,
        resource_type: "MERCHANT",
        resource_id: merchantId,
        metadata: validated,
      });

      const response: ApiResponse<typeof updated> = {
        data: updated,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/submit-for-review
 */
merchantRouter.post(
  "/submit-for-review",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const merchant = await merchantRepository.findMerchantById(merchantId);
      if (!merchant) {
        throw new AppError(404, "MERCHANT_NOT_FOUND", "Merchant not found");
      }

      if (merchant.approval_status === MerchantApprovalStatus.APPROVED) {
        throw new AppError(
          400,
          "ALREADY_APPROVED",
          "Merchant is already approved",
        );
      }

      const updated = await merchantRepository.updateMerchant(merchantId, {
        approval_status: MerchantApprovalStatus.PENDING_REVIEW,
        rejection_reason: undefined,
      });

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.MERCHANT_SUBMITTED,
        resource_type: "MERCHANT",
        resource_id: merchantId,
      });

      const response: ApiResponse<typeof updated> = {
        data: updated!,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 2. Branch Operations
// ==========================================

/**
 * GET /api/v1/merchant/branches
 */
merchantRouter.get(
  "/branches",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const branches =
        await merchantRepository.listBranchesByMerchant(merchantId);

      // Filter branches if user has branch-scoped membership
      const memberships = await merchantRepository.getMembershipsForUser(
        req.user!.id,
      );
      const membership = memberships.find((m) => m.merchant_id === merchantId);

      let accessibleBranches = branches;
      if (membership && membership.role_code !== "merchant_owner") {
        const allowed = new Set(membership.branch_ids);
        accessibleBranches = branches.filter((b) => allowed.has(b.id));
      }

      // Attach availability info to each branch
      const branchesWithAvailability = await Promise.all(
        accessibleBranches.map(async (branch) => {
          const availability = await merchantService.evaluateBranchAvailability(
            branch.id,
          );
          return {
            ...branch,
            availability,
          };
        }),
      );

      const response: ApiResponse<typeof branchesWithAvailability> = {
        data: branchesWithAvailability,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/branches
 */
merchantRouter.post(
  "/branches",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await merchantScope(req.user!, merchantId, true);
      const validated = CreateBranchSchema.parse(req.body);

      const now = new Date().toISOString();
      // Was `branch_${randomBytes(6).toString('hex')}` -- a memory-mode-style string ID that
      // Postgres's merchant_branches.id (type UUID) rejects outright with a 500
      // ("invalid input syntax for type uuid"). This is the exact bug reported: Add Branch
      // works fine in memory/dev:demo mode (which accepts any string ID) but always 500s
      // against a real Postgres database.
      const branchId = crypto.randomUUID();

      const newBranch = await merchantRepository.createBranch({
        id: branchId,
        merchant_id: merchantId,
        name: validated.name,
        slug:
          validated.slug ||
          validated.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
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

      // Seed default opening hours (08:00 - 22:00 every day)
      const defaultHours = [];
      for (let day = 0; day <= 6; day++) {
        defaultHours.push({
          id: crypto.randomUUID(),
          branch_id: branchId,
          day_of_week: day,
          open_time: "08:00",
          close_time: "22:00",
          is_closed: false,
          created_at: now,
        });
      }
      await merchantRepository.setOpeningHours(branchId, defaultHours);

      // Auto-detect and assign service zones covering this branch
      const zones = await merchantService.findZonesForPoint(
        validated.latitude,
        validated.longitude,
      );
      if (zones.length > 0) {
        await merchantRepository.assignBranchServiceZones(
          branchId,
          zones.map((z) => z.id),
        );
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.BRANCH_CREATED,
        resource_type: "BRANCH",
        resource_id: branchId,
        metadata: { name: validated.name, merchant_id: merchantId },
      });

      const availability =
        await merchantService.evaluateBranchAvailability(branchId);

      const response: ApiResponse<any> = {
        data: { ...newBranch, availability },
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/merchant/branches/:id
 */
merchantRouter.get(
  "/branches/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const hasAccess = await merchantService.checkUserBranchAccess(
        req.user!.id,
        req.user!.roles,
        branchId,
      );
      if (!hasAccess) {
        throw new AppError(403, "ACCESS_DENIED", "Access to branch denied");
      }

      const branch = await merchantRepository.findBranchById(branchId);
      if (!branch) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
      }

      const availability =
        await merchantService.evaluateBranchAvailability(branchId);
      const openingHours = await merchantRepository.getOpeningHours(branchId);
      const zones = await merchantRepository.getBranchServiceZones(branchId);

      const response: ApiResponse<any> = {
        data: {
          ...branch,
          availability,
          opening_hours: openingHours,
          service_zones: zones,
        },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/branches/:id
 */
merchantRouter.patch(
  "/branches/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const hasAccess = await merchantService.checkUserBranchAccess(
        req.user!.id,
        req.user!.roles,
        branchId,
      );
      if (!hasAccess) {
        throw new AppError(403, "ACCESS_DENIED", "Access to branch denied");
      }

      const branch = await merchantRepository.findBranchById(branchId);
      if (!branch) deny();
      await merchantScope(req.user!, branch!.merchant_id, true);
      const validated = UpdateBranchSchema.parse(req.body);
      const updated = await merchantRepository.updateBranch(
        branchId,
        validated,
      );
      if (!updated) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.BRANCH_UPDATED,
        resource_type: "BRANCH",
        resource_id: branchId,
        metadata: validated,
      });

      const availability =
        await merchantService.evaluateBranchAvailability(branchId);

      const response: ApiResponse<any> = {
        data: { ...updated, availability },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/branches/:id/status
 * Updates operational status (OPEN, CLOSED, BUSY, TEMPORARILY_UNAVAILABLE)
 */
merchantRouter.post(
  "/branches/:id/status",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const hasAccess = await merchantService.checkUserBranchAccess(
        req.user!.id,
        req.user!.roles,
        branchId,
      );
      if (!hasAccess) {
        throw new AppError(403, "ACCESS_DENIED", "Access to branch denied");
      }

      const validated = UpdateBranchOperationalStatusSchema.parse(req.body);
      const updated = await merchantService.updateBranchOperationalStatus(
        branchId,
        validated.operational_status as BranchOperationalStatus,
        req.user!.id,
        validated.reason,
      );

      const availability =
        await merchantService.evaluateBranchAvailability(branchId);

      const response: ApiResponse<any> = {
        data: { ...updated, availability },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/merchant/branches/:id/opening-hours
 */
merchantRouter.get(
  "/branches/:id/opening-hours",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const hasAccess = await merchantService.checkUserBranchAccess(
        req.user!.id,
        req.user!.roles,
        branchId,
      );
      if (!hasAccess) {
        throw new AppError(403, "ACCESS_DENIED", "Access to branch denied");
      }

      const hours = await merchantRepository.getOpeningHours(branchId);
      const response: ApiResponse<typeof hours> = {
        data: hours,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/merchant/branches/:id/opening-hours
 * Replaces all opening hours intervals
 */
merchantRouter.put(
  "/branches/:id/opening-hours",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const hasAccess = await merchantService.checkUserBranchAccess(
        req.user!.id,
        req.user!.roles,
        branchId,
      );
      if (!hasAccess) {
        throw new AppError(403, "ACCESS_DENIED", "Access to branch denied");
      }

      const validated = BatchOpeningHoursSchema.parse(req.body);
      const formatted = validated.map((item) => ({
        id: item.id || crypto.randomUUID(),
        branch_id: branchId,
        day_of_week: item.day_of_week,
        open_time: item.open_time,
        close_time: item.close_time,
        is_closed: item.is_closed,
        created_at: new Date().toISOString(),
      }));

      const saved = await merchantRepository.setOpeningHours(
        branchId,
        formatted,
      );

      const availability =
        await merchantService.evaluateBranchAvailability(branchId);

      const response: ApiResponse<any> = {
        data: { hours: saved, availability },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/merchant/branches/:id/availability
 */
merchantRouter.get(
  "/branches/:id/availability",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = req.params.id;
      const availability =
        await merchantService.evaluateBranchAvailability(branchId);

      const response: ApiResponse<typeof availability> = {
        data: availability,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 3. Team, Memberships & Invitations
// ==========================================

/**
 * GET /api/v1/merchant/team
 */
merchantRouter.get(
  "/team",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const members =
        await merchantRepository.listMembershipsByMerchant(merchantId);
      const invitations =
        await merchantRepository.listInvitationsByMerchant(merchantId);

      const response: ApiResponse<any> = {
        data: {
          members,
          invitations: invitations.filter((i) => i.status === "PENDING"),
        },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/team/invitations
 */
merchantRouter.post(
  "/team/invitations",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = InviteStaffSchema.parse(req.body);

      const invitation = await merchantService.inviteStaff({
        merchantId,
        email: validated.email,
        phone_e164: validated.phone_e164,
        role_code: validated.role_code as any,
        branch_ids: validated.branch_ids,
        actorUserId: req.user!.id,
        actorRoles: req.user!.roles,
      });

      const response: ApiResponse<typeof invitation> = {
        data: invitation,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/team/invitations/:token/accept
 */
merchantRouter.post(
  "/team/invitations/:token/accept",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.params.token;
      await merchantService.acceptInvitation(token, req.user!.id);

      const response: ApiResponse<{ message: string }> = {
        data: { message: "Invitation successfully accepted" },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/team/memberships/:id/revoke
 */
merchantRouter.post(
  "/team/memberships/:id/revoke",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const membershipId = req.params.id;
      await merchantService.revokeMembership(membershipId, req.user!.id);

      const response: ApiResponse<{ message: string }> = {
        data: { message: "Membership revoked" },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/team/memberships/:id
 */
merchantRouter.patch(
  "/team/memberships/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const membershipId = req.params.id;
      const validated = UpdateMembershipSchema.parse(req.body);

      const updated = await merchantRepository.updateMembership(
        membershipId,
        validated as any,
      );
      if (!updated) {
        throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found");
      }

      await authRepository.createAuditLog({
        actor_user_id: req.user!.id,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.MERCHANT_MEMBER_ROLE_CHANGED,
        resource_type: "MERCHANT_MEMBERSHIP",
        resource_id: membershipId,
        metadata: validated,
      });

      const response: ApiResponse<typeof updated> = {
        data: updated,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
