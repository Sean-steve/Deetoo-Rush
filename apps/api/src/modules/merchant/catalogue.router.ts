import { branchScope, merchantScope } from "../auth/scope";
/**
 * DEETOO - Merchant Catalogue API Router
 * Endpoints for menus, categories, items, prices, modifier groups, options, and branch availability
 */

import { Router, Response, NextFunction } from "express";
import { ApiResponse } from "@deetoo/types";
import {
  CreateMenuSchema,
  UpdateMenuSchema,
  AssignMenuBranchesSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  ReorderCategoriesSchema,
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
  ReorderItemsSchema,
  UpdateItemAvailabilitySchema,
  CreateModifierGroupSchema,
  UpdateModifierGroupSchema,
  AttachModifierGroupsSchema,
  CreateModifierOptionSchema,
  UpdateModifierOptionSchema,
  ReorderModifierOptionsSchema,
  UpdateModifierOptionAvailabilitySchema,
  BranchCatalogueOverrideSchema,
} from "@deetoo/validation";
import { AuthenticatedRequest, requireAuth } from "../auth/auth.middleware";
import { resolveMerchantId } from "./merchant.router";
import { catalogueService } from "./catalogue.service";

export const catalogueRouter = Router();

// All catalogue endpoints require authenticated merchant access
catalogueRouter.use(requireAuth);
// Only catalogue paths are handled here; orders retain their own operational policy.
catalogueRouter.use(async (req: AuthenticatedRequest, _res, next) => {
  try {
    if (
      !/^\/(menus|categories|items|modifier-groups|modifier-options|branches)(\/|$)/.test(
        req.path,
      )
    )
      return next();
    const branch = req.path.match(/^\/branches\/([^/]+)\/(catalogue|items)/);
    if (branch) await branchScope(req.user!, branch[1]);
    if (req.body?.branch_id) await branchScope(req.user!, req.body.branch_id);
    for (const id of req.body?.branch_ids || [])
      await branchScope(req.user!, id);
    if (req.method !== "GET")
      await merchantScope(req.user!, await resolveMerchantId(req), true, true, false);
    next();
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 1. Menus
// ==========================================

/**
 * GET /api/v1/merchant/menus
 */
catalogueRouter.get(
  "/menus",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const menus = await catalogueService.listMenus(merchantId);

      const response: ApiResponse<typeof menus> = {
        data: menus,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/menus
 */
catalogueRouter.post(
  "/menus",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = CreateMenuSchema.parse(req.body);
      const menu = await catalogueService.createMenu(
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof menu> = {
        data: menu,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/merchant/menus/:id
 */
catalogueRouter.get(
  "/menus/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const menu = await catalogueService.getMenu(req.params.id, merchantId);

      const response: ApiResponse<typeof menu> = {
        data: menu,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/menus/:id
 */
catalogueRouter.patch(
  "/menus/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateMenuSchema.parse(req.body);
      const menu = await catalogueService.updateMenu(
        req.params.id,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof menu> = {
        data: menu,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/merchant/menus/:id
 */
catalogueRouter.delete(
  "/menus/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await catalogueService.deleteMenu(
        req.params.id,
        merchantId,
        req.user!.id,
      );

      const response: ApiResponse<{ success: boolean; id: string }> = {
        data: { success: true, id: req.params.id },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/menus/:id/branches (Branch Assignments)
 */
catalogueRouter.post(
  "/menus/:id/branches",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = AssignMenuBranchesSchema.parse(req.body);
      const menu = await catalogueService.assignMenuBranches(
        req.params.id,
        merchantId,
        validated.branch_ids,
        req.user!.id,
      );

      const response: ApiResponse<typeof menu> = {
        data: menu,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 2. Categories
// ==========================================

/**
 * GET /api/v1/merchant/menus/:menuId/categories
 */
catalogueRouter.get(
  "/menus/:menuId/categories",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const categories = await catalogueService.listCategories(
        req.params.menuId,
        merchantId,
      );

      const response: ApiResponse<typeof categories> = {
        data: categories,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/menus/:menuId/categories
 */
catalogueRouter.post(
  "/menus/:menuId/categories",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = CreateCategorySchema.parse(req.body);
      const category = await catalogueService.createCategory(
        req.params.menuId,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof category> = {
        data: category,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/categories/:id
 */
catalogueRouter.patch(
  "/categories/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateCategorySchema.parse(req.body);
      const category = await catalogueService.updateCategory(
        req.params.id,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof category> = {
        data: category,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/menus/:menuId/categories/reorder
 */
catalogueRouter.post(
  "/menus/:menuId/categories/reorder",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = ReorderCategoriesSchema.parse(req.body);
      const reordered = await catalogueService.reorderCategories(
        req.params.menuId,
        merchantId,
        validated.category_ids,
        req.user!.id,
      );

      const response: ApiResponse<typeof reordered> = {
        data: reordered,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/merchant/categories/:id
 */
catalogueRouter.delete(
  "/categories/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await catalogueService.deleteCategory(
        req.params.id,
        merchantId,
        req.user!.id,
      );

      const response: ApiResponse<{ success: boolean; id: string }> = {
        data: { success: true, id: req.params.id },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 3. Menu Items
// ==========================================

/**
 * GET /api/v1/merchant/menus/:menuId/items
 */
catalogueRouter.get(
  "/menus/:menuId/items",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const categoryId = req.query.category_id as string | undefined;
      const items = await catalogueService.listItems(
        req.params.menuId,
        merchantId,
        categoryId,
      );

      const response: ApiResponse<typeof items> = {
        data: items,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/menus/:menuId/items
 */
catalogueRouter.post(
  "/menus/:menuId/items",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = CreateMenuItemSchema.parse(req.body);
      const item = await catalogueService.createItem(
        req.params.menuId,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof item> = {
        data: item,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/merchant/items/:id
 */
catalogueRouter.get(
  "/items/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const item = await catalogueService.getItem(req.params.id, merchantId);

      const response: ApiResponse<typeof item> = {
        data: item,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/items/:id
 */
catalogueRouter.patch(
  "/items/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateMenuItemSchema.parse(req.body);
      const item = await catalogueService.updateItem(
        req.params.id,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof item> = {
        data: item,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/categories/:categoryId/items/reorder
 */
catalogueRouter.post(
  "/categories/:categoryId/items/reorder",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = ReorderItemsSchema.parse(req.body);
      const reordered = await catalogueService.reorderItems(
        req.params.categoryId,
        merchantId,
        validated.item_ids,
        req.user!.id,
      );

      const response: ApiResponse<typeof reordered> = {
        data: reordered,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/merchant/items/:id
 */
catalogueRouter.delete(
  "/items/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await catalogueService.deleteItem(
        req.params.id,
        merchantId,
        req.user!.id,
      );

      const response: ApiResponse<{ success: boolean; id: string }> = {
        data: { success: true, id: req.params.id },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/items/:id/availability (Fast availability toggle: base or branch-scoped)
 */
catalogueRouter.patch(
  "/items/:id/availability",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateItemAvailabilitySchema.parse(req.body);
      const result = await catalogueService.setItemAvailability(
        req.params.id,
        merchantId,
        validated.is_available,
        validated.branch_id,
        req.user!.id,
      );

      const response: ApiResponse<typeof result> = {
        data: result,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 4. Modifier Groups & Options
// ==========================================

/**
 * GET /api/v1/merchant/modifier-groups
 */
catalogueRouter.get(
  "/modifier-groups",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const groups = await catalogueService.listModifierGroups(merchantId);

      const response: ApiResponse<typeof groups> = {
        data: groups,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/modifier-groups
 */
catalogueRouter.post(
  "/modifier-groups",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = CreateModifierGroupSchema.parse(req.body);
      const group = await catalogueService.createModifierGroup(
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof group> = {
        data: group,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/modifier-groups/:id
 */
catalogueRouter.patch(
  "/modifier-groups/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateModifierGroupSchema.parse(req.body);
      const group = await catalogueService.updateModifierGroup(
        req.params.id,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof group> = {
        data: group,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/merchant/modifier-groups/:id
 */
catalogueRouter.delete(
  "/modifier-groups/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await catalogueService.deleteModifierGroup(
        req.params.id,
        merchantId,
        req.user!.id,
      );

      const response: ApiResponse<{ success: boolean; id: string }> = {
        data: { success: true, id: req.params.id },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/items/:id/modifier-groups (Attach modifier groups to item)
 */
catalogueRouter.post(
  "/items/:id/modifier-groups",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = AttachModifierGroupsSchema.parse(req.body);
      await catalogueService.attachModifierGroupsToItem(
        req.params.id,
        merchantId,
        validated.modifier_group_ids,
        req.user!.id,
      );

      const updatedItem = await catalogueService.getItem(
        req.params.id,
        merchantId,
      );

      const response: ApiResponse<typeof updatedItem> = {
        data: updatedItem,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/modifier-groups/:groupId/options
 */
catalogueRouter.post(
  "/modifier-groups/:groupId/options",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = CreateModifierOptionSchema.parse(req.body);
      const option = await catalogueService.createModifierOption(
        req.params.groupId,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof option> = {
        data: option,
        requestId: (req as any).requestId,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/merchant/modifier-options/:id
 */
catalogueRouter.patch(
  "/modifier-options/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = UpdateModifierOptionSchema.parse(req.body);
      const option = await catalogueService.updateModifierOption(
        req.params.id,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof option> = {
        data: option,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/merchant/modifier-groups/:groupId/options/reorder
 */
catalogueRouter.post(
  "/modifier-groups/:groupId/options/reorder",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = ReorderModifierOptionsSchema.parse(req.body);
      const reordered = await catalogueService.reorderModifierOptions(
        req.params.groupId,
        merchantId,
        validated.option_ids,
        req.user!.id,
      );

      const response: ApiResponse<typeof reordered> = {
        data: reordered,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/merchant/modifier-options/:id
 */
catalogueRouter.delete(
  "/modifier-options/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      await catalogueService.deleteModifierOption(
        req.params.id,
        merchantId,
        req.user!.id,
      );

      const response: ApiResponse<{ success: boolean; id: string }> = {
        data: { success: true, id: req.params.id },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 5. Branch Catalogue & Overrides
// ==========================================

/**
 * GET /api/v1/merchant/branches/:id/catalogue
 */
catalogueRouter.get(
  "/branches/:id/catalogue",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const catalogue = await catalogueService.getBranchCatalogue(
        req.params.id,
        merchantId,
      );

      const response: ApiResponse<typeof catalogue> = {
        data: catalogue,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/merchant/branches/:branchId/items/:itemId/override
 */
catalogueRouter.put(
  "/branches/:branchId/items/:itemId/override",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = await resolveMerchantId(req);
      const validated = BranchCatalogueOverrideSchema.parse(req.body);
      const override = await catalogueService.updateBranchItemOverride(
        req.params.branchId,
        req.params.itemId,
        merchantId,
        validated,
        req.user!.id,
      );

      const response: ApiResponse<typeof override> = {
        data: override,
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 6. Object Storage / Image Upload
// ==========================================

/**
 * POST /api/v1/merchant/upload-image
 * Simulates CDN/Object Storage upload (S3/Cloud Storage)
 */
catalogueRouter.post(
  "/upload-image",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { url, filename, category } = req.body;
      const uploadedUrl =
        url ||
        `https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80`;

      const response: ApiResponse<{
        image_url: string;
        storage_key: string;
        size_bytes: number;
        mime_type: string;
      }> = {
        data: {
          image_url: uploadedUrl,
          storage_key: `merchants/${(req.user as any).id}/${filename || "item-img.jpg"}`,
          size_bytes: 245000,
          mime_type: "image/jpeg",
        },
        requestId: (req as any).requestId,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
