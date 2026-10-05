import { storageAdapter } from '../../db/adapter';
import { postgresMerchant } from './merchant.postgres';
import { postgresMemberships } from './membership.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Merchant & Branch Repository
 * Resilient data layer supporting PostgreSQL/PostGIS with Ephemeral fallback (ADR-005)
 */

import {
  Merchant,
  MerchantBranch,
  BranchOpeningHour,
  ServiceZone,
  BranchServiceZone,
  MerchantMembership,
  MerchantInvitation,
  MerchantStatus,
  MerchantApprovalStatus,
  BranchAdminStatus,
  BranchOperationalStatus,
  MembershipRole,
  MembershipStatus,
  InvitationStatus,
  ServiceZoneStatus,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';
import { getDbPool } from '../../db/client';

export class EphemeralMerchantStore {
  public merchants = new Map<string, Merchant>();
  public branches = new Map<string, MerchantBranch>();
  public openingHours = new Map<string, BranchOpeningHour[]>(); // branch_id -> hours
  public serviceZones = new Map<string, ServiceZone>();
  public branchServiceZones = new Map<string, Set<string>>(); // branch_id -> Set of zone_ids
  public memberships = new Map<string, MerchantMembership>(); // membership_id -> membership
  public userMemberships = new Map<string, string[]>(); // user_id -> membership_ids
  public invitations = new Map<string, MerchantInvitation>();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();

    // 1. Service Zones
    const zoneCentral: ServiceZone = {
      id: '33333333-3333-3333-3333-333333333301',
      name: 'Kenya Nationwide Zone',
      city_id: 'NAIROBI',
      status: ServiceZoneStatus.ACTIVE,
      boundary: {
        // Covers the whole of Kenya (approx. national bounding box: lat -4.9 to 5.1,
        // lng 33.5 to 41.9), so any address within Kenya is serviceable -- previously this
        // was a ~5km slice of Nairobi CBD/Westlands, which is what made "Delivery Service
        // Area: anywhere in Kenya" impossible to configure from the UI: there was no zone
        // covering anywhere outside a few Nairobi neighborhoods for a branch or rider to
        // be assigned to.
        type: 'Polygon',
        coordinates: [
          [
            [33.5, -4.9],
            [41.9, -4.9],
            [41.9, 5.1],
            [33.5, 5.1],
            [33.5, -4.9],
          ],
        ],
      },
      config: {
        base_delivery_fee_minor: 15000,
        service_fee_minor: 5000,
        max_radius_km: 1000.0,
      },
      created_at: now,
    };

    const zoneKilimani: ServiceZone = {
      id: '33333333-3333-3333-3333-333333333302',
      name: 'Kilimani & Lavington Zone',
      city_id: 'NAIROBI',
      status: ServiceZoneStatus.ACTIVE,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [36.75, -1.28],
            [36.80, -1.28],
            [36.80, -1.33],
            [36.75, -1.33],
            [36.75, -1.28],
          ],
        ],
      },
      config: {
        base_delivery_fee_minor: 18000,
        service_fee_minor: 5000,
        max_radius_km: 8.0,
      },
      created_at: now,
    };

    const zoneKaren: ServiceZone = {
      id: '33333333-3333-3333-3333-333333333303',
      name: 'Karen & Langata Zone',
      city_id: 'NAIROBI',
      status: ServiceZoneStatus.INACTIVE,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [36.68, -1.31],
            [36.76, -1.31],
            [36.76, -1.38],
            [36.68, -1.38],
            [36.68, -1.31],
          ],
        ],
      },
      config: {
        base_delivery_fee_minor: 25000,
        service_fee_minor: 6000,
        max_radius_km: 15.0,
      },
      created_at: now,
    };

    this.serviceZones.set(zoneCentral.id, zoneCentral);
    this.serviceZones.set(zoneKilimani.id, zoneKilimani);
    this.serviceZones.set(zoneKaren.id, zoneKaren);

    // 2. Merchant 1: Nairobi Burger Co. (APPROVED & ACTIVE)
    const merchantBurger: Merchant = {
      id: 'merchant_burger_01',
      legal_name: 'Nairobi Burger Enterprises Ltd',
      display_name: 'Nairobi Burger Co.',
      slug: 'nairobi-burger-co',
      description: 'Artisanal smash burgers, hand-cut fries, and fresh thick milkshakes crafted in Nairobi.',
      phone: '+254700000002',
      email: 'info@nairobiburger.co.ke',
      logo_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=150',
      status: MerchantStatus.ACTIVE,
      approval_status: MerchantApprovalStatus.APPROVED,
      commission_bps: 2000,
      settlement_schedule: 'WEEKLY',
      created_at: now,
      updated_at: now,
    };
    this.merchants.set(merchantBurger.id, merchantBurger);

    // Branch 1: Westlands
    const branchWestlands: MerchantBranch = {
      id: 'branch_westlands_01',
      merchant_id: merchantBurger.id,
      name: 'Nairobi Burger - Westlands',
      slug: 'nairobi-burger-westlands',
      phone: '+254700000010',
      email: 'westlands@nairobiburger.co.ke',
      address_line1: 'Woodvale Grove, Ground Floor',
      address_line2: 'Mpaka Plaza',
      landmark: 'Opposite Sarit Centre',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'Woodvale Grove, Westlands, Nairobi',
      latitude: -1.2683,
      longitude: 36.8044,
      status: BranchAdminStatus.ACTIVE,
      operational_status: BranchOperationalStatus.OPEN,
      timezone: 'Africa/Nairobi',
      currency: 'KES',
      min_order_minor: 50000, // KES 500
      prep_default_min: 20,
      created_at: now,
      updated_at: now,
      service_zones: [zoneCentral.id],
    };
    this.branches.set(branchWestlands.id, branchWestlands);
    this.branchServiceZones.set(branchWestlands.id, new Set([zoneCentral.id]));

    // Branch 2: Kilimani
    const branchKilimani: MerchantBranch = {
      id: 'branch_kilimani_02',
      merchant_id: merchantBurger.id,
      name: 'Nairobi Burger - Kilimani',
      slug: 'nairobi-burger-kilimani',
      phone: '+254700000011',
      email: 'kilimani@nairobiburger.co.ke',
      address_line1: 'Argwings Kodhek Road',
      address_line2: 'Adlife Plaza, 1st Floor',
      landmark: 'Near Yaya Centre',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'Argwings Kodhek Rd, Kilimani, Nairobi',
      latitude: -1.2921,
      longitude: 36.7842,
      status: BranchAdminStatus.ACTIVE,
      operational_status: BranchOperationalStatus.OPEN,
      timezone: 'Africa/Nairobi',
      currency: 'KES',
      min_order_minor: 50000,
      prep_default_min: 25,
      created_at: now,
      updated_at: now,
      service_zones: [zoneKilimani.id, zoneCentral.id],
    };
    this.branches.set(branchKilimani.id, branchKilimani);
    this.branchServiceZones.set(branchKilimani.id, new Set([zoneKilimani.id, zoneCentral.id]));

    // Opening Hours for Westlands (Mon-Sun 08:00-23:00)
    const westlandsHours: BranchOpeningHour[] = [];
    for (let day = 0; day <= 6; day++) {
      westlandsHours.push({
        id: `oh_westlands_${day}`,
        branch_id: branchWestlands.id,
        day_of_week: day,
        open_time: '08:00',
        close_time: '23:00',
        is_closed: false,
        created_at: now,
      });
    }
    this.openingHours.set(branchWestlands.id, westlandsHours);

    // Opening Hours for Kilimani (Mon-Sun 09:00-22:00)
    const kilimaniHours: BranchOpeningHour[] = [];
    for (let day = 0; day <= 6; day++) {
      kilimaniHours.push({
        id: `oh_kilimani_${day}`,
        branch_id: branchKilimani.id,
        day_of_week: day,
        open_time: '09:00',
        close_time: '22:00',
        is_closed: false,
        created_at: now,
      });
    }
    this.openingHours.set(branchKilimani.id, kilimaniHours);

    // 3. Merchant 2: Swahili Plate Express (PENDING_REVIEW)
    const merchantSwahili: Merchant = {
      id: 'merchant_swahili_02',
      legal_name: 'Swahili Plate Catering Ltd',
      display_name: 'Swahili Plate Express',
      slug: 'swahili-plate-express',
      description: 'Authentic coastal dishes: biryani, pilau, mahamri, and fresh coconut curries.',
      phone: '+254711223344',
      email: 'contact@swahiliplate.ke',
      logo_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150',
      status: MerchantStatus.ACTIVE,
      approval_status: MerchantApprovalStatus.PENDING_REVIEW,
      commission_bps: 1800,
      settlement_schedule: 'WEEKLY',
      created_at: now,
      updated_at: now,
    };
    this.merchants.set(merchantSwahili.id, merchantSwahili);

    const branchCbd: MerchantBranch = {
      id: 'branch_cbd_03',
      merchant_id: merchantSwahili.id,
      name: 'Swahili Plate - CBD Branch',
      slug: 'swahili-plate-cbd',
      phone: '+254711223355',
      email: 'cbd@swahiliplate.ke',
      address_line1: 'Mama Ngina Street, City Centre',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'Mama Ngina St, Nairobi CBD',
      latitude: -1.2841,
      longitude: 36.8228,
      status: BranchAdminStatus.ACTIVE,
      operational_status: BranchOperationalStatus.CLOSED,
      timezone: 'Africa/Nairobi',
      currency: 'KES',
      min_order_minor: 30000,
      prep_default_min: 15,
      created_at: now,
      updated_at: now,
      service_zones: [zoneCentral.id],
    };
    this.branches.set(branchCbd.id, branchCbd);
    this.branchServiceZones.set(branchCbd.id, new Set([zoneCentral.id]));

    // Opening Hours for CBD
    const cbdHours: BranchOpeningHour[] = [];
    for (let day = 0; day <= 6; day++) {
      cbdHours.push({
        id: `oh_cbd_${day}`,
        branch_id: branchCbd.id,
        day_of_week: day,
        open_time: '07:00',
        close_time: '20:00',
        is_closed: day === 0, // Closed on Sundays
        created_at: now,
      });
    }
    this.openingHours.set(branchCbd.id, cbdHours);

    // 4. Merchant 3: Mama Oliech Kitchen (SUSPENDED)
    const merchantMama: Merchant = {
      id: 'merchant_mama_03',
      legal_name: 'Mama Oliech Fish Ltd',
      display_name: 'Mama Oliech Kitchen',
      slug: 'mama-oliech-kitchen',
      description: 'Legendary whole fried lake tilapia with ugali and traditional greens.',
      phone: '+254722334455',
      email: 'orders@mamaoliech.com',
      logo_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=150',
      status: MerchantStatus.SUSPENDED,
      approval_status: MerchantApprovalStatus.APPROVED,
      commission_bps: 2000,
      settlement_schedule: 'WEEKLY',
      created_at: now,
      updated_at: now,
    };
    this.merchants.set(merchantMama.id, merchantMama);

    const branchHurlingham: MerchantBranch = {
      id: 'branch_hurlingham_04',
      merchant_id: merchantMama.id,
      name: 'Mama Oliech - Hurlingham',
      slug: 'mama-oliech-hurlingham',
      phone: '+254722334466',
      email: 'hurlingham@mamaoliech.com',
      address_line1: 'Marcus Garvey Road, Hurlingham',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'Marcus Garvey Rd, Hurlingham, Nairobi',
      latitude: -1.2952,
      longitude: 36.7901,
      status: BranchAdminStatus.SUSPENDED,
      operational_status: BranchOperationalStatus.OPEN,
      timezone: 'Africa/Nairobi',
      currency: 'KES',
      min_order_minor: 60000,
      prep_default_min: 30,
      created_at: now,
      updated_at: now,
      service_zones: [zoneKilimani.id],
    };
    this.branches.set(branchHurlingham.id, branchHurlingham);
    this.branchServiceZones.set(branchHurlingham.id, new Set([zoneKilimani.id]));

    // 5. Memberships for Users
    // User 10000000-0000-0000-0000-000000000002 (merchant@deetoo.ke): Owner of merchant_burger_01
    const ownerUserId = '10000000-0000-0000-0000-000000000002';
    const ownerMem: MerchantMembership = {
      id: 'mem_01',
      merchant_id: merchantBurger.id,
      user_id: ownerUserId,
      user_email: 'merchant@deetoo.ke',
      user_name: 'Merchant Owner',
      role_code: MembershipRole.MERCHANT_OWNER,
      status: MembershipStatus.ACTIVE,
      branch_ids: [branchWestlands.id, branchKilimani.id],
      created_at: now,
    };
    this.memberships.set(ownerMem.id, ownerMem);
    this.userMemberships.set(ownerUserId, [ownerMem.id]);

    // Manager User
    const managerUserId = '10000000-0000-0000-0000-000000000008';
    const managerMem: MerchantMembership = {
      id: 'mem_02',
      merchant_id: merchantBurger.id,
      user_id: managerUserId,
      user_email: 'manager@deetoo.ke',
      user_name: 'Westlands Branch Manager',
      role_code: MembershipRole.MERCHANT_MANAGER,
      status: MembershipStatus.ACTIVE,
      branch_ids: [branchWestlands.id],
      created_at: now,
    };
    this.memberships.set(managerMem.id, managerMem);
    this.userMemberships.set(managerUserId, [managerMem.id]);

    // Staff User
    const staffUserId = '10000000-0000-0000-0000-000000000009';
    const staffMem: MerchantMembership = {
      id: 'mem_03',
      merchant_id: merchantBurger.id,
      user_id: staffUserId,
      user_email: 'staff@deetoo.ke',
      user_name: 'Kitchen Staff Member',
      role_code: MembershipRole.MERCHANT_STAFF,
      status: MembershipStatus.ACTIVE,
      branch_ids: [branchWestlands.id],
      created_at: now,
    };
    this.memberships.set(staffMem.id, staffMem);
    this.userMemberships.set(staffUserId, [staffMem.id]);
  }
}

