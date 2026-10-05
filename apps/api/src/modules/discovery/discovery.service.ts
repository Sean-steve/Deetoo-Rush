import { config } from '@deetoo/config';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Restaurant Discovery & Categories Service
 * Implements location-based discovery, category filtering, search, and customer-safe DTOs (DEE-API-001, Sprint 5)
 */

import {
  RestaurantCategory,
  PublicRestaurantBranch,
  PublicRestaurantDetail,
  RestaurantDiscoveryQuery,
  ServiceabilityCheckResult,
  BranchOpenStatus,
  BranchAdminStatus,
  MerchantStatus,
  MerchantApprovalStatus,
  BranchOperationalStatus,
} from '@deetoo/types';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { catalogueService } from '../merchant/catalogue.service';
import { serviceabilityService } from '../serviceability/serviceability.service';
import { getDbPool } from '../../db/client';
import { logger, calculateDistanceMeters } from '@deetoo/utils';
import { cartRepository } from '../cart/cart.repository';
import { AppError } from '../../middleware/error-handler';

export class DiscoveryService {
  private ephemeralCategories = new Map<string, RestaurantCategory>();
  private ephemeralAssignments = new Map<string, Set<string>>(); // branch_id -> Set<category_id>

  constructor() {
    this.seedCategories();
  }

  private seedCategories() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();
    const categories: RestaurantCategory[] = [
      {
        id: '44444444-4444-4444-4444-444444444401',
        name: 'Burgers',
        slug: 'burgers',
        icon: 'Burger',
        description: 'Gourmet smash burgers, beef & chicken patties',
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
        sort_order: 1,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444402',
        name: 'Pizza',
        slug: 'pizza',
        icon: 'Pizza',
        description: 'Authentic wood-fired and pan pizzas',
        image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400',
        sort_order: 2,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444403',
        name: 'Chicken',
        slug: 'chicken',
        icon: 'Drumstick',
        description: 'Crispy fried chicken, wings & tenders',
        image_url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400',
        sort_order: 3,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444404',
        name: 'African',
        slug: 'african',
        icon: 'Utensils',
        description: 'Authentic local cuisine, pilau, nyama choma & stews',
        image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
        sort_order: 4,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444405',
        name: 'Healthy & Bowls',
        slug: 'healthy',
        icon: 'Salad',
        description: 'Fresh salads, grain bowls and wholesome plates',
        image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400',
        sort_order: 5,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444406',
        name: 'Fast Food',
        slug: 'fast-food',
        icon: 'Flame',
        description: 'Quick bites, fries, hot dogs & loaded snacks',
        image_url: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400',
        sort_order: 6,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444407',
        name: 'Desserts & Bakery',
        slug: 'desserts',
        icon: 'Cake',
        description: 'Cakes, pastries, ice cream & sweet treats',
        image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
        sort_order: 7,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444408',
        name: 'Asian & Noodles',
        slug: 'asian',
        icon: 'Soup',
        description: 'Noodles, stir-fries, ramen and Asian delicacies',
        image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400',
        sort_order: 8,
        is_active: true,
        created_at: now,
      },
      {
        id: '44444444-4444-4444-4444-444444444409',
        name: 'Drinks & Shakes',
        slug: 'drinks',
        icon: 'Coffee',
        description: 'Handcrafted milkshakes, smoothies, coffee & juices',
        image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400',
        sort_order: 9,
        is_active: true,
        created_at: now,
      },
    ];

    for (const cat of categories) {
      this.ephemeralCategories.set(cat.id, cat);
    }

