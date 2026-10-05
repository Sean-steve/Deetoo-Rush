import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Catalogue & Menu Domain Service
 * Business logic for Menu, Category, Item, Modifiers, Options, Branch Overrides,
 * Cross-merchant isolation, and Effective Availability calculation.
 */

import crypto from "crypto";
import {
  Menu,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  MenuItemBranchOverride,
  ModifierOptionBranchOverride,
  EnrichedCategoryWithItems,
  PublicRestaurantMenu,
  AuditAction,
  UserRole,
} from "@deetoo/types";
import { logger } from "@deetoo/utils";
import { AppError } from "../../middleware/error-handler";
import { authRepository } from "../auth/auth.repository";
import { merchantRepository } from "./merchant.repository";
import { catalogueRepository } from "./catalogue.repository";

export class CatalogueService {
  // ==========================================
  // Cross-Merchant Validation Helpers
  // ==========================================

  private async assertMenuOwnership(
    menuId: string,
    merchantId: string,
  ): Promise<Menu> {
    const menu = await catalogueRepository.findMenuById(menuId);
    if (!menu) {
      throw new AppError(
        404,
        "MENU_NOT_FOUND",
        `Menu with ID ${menuId} not found`,
      );
    }
    if (menu.merchant_id !== merchantId) {
      throw new AppError(
        403,
        "CROSS_MERCHANT_DENIED",
        "Menu does not belong to this merchant organization",
      );
    }
    return menu;
  }