export const ephemeralMerchantStore = new EphemeralMerchantStore();

export class MerchantRepository {
  private async getClient() {
    try {
      const pool = getDbPool();
      return await pool.connect();
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  // ==========================================
  // Merchant CRUD & Approval
  // ==========================================

  public async findMerchantById(id: string): Promise<Merchant | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM merchants WHERE id = $1', [id]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            legal_name: row.legal_name,
            display_name: row.display_name,
            slug: row.slug || undefined,
            description: row.description || undefined,
            phone: row.phone || undefined,
            email: row.email || undefined,
            logo_url: row.logo_url || undefined,
            status: row.status as MerchantStatus,
            approval_status: (row.approval_status || 'DRAFT') as MerchantApprovalStatus,
            rejection_reason: row.rejection_reason || undefined,
            commission_bps: row.commission_bps,
            settlement_schedule: row.settlement_schedule,
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
          };
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed querying merchant from db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    return ephemeralMerchantStore.merchants.get(id) || null;
  }

  public async listMerchants(options: {
    status?: MerchantStatus;
    approval_status?: MerchantApprovalStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ merchants: Merchant[]; total: number }> {
    allowMemoryAdapter();
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    let items = Array.from(ephemeralMerchantStore.merchants.values());
    if (options.status) {
      items = items.filter((m) => m.status === options.status);
    }
    if (options.approval_status) {
      items = items.filter((m) => m.approval_status === options.approval_status);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      items = items.filter(
        (m) =>
          m.display_name.toLowerCase().includes(q) ||
          m.legal_name.toLowerCase().includes(q) ||
          (m.email && m.email.toLowerCase().includes(q)) ||
          (m.phone && m.phone.includes(q)) ||
          m.id.includes(q)
      );
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);
    return { merchants: paginated, total };
  }

  public async createMerchant(merchant: Merchant): Promise<Merchant> {
    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO merchants (id, legal_name, display_name, slug, description, phone, email, logo_url, status, approval_status, commission_bps, settlement_schedule, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            merchant.id,
            merchant.legal_name,
            merchant.display_name,
            merchant.slug || null,
            merchant.description || null,
            merchant.phone || null,
            merchant.email || null,
            merchant.logo_url || null,
            merchant.status,
            merchant.approval_status,
            merchant.commission_bps,
            merchant.settlement_schedule,
            merchant.created_at,
            merchant.updated_at,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed saving merchant to db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.merchants.set(merchant.id, merchant);
    return merchant;
  }

  public async updateMerchant(id: string, updates: Partial<Merchant>): Promise<Merchant | null> {
    const existing = await this.findMerchantById(id);
    if (!existing) return null;

    const updated: Merchant = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE merchants 
           SET legal_name = $1, display_name = $2, slug = $3, description = $4, phone = $5, email = $6,
               logo_url = $7, status = $8, approval_status = $9, rejection_reason = $10, commission_bps = $11,
               settlement_schedule = $12, updated_at = $13
           WHERE id = $14`,
          [
            updated.legal_name,
            updated.display_name,
            updated.slug || null,
            updated.description || null,
            updated.phone || null,
            updated.email || null,
            updated.logo_url || null,
            updated.status,
            updated.approval_status,
            updated.rejection_reason || null,
            updated.commission_bps,
            updated.settlement_schedule,
            updated.updated_at,
            id,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed updating merchant in db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.merchants.set(id, updated);
    return updated;
  }

  // ==========================================
  // Branch Management
  // ==========================================

  public async findBranchById(id: string): Promise<MerchantBranch | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM merchant_branches WHERE id = $1', [id]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          const zonesRes = await client.query(
            'SELECT service_zone_id FROM branch_service_zones WHERE branch_id = $1 AND status = $2',
            [id, 'ACTIVE']
          );
          return {
            id: row.id,
            merchant_id: row.merchant_id,
            name: row.name,
            slug: row.slug || undefined,
            email: row.email || undefined,
            phone: row.phone || undefined,
            address_line1: row.address_line1 || row.address_text,
            address_line2: row.address_line2 || undefined,
            landmark: row.landmark || undefined,
            city: row.city || 'Nairobi',
            region: row.region || 'Nairobi',
            country_code: row.country_code || 'KE',
            postal_code: row.postal_code || undefined,
            address_text: row.address_text,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            status: row.status as BranchAdminStatus,
            operational_status: (row.operational_status || 'CLOSED') as BranchOperationalStatus,
            timezone: row.timezone || 'Africa/Nairobi',
            currency: row.currency || 'KES',
            min_order_minor: Number(row.min_order_minor || 0),
            prep_default_min: Number(row.prep_default_min || 20),
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
            service_zones: zonesRes.rows.map((r) => r.service_zone_id),
          };
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed finding branch in db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const branch = ephemeralMerchantStore.branches.get(id);
    if (branch) {
      const zones = ephemeralMerchantStore.branchServiceZones.get(id);
      return {
        ...branch,
        service_zones: zones ? Array.from(zones) : [],
      };
    }
    return null;
  }

  public async listBranchesByMerchant(merchantId: string): Promise<MerchantBranch[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM merchant_branches WHERE merchant_id = $1 ORDER BY name ASC', [merchantId]);
        if (res.rows.length > 0) {
          return res.rows.map((row) => ({
            id: row.id,
            merchant_id: row.merchant_id,
            name: row.name,
            slug: row.slug || undefined,
            email: row.email || undefined,
            phone: row.phone || undefined,
            address_line1: row.address_line1 || row.address_text,
            address_line2: row.address_line2 || undefined,
            landmark: row.landmark || undefined,
            city: row.city || 'Nairobi',
            region: row.region || 'Nairobi',
            country_code: row.country_code || 'KE',
            postal_code: row.postal_code || undefined,
            address_text: row.address_text,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            status: row.status as BranchAdminStatus,
            operational_status: (row.operational_status || 'CLOSED') as BranchOperationalStatus,
            timezone: row.timezone || 'Africa/Nairobi',
            currency: row.currency || 'KES',
            min_order_minor: Number(row.min_order_minor || 0),
            prep_default_min: Number(row.prep_default_min || 20),
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
          }));
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed listing branches from db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    return Array.from(ephemeralMerchantStore.branches.values())
      .filter((b) => b.merchant_id === merchantId)
      .map((b) => ({
        ...b,
        service_zones: Array.from(ephemeralMerchantStore.branchServiceZones.get(b.id) || []),
      }));
  }

  public async listAllBranches(options?: {
    status?: BranchAdminStatus;
    operational_status?: BranchOperationalStatus;
    search?: string;
  }): Promise<MerchantBranch[]> {
    allowMemoryAdapter();
    let branches = Array.from(ephemeralMerchantStore.branches.values()).map((b) => ({
      ...b,
      service_zones: Array.from(ephemeralMerchantStore.branchServiceZones.get(b.id) || []),
    }));

    if (options?.status) {
      branches = branches.filter((b) => b.status === options.status);
    }
    if (options?.operational_status) {
      branches = branches.filter((b) => b.operational_status === options.operational_status);
    }
    if (options?.search) {
      const q = options.search.toLowerCase();
      branches = branches.filter((b) => b.name.toLowerCase().includes(q) || b.address_text.toLowerCase().includes(q));
    }
    return branches;
  }

  public async createBranch(branch: MerchantBranch): Promise<MerchantBranch> {
    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO merchant_branches (
             id, merchant_id, name, slug, email, phone, address_line1, address_line2, landmark,
             city, region, country_code, postal_code, address_text, latitude, longitude,
             status, operational_status, timezone, currency, min_order_minor, prep_default_min,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            branch.id,
            branch.merchant_id,
            branch.name,
            branch.slug || null,
            branch.email || null,
            branch.phone || null,
            branch.address_line1,
            branch.address_line2 || null,
            branch.landmark || null,
            branch.city,
            branch.region,
            branch.country_code,
            branch.postal_code || null,
            branch.address_text,
            branch.latitude,
            branch.longitude,
            branch.status,
            branch.operational_status,
            branch.timezone,
            branch.currency,
            branch.min_order_minor,
            branch.prep_default_min,
            branch.created_at,
            branch.updated_at,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed saving branch in db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.branches.set(branch.id, branch);
    if (branch.service_zones) {
      ephemeralMerchantStore.branchServiceZones.set(branch.id, new Set(branch.service_zones));
    }
    return branch;
  }

  public async updateBranch(id: string, updates: Partial<MerchantBranch>): Promise<MerchantBranch | null> {
    const existing = await this.findBranchById(id);
    if (!existing) return null;

    const updated: MerchantBranch = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE merchant_branches 
           SET name = $1, slug = $2, email = $3, phone = $4, address_line1 = $5, address_line2 = $6,
               landmark = $7, city = $8, region = $9, country_code = $10, postal_code = $11,
               address_text = $12, latitude = $13, longitude = $14, status = $15, operational_status = $16,
               timezone = $17, currency = $18, min_order_minor = $19, prep_default_min = $20, updated_at = $21
           WHERE id = $22`,
          [
            updated.name,
            updated.slug || null,
            updated.email || null,
            updated.phone || null,
            updated.address_line1,
            updated.address_line2 || null,
            updated.landmark || null,
            updated.city,
            updated.region,
            updated.country_code,
            updated.postal_code || null,
            updated.address_text,
            updated.latitude,
            updated.longitude,
            updated.status,
            updated.operational_status,
            updated.timezone,
            updated.currency,
            updated.min_order_minor,
            updated.prep_default_min,
            updated.updated_at,
            id,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed updating branch in db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.branches.set(id, updated);
    return updated;
  }

  // ==========================================
  // Opening Hours
  // ==========================================

  public async getOpeningHours(branchId: string): Promise<BranchOpeningHour[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          'SELECT * FROM branch_opening_hours WHERE branch_id = $1 ORDER BY day_of_week ASC, open_time ASC',
          [branchId]
        );
        if (res.rows.length > 0) {
          return res.rows.map((row) => ({
            id: row.id,
            branch_id: row.branch_id,
            day_of_week: row.day_of_week,
            open_time: row.open_time,
            close_time: row.close_time,
            is_closed: row.is_closed,
            created_at: row.created_at.toISOString(),
          }));
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed querying opening hours from db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    return ephemeralMerchantStore.openingHours.get(branchId) || [];
  }

  public async setOpeningHours(branchId: string, hours: BranchOpeningHour[]): Promise<BranchOpeningHour[]> {
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM branch_opening_hours WHERE branch_id = $1', [branchId]);
        for (const h of hours) {
          await client.query(
            `INSERT INTO branch_opening_hours (id, branch_id, day_of_week, open_time, close_time, is_closed)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [h.id, branchId, h.day_of_week, h.open_time, h.close_time, h.is_closed]
          );
        }
        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        logger.warn('Failed saving opening hours to db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.openingHours.set(branchId, hours);
    return hours;
  }

  // ==========================================
  // Service Zones
  // ==========================================

  public async listServiceZones(options?: { status?: ServiceZoneStatus }): Promise<ServiceZone[]> {
    const client = await this.getClient();
    if (client) {
      try {
        let q = 'SELECT * FROM service_zones';
        const params: any[] = [];
        if (options?.status) {
          q += ' WHERE status = $1';
          params.push(options.status);
        }
        q += ' ORDER BY name ASC';
        const res = await client.query(q, params);
        if (res.rows.length > 0) {
          return res.rows.map((row) => ({
            id: row.id,
            name: row.name,
            city_id: row.city_id,
            status: row.status as ServiceZoneStatus,
            config: row.config || { base_delivery_fee_minor: 15000, service_fee_minor: 5000, max_radius_km: 10 },
            created_at: row.created_at?.toISOString(),
          }));
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Failed querying service zones from db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    let zones = Array.from(ephemeralMerchantStore.serviceZones.values());
    if (options?.status) {
      zones = zones.filter((z) => z.status === options.status);
    }
    return zones;
  }

  public async findServiceZoneById(id: string): Promise<ServiceZone | null> {
    allowMemoryAdapter();
    return ephemeralMerchantStore.serviceZones.get(id) || null;
  }

  public async createServiceZone(zone: ServiceZone): Promise<ServiceZone> {
    allowMemoryAdapter();
    ephemeralMerchantStore.serviceZones.set(zone.id, zone);
    return zone;
  }

  public async updateServiceZone(id: string, updates: Partial<ServiceZone>): Promise<ServiceZone | null> {
    allowMemoryAdapter();
    const existing = ephemeralMerchantStore.serviceZones.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    ephemeralMerchantStore.serviceZones.set(id, updated);
    return updated;
  }

  public async assignBranchServiceZones(branchId: string, zoneIds: string[]): Promise<void> {
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM branch_service_zones WHERE branch_id = $1', [branchId]);
        for (const zid of zoneIds) {
          await client.query(
            'INSERT INTO branch_service_zones (branch_id, service_zone_id, status) VALUES ($1, $2, $3)',
            [branchId, zid, 'ACTIVE']
          );
        }
        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        logger.warn('Failed saving branch zones to db', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    ephemeralMerchantStore.branchServiceZones.set(branchId, new Set(zoneIds));
  }

  public async getBranchServiceZones(branchId: string): Promise<string[]> {
    allowMemoryAdapter();
    const zones = ephemeralMerchantStore.branchServiceZones.get(branchId);
    return zones ? Array.from(zones) : [];
  }

  // ==========================================
  // Memberships & Team
  // ==========================================

  public async getMembershipsForUser(userId: string): Promise<MerchantMembership[]> {
    if (config.storage.mode === "postgres") return postgresMemberships.getMembershipsForUser(userId);
    const memIds = ephemeralMerchantStore.userMemberships.get(userId) || [];
    return memIds
      .map((id) => ephemeralMerchantStore.memberships.get(id))
      .filter((m): m is MerchantMembership => m !== undefined);
  }

  public async listMembershipsByMerchant(merchantId: string): Promise<MerchantMembership[]> {
    if (config.storage.mode === "postgres") return postgresMemberships.listMembershipsByMerchant(merchantId);
    return Array.from(ephemeralMerchantStore.memberships.values()).filter(
      (m) => m.merchant_id === merchantId
    );
  }

  public async findMembershipById(id: string): Promise<MerchantMembership | null> {
    if (config.storage.mode === "postgres") return postgresMemberships.findMembershipById(id);
    return ephemeralMerchantStore.memberships.get(id) || null;
  }

  public async createMembership(membership: MerchantMembership): Promise<MerchantMembership> {
    if (config.storage.mode === "postgres") return postgresMemberships.createMembership(membership);
    ephemeralMerchantStore.memberships.set(membership.id, membership);
    const existing = ephemeralMerchantStore.userMemberships.get(membership.user_id) || [];
    if (!existing.includes(membership.id)) {
      existing.push(membership.id);
      ephemeralMerchantStore.userMemberships.set(membership.user_id, existing);
    }
    return membership;
  }

  public async updateMembership(id: string, updates: Partial<MerchantMembership>): Promise<MerchantMembership | null> {
    if (config.storage.mode === "postgres") return postgresMemberships.updateMembership(id,updates);
    const existing = ephemeralMerchantStore.memberships.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    ephemeralMerchantStore.memberships.set(id, updated);
    return updated;
  }

  // ==========================================
  // Invitations
  // ==========================================

  public async createInvitation(invitation: MerchantInvitation): Promise<MerchantInvitation> {
    if (config.storage.mode === "postgres") return postgresMemberships.createInvitation(invitation);
    ephemeralMerchantStore.invitations.set(invitation.invitation_token, invitation);
    return invitation;
  }

  public async findInvitationByToken(token: string): Promise<MerchantInvitation | null> {
    if (config.storage.mode === "postgres") return postgresMemberships.findInvitationByToken(token);
    return ephemeralMerchantStore.invitations.get(token) || null;
  }

  public async listInvitationsByMerchant(merchantId: string): Promise<MerchantInvitation[]> {
    if (config.storage.mode === "postgres") return postgresMemberships.listInvitationsByMerchant(merchantId);
    return Array.from(ephemeralMerchantStore.invitations.values()).filter(
      (inv) => inv.merchant_id === merchantId
    );
  }

  public async updateInvitation(token: string, updates: Partial<MerchantInvitation>): Promise<MerchantInvitation | null> {
    if (config.storage.mode === "postgres") return postgresMemberships.updateInvitation(token,updates);
    const existing = ephemeralMerchantStore.invitations.get(token);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    ephemeralMerchantStore.invitations.set(token, updated);
    return updated;
  }
}

export const merchantRepository = storageAdapter(new MerchantRepository(), postgresMerchant);