    // Assign categories to demo branches
    this.ephemeralAssignments.set(
      'branch_westlands_01',
      new Set([
        '44444444-4444-4444-4444-444444444401', // Burgers
        '44444444-4444-4444-4444-444444444406', // Fast Food
        '44444444-4444-4444-4444-444444444409', // Drinks
      ])
    );
    this.ephemeralAssignments.set(
      'branch_kilimani_02',
      new Set([
        '44444444-4444-4444-4444-444444444401', // Burgers
        '44444444-4444-4444-4444-444444444406', // Fast Food
      ])
    );
  }

  /**
   * Lists all active restaurant categories for filter chips and discovery
   */
  public async listCategories(): Promise<RestaurantCategory[]> {
    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const query = `
          SELECT id, name, slug, icon, description, image_url, sort_order, is_active, created_at, updated_at
          FROM restaurant_categories
          WHERE is_active = true
          ORDER BY sort_order ASC, name ASC
        `;
        const res = await client.query(query);
        if (res.rows.length >= 0) {
          return res.rows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            icon: r.icon,
            description: r.description,
            image_url: r.image_url,
            sort_order: Number(r.sort_order),
            is_active: Boolean(r.is_active),
            created_at: r.created_at?.toISOString?.() || r.created_at,
            updated_at: r.updated_at?.toISOString?.() || r.updated_at,
          }));
        }
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // Fallback to ephemeral store
    }

    return Array.from(this.ephemeralCategories.values())
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  /**
   * Helper to get category names and IDs for a branch
   */
  private async getBranchCategories(branchId: string): Promise<{ names: string[]; ids: string[] }> {
    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const query = `
          SELECT rc.id, rc.name
          FROM restaurant_category_assignments rca
          JOIN restaurant_categories rc ON rc.id = rca.category_id
          WHERE rca.branch_id = $1 AND rc.is_active = true
          ORDER BY rc.sort_order ASC
        `;
        const res = await client.query(query, [branchId]);
        if (res.rows.length >= 0) {
          return {
            names: res.rows.map((r) => r.name),
            ids: res.rows.map((r) => r.id),
          };
        }
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    const assignedIds = this.ephemeralAssignments.get(branchId) || new Set();
    const names: string[] = [];
    const ids: string[] = [];

    for (const catId of assignedIds) {
      const cat = this.ephemeralCategories.get(catId);
      if (cat && cat.is_active) {
        names.push(cat.name);
        ids.push(cat.id);
      }
    }

    return { names, ids };
  }

  /**
   * Main Restaurant Discovery Engine:
   * 1. Evaluates customer location serviceability
   * 2. Retrieves eligible branches matching service zone
   * 3. Calculates distance and delivery estimates
   * 4. Evaluates real-time availability (OPEN, CLOSED, BUSY)
   * 5. Filters by category and search keyword (matches restaurant, branch, cuisine, menu items)
   * 6. Formats clean, customer-safe public projection
   */
  public async discoverRestaurants(query: RestaurantDiscoveryQuery): Promise<{
    restaurants: PublicRestaurantBranch[];
    total: number;
    page: number;
    limit: number;
    serviceability: ServiceabilityCheckResult;
  }> {
    const lat = query.latitude;
    const lng = query.longitude;
    const hasLocation = lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng);

    // 1. Serviceability Check
    let serviceability: ServiceabilityCheckResult;
    if (hasLocation) {
      serviceability = await serviceabilityService.checkServiceability(lat!, lng!);
    } else {
      serviceability = {
        serviceable: true,
        zone_id: null,
        zone_name: null,
        reason_code: 'LOCATION_REQUIRED',
        eligible_branch_count: 0,
      };
    }

    // 2. Fetch branches
    // If outside service area and location provided, return empty list with reason code
    if (hasLocation && !serviceability.serviceable) {
      return {
        restaurants: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 20,
        serviceability,
      };
    }

    // List active branches
    const allBranches = await merchantRepository.listAllBranches({
      status: BranchAdminStatus.ACTIVE,
    });

    const activeCustomerZoneId = serviceability.zone_id;
    const candidates: PublicRestaurantBranch[] = [];
    const deliveryRule = hasLocation ? await cartRepository.getDeliveryPricingRuleForZone(activeCustomerZoneId) : null;

    for (const branch of allBranches) {
      // Must belong to approved and active merchant
      const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
      if (
        !merchant ||
        merchant.status !== MerchantStatus.ACTIVE ||
        merchant.approval_status !== MerchantApprovalStatus.APPROVED
      ) {
        continue;
      }

      // Check zone eligibility
      const branchZones = await merchantRepository.getBranchServiceZones(branch.id);
      if (activeCustomerZoneId && !branchZones.includes(activeCustomerZoneId)) {
        continue;
      }

      // Calculate distance if customer coords provided
      let distanceMeters: number | undefined;
      let distanceKm: number | undefined;
      if (hasLocation) {
        distanceMeters = calculateDistanceMeters(branch.latitude, branch.longitude, lat!, lng!, 1);
        if (deliveryRule && distanceMeters > deliveryRule.max_delivery_distance_meters) continue;
        distanceKm = Math.round(distanceMeters / 100) / 10;
      }

      // Check real-time operational availability
      const availability = await merchantService.evaluateBranchAvailability(branch.id);
      const openingHours = await merchantRepository.getOpeningHours(branch.id);

      // Determine open_status:
      // 'OPEN' | 'CLOSED' | 'BUSY' | 'UNAVAILABLE'
      let openStatus: BranchOpenStatus = 'CLOSED';
      let isOpenNow = false;
      let isBusy = false;
      let statusBadgeText = 'STORE CLOSED';

      if (branch.operational_status === BranchOperationalStatus.BUSY) {
        openStatus = 'BUSY';
        isBusy = true;
        isOpenNow = availability.within_hours;
        statusBadgeText = 'BUSY · HIGH DEMAND';
      } else if (availability.within_hours && branch.operational_status === BranchOperationalStatus.OPEN) {
        openStatus = 'OPEN';
        isOpenNow = true;
        statusBadgeText = 'OPEN NOW';
      } else if (!availability.within_hours) {
        openStatus = 'CLOSED';
        isOpenNow = false;
        statusBadgeText = 'CLOSED';
      }

      const { names: categoryNames, ids: categoryIds } = await this.getBranchCategories(branch.id);

      // Construct customer-safe public branch DTO
      const publicBranch: PublicRestaurantBranch = {
        branch_id: branch.id,
        merchant_id: merchant.id,
        merchant_name: merchant.display_name,
        branch_name: branch.name,
        slug: branch.slug || merchant.slug,
        logo_url: merchant.logo_url || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
        cover_url:
          merchant.logo_url || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
        categories: categoryNames.length > 0 ? categoryNames : ['Burgers', 'Fast Food'],
        category_ids: categoryIds,
        address_text: branch.address_text,
        city: branch.city,
        latitude: branch.latitude,
        longitude: branch.longitude,
        distance_meters: distanceMeters,
        distance_km: distanceKm,
        min_order_minor: branch.min_order_minor,
        currency: branch.currency || 'KES',
        prep_default_min: branch.prep_default_min || 20,
        open_status: openStatus,
        is_open_now: isOpenNow,
        is_busy: isBusy,
        status_badge_text: statusBadgeText,
        opening_hours: openingHours,
        serviceable: true,
      };

      candidates.push(publicBranch);
    }

    // 3. Filter by Category
    let filtered = candidates;
    if (query.category) {
      const catQuery = query.category.toLowerCase().trim();
      filtered = filtered.filter((r) => {
        const matchesName = r.categories.some((c) => c.toLowerCase() === catQuery);
        const matchesId = r.category_ids.includes(query.category!);
        return matchesName || matchesId;
      });
    }

    // 4. Filter by Search Query (Restaurant name, branch, cuisines, or menu items)
    if (query.search) {
      const q = query.search.toLowerCase().trim();
      const matchedList: PublicRestaurantBranch[] = [];

      for (const restaurant of filtered) {
        // Match merchant name or branch name
        if (
          restaurant.merchant_name.toLowerCase().includes(q) ||
          restaurant.branch_name.toLowerCase().includes(q) ||
          restaurant.address_text.toLowerCase().includes(q) ||
          restaurant.categories.some((c) => c.toLowerCase().includes(q))
        ) {
          matchedList.push(restaurant);
          continue;
        }

        // Match menu item names
        try {
          const menu = await catalogueService.getPublicRestaurantMenu(restaurant.branch_id);
          const hasMatchingItem = menu?.categories.some((c) =>
            c.items.some(
              (item) =>
                item.name.toLowerCase().includes(q) ||
                (item.description && item.description.toLowerCase().includes(q))
            )
          );
          if (hasMatchingItem) {
            matchedList.push(restaurant);
          }
        } catch {
          // Ignore menu load error
        }
      }

      filtered = matchedList;
    }

    // 5. Filter by Open Now
    if (query.open_now) {
      filtered = filtered.filter((r) => r.is_open_now);
    }

    // 6. Sorting
    const sort = query.sort || 'recommended';
    if (sort === 'distance') {
      filtered.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    } else if (sort === 'open_now') {
      filtered.sort((a, b) => (b.is_open_now ? 1 : 0) - (a.is_open_now ? 1 : 0));
    } else {
      // Recommended: Open/Busy first, then shortest distance
      filtered.sort((a, b) => {
        const scoreA = (a.is_open_now ? 100 : 0) + (a.is_busy ? 50 : 0) - (a.distance_km ?? 10);
        const scoreB = (b.is_open_now ? 100 : 0) + (b.is_busy ? 50 : 0) - (b.distance_km ?? 10);
        return scoreB - scoreA;
      });
    }

    // 7. Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      restaurants: paginated,
      total: filtered.length,
      page,
      limit,
      serviceability,
    };
  }

  /**
   * Retrieves full customer-safe restaurant details
   */
  public async getRestaurantDetail(
    branchId: string,
    lat?: number,
    lng?: number
  ): Promise<PublicRestaurantDetail> {
    const branch = await merchantRepository.findBranchById(branchId);
    if (!branch || branch.status !== BranchAdminStatus.ACTIVE) {
      throw new AppError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant branch is not available or does not exist');
    }

    const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
    if (
      !merchant ||
      merchant.status !== MerchantStatus.ACTIVE ||
      merchant.approval_status !== MerchantApprovalStatus.APPROVED
    ) {
      throw new AppError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant is currently unavailable');
    }

    const availability = await merchantService.evaluateBranchAvailability(branchId);
    const openingHours = await merchantRepository.getOpeningHours(branchId);
    const { names: categoryNames, ids: categoryIds } = await this.getBranchCategories(branchId);

    let distanceMeters: number | undefined;
    let distanceKm: number | undefined;
    let serviceabilityResult: any = undefined;

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      distanceMeters = calculateDistanceMeters(branch.latitude, branch.longitude, lat, lng, 1);
      distanceKm = Math.round(distanceMeters / 100) / 10;
      serviceabilityResult = await serviceabilityService.checkServiceability(lat, lng);
      if (serviceabilityResult.serviceable) {
        const rule = await cartRepository.getDeliveryPricingRuleForZone(serviceabilityResult.zone_id);
        if (distanceMeters > rule.max_delivery_distance_meters) {
          throw new AppError(422, 'OUTSIDE_DELIVERY_RANGE', 'This restaurant is outside your delivery range');
        }
      }
    }

    let openStatus: BranchOpenStatus = 'CLOSED';
    let isOpenNow = false;
    let isBusy = false;
    let statusBadgeText = 'STORE CLOSED';

    if (branch.operational_status === BranchOperationalStatus.BUSY) {
      openStatus = 'BUSY';
      isBusy = true;
      isOpenNow = availability.within_hours;
      statusBadgeText = 'BUSY · HIGH DEMAND';
    } else if (availability.within_hours && branch.operational_status === BranchOperationalStatus.OPEN) {
      openStatus = 'OPEN';
      isOpenNow = true;
      statusBadgeText = 'OPEN NOW';
    } else {
      openStatus = 'CLOSED';
      isOpenNow = false;
      statusBadgeText = 'CLOSED';
    }

    const publicBranch: PublicRestaurantBranch = {
      branch_id: branch.id,
      merchant_id: merchant.id,
      merchant_name: merchant.display_name,
      branch_name: branch.name,
      slug: branch.slug || merchant.slug,
      logo_url: merchant.logo_url || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
      cover_url:
        merchant.logo_url || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
      categories: categoryNames.length > 0 ? categoryNames : ['Burgers', 'Fast Food'],
      category_ids: categoryIds,
      address_text: branch.address_text,
      city: branch.city,
      latitude: branch.latitude,
      longitude: branch.longitude,
      distance_meters: distanceMeters,
      distance_km: distanceKm,
      min_order_minor: branch.min_order_minor,
      currency: branch.currency || 'KES',
      prep_default_min: branch.prep_default_min || 20,
      open_status: openStatus,
      is_open_now: isOpenNow,
      is_busy: isBusy,
      status_badge_text: statusBadgeText,
      opening_hours: openingHours,
      serviceable: true,
    };

    return {
      branch: publicBranch,
      merchant: {
        id: merchant.id,
        display_name: merchant.display_name,
        description: merchant.description,
        logo_url: merchant.logo_url,
      },
      opening_hours: openingHours,
      serviceability: serviceabilityResult,
    };
  }
}

export const discoveryService = transactionalService(new DiscoveryService());