  private async assertBranchOwnership(
    branchId: string,
    merchantId: string,
  ): Promise<void> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        `Branch with ID ${branchId} not found`,
      );
    }
    if (branch.merchant_id !== merchantId) {
      throw new AppError(
        403,
        "CROSS_MERCHANT_DENIED",
        `Branch ${branch.name} (${branchId}) does not belong to merchant ${merchantId}`,
      );
    }
  }

  private async assertModifierGroupOwnership(
    groupId: string,
    merchantId: string,
  ): Promise<ModifierGroup> {
    const group = await catalogueRepository.findModifierGroupById(groupId);
    if (!group) {
      throw new AppError(
        404,
        "MODIFIER_GROUP_NOT_FOUND",
        `Modifier group ${groupId} not found`,
      );
    }
    if (group.merchant_id !== merchantId) {
      throw new AppError(
        403,
        "CROSS_MERCHANT_DENIED",
        "Modifier group does not belong to this merchant organization",
      );
    }
    return group;
  }

  // ==========================================
  // Menus
  // ==========================================

  public async listMenus(merchantId: string): Promise<Menu[]> {
    return catalogueRepository.listMenusByMerchant(merchantId);
  }

  public async getMenu(menuId: string, merchantId: string): Promise<Menu> {
    return this.assertMenuOwnership(menuId, merchantId);
  }

  public async createMenu(
    merchantId: string,
    data: {
      name: string;
      description?: string;
      currency?: string;
      is_active?: boolean;
      branch_ids?: string[];
    },
    actorUserId: string,
  ): Promise<Menu> {
    // Validate branch ownership for all assigned branches
    if (data.branch_ids && data.branch_ids.length > 0) {
      for (const bId of data.branch_ids) {
        await this.assertBranchOwnership(bId, merchantId);
      }
    }

    const now = new Date().toISOString();
    const menu: Menu = {
      id: crypto.randomUUID(),
      merchant_id: merchantId,
      name: data.name,
      description: data.description,
      currency: data.currency || "KES",
      is_active: data.is_active ?? true,
      assigned_branch_ids: data.branch_ids || [],
      created_at: now,
      updated_at: now,
    };

    const created = await catalogueRepository.createMenu(menu);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MENU_CREATED,
      resource_type: "MENU",
      resource_id: created.id,
      metadata: {
        merchant_id: merchantId,
        name: created.name,
        branch_ids: data.branch_ids,
      },
    });

    return created;
  }

  public async updateMenu(
    menuId: string,
    merchantId: string,
    data: {
      name?: string;
      description?: string;
      currency?: string;
      is_active?: boolean;
      branch_ids?: string[];
    },
    actorUserId: string,
  ): Promise<Menu> {
    await this.assertMenuOwnership(menuId, merchantId);

    if (data.branch_ids !== undefined) {
      for (const bId of data.branch_ids) {
        await this.assertBranchOwnership(bId, merchantId);
      }
    }

    const updated = await catalogueRepository.updateMenu(menuId, {
      ...data,
      assigned_branch_ids: data.branch_ids,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MENU_UPDATED,
      resource_type: "MENU",
      resource_id: menuId,
      metadata: { merchant_id: merchantId, updates: data },
    });

    return updated!;
  }

  public async deleteMenu(
    menuId: string,
    merchantId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.assertMenuOwnership(menuId, merchantId);
    await catalogueRepository.deleteMenu(menuId);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MENU_DELETED,
      resource_type: "MENU",
      resource_id: menuId,
      metadata: { merchant_id: merchantId },
    });
  }

  public async assignMenuBranches(
    menuId: string,
    merchantId: string,
    branchIds: string[],
    actorUserId: string,
  ): Promise<Menu> {
    await this.assertMenuOwnership(menuId, merchantId);

    // Cross-merchant protection: ensure every branch belongs to this merchant
    for (const bId of branchIds) {
      await this.assertBranchOwnership(bId, merchantId);
    }

    await catalogueRepository.assignBranchesToMenu(menuId, branchIds);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MENU_BRANCHES_ASSIGNED,
      resource_type: "MENU",
      resource_id: menuId,
      metadata: { merchant_id: merchantId, branch_ids: branchIds },
    });

    return (await catalogueRepository.findMenuById(menuId))!;
  }

  // ==========================================
  // Categories
  // ==========================================

  public async listCategories(
    menuId: string,
    merchantId: string,
  ): Promise<MenuCategory[]> {
    await this.assertMenuOwnership(menuId, merchantId);
    return catalogueRepository.listCategoriesByMenu(menuId);
  }

  public async createCategory(
    menuId: string,
    merchantId: string,
    data: {
      name: string;
      description?: string;
      sort_order?: number;
      is_active?: boolean;
    },
    actorUserId: string,
  ): Promise<MenuCategory> {
    await this.assertMenuOwnership(menuId, merchantId);

    const now = new Date().toISOString();
    const existing = await catalogueRepository.listCategoriesByMenu(menuId);

    const category: MenuCategory = {
      id: crypto.randomUUID(),
      menu_id: menuId,
      name: data.name,
      description: data.description,
      sort_order: data.sort_order ?? existing.length,
      is_active: data.is_active ?? true,
      created_at: now,
      updated_at: now,
    };

    const created = await catalogueRepository.createCategory(category);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_CATEGORY_CREATED,
      resource_type: "MENU_CATEGORY",
      resource_id: created.id,
      metadata: {
        merchant_id: merchantId,
        menu_id: menuId,
        name: created.name,
      },
    });

    return created;
  }

  public async updateCategory(
    categoryId: string,
    merchantId: string,
    data: {
      name?: string;
      description?: string;
      sort_order?: number;
      is_active?: boolean;
    },
    actorUserId: string,
  ): Promise<MenuCategory> {
    const category = await catalogueRepository.findCategoryById(categoryId);
    if (!category) {
      throw new AppError(
        404,
        "CATEGORY_NOT_FOUND",
        `Category with ID ${categoryId} not found`,
      );
    }
    await this.assertMenuOwnership(category.menu_id, merchantId);

    const updated = await catalogueRepository.updateCategory(categoryId, data);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_CATEGORY_UPDATED,
      resource_type: "MENU_CATEGORY",
      resource_id: categoryId,
      metadata: { merchant_id: merchantId, updates: data },
    });

    return updated!;
  }

  public async reorderCategories(
    menuId: string,
    merchantId: string,
    categoryIds: string[],
    actorUserId: string,
  ): Promise<MenuCategory[]> {
    await this.assertMenuOwnership(menuId, merchantId);

    for (const id of categoryIds) {
      const child = await catalogueRepository.findCategoryById(id);
      if (!child || child.menu_id !== menuId) {
        throw new AppError(
          403,
          "CROSS_MERCHANT_DENIED",
          "Reordered resources must belong to the requested parent",
        );
      }
    }

    const reordered = await catalogueRepository.reorderCategories(
      menuId,
      categoryIds,
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_CATEGORIES_REORDERED,
      resource_type: "MENU",
      resource_id: menuId,
      metadata: { merchant_id: merchantId, category_ids: categoryIds },
    });

    return reordered;
  }

  public async deleteCategory(
    categoryId: string,
    merchantId: string,
    actorUserId: string,
  ): Promise<void> {
    const category = await catalogueRepository.findCategoryById(categoryId);
    if (!category) {
      throw new AppError(
        404,
        "CATEGORY_NOT_FOUND",
        `Category with ID ${categoryId} not found`,
      );
    }
    await this.assertMenuOwnership(category.menu_id, merchantId);

    await catalogueRepository.deleteCategory(categoryId);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_CATEGORY_DELETED,
      resource_type: "MENU_CATEGORY",
      resource_id: categoryId,
      metadata: { merchant_id: merchantId, menu_id: category.menu_id },
    });
  }

  // ==========================================
  // Menu Items
  // ==========================================

  public async listItems(
    menuId: string,
    merchantId: string,
    categoryId?: string,
  ): Promise<MenuItem[]> {
    await this.assertMenuOwnership(menuId, merchantId);
    return catalogueRepository.listItemsByMenu(menuId, categoryId);
  }

  public async getItem(itemId: string, merchantId: string): Promise<MenuItem> {
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(
        404,
        "ITEM_NOT_FOUND",
        `Item with ID ${itemId} not found`,
      );
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);
    return item;
  }

  public async createItem(
    menuId: string,
    merchantId: string,
    data: {
      category_id: string;
      name: string;
      description?: string;
      price_minor: number;
      currency?: string;
      sku?: string;
      image_url?: string;
      is_available?: boolean;
      sort_order?: number;
      modifier_group_ids?: string[];
    },
    actorUserId: string,
  ): Promise<MenuItem> {
    await this.assertMenuOwnership(menuId, merchantId);

    // Strict Money Validation: integer minor units only, non-negative
    if (!Number.isInteger(data.price_minor) || data.price_minor < 0) {
      throw new AppError(
        400,
        "INVALID_PRICE_FORMAT",
        "Price must be an integer minor unit (e.g., KES 12.50 is 1250 minor units). Decimals are forbidden.",
      );
    }

    // Referential integrity: ensure category exists and belongs to the same menu
    const category = await catalogueRepository.findCategoryById(
      data.category_id,
    );
    if (!category || category.menu_id !== menuId) {
      throw new AppError(
        400,
        "INVALID_CATEGORY",
        "Category does not belong to this menu",
      );
    }

    // Check modifier groups ownership if provided
    if (data.modifier_group_ids && data.modifier_group_ids.length > 0) {
      for (const mgId of data.modifier_group_ids) {
        await this.assertModifierGroupOwnership(mgId, merchantId);
      }
    }

    const now = new Date().toISOString();
    const existing = await catalogueRepository.listItemsByCategory(
      data.category_id,
    );

    const item: MenuItem = {
      id: crypto.randomUUID(),
      menu_id: menuId,
      category_id: data.category_id,
      name: data.name,
      description: data.description,
      price_minor: data.price_minor,
      currency: data.currency || "KES",
      sku: data.sku,
      image_url: data.image_url,
      is_available: data.is_available ?? true,
      sort_order: data.sort_order ?? existing.length,
      modifier_group_ids: data.modifier_group_ids || [],
      created_at: now,
      updated_at: now,
    };

    const created = await catalogueRepository.createItem(item);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_ITEM_CREATED,
      resource_type: "MENU_ITEM",
      resource_id: created.id,
      metadata: {
        merchant_id: merchantId,
        menu_id: menuId,
        name: created.name,
        price_minor: created.price_minor,
      },
    });

    return created;
  }

  public async updateItem(
    itemId: string,
    merchantId: string,
    data: {
      category_id?: string;
      name?: string;
      description?: string;
      price_minor?: number;
      currency?: string;
      sku?: string;
      image_url?: string;
      is_available?: boolean;
      sort_order?: number;
      modifier_group_ids?: string[];
    },
    actorUserId: string,
  ): Promise<MenuItem> {
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(
        404,
        "ITEM_NOT_FOUND",
        `Item with ID ${itemId} not found`,
      );
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);

    if (data.price_minor !== undefined) {
      if (!Number.isInteger(data.price_minor) || data.price_minor < 0) {
        throw new AppError(
          400,
          "INVALID_PRICE_FORMAT",
          "Price must be a non-negative integer minor unit",
        );
      }
    }

    if (data.category_id && data.category_id !== item.category_id) {
      const targetCategory = await catalogueRepository.findCategoryById(
        data.category_id,
      );
      if (!targetCategory || targetCategory.menu_id !== item.menu_id) {
        throw new AppError(
          400,
          "INVALID_CATEGORY",
          "Target category does not belong to the same menu",
        );
      }
    }

    if (data.modifier_group_ids !== undefined) {
      for (const mgId of data.modifier_group_ids) {
        await this.assertModifierGroupOwnership(mgId, merchantId);
      }
    }

    const updated = await catalogueRepository.updateItem(itemId, data);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_ITEM_UPDATED,
      resource_type: "MENU_ITEM",
      resource_id: itemId,
      metadata: { merchant_id: merchantId, updates: data },
    });

    return updated!;
  }

  public async reorderItems(
    categoryId: string,
    merchantId: string,
    itemIds: string[],
    actorUserId: string,
  ): Promise<MenuItem[]> {
    const category = await catalogueRepository.findCategoryById(categoryId);
    if (!category) {
      throw new AppError(
        404,
        "CATEGORY_NOT_FOUND",
        `Category with ID ${categoryId} not found`,
      );
    }
    await this.assertMenuOwnership(category.menu_id, merchantId);

    for (const id of itemIds) {
      const child = await catalogueRepository.findItemById(id);
      if (!child || child.category_id !== categoryId) {
        throw new AppError(
          403,
          "CROSS_MERCHANT_DENIED",
          "Reordered resources must belong to the requested parent",
        );
      }
    }

    const reordered = await catalogueRepository.reorderItems(
      categoryId,
      itemIds,
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_ITEMS_REORDERED,
      resource_type: "MENU_CATEGORY",
      resource_id: categoryId,
      metadata: { merchant_id: merchantId, item_ids: itemIds },
    });

    return reordered;
  }

  public async deleteItem(
    itemId: string,
    merchantId: string,
    actorUserId: string,
  ): Promise<void> {
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(
        404,
        "ITEM_NOT_FOUND",
        `Item with ID ${itemId} not found`,
      );
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);

    await catalogueRepository.deleteItem(itemId);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_ITEM_DELETED,
      resource_type: "MENU_ITEM",
      resource_id: itemId,
      metadata: { merchant_id: merchantId, menu_id: item.menu_id },
    });
  }

  public async setItemAvailability(
    itemId: string,
    merchantId: string,
    isAvailable: boolean,
    branchId: string | undefined,
    actorUserId: string,
  ): Promise<{ item_id: string; is_available: boolean; branch_id?: string }> {
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(
        404,
        "ITEM_NOT_FOUND",
        `Item with ID ${itemId} not found`,
      );
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);

    if (branchId) {
      await this.assertBranchOwnership(branchId, merchantId);
      await catalogueRepository.setBranchItemOverride(branchId, itemId, {
        is_available: isAvailable,
      });

      await authRepository.createAuditLog({
        actor_user_id: actorUserId,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.CATALOGUE_BRANCH_OVERRIDE_UPDATED,
        resource_type: "MENU_ITEM_OVERRIDE",
        resource_id: `${branchId}:${itemId}`,
        metadata: {
          merchant_id: merchantId,
          branch_id: branchId,
          item_id: itemId,
          is_available: isAvailable,
        },
      });

      return {
        item_id: itemId,
        is_available: isAvailable,
        branch_id: branchId,
      };
    } else {
      await catalogueRepository.setItemAvailability(itemId, isAvailable);

      await authRepository.createAuditLog({
        actor_user_id: actorUserId,
        actor_role: UserRole.MERCHANT,
        action: AuditAction.CATALOGUE_ITEM_AVAILABILITY_CHANGED,
        resource_type: "MENU_ITEM",
        resource_id: itemId,
        metadata: { merchant_id: merchantId, is_available: isAvailable },
      });

      return { item_id: itemId, is_available: isAvailable };
    }
  }

  // ==========================================
  // Modifier Groups & Options
  // ==========================================

  public async listModifierGroups(
    merchantId: string,
  ): Promise<ModifierGroup[]> {
    return catalogueRepository.listModifierGroupsByMerchant(merchantId);
  }

  public async getModifierGroup(
    groupId: string,
    merchantId: string,
  ): Promise<ModifierGroup> {
    return this.assertModifierGroupOwnership(groupId, merchantId);
  }

  public async createModifierGroup(
    merchantId: string,
    data: { name: string; min_selections: number; max_selections: number },
    actorUserId: string,
  ): Promise<ModifierGroup> {
    if (data.min_selections < 0 || data.max_selections < data.min_selections) {
      throw new AppError(
        400,
        "INVALID_SELECTION_RANGE",
        "max_selections must be >= min_selections and >= 0",
      );
    }

    const now = new Date().toISOString();
    const group: ModifierGroup = {
      id: crypto.randomUUID(),
      merchant_id: merchantId,
      name: data.name,
      min_selections: data.min_selections,
      max_selections: data.max_selections,
      is_required: data.min_selections >= 1,
      created_at: now,
      updated_at: now,
    };

    const created = await catalogueRepository.createModifierGroup(group);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_GROUP_CREATED,
      resource_type: "MODIFIER_GROUP",
      resource_id: created.id,
      metadata: { merchant_id: merchantId, name: created.name },
    });

    return created;
  }

  public async updateModifierGroup(
    groupId: string,
    merchantId: string,
    data: { name?: string; min_selections?: number; max_selections?: number },
    actorUserId: string,
  ): Promise<ModifierGroup> {
    const existing = await this.assertModifierGroupOwnership(
      groupId,
      merchantId,
    );

    const min = data.min_selections ?? existing.min_selections;
    const max = data.max_selections ?? existing.max_selections;

    if (min < 0 || max < min) {
      throw new AppError(
        400,
        "INVALID_SELECTION_RANGE",
        "max_selections must be >= min_selections and >= 0",
      );
    }

    const updated = await catalogueRepository.updateModifierGroup(
      groupId,
      data,
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_GROUP_UPDATED,
      resource_type: "MODIFIER_GROUP",
      resource_id: groupId,
      metadata: { merchant_id: merchantId, updates: data },
    });

    return updated!;
  }

  public async deleteModifierGroup(
    groupId: string,
    merchantId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.assertModifierGroupOwnership(groupId, merchantId);
    await catalogueRepository.deleteModifierGroup(groupId);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_GROUP_DELETED,
      resource_type: "MODIFIER_GROUP",
      resource_id: groupId,
      metadata: { merchant_id: merchantId },
    });
  }

  public async createModifierOption(
    groupId: string,
    merchantId: string,
    data: {
      name: string;
      price_delta_minor?: number;
      is_available?: boolean;
      sort_order?: number;
    },
    actorUserId: string,
  ): Promise<ModifierOption> {
    await this.assertModifierGroupOwnership(groupId, merchantId);

    const priceDelta = data.price_delta_minor ?? 0;
    if (!Number.isInteger(priceDelta) || priceDelta < 0) {
      throw new AppError(
        400,
        "INVALID_PRICE_FORMAT",
        "price_delta_minor must be a non-negative integer minor unit",
      );
    }

    const now = new Date().toISOString();
    const existing =
      await catalogueRepository.listModifierOptionsByGroup(groupId);

    const option: ModifierOption = {
      id: crypto.randomUUID(),
      modifier_group_id: groupId,
      name: data.name,
      price_delta_minor: priceDelta,
      is_available: data.is_available ?? true,
      sort_order: data.sort_order ?? existing.length,
      created_at: now,
      updated_at: now,
    };

    const created = await catalogueRepository.createModifierOption(option);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_OPTION_CREATED,
      resource_type: "MODIFIER_OPTION",
      resource_id: created.id,
      metadata: {
        merchant_id: merchantId,
        group_id: groupId,
        name: created.name,
      },
    });

    return created;
  }

  public async updateModifierOption(
    optionId: string,
    merchantId: string,
    data: {
      name?: string;
      price_delta_minor?: number;
      is_available?: boolean;
      sort_order?: number;
    },
    actorUserId: string,
  ): Promise<ModifierOption> {
    const option = await catalogueRepository.findModifierOptionById(optionId);
    if (!option) {
      throw new AppError(
        404,
        "OPTION_NOT_FOUND",
        `Modifier option ${optionId} not found`,
      );
    }
    await this.assertModifierGroupOwnership(
      option.modifier_group_id,
      merchantId,
    );

    if (data.price_delta_minor !== undefined) {
      if (
        !Number.isInteger(data.price_delta_minor) ||
        data.price_delta_minor < 0
      ) {
        throw new AppError(
          400,
          "INVALID_PRICE_FORMAT",
          "price_delta_minor must be a non-negative integer minor unit",
        );
      }
    }

    const updated = await catalogueRepository.updateModifierOption(
      optionId,
      data,
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_OPTION_UPDATED,
      resource_type: "MODIFIER_OPTION",
      resource_id: optionId,
      metadata: { merchant_id: merchantId, updates: data },
    });

    return updated!;
  }

  public async reorderModifierOptions(
    groupId: string,
    merchantId: string,
    optionIds: string[],
    actorUserId: string,
  ): Promise<ModifierOption[]> {
    await this.assertModifierGroupOwnership(groupId, merchantId);

    for (const id of optionIds) {
      const child = await catalogueRepository.findModifierOptionById(id);
      if (!child || child.modifier_group_id !== groupId) {
        throw new AppError(
          403,
          "CROSS_MERCHANT_DENIED",
          "Reordered resources must belong to the requested parent",
        );
      }
    }

    const reordered = await catalogueRepository.reorderModifierOptions(
      groupId,
      optionIds,
    );

    return reordered;
  }

  public async deleteModifierOption(
    optionId: string,
    merchantId: string,
    actorUserId: string,
  ): Promise<void> {
    const option = await catalogueRepository.findModifierOptionById(optionId);
    if (!option) {
      throw new AppError(
        404,
        "OPTION_NOT_FOUND",
        `Modifier option ${optionId} not found`,
      );
    }
    await this.assertModifierGroupOwnership(
      option.modifier_group_id,
      merchantId,
    );

    await catalogueRepository.deleteModifierOption(optionId);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_MODIFIER_OPTION_DELETED,
      resource_type: "MODIFIER_OPTION",
      resource_id: optionId,
      metadata: { merchant_id: merchantId, group_id: option.modifier_group_id },
    });
  }

  public async attachModifierGroupsToItem(
    itemId: string,
    merchantId: string,
    groupIds: string[],
    actorUserId: string,
  ): Promise<void> {
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(404, "ITEM_NOT_FOUND", `Item ${itemId} not found`);
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);

    for (const gId of groupIds) {
      await this.assertModifierGroupOwnership(gId, merchantId);
    }

    await catalogueRepository.attachModifierGroupsToItem(itemId, groupIds);

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_ITEM_UPDATED,
      resource_type: "MENU_ITEM",
      resource_id: itemId,
      metadata: { merchant_id: merchantId, modifier_group_ids: groupIds },
    });
  }

  // ==========================================
  // Branch Catalogue & Overrides
  // ==========================================

  public async getBranchCatalogue(
    branchId: string,
    merchantId?: string,
  ): Promise<{ menu: Menu; categories: EnrichedCategoryWithItems[] } | null> {
    if (merchantId) {
      await this.assertBranchOwnership(branchId, merchantId);
    }
    return catalogueRepository.getEffectiveCatalogueForBranch(branchId);
  }

  public async updateBranchItemOverride(
    branchId: string,
    itemId: string,
    merchantId: string,
    override: { is_available?: boolean; price_override_minor?: number | null },
    actorUserId: string,
  ): Promise<MenuItemBranchOverride> {
    await this.assertBranchOwnership(branchId, merchantId);
    const item = await catalogueRepository.findItemById(itemId);
    if (!item) {
      throw new AppError(404, "ITEM_NOT_FOUND", `Item ${itemId} not found`);
    }
    await this.assertMenuOwnership(item.menu_id, merchantId);

    const result = await catalogueRepository.setBranchItemOverride(
      branchId,
      itemId,
      override,
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.MERCHANT,
      action: AuditAction.CATALOGUE_BRANCH_OVERRIDE_UPDATED,
      resource_type: "MENU_ITEM_OVERRIDE",
      resource_id: `${branchId}:${itemId}`,
      metadata: {
        merchant_id: merchantId,
        branch_id: branchId,
        item_id: itemId,
        override,
      },
    });

    return result;
  }

  // ==========================================
  // Customer Public Safe Restaurant Menu
  // ==========================================

  public async getPublicRestaurantMenu(
    branchId: string,
  ): Promise<PublicRestaurantMenu> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        `Restaurant branch not found`,
      );
    }

    const merchant = await merchantRepository.findMerchantById(
      branch.merchant_id,
    );
    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        `Merchant profile not found`,
      );
    }

    const effectiveCatalogue =
      await catalogueRepository.getEffectiveCatalogueForBranch(branchId);
    if (!effectiveCatalogue) {
      throw new AppError(
        404,
        "MENU_NOT_FOUND",
        "No active menu is assigned to this restaurant branch",
      );
    }

    // Filter categories & items to ensure only clean public-safe fields are returned
    const publicCategories = effectiveCatalogue.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      sort_order: cat.sort_order,
      items: cat.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price_minor: item.effective_price_minor,
        currency: item.currency,
        image_url: item.image_url,
        is_available: item.effective_available,
        modifier_groups: item.modifier_groups.map((mg) => ({
          id: mg.id,
          name: mg.name,
          min_selections: mg.min_selections,
          max_selections: mg.max_selections,
          is_required: mg.is_required,
          options: mg.options.map((opt) => ({
            id: opt.id,
            name: opt.name,
            price_delta_minor: opt.effective_price_delta_minor,
            is_available: opt.effective_available,
          })),
        })),
      })),
    }));

    return {
      menu: effectiveCatalogue.menu,
      branch: {
        id: branch.id,
        name: branch.name,
        address_text: branch.address_text,
        operational_status: branch.operational_status,
        currency: branch.currency,
      },
      merchant: {
        id: merchant.id,
        display_name: merchant.display_name,
        logo_url: merchant.logo_url,
        description: merchant.description,
      },
      categories: publicCategories,
    };
  }
}

export const catalogueService = transactionalService(new CatalogueService());
