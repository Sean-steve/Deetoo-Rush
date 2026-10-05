/**
 * DEETOO - Public / Customer Data Foundation Router
 * Provides public customer-facing branch discovery, operational availability, and serviceability checks
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, BranchAdminStatus, MerchantApprovalStatus, MerchantStatus } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { catalogueService } from '../merchant/catalogue.service';

export const publicRouter = Router();

/**
 * GET /api/v1/public/branches
 * List branches with real-time operational availability, optionally sorted by distance to customer
 */
publicRouter.get('/branches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      const serviceable = await merchantService.findServiceableBranches(lat, lng);
      const response: ApiResponse<typeof serviceable> = {
        data: serviceable,
        requestId: (req as any).requestId,
      };
      return res.json(response);
    }

    // Default list of active branches
    const branches = await merchantRepository.listAllBranches({
      status: BranchAdminStatus.ACTIVE,
    });

    const enriched = await Promise.all(
      branches.map(async (branch) => {
        const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
        const availability = await merchantService.evaluateBranchAvailability(branch.id);
        const openingHours = await merchantRepository.getOpeningHours(branch.id);
        return {
          branch,
          merchant,
          availability,
          opening_hours: openingHours,
        };
      })
    );

    // Only return branches whose merchants are approved and active
    const valid = enriched.filter(
      (e) =>
        e.merchant &&
        e.merchant.status === MerchantStatus.ACTIVE &&
        e.merchant.approval_status === MerchantApprovalStatus.APPROVED
    );

    const response: ApiResponse<typeof valid> = {
      data: valid,
      requestId: (req as any).requestId,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/branches/:id
 * Retrieve branch details, opening hours, and real-time operational availability
 */
publicRouter.get('/branches/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.params.id;
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    }

    const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
    const availability = await merchantService.evaluateBranchAvailability(branchId);
    const openingHours = await merchantRepository.getOpeningHours(branchId);
    const zones = await merchantRepository.getBranchServiceZones(branchId);

    const response: ApiResponse<any> = {
      data: {
        branch,
        merchant,
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
});

/**
 * GET /api/v1/public/service-zones
 * List active platform delivery service zones
 */
publicRouter.get('/service-zones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zones = await merchantRepository.listServiceZones();
    const response: ApiResponse<typeof zones> = {
      data: zones,
      requestId: (req as any).requestId,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/branches/:id/menu
 * Retrieve clean, public-safe restaurant menu with effective availability and modifiers
 */
publicRouter.get('/branches/:id/menu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.params.id;
    const publicMenu = await catalogueService.getPublicRestaurantMenu(branchId);

    const response: ApiResponse<typeof publicMenu> = {
      data: publicMenu,
      requestId: (req as any).requestId,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

