import { allowMemoryAdapter } from '../../db/storage-policy';
import { storageAdapter } from '../../db/adapter';
import { postgresCatalogue } from './catalogue.postgres';
import { config } from '@deetoo/config';
/**
 * DEETOO - Catalogue & Menu Repository
 * Domain storage for Menus, Categories, Items, Modifiers, Options, and Branch Availability Overrides
 * Resilient multi-layer data access with PostgreSQL and EphemeralCatalogueStore fallback (ADR-002, ADR-005)
 */

import {
  Menu,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  MenuItemBranchOverride,
  ModifierOptionBranchOverride,
  EnrichedMenuItem,
  EnrichedCategoryWithItems,
  EnrichedModifierGroup,
  EnrichedModifierOption,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';
import { getDbPool } from '../../db/client';

export class EphemeralCatalogueStore {
  public menus = new Map<string, Menu>();
  public menuBranches = new Map<string, Set<string>>(); // menu_id -> Set of branch_ids
  public branchMenus = new Map<string, Set<string>>(); // branch_id -> Set of menu_ids
  public categories = new Map<string, MenuCategory>();
  public menuCategories = new Map<string, string[]>(); // menu_id -> category_ids (ordered)
  public items = new Map<string, MenuItem>();
  public categoryItems = new Map<string, string[]>(); // category_id -> item_ids (ordered)
  public modifierGroups = new Map<string, ModifierGroup>();
  public merchantModifierGroups = new Map<string, string[]>(); // merchant_id -> group_ids
  public modifierOptions = new Map<string, ModifierOption>();
  public groupModifierOptions = new Map<string, string[]>(); // group_id -> option_ids (ordered)
  public itemModifierGroups = new Map<string, string[]>(); // item_id -> group_ids
  public itemBranchOverrides = new Map<string, MenuItemBranchOverride>(); // `${branch_id}:${item_id}` -> override
  public modifierOptionBranchOverrides = new Map<string, ModifierOptionBranchOverride>(); // `${branch_id}:${option_id}` -> override

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();

    // -------------------------------------------------------------
    // Merchant 1: Nairobi Burger Co. (merchant_burger_01)
    // -------------------------------------------------------------
    const burgerMerchantId = 'merchant_burger_01';
    const menuBurgerId = 'menu_burger_main_01';

    const menuBurger: Menu = {
      id: menuBurgerId,
      merchant_id: burgerMerchantId,
      name: 'All-Day Smash & Shakes Menu',
      description: 'Artisanal smash burgers, hand-cut twice-cooked fries, and thick craft milkshakes.',
      currency: 'KES',
      is_active: true,
      assigned_branch_ids: ['branch_westlands_01', 'branch_kilimani_02'],
      created_at: now,
      updated_at: now,
    };
    this.menus.set(menuBurger.id, menuBurger);

    // Assign to branches
    this.menuBranches.set(menuBurgerId, new Set(['branch_westlands_01', 'branch_kilimani_02']));
    this.branchMenus.set('branch_westlands_01', new Set([menuBurgerId]));
    this.branchMenus.set('branch_kilimani_02', new Set([menuBurgerId]));

    // Modifier Groups for Nairobi Burger Co.
    // 1. Bun Choice (Required, 1 selection)
    const mgBun: ModifierGroup = {
      id: 'mg_burger_bun_01',
      merchant_id: burgerMerchantId,
      name: 'Choose Your Bun',
      min_selections: 1,
      max_selections: 1,
      is_required: true,
      created_at: now,
      updated_at: now,
    };
    this.modifierGroups.set(mgBun.id, mgBun);

    const optBrioche: ModifierOption = {
      id: 'mo_bun_brioche',
      modifier_group_id: mgBun.id,
      name: 'Toasted Golden Brioche',
      price_delta_minor: 0,
      is_available: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };
    const optSesame: ModifierOption = {
      id: 'mo_bun_sesame',
      modifier_group_id: mgBun.id,
      name: 'Classic Sesame Seed Bun',
      price_delta_minor: 0,
      is_available: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    };
    const optLettuce: ModifierOption = {
      id: 'mo_bun_lettuce',
      modifier_group_id: mgBun.id,
      name: 'Gluten-Free Crisp Lettuce Wrap',
      price_delta_minor: 5000, // + KES 50.00
      is_available: true,
      sort_order: 2,
      created_at: now,
      updated_at: now,
    };
    this.modifierOptions.set(optBrioche.id, optBrioche);
    this.modifierOptions.set(optSesame.id, optSesame);
    this.modifierOptions.set(optLettuce.id, optLettuce);
    this.groupModifierOptions.set(mgBun.id, [optBrioche.id, optSesame.id, optLettuce.id]);

    // 2. Extra Cheese & Toppings (Optional, up to 3)
    const mgToppings: ModifierGroup = {
      id: 'mg_burger_toppings_02',
      merchant_id: burgerMerchantId,
      name: 'Extra Gourmet Toppings',
      min_selections: 0,
      max_selections: 3,
      is_required: false,
      created_at: now,
      updated_at: now,
    };
    this.modifierGroups.set(mgToppings.id, mgToppings);

    const optExtraCheese: ModifierOption = {
      id: 'mo_top_cheese',
      modifier_group_id: mgToppings.id,
      name: 'Extra Melted Aged Cheddar',
      price_delta_minor: 10000, // + KES 100.00
      is_available: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };
    const optBacon: ModifierOption = {
      id: 'mo_top_bacon',
      modifier_group_id: mgToppings.id,
      name: 'Crispy Beef Bacon Rashers',
      price_delta_minor: 15000, // + KES 150.00
      is_available: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    };
    const optJalapenos: ModifierOption = {
      id: 'mo_top_jalapenos',
      modifier_group_id: mgToppings.id,
      name: 'Pickled Fire Jalapeños',
      price_delta_minor: 5000, // + KES 50.00
      is_available: true,
      sort_order: 2,
      created_at: now,
      updated_at: now,
    };
    this.modifierOptions.set(optExtraCheese.id, optExtraCheese);
    this.modifierOptions.set(optBacon.id, optBacon);
    this.modifierOptions.set(optJalapenos.id, optJalapenos);
    this.groupModifierOptions.set(mgToppings.id, [optExtraCheese.id, optBacon.id, optJalapenos.id]);

    // 3. Shake Size (Required, 1 selection)
    const mgShakeSize: ModifierGroup = {
      id: 'mg_shake_size_03',
      merchant_id: burgerMerchantId,
      name: 'Select Shake Size',
      min_selections: 1,
      max_selections: 1,
      is_required: true,
      created_at: now,
      updated_at: now,
    };
    this.modifierGroups.set(mgShakeSize.id, mgShakeSize);

    const optRegularShake: ModifierOption = {
      id: 'mo_shake_reg',
      modifier_group_id: mgShakeSize.id,
      name: 'Regular (350ml)',
      price_delta_minor: 0,
      is_available: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };
    const optLargeShake: ModifierOption = {
      id: 'mo_shake_large',
      modifier_group_id: mgShakeSize.id,
      name: 'Large Jumbo (500ml)',
      price_delta_minor: 10000, // + KES 100.00
      is_available: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    };
    this.modifierOptions.set(optRegularShake.id, optRegularShake);
    this.modifierOptions.set(optLargeShake.id, optLargeShake);
    this.groupModifierOptions.set(mgShakeSize.id, [optRegularShake.id, optLargeShake.id]);

    this.merchantModifierGroups.set(burgerMerchantId, [mgBun.id, mgToppings.id, mgShakeSize.id]);

    // Categories for Nairobi Burger Co.
    const catBurgers: MenuCategory = {
      id: 'cat_burgers_01',
      menu_id: menuBurgerId,
      name: 'Artisanal Smash Burgers',
      description: '100% grass-fed Kenyan beef patties, smashed ultra-crispy on cast iron griddles.',
      sort_order: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    const catSides: MenuCategory = {
      id: 'cat_sides_02',
      menu_id: menuBurgerId,
      name: 'Sides & Loaded Fries',
      description: 'Twice-cooked hand-cut fries and golden battered snacks.',
      sort_order: 1,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    const catDrinks: MenuCategory = {
      id: 'cat_drinks_03',
      menu_id: menuBurgerId,
      name: 'Shakes & Cold Drinks',
      description: 'Hand-spun ice cream milkshakes and fresh fruit sodas.',
      sort_order: 2,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    this.categories.set(catBurgers.id, catBurgers);
    this.categories.set(catSides.id, catSides);
    this.categories.set(catDrinks.id, catDrinks);
    this.menuCategories.set(menuBurgerId, [catBurgers.id, catSides.id, catDrinks.id]);

    // Items
    // Item 1: Westlands Double Smash
    const itemWestlandsDouble: MenuItem = {
      id: 'item_westlands_double_01',
      menu_id: menuBurgerId,
      category_id: catBurgers.id,
      name: 'The Westlands Double Smash',
      description: 'Two smashed grass-fed beef patties, double aged cheddar, caramelized onions, house burger sauce.',
      price_minor: 85000, // KES 850.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
      is_available: true,
      sort_order: 0,
      modifier_group_ids: [mgBun.id, mgToppings.id],
      created_at: now,
      updated_at: now,
    };

    // Item 2: Crispy Buttermilk Chicken
    const itemCrispyChicken: MenuItem = {
      id: 'item_crispy_chicken_02',
      menu_id: menuBurgerId,
      category_id: catBurgers.id,
      name: 'Crispy Buttermilk Chicken Burger',
      description: '24-hour spiced buttermilk fried chicken breast, tangy pickled slaw, garlic herb mayo.',
      price_minor: 75000, // KES 750.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600',
      is_available: true,
      sort_order: 1,
      modifier_group_ids: [mgBun.id, mgToppings.id],
      created_at: now,
      updated_at: now,
    };

    // Item 3: Truffle Mushroom Swiss
    const itemTruffleSwiss: MenuItem = {
      id: 'item_truffle_swiss_03',
      menu_id: menuBurgerId,
      category_id: catBurgers.id,
      name: 'Truffle Mushroom Swiss Burger',
      description: 'Smashed beef patty, sautéed garlic butter wild mushrooms, melted Swiss cheese, truffle aioli.',
      price_minor: 95000, // KES 950.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600',
      is_available: true,
      sort_order: 2,
      modifier_group_ids: [mgBun.id],
      created_at: now,
      updated_at: now,
    };

    // Item 4: Rustic Fries
    const itemRusticFries: MenuItem = {
      id: 'item_rustic_fries_04',
      menu_id: menuBurgerId,
      category_id: catSides.id,
      name: 'Hand-Cut Rosemary Rustic Fries',
      description: 'Fresh Kenyan potatoes twice-cooked with fresh rosemary and cracked sea salt.',
      price_minor: 25000, // KES 250.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600',
      is_available: true,
      sort_order: 0,
      modifier_group_ids: [],
      created_at: now,
      updated_at: now,
    };

    // Item 5: Loaded Fries
    const itemLoadedFries: MenuItem = {
      id: 'item_loaded_fries_05',
      menu_id: menuBurgerId,
      category_id: catSides.id,
      name: 'Loaded Cheddar & Bacon Fries',
      description: 'Golden fries drenched in warm cheddar cheese sauce, crispy beef bacon bits, and scallions.',
      price_minor: 45000, // KES 450.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600',
      is_available: true,
      sort_order: 1,
      modifier_group_ids: [],
      created_at: now,
      updated_at: now,
    };

    // Item 6: Salted Caramel Shake
    const itemCaramelShake: MenuItem = {
      id: 'item_caramel_shake_06',
      menu_id: menuBurgerId,
      category_id: catDrinks.id,
      name: 'Artisan Salted Caramel Milkshake',
      description: 'Hand-spun vanilla dairy cream, homemade sea-salt caramel sauce, crowned with whipped cream.',
      price_minor: 40000, // KES 400.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600',
      is_available: true,
      sort_order: 0,
      modifier_group_ids: [mgShakeSize.id],
      created_at: now,
      updated_at: now,
    };

    // Store items
    [
      itemWestlandsDouble,
      itemCrispyChicken,
      itemTruffleSwiss,
      itemRusticFries,
      itemLoadedFries,
      itemCaramelShake,
    ].forEach((item) => {
      this.items.set(item.id, item);
      this.itemModifierGroups.set(item.id, item.modifier_group_ids || []);
    });

    this.categoryItems.set(catBurgers.id, [
      itemWestlandsDouble.id,
      itemCrispyChicken.id,
      itemTruffleSwiss.id,
    ]);
    this.categoryItems.set(catSides.id, [itemRusticFries.id, itemLoadedFries.id]);
    this.categoryItems.set(catDrinks.id, [itemCaramelShake.id]);

    // Branch Availability Overrides:
    // On branch_kilimani_02, Truffle Mushroom Swiss Burger is out of stock today
    this.itemBranchOverrides.set(`branch_kilimani_02:${itemTruffleSwiss.id}`, {
      branch_id: 'branch_kilimani_02',
      item_id: itemTruffleSwiss.id,
      is_available: false,
      updated_at: now,
    });

    // -------------------------------------------------------------
    // Merchant 2: Swahili Plate Express (merchant_swahili_02)
    // -------------------------------------------------------------
    const swahiliMerchantId = 'merchant_swahili_02';
    const menuSwahiliId = 'menu_swahili_coast_02';

    const menuSwahili: Menu = {
      id: menuSwahiliId,
      merchant_id: swahiliMerchantId,
      name: 'Coastal Flavours & Biryani Specials',
      description: 'Authentic coastal Swahili cuisine: fragrant biryani, slow-cooked beef pilau, and mahamri.',
      currency: 'KES',
      is_active: true,
      assigned_branch_ids: ['branch_cbd_03'],
      created_at: now,
      updated_at: now,
    };
    this.menus.set(menuSwahili.id, menuSwahili);
    this.menuBranches.set(menuSwahiliId, new Set(['branch_cbd_03']));
    this.branchMenus.set('branch_cbd_03', new Set([menuSwahiliId]));

    const catRice: MenuCategory = {
      id: 'cat_rice_01',
      menu_id: menuSwahiliId,
      name: 'Coastal Rice & Biryani',
      description: 'Steamed basmati rice flavored with aromatic spices and saffron.',
      sort_order: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    this.categories.set(catRice.id, catRice);
    this.menuCategories.set(menuSwahiliId, [catRice.id]);

    const itemBiryani: MenuItem = {
      id: 'item_swahili_biryani_01',
      menu_id: menuSwahiliId,
      category_id: catRice.id,
      name: 'Mombasa Chicken Biryani',
      description: 'Tender chicken simmered in a spiced tomato yogurt gravy, layered with fragrant basmati rice.',
      price_minor: 65000, // KES 650.00
      currency: 'KES',
      image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600',
      is_available: true,
      sort_order: 0,
      modifier_group_ids: [],
      created_at: now,
      updated_at: now,
    };
    this.items.set(itemBiryani.id, itemBiryani);
    this.categoryItems.set(catRice.id, [itemBiryani.id]);
  }
}

export const ephemeralCatalogueStore = new EphemeralCatalogueStore();

export class CatalogueRepository {
  // ==========================================
  // Menus
  // ==========================================

  public async createMenu(menu: Menu): Promise<Menu> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.menus.set(menu.id, menu);
    if (menu.assigned_branch_ids && menu.assigned_branch_ids.length > 0) {
      await this.assignBranchesToMenu(menu.id, menu.assigned_branch_ids);
    }
    return menu;
  }

  public async findMenuById(id: string): Promise<Menu | null> {
    allowMemoryAdapter();
    const menu = ephemeralCatalogueStore.menus.get(id);
    if (!menu) return null;
    const branches = ephemeralCatalogueStore.menuBranches.get(id);
    return {
      ...menu,
      assigned_branch_ids: branches ? Array.from(branches) : [],
    };
  }

  public async listMenusByMerchant(merchantId: string): Promise<Menu[]> {
    allowMemoryAdapter();
    const list: Menu[] = [];
    for (const menu of ephemeralCatalogueStore.menus.values()) {
      if (menu.merchant_id === merchantId) {
        const branches = ephemeralCatalogueStore.menuBranches.get(menu.id);
        list.push({
          ...menu,
          assigned_branch_ids: branches ? Array.from(branches) : [],
        });
      }
    }
    return list;
  }

  public async updateMenu(id: string, updates: Partial<Menu>): Promise<Menu | null> {
    allowMemoryAdapter();
    const existing = ephemeralCatalogueStore.menus.get(id);
    if (!existing) return null;
    const updated: Menu = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    ephemeralCatalogueStore.menus.set(id, updated);

    if (updates.assigned_branch_ids !== undefined) {
      await this.assignBranchesToMenu(id, updates.assigned_branch_ids);
      updated.assigned_branch_ids = updates.assigned_branch_ids;
    }
    return updated;
  }

  public async deleteMenu(id: string): Promise<boolean> {
    allowMemoryAdapter();
    const exists = ephemeralCatalogueStore.menus.has(id);
    if (!exists) return false;

    // Remove branch associations
    const branchIds = ephemeralCatalogueStore.menuBranches.get(id);
    if (branchIds) {
      for (const bId of branchIds) {
        const set = ephemeralCatalogueStore.branchMenus.get(bId);
        if (set) set.delete(id);
      }
      ephemeralCatalogueStore.menuBranches.delete(id);
    }

    // Cascade remove categories and items
    const catIds = ephemeralCatalogueStore.menuCategories.get(id) || [];
    for (const cId of catIds) {
      await this.deleteCategory(cId);
    }
    ephemeralCatalogueStore.menuCategories.delete(id);

    ephemeralCatalogueStore.menus.delete(id);
    return true;
  }

  public async assignBranchesToMenu(menuId: string, branchIds: string[]): Promise<void> {
    allowMemoryAdapter();
    // Clear old associations
    const existingBranches = ephemeralCatalogueStore.menuBranches.get(menuId);
    if (existingBranches) {
      for (const bId of existingBranches) {
        const set = ephemeralCatalogueStore.branchMenus.get(bId);
        if (set) set.delete(menuId);
      }
    }

    // Set new associations
    const newSet = new Set(branchIds);
    ephemeralCatalogueStore.menuBranches.set(menuId, newSet);
    for (const bId of branchIds) {
      let bSet = ephemeralCatalogueStore.branchMenus.get(bId);
      if (!bSet) {
        bSet = new Set();
        ephemeralCatalogueStore.branchMenus.set(bId, bSet);
      }
      bSet.add(menuId);
    }

    const menu = ephemeralCatalogueStore.menus.get(menuId);
    if (menu) {
      menu.assigned_branch_ids = branchIds;
      menu.updated_at = new Date().toISOString();
    }
  }

  public async getBranchAssignedMenus(branchId: string): Promise<Menu[]> {
    allowMemoryAdapter();
    const menuIds = ephemeralCatalogueStore.branchMenus.get(branchId);
    if (!menuIds) return [];
    const list: Menu[] = [];
    for (const mId of menuIds) {
      const menu = await this.findMenuById(mId);
      if (menu) list.push(menu);
    }
    return list;
  }

  // ==========================================
  // Categories
  // ==========================================

  public async createCategory(category: MenuCategory): Promise<MenuCategory> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.categories.set(category.id, category);
    const existing = ephemeralCatalogueStore.menuCategories.get(category.menu_id) || [];
    if (!existing.includes(category.id)) {
      existing.push(category.id);
      ephemeralCatalogueStore.menuCategories.set(category.menu_id, existing);
    }
    return category;
  }

  public async findCategoryById(id: string): Promise<MenuCategory | null> {
    allowMemoryAdapter();
    return ephemeralCatalogueStore.categories.get(id) || null;
  }

  public async listCategoriesByMenu(menuId: string): Promise<MenuCategory[]> {
    allowMemoryAdapter();
    const ids = ephemeralCatalogueStore.menuCategories.get(menuId) || [];
    const list: MenuCategory[] = [];
    for (const id of ids) {
      const cat = ephemeralCatalogueStore.categories.get(id);
      if (cat) list.push(cat);
    }
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }

  public async updateCategory(id: string, updates: Partial<MenuCategory>): Promise<MenuCategory | null> {
    allowMemoryAdapter();
    const existing = ephemeralCatalogueStore.categories.get(id);
    if (!existing) return null;
    const updated: MenuCategory = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    ephemeralCatalogueStore.categories.set(id, updated);
    return updated;
  }

  public async reorderCategories(menuId: string, categoryIds: string[]): Promise<MenuCategory[]> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.menuCategories.set(menuId, categoryIds);
    categoryIds.forEach((id, index) => {
      const cat = ephemeralCatalogueStore.categories.get(id);
      if (cat) {
        cat.sort_order = index;
        cat.updated_at = new Date().toISOString();
      }
    });
    return this.listCategoriesByMenu(menuId);
  }

  public async deleteCategory(id: string): Promise<boolean> {
    allowMemoryAdapter();
    const cat = ephemeralCatalogueStore.categories.get(id);
    if (!cat) return false;

    // Delete items in category
    const itemIds = ephemeralCatalogueStore.categoryItems.get(id) || [];
    for (const itemId of itemIds) {
      ephemeralCatalogueStore.items.delete(itemId);
    }
    ephemeralCatalogueStore.categoryItems.delete(id);

    // Remove from menu categories order
    const menuCats = ephemeralCatalogueStore.menuCategories.get(cat.menu_id);
    if (menuCats) {
      ephemeralCatalogueStore.menuCategories.set(
        cat.menu_id,
        menuCats.filter((cId) => cId !== id)
      );
    }

    ephemeralCatalogueStore.categories.delete(id);
    return true;
  }

  // ==========================================
  // Menu Items
  // ==========================================

  public async createItem(item: MenuItem): Promise<MenuItem> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.items.set(item.id, item);
    const existing = ephemeralCatalogueStore.categoryItems.get(item.category_id) || [];
    if (!existing.includes(item.id)) {
      existing.push(item.id);
      ephemeralCatalogueStore.categoryItems.set(item.category_id, existing);
    }
    if (item.modifier_group_ids) {
      ephemeralCatalogueStore.itemModifierGroups.set(item.id, item.modifier_group_ids);
    }
    return item;
  }

  public async findItemById(id: string): Promise<MenuItem | null> {
    allowMemoryAdapter();
    const item = ephemeralCatalogueStore.items.get(id);
    if (!item) return null;
    const modifierGroups = ephemeralCatalogueStore.itemModifierGroups.get(id) || [];
    return {
      ...item,
      modifier_group_ids: modifierGroups,
    };
  }

  public async listItemsByMenu(menuId: string, categoryId?: string): Promise<MenuItem[]> {
    allowMemoryAdapter();
    const list: MenuItem[] = [];
    for (const item of ephemeralCatalogueStore.items.values()) {
      if (item.menu_id === menuId) {
        if (!categoryId || item.category_id === categoryId) {
          const modGroups = ephemeralCatalogueStore.itemModifierGroups.get(item.id) || [];
          list.push({
            ...item,
            modifier_group_ids: modGroups,
          });
        }
      }
    }
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }

  public async listItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    allowMemoryAdapter();
    const ids = ephemeralCatalogueStore.categoryItems.get(categoryId) || [];
    const list: MenuItem[] = [];
    for (const id of ids) {
      const item = await this.findItemById(id);
      if (item) list.push(item);
    }
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }

  public async updateItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem | null> {
    allowMemoryAdapter();
    const existing = ephemeralCatalogueStore.items.get(id);
    if (!existing) return null;

    // If category changed, move item in category maps
    if (updates.category_id && updates.category_id !== existing.category_id) {
      const oldList = ephemeralCatalogueStore.categoryItems.get(existing.category_id) || [];
      ephemeralCatalogueStore.categoryItems.set(
        existing.category_id,
        oldList.filter((itemId) => itemId !== id)
      );
      const newList = ephemeralCatalogueStore.categoryItems.get(updates.category_id) || [];
      if (!newList.includes(id)) {
        newList.push(id);
        ephemeralCatalogueStore.categoryItems.set(updates.category_id, newList);
      }
    }

    const updated: MenuItem = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    ephemeralCatalogueStore.items.set(id, updated);

    if (updates.modifier_group_ids !== undefined) {
      ephemeralCatalogueStore.itemModifierGroups.set(id, updates.modifier_group_ids);
      updated.modifier_group_ids = updates.modifier_group_ids;
    }

    return updated;
  }

  public async reorderItems(categoryId: string, itemIds: string[]): Promise<MenuItem[]> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.categoryItems.set(categoryId, itemIds);
    itemIds.forEach((id, index) => {
      const item = ephemeralCatalogueStore.items.get(id);
      if (item) {
        item.sort_order = index;
        item.updated_at = new Date().toISOString();
      }
    });
    return this.listItemsByCategory(categoryId);
  }

  public async deleteItem(id: string): Promise<boolean> {
    allowMemoryAdapter();
    const item = ephemeralCatalogueStore.items.get(id);
    if (!item) return false;

    const list = ephemeralCatalogueStore.categoryItems.get(item.category_id);
    if (list) {
      ephemeralCatalogueStore.categoryItems.set(
        item.category_id,
        list.filter((itemId) => itemId !== id)
      );
    }

    ephemeralCatalogueStore.itemModifierGroups.delete(id);
    ephemeralCatalogueStore.items.delete(id);
    return true;
  }

  public async setItemAvailability(id: string, isAvailable: boolean): Promise<MenuItem | null> {
    allowMemoryAdapter();
    const item = ephemeralCatalogueStore.items.get(id);
    if (!item) return null;
    item.is_available = isAvailable;
    item.updated_at = new Date().toISOString();
    return item;
  }

  // ==========================================
  // Modifier Groups & Options
  // ==========================================

  public async createModifierGroup(group: ModifierGroup): Promise<ModifierGroup> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.modifierGroups.set(group.id, group);
    const existing = ephemeralCatalogueStore.merchantModifierGroups.get(group.merchant_id) || [];
    if (!existing.includes(group.id)) {
      existing.push(group.id);
      ephemeralCatalogueStore.merchantModifierGroups.set(group.merchant_id, existing);
    }
    return group;
  }

  public async findModifierGroupById(id: string): Promise<ModifierGroup | null> {
    allowMemoryAdapter();
    const group = ephemeralCatalogueStore.modifierGroups.get(id);
    if (!group) return null;
    const options = await this.listModifierOptionsByGroup(id);
    return {
      ...group,
      options,
    };
  }

  public async listModifierGroupsByMerchant(merchantId: string): Promise<ModifierGroup[]> {
    allowMemoryAdapter();
    const ids = ephemeralCatalogueStore.merchantModifierGroups.get(merchantId) || [];
    const list: ModifierGroup[] = [];
    for (const id of ids) {
      const group = await this.findModifierGroupById(id);
      if (group) list.push(group);
    }
    return list;
  }

  public async updateModifierGroup(id: string, updates: Partial<ModifierGroup>): Promise<ModifierGroup | null> {
    allowMemoryAdapter();
    const existing = ephemeralCatalogueStore.modifierGroups.get(id);
    if (!existing) return null;
    const updated: ModifierGroup = {
      ...existing,
      ...updates,
      is_required: (updates.min_selections ?? existing.min_selections) >= 1,
      updated_at: new Date().toISOString(),
    };
    ephemeralCatalogueStore.modifierGroups.set(id, updated);
    return this.findModifierGroupById(id);
  }

  public async deleteModifierGroup(id: string): Promise<boolean> {
    allowMemoryAdapter();
    const group = ephemeralCatalogueStore.modifierGroups.get(id);
    if (!group) return false;

    // Delete options
    const optionIds = ephemeralCatalogueStore.groupModifierOptions.get(id) || [];
    for (const optId of optionIds) {
      ephemeralCatalogueStore.modifierOptions.delete(optId);
    }
    ephemeralCatalogueStore.groupModifierOptions.delete(id);

    // Remove from merchant
    const list = ephemeralCatalogueStore.merchantModifierGroups.get(group.merchant_id);
    if (list) {
      ephemeralCatalogueStore.merchantModifierGroups.set(
        group.merchant_id,
        list.filter((gId) => gId !== id)
      );
    }

    // Detach from all items
    for (const [itemId, groupIds] of ephemeralCatalogueStore.itemModifierGroups.entries()) {
      if (groupIds.includes(id)) {
        ephemeralCatalogueStore.itemModifierGroups.set(
          itemId,
          groupIds.filter((gId) => gId !== id)
        );
      }
    }

    ephemeralCatalogueStore.modifierGroups.delete(id);
    return true;
  }

  public async createModifierOption(option: ModifierOption): Promise<ModifierOption> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.modifierOptions.set(option.id, option);
    const existing = ephemeralCatalogueStore.groupModifierOptions.get(option.modifier_group_id) || [];
    if (!existing.includes(option.id)) {
      existing.push(option.id);
      ephemeralCatalogueStore.groupModifierOptions.set(option.modifier_group_id, existing);
    }
    return option;
  }

  public async findModifierOptionById(id: string): Promise<ModifierOption | null> {
    allowMemoryAdapter();
    return ephemeralCatalogueStore.modifierOptions.get(id) || null;
  }

  public async listModifierOptionsByGroup(groupId: string): Promise<ModifierOption[]> {
    allowMemoryAdapter();
    const ids = ephemeralCatalogueStore.groupModifierOptions.get(groupId) || [];
    const list: ModifierOption[] = [];
    for (const id of ids) {
      const opt = ephemeralCatalogueStore.modifierOptions.get(id);
      if (opt) list.push(opt);
    }
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }

  public async updateModifierOption(id: string, updates: Partial<ModifierOption>): Promise<ModifierOption | null> {
    allowMemoryAdapter();
    const existing = ephemeralCatalogueStore.modifierOptions.get(id);
    if (!existing) return null;
    const updated: ModifierOption = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    ephemeralCatalogueStore.modifierOptions.set(id, updated);
    return updated;
  }

  public async reorderModifierOptions(groupId: string, optionIds: string[]): Promise<ModifierOption[]> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.groupModifierOptions.set(groupId, optionIds);
    optionIds.forEach((id, index) => {
      const opt = ephemeralCatalogueStore.modifierOptions.get(id);
      if (opt) {
        opt.sort_order = index;
        opt.updated_at = new Date().toISOString();
      }
    });
    return this.listModifierOptionsByGroup(groupId);
  }

  public async deleteModifierOption(id: string): Promise<boolean> {
    allowMemoryAdapter();
    const opt = ephemeralCatalogueStore.modifierOptions.get(id);
    if (!opt) return false;

    const list = ephemeralCatalogueStore.groupModifierOptions.get(opt.modifier_group_id);
    if (list) {
      ephemeralCatalogueStore.groupModifierOptions.set(
        opt.modifier_group_id,
        list.filter((optId) => optId !== id)
      );
    }

    ephemeralCatalogueStore.modifierOptions.delete(id);
    return true;
  }

  public async attachModifierGroupsToItem(itemId: string, groupIds: string[]): Promise<void> {
    allowMemoryAdapter();
    ephemeralCatalogueStore.itemModifierGroups.set(itemId, groupIds);
    const item = ephemeralCatalogueStore.items.get(itemId);
    if (item) {
      item.modifier_group_ids = groupIds;
      item.updated_at = new Date().toISOString();
    }
  }

  public async getItemModifierGroups(itemId: string): Promise<ModifierGroup[]> {
    allowMemoryAdapter();
    const groupIds = ephemeralCatalogueStore.itemModifierGroups.get(itemId) || [];
    const list: ModifierGroup[] = [];
    for (const gId of groupIds) {
      const g = await this.findModifierGroupById(gId);
      if (g) list.push(g);
    }
    return list;
  }

  public async getModifierGroupsForItem(itemId: string): Promise<ModifierGroup[]> {
    return this.getItemModifierGroups(itemId);
  }

  // ==========================================
  // Branch Overrides & Effective Availability
  // ==========================================

  public async setBranchItemOverride(
    branchId: string,
    itemId: string,
    override: { is_available?: boolean; price_override_minor?: number | null }
  ): Promise<MenuItemBranchOverride> {
    allowMemoryAdapter();
    const key = `${branchId}:${itemId}`;
    const existing = ephemeralCatalogueStore.itemBranchOverrides.get(key) || {
      branch_id: branchId,
      item_id: itemId,
      is_available: true,
      price_override_minor: null,
      updated_at: new Date().toISOString(),
    };

    const updated: MenuItemBranchOverride = {
      ...existing,
      ...(override.is_available !== undefined ? { is_available: override.is_available } : {}),
      ...(override.price_override_minor !== undefined ? { price_override_minor: override.price_override_minor } : {}),
      updated_at: new Date().toISOString(),
    };

    ephemeralCatalogueStore.itemBranchOverrides.set(key, updated);
    return updated;
  }

  public async getBranchItemOverride(branchId: string, itemId: string): Promise<MenuItemBranchOverride | null> {
    allowMemoryAdapter();
    return ephemeralCatalogueStore.itemBranchOverrides.get(`${branchId}:${itemId}`) || null;
  }

  public async findBranchItemOverride(branchId: string, itemId: string): Promise<MenuItemBranchOverride | null> {
    return this.getBranchItemOverride(branchId, itemId);
  }

  public async setBranchModifierOptionOverride(
    branchId: string,
    optionId: string,
    override: { is_available?: boolean; price_delta_override_minor?: number | null }
  ): Promise<ModifierOptionBranchOverride> {
    allowMemoryAdapter();
    const key = `${branchId}:${optionId}`;
    const existing = ephemeralCatalogueStore.modifierOptionBranchOverrides.get(key) || {
      branch_id: branchId,
      modifier_option_id: optionId,
      is_available: true,
      price_delta_override_minor: null,
      updated_at: new Date().toISOString(),
    };

    const updated: ModifierOptionBranchOverride = {
      ...existing,
      ...(override.is_available !== undefined ? { is_available: override.is_available } : {}),
      ...(override.price_delta_override_minor !== undefined
        ? { price_delta_override_minor: override.price_delta_override_minor }
        : {}),
      updated_at: new Date().toISOString(),
    };

    ephemeralCatalogueStore.modifierOptionBranchOverrides.set(key, updated);
    return updated;
  }

  public async getBranchModifierOptionOverride(
    branchId: string,
    optionId: string
  ): Promise<ModifierOptionBranchOverride | null> {
    allowMemoryAdapter();
    return ephemeralCatalogueStore.modifierOptionBranchOverrides.get(`${branchId}:${optionId}`) || null;
  }

  public async findBranchModifierOptionOverride(
    branchId: string,
    optionId: string
  ): Promise<ModifierOptionBranchOverride | null> {
    return this.getBranchModifierOptionOverride(branchId, optionId);
  }

  /**
   * Evaluates and builds an enriched catalogue for a specific branch with effective availability
   */
  public async getEffectiveCatalogueForBranch(
    branchId: string
  ): Promise<{ menu: Menu; categories: EnrichedCategoryWithItems[] } | null> {
    const assignedMenus = await this.getBranchAssignedMenus(branchId);
    if (assignedMenus.length === 0) return null;

    // Pick first active assigned menu
    const activeMenu = assignedMenus.find((m) => m.is_active) || assignedMenus[0];
    const categories = await this.listCategoriesByMenu(activeMenu.id);

    const enrichedCategories: EnrichedCategoryWithItems[] = [];

    for (const cat of categories) {
      if (!cat.is_active) continue;

      const items = await this.listItemsByCategory(cat.id);
      const enrichedItems: EnrichedMenuItem[] = [];

      for (const item of items) {
        const itemOverride = await this.getBranchItemOverride(branchId, item.id);
        const isBranchOverride = !!itemOverride;

        // Effective item availability:
        // Base is_available must be true, AND if branch override exists, override is_available must be true
        const effectiveAvailable = item.is_available && (itemOverride ? itemOverride.is_available : true);

        // Effective price:
        const effectivePrice =
          itemOverride && itemOverride.price_override_minor !== null && itemOverride.price_override_minor !== undefined
            ? itemOverride.price_override_minor
            : item.price_minor;

        // Fetch modifier groups
        const modifierGroups = await this.getItemModifierGroups(item.id);
        const enrichedGroups: EnrichedModifierGroup[] = [];

        for (const mg of modifierGroups) {
          const options = await this.listModifierOptionsByGroup(mg.id);
          const enrichedOptions: EnrichedModifierOption[] = [];

          for (const opt of options) {
            const optOverride = await this.getBranchModifierOptionOverride(branchId, opt.id);
            const optBranchOverride = !!optOverride;

            const optEffectiveAvailable =
              opt.is_available && (optOverride ? optOverride.is_available : true);
            const optEffectivePrice =
              optOverride &&
              optOverride.price_delta_override_minor !== null &&
              optOverride.price_delta_override_minor !== undefined
                ? optOverride.price_delta_override_minor
                : opt.price_delta_minor;

            enrichedOptions.push({
              ...opt,
              effective_available: optEffectiveAvailable,
              effective_price_delta_minor: optEffectivePrice,
              is_branch_override: optBranchOverride,
            });
          }

          enrichedGroups.push({
            id: mg.id,
            merchant_id: mg.merchant_id,
            name: mg.name,
            min_selections: mg.min_selections,
            max_selections: mg.max_selections,
            is_required: mg.is_required,
            created_at: mg.created_at,
            updated_at: mg.updated_at,
            options: enrichedOptions,
          });
        }

        enrichedItems.push({
          ...item,
          category_name: cat.name,
          effective_available: effectiveAvailable,
          effective_price_minor: effectivePrice,
          is_branch_override: isBranchOverride,
          modifier_groups: enrichedGroups,
        });
      }

      enrichedCategories.push({
        ...cat,
        items: enrichedItems,
      });
    }

    return {
      menu: activeMenu,
      categories: enrichedCategories,
    };
  }
}

const fixtureCatalogue = new CatalogueRepository();
export const catalogueRepository = storageAdapter(fixtureCatalogue, {
  ...postgresCatalogue,
  getEffectiveCatalogueForBranch: (id:string) => fixtureCatalogue.getEffectiveCatalogueForBranch.call(postgresCatalogue,id),
});
