/**
 * DEETOO - Shared Validation Schemas
 * Standardized Zod schemas for frontend forms and backend validation
 * Based on DEE-API-001, DEE-DOM-001, DEE-SEC-001
 */

import { z } from 'zod';

export const MoneySchema = z.object({
  amount_minor: z.number().int().nonnegative('Amount must be a non-negative integer minor unit'),
  currency: z.string().length(3, 'Currency must be ISO 3-letter code').regex(/^[A-Z]{3}$/, 'Currency must be uppercase'),
});

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  lng: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  accuracy_m: z.number().positive().optional(),
  observed_at: z.string().datetime().optional(),
});

export const PhoneE164Schema = z.string().regex(
  /^\+[1-9]\d{6,14}$/,
  'Phone number must be in E.164 format (e.g. +254712345678)'
);

/**
 * Normalizes email address by trimming and lowercasing
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes Kenyan or international phone number to E.164
 * e.g. 0712345678 -> +254712345678, 254712345678 -> +254712345678
 */
export function normalizePhoneE164(phone: string, defaultCountryCode = '254'): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0')) {
    return `+${defaultCountryCode}${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith(defaultCountryCode)) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password maximum length is 128 characters');

export const CustomerRegisterSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address').optional(),
    phone_e164: PhoneE164Schema.optional(),
    password: PasswordSchema,
  })
  .refine((data) => !!(data.email || data.phone_e164), {
    message: 'Either email or phone number is required',
    path: ['email'],
  });

export const LoginSchema = z.object({
  identifier: z.string().min(3, 'Email or phone number is required'),
  password: z.string().min(1, 'Password is required'),
  device_info: z.string().max(255).optional(),
  device_id: z.string().max(100).optional(),
});

export const ForgotPasswordSchema = z.object({
  identifier: z.string().min(3, 'Email or phone number is required'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10, 'Valid reset token is required'),
  new_password: PasswordSchema,
});

export const OtpRequestSchema = z.object({
  phone_e164: PhoneE164Schema,
  purpose: z.enum(['VERIFICATION', 'LOGIN', 'RESET']).optional().default('VERIFICATION'),
});

export const OtpConfirmSchema = z.object({
  phone_e164: PhoneE164Schema,
  code: z.string().min(4).max(8, 'Invalid verification code'),
});

export const IdempotencyKeySchema = z
  .string()
  .min(8, 'Idempotency key must be at least 8 characters')
  .max(128, 'Idempotency key max 128 characters');

export const CreateOrderSchema = z
  .object({
    quote_id: z.string().min(1, 'Quote ID is required').optional(),
    quoteId: z.string().min(1, 'Quote ID is required').optional(),
    special_instructions: z.string().max(500).optional(),
  })
  .refine((data) => !!(data.quote_id || data.quoteId), {
    message: 'Quote ID is required',
    path: ['quoteId'],
  });

export const OrderAcceptSchema = z
  .object({
    preparation_minutes: z
      .number()
      .int('Preparation minutes must be an integer')
      .min(1, 'Minimum preparation time is 1 minute')
      .max(180, 'Maximum preparation time is 180 minutes')
      .optional(),
    estimatedPreparationMinutes: z
      .number()
      .int('Preparation minutes must be an integer')
      .min(1, 'Minimum preparation time is 1 minute')
      .max(180, 'Maximum preparation time is 180 minutes')
      .optional(),
  })
  .refine(
    (data) => data.preparation_minutes !== undefined || data.estimatedPreparationMinutes !== undefined,
    {
      message: 'Preparation minutes is required (between 1 and 180)',
      path: ['preparation_minutes'],
    }
  );

export const OrderRejectSchema = z
  .object({
    reason_code: z.string().min(2, 'Reason code required').optional(),
    reasonCode: z.string().min(2, 'Reason code required').optional(),
    note: z.string().max(255).optional(),
  })
  .refine((data) => !!(data.reason_code || data.reasonCode), {
    message: 'Reason code is required',
    path: ['reasonCode'],
  });

export const OrderCancelSchema = z
  .object({
    reason_code: z.string().min(2, 'Reason code required').optional(),
    reasonCode: z.string().min(2, 'Reason code required').optional(),
    note: z.string().max(255).optional(),
  })
  .refine((data) => !!(data.reason_code || data.reasonCode), {
    message: 'Reason code is required',
    path: ['reasonCode'],
  });

export const RiderLocationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().optional().default(10),
  recorded_at: z.string().datetime().optional(),
});

export const AddressInputSchema = z.object({
  label: z.string().min(1).max(50),
  recipient_name: z.string().min(2).max(100),
  phone_e164: PhoneE164Schema,
  address_text: z.string().min(5).max(255),
  location: GeoPointSchema,
  instructions: z.string().max(255).optional(),
  is_default: z.boolean().optional().default(false),
});

export const CheckoutInputSchema = z.object({
  cart_id: z.string().min(1, 'Cart ID is required'),
  delivery_address_id: z.string().min(1, 'Delivery address ID is required'),
  payment_method: z.object({
    type: z.enum(['MPESA', 'CARD']),
    phone_e164: PhoneE164Schema.optional(),
  }),
});

// ==========================================
// Sprint 3 Merchant Domain Validation Schemas
// ==========================================

export const CreateMerchantSchema = z.object({
  legal_name: z.string().min(2, 'Legal name must be at least 2 characters').max(255),
  display_name: z.string().min(2, 'Display name must be at least 2 characters').max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  description: z.string().max(1000).optional(),
  phone: z.string().min(8).max(30).optional(),
  email: z.string().email('Invalid email address').optional(),
  logo_url: z.string().url('Invalid logo URL').optional(),
  commission_bps: z.number().int().min(0).max(10000).optional().default(2000),
  settlement_schedule: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional().default('WEEKLY'),
});

export const UpdateMerchantSchema = CreateMerchantSchema.partial();

export const AdminApproveMerchantSchema = z.object({
  note: z.string().max(500).optional(),
});

export const AdminRejectMerchantSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be at least 5 characters').max(500),
});

export const CreateBranchSchema = z.object({
  name: z.string().min(2, 'Branch name must be at least 2 characters').max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
  phone: z.string().min(8).max(30).optional(),
  email: z.string().email('Invalid email address').optional(),
  address_line1: z.string().min(2, 'Address Line 1 is required').max(255),
  address_line2: z.string().max(255).optional(),
  landmark: z.string().max(255).optional(),
  city: z.string().min(2).max(100).default('Nairobi'),
  region: z.string().min(2).max(100).default('Nairobi'),
  country_code: z.string().length(2).default('KE'),
  postal_code: z.string().max(30).optional(),
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  timezone: z.string().default('Africa/Nairobi'),
  currency: z.string().length(3).default('KES'),
  min_order_minor: z.number().int().nonnegative().optional().default(0),
  prep_default_min: z.number().int().min(1).max(180).optional().default(20),
});

export const UpdateBranchSchema = CreateBranchSchema.partial();

export const UpdateBranchOperationalStatusSchema = z.object({
  operational_status: z.enum(['OPEN', 'CLOSED', 'BUSY', 'TEMPORARILY_UNAVAILABLE', 'PAUSED']),
  reason: z.string().max(255).optional(),
});

export const BranchAdminStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
  reason: z.string().min(3, 'Reason is required').max(255),
});

export const OpeningHourIntervalSchema = z
  .object({
    id: z.string().optional(),
    day_of_week: z.number().int().min(0).max(6),
    open_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'open_time must be HH:mm 24-hr format'),
    close_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'close_time must be HH:mm 24-hr format'),
    is_closed: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.is_closed) return true;
      return data.open_time < data.close_time;
    },
    {
      message: 'close_time must be later than open_time for same-day intervals',
      path: ['close_time'],
    }
  );

/**
 * Validates that opening hours intervals do not overlap for the same day
 */
export const BatchOpeningHoursSchema = z
  .array(OpeningHourIntervalSchema)
  .refine((intervals) => {
    // Group by day_of_week
    const byDay = new Map<number, typeof intervals>();
    for (const item of intervals) {
      if (item.is_closed) continue;
      const list = byDay.get(item.day_of_week) || [];
      list.push(item);
      byDay.set(item.day_of_week, list);
    }

    for (const [, dayIntervals] of byDay.entries()) {
      // Sort intervals by open_time
      const sorted = [...dayIntervals].sort((a, b) => a.open_time.localeCompare(b.open_time));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].close_time > sorted[i + 1].open_time) {
          return false; // Overlap detected!
        }
      }
    }
    return true;
  }, {
    message: 'Opening hours intervals must not overlap on the same day',
  });

export const InviteStaffSchema = z.object({
  email: z.string().email('Valid email address is required'),
  phone_e164: PhoneE164Schema.optional(),
  role_code: z.enum(['merchant_owner', 'merchant_manager', 'merchant_staff']),
  branch_ids: z.array(z.string()).optional().default([]),
});

export const UpdateMembershipSchema = z.object({
  role_code: z.enum(['merchant_owner', 'merchant_manager', 'merchant_staff']).optional(),
  branch_ids: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']).optional(),
});

export const ServiceZoneSchema = z.object({
  name: z.string().min(2, 'Zone name must be at least 2 characters').max(100),
  city_id: z.string().min(2).max(50).default('NAIROBI'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  boundary: z.any().optional(),
  config: z.object({
    base_delivery_fee_minor: z.number().int().nonnegative(),
    service_fee_minor: z.number().int().nonnegative(),
    max_radius_km: z.number().positive(),
  }),
});

export const AssignBranchZonesSchema = z.object({
  service_zone_ids: z.array(z.string()),
});

// ==========================================
// Sprint 4 Catalogue Validation Schemas
// ==========================================

export const CreateMenuSchema = z.object({
  name: z.string().min(2, 'Menu name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).default('KES'),
  is_active: z.boolean().default(true),
  branch_ids: z.array(z.string()).optional().default([]),
});

export const UpdateMenuSchema = CreateMenuSchema.partial();

export const AssignMenuBranchesSchema = z.object({
  branch_ids: z.array(z.string()),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().optional().default(0),
  is_active: z.boolean().default(true),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

export const ReorderCategoriesSchema = z.object({
  category_ids: z.array(z.string()).min(1, 'At least one category ID is required'),
});

export const CreateMenuItemSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Item name is required').max(255),
  description: z.string().max(1000).optional(),
  price_minor: z
    .number()
    .int('Price must be an integer minor unit (no decimals allowed)')
    .nonnegative('Price must be non-negative'),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).default('KES'),
  sku: z.string().max(100).optional(),
  image_url: z.string().max(2048).optional(),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().optional().default(0),
  modifier_group_ids: z.array(z.string()).optional().default([]),
});

export const UpdateMenuItemSchema = z.object({
  category_id: z.string().min(1).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  price_minor: z
    .number()
    .int('Price must be an integer minor unit')
    .nonnegative('Price must be non-negative')
    .optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  sku: z.string().max(100).optional(),
  image_url: z.string().max(2048).optional(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  modifier_group_ids: z.array(z.string()).optional(),
});

export const ReorderItemsSchema = z.object({
  item_ids: z.array(z.string()).min(1, 'At least one item ID is required'),
});

export const UpdateItemAvailabilitySchema = z.object({
  is_available: z.boolean(),
  branch_id: z.string().optional(),
});

export const CreateModifierGroupSchema = z
  .object({
    name: z.string().min(1, 'Modifier group name is required').max(100),
    min_selections: z.number().int().nonnegative().default(0),
    max_selections: z.number().int().min(1).default(1),
  })
  .refine((data) => data.max_selections >= data.min_selections, {
    message: 'max_selections cannot be less than min_selections',
    path: ['max_selections'],
  });

export const UpdateModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    min_selections: z.number().int().nonnegative().optional(),
    max_selections: z.number().int().min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.min_selections !== undefined && data.max_selections !== undefined) {
        return data.max_selections >= data.min_selections;
      }
      return true;
    },
    {
      message: 'max_selections cannot be less than min_selections',
      path: ['max_selections'],
    }
  );

export const AttachModifierGroupsSchema = z.object({
  modifier_group_ids: z.array(z.string()),
});

export const CreateModifierOptionSchema = z.object({
  name: z.string().min(1, 'Option name is required').max(100),
  price_delta_minor: z
    .number()
    .int('Price delta must be an integer minor unit')
    .nonnegative('Price delta must be non-negative')
    .default(0),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const UpdateModifierOptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price_delta_minor: z
    .number()
    .int('Price delta must be an integer minor unit')
    .nonnegative('Price delta must be non-negative')
    .optional(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const ReorderModifierOptionsSchema = z.object({
  option_ids: z.array(z.string()).min(1, 'At least one option ID is required'),
});

export const UpdateModifierOptionAvailabilitySchema = z.object({
  is_available: z.boolean(),
  branch_id: z.string().optional(),
});

export const BranchCatalogueOverrideSchema = z.object({
  is_available: z.boolean().optional(),
  price_override_minor: z
    .number()
    .int('Price override must be an integer minor unit')
    .nonnegative()
    .nullable()
    .optional(),
});

// ==========================================
// Sprint 5 Customer Profiles, Addresses & Discovery Schemas
// ==========================================

export const UpdateCustomerProfileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100).optional(),
  last_name: z.string().min(1, 'Last name is required').max(100).optional(),
  display_name: z.string().min(1).max(100).optional(),
  phone: PhoneE164Schema.optional(),
  email: z.string().email('Invalid email address').optional(),
});

export const CreateCustomerAddressSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g. Home, Work, Other)').max(50),
  recipient_name: z.string().max(100).optional(),
  phone_e164: PhoneE164Schema.optional(),
  address_line1: z.string().min(2, 'Street address is required').max(255),
  address_line2: z.string().max(255).optional(),
  landmark: z.string().max(255).optional(),
  city: z.string().min(1).max(100).default('Nairobi'),
  region: z.string().max(100).default('Nairobi County'),
  country_code: z.string().length(2).default('KE'),
  postal_code: z.string().max(30).optional(),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  delivery_instructions: z.string().max(500).optional(),
  is_default: z.boolean().optional().default(false),
});

export const UpdateCustomerAddressSchema = CreateCustomerAddressSchema.partial();

export const ServiceabilityCheckSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
});

export const RestaurantDiscoveryQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  search: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  open_now: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  sort: z.enum(['recommended', 'distance', 'open_now']).optional().default('recommended'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// ==========================================
// 8. Sprint 6 Validation Schemas
// ==========================================

export const AddToCartSchema = z.object({
  branch_id: z.string().min(1, 'Branch ID is required'),
  menu_item_id: z.string().min(1, 'Menu item ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(99, 'Quantity cannot exceed 99'),
  modifier_option_ids: z.array(z.string()).optional().default([]),
  force_clear_existing: z.boolean().optional().default(false),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity cannot be negative').max(99, 'Quantity cannot exceed 99'),
});

export const ApplyPromoCodeSchema = z.object({
  code: z.string().min(1, 'Promo code is required').max(50, 'Promo code cannot exceed 50 characters'),
});

export const GenerateQuoteSchema = z.object({
  payment_method: z.enum(['MPESA', 'CARD']).optional(),
  address_id: z.string().min(1, 'Delivery address ID is required'),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const DeliveryPricingRuleSchema = z.object({
  zone_id: z.string().nullable().optional(),
  base_fee_minor: z.number().int().nonnegative('Base fee must be non-negative integer minor units'),
  included_distance_meters: z.number().int().nonnegative('Included distance must be non-negative'),
  per_km_fee_minor: z.number().int().nonnegative('Per-km fee must be non-negative integer minor units'),
  minimum_fee_minor: z.number().int().nonnegative('Minimum fee must be non-negative integer minor units'),
  maximum_fee_minor: z.number().int().nonnegative('Maximum fee must be non-negative integer minor units'),
  max_delivery_distance_meters: z.number().int().positive('Max distance must be greater than 0'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).refine((data) => data.maximum_fee_minor >= data.minimum_fee_minor, {
  message: 'Maximum fee cannot be less than minimum fee',
  path: ['maximum_fee_minor'],
});

export const ServiceFeeRuleSchema = z.object({
  fee_type: z.enum(['PERCENTAGE', 'FIXED', 'HYBRID']).default('PERCENTAGE'),
  percentage_basis_points: z.number().int().nonnegative().default(250),
  fixed_fee_minor: z.number().int().nonnegative().default(0),
  minimum_fee_minor: z.number().int().nonnegative().default(2000),
  maximum_fee_minor: z.number().int().nonnegative().default(8000),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).refine((data) => data.maximum_fee_minor >= data.minimum_fee_minor, {
  message: 'Maximum fee cannot be less than minimum fee',
  path: ['maximum_fee_minor'],
});

export const CreatePromotionSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Promo code must be alphanumeric'),
  type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_DELIVERY']),
  value_minor_or_bps: z.number().int().nonnegative().default(0),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime(),
  minimum_basket_minor: z.number().int().nonnegative().default(0),
  usage_limit: z.number().int().positive().default(1000),
  per_customer_limit: z.number().int().positive().default(1),
  merchant_id: z.string().nullable().optional(),
  branch_id: z.string().nullable().optional(),
  zone_id: z.string().nullable().optional(),
  funding_source: z.enum(['DEETOO', 'MERCHANT', 'SHARED']).default('DEETOO'),
  merchant_funding_bps: z.number().int().min(0).max(10000).default(0),
  description: z.string().min(2).max(255),
});

// ==========================================
// Rider Foundation Validation Schemas (Sprint 8)
// ==========================================

export const RiderProfileUpdateSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters').max(100).optional(),
  last_name: z.string().min(2, 'Last name must be at least 2 characters').max(100).optional(),
  phone: z.string().min(8, 'Phone number is too short').max(30).optional(),
  vehicle_type: z.enum(['BICYCLE', 'MOTORBIKE', 'CAR']).optional(),
  vehicle_registration: z.string().max(50).optional(),
}).strict();

export const RiderVehicleSchema = z.object({
  type: z.enum(['BICYCLE', 'MOTORBIKE', 'CAR']),
  registration_number: z.string().max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const RiderLocationSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  accuracy_meters: z.number().nonnegative('Accuracy must be a non-negative number').default(10),
  recorded_at: z.string().datetime().optional(),
});

export const RiderAvailabilityOnlineSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy_meters: z.number().nonnegative().optional(),
});

export const AdminApproveRiderSchema = z.object({
  note: z.string().max(500).optional(),
});

export const AdminRejectRiderSchema = z.object({
  reason_code: z.string().min(3, 'Rejection reason code is required').max(100),
  note: z.string().max(500).optional(),
});

export const AdminSuspendRiderSchema = z.object({
  reason: z.string().min(3, 'Suspension reason is required').max(500),
  note: z.string().max(500).optional(),
});

export const AdminRiderZoneAssignSchema = z.object({
  zone_ids: z.array(z.string().min(1)).optional(),
  service_zone_ids: z.array(z.string().min(1)).optional(),
});

export const RiderApprovalSchema = AdminApproveRiderSchema;
export const RiderRejectionSchema = AdminRejectRiderSchema;
export const RiderSuspensionSchema = AdminSuspendRiderSchema;
export const RiderZoneAssignmentSchema = AdminRiderZoneAssignSchema;

// ==========================================
// Dispatch & Delivery Offer Validation Schemas (Sprint 9)
// ==========================================

export const RiderRejectOfferSchema = z.object({
  reason_code: z.enum([
    'TOO_FAR',
    'ENDING_SHIFT',
    'VEHICLE_ISSUE',
    'AREA_UNFAMILIAR',
    'INSUFFICIENT_PAY',
    'PERSONAL_EMERGENCY',
    'OTHER',
  ]).default('OTHER'),
  note: z.string().max(300).optional(),
});

export const RiderReleaseDeliverySchema = z.object({
  reason_code: z.string().min(3, 'Reason code is required').max(100),
  note: z.string().max(500).optional(),
});

export const AdminManualAssignSchema = z.object({
  rider_id: z.string().min(1, 'Rider ID is required'),
  note: z.string().max(500).optional(),
});

export const AdminUnassignDeliverySchema = z.object({
  reason_code: z.string().min(3, 'Reason code is required').max(100),
  note: z.string().max(500).optional(),
  retrigger_dispatch: z.boolean().default(true),
});

export const DispatchConfigUpdateSchema = z.object({
  initialSearchRadius: z.number().int().positive().optional(),
  radiusExpansionSteps: z.array(z.number().int().positive()).optional(),
  maxSearchRadius: z.number().int().positive().optional(),
  offerTimeoutSeconds: z.number().int().positive().optional(),
  maxOffersPerCycle: z.number().int().positive().optional(),
  retryIntervalsSeconds: z.array(z.number().int().nonnegative()).optional(),
  pickupArrivalBufferSeconds: z.number().int().nonnegative().optional(),
  expectedRiderPickupTravelTimeSeconds: z.number().int().nonnegative().optional(),
  maxActiveDeliveriesPerRider: z.number().int().positive().optional(),
  routingCandidateLimit: z.number().int().positive().optional(),
  dispatchSlaSeconds: z.number().int().positive().optional(),
});

// ==========================================
// Sprint 10: Delivery Execution Lifecycle & Proof of Delivery Schemas
// ==========================================

export const RiderArrivePickupSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy_meters: z.number().nonnegative().optional(),
  override_reason: z.string().max(300).optional(),
});

export const RiderConfirmPickupSchema = z.object({
  pickup_verification_code: z.string().max(50).optional(),
  verification_code: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});

export const RiderArriveDropoffSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy_meters: z.number().nonnegative().optional(),
  override_reason: z.string().max(300).optional(),
});

export const RiderCompleteDeliverySchema = z.object({
  proof_type: z.enum(['OTP', 'PHOTO', 'SIGNATURE', 'CONTACTLESS_CONFIRMATION']).default('OTP'),
  otp: z.string().min(4).max(8).optional(),
  verification_code: z.string().min(4).max(8).optional(),
  photo_media_id: z.string().uuid().optional(),
  photo_url: z.string().max(2048).optional(),
  signature_data: z.string().max(10000).optional(),
  note: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const RiderFailDeliverySchema = z.object({
  reason_code: z.enum([
    'CUSTOMER_UNREACHABLE',
    'CUSTOMER_REFUSED',
    'INCORRECT_ADDRESS',
    'ACCESS_DENIED',
    'ACCIDENT_OR_EMERGENCY',
    'MERCHANT_CLOSED',
    'DAMAGED_IN_TRANSIT',
    'OTHER',
  ]),
  note: z.string().min(3, 'Detailed failure note is required').max(1000),
  photo_media_id: z.string().uuid().optional(),
});

export const AdminForceCompleteDeliverySchema = z.object({
  reason: z.string().min(3, 'Reason is required').max(500),
  note: z.string().max(1000).optional(),
});

export const AdminResolveIncidentSchema = z.object({
  resolution_action: z.string().min(3, 'Resolution action is required').max(200),
  note: z.string().max(1000).optional(),
});

/**
 * Normalizes phone number to M-PESA Daraja format (2547XXXXXXXX or 2541XXXXXXXX)
 */
export function formatMpesaPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('0')) {
    return `254${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith('254')) {
    return cleaned;
  }
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    return `254${cleaned}`;
  }
  return cleaned;
}

export const PaymentInitiateSchema = z
  .object({
    method: z.enum(['MPESA', 'CARD']),
    phone: z.string().optional(),
    payment_method_token: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.method === 'MPESA') {
        return !!data.phone && data.phone.trim().length >= 9;
      }
      return true;
    },
    {
      message: 'Phone number is required for M-PESA payments',
      path: ['phone'],
    }
  );

export const AdminRefundSchema = z
  .object({
    amount_minor: z.number().int().positive('Amount must be positive minor units').optional(),
    amount: z.number().positive('Amount must be positive').optional(),
    reason_code: z.enum([
      'MERCHANT_REJECTED',
      'ORDER_CANCELLED',
      'ITEM_MISSING',
      'DUPLICATE_PAYMENT',
      'DELIVERY_FAILED',
      'CUSTOMER_SUPPORT_ADJUSTMENT',
      'OTHER',
    ]),
    note: z.string().max(1000).optional(),
  })
  .refine((data) => data.amount_minor !== undefined || data.amount !== undefined, {
    message: 'Either amount_minor or amount is required',
    path: ['amount_minor'],
  });

export const MpesaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            })
          ),
        })
        .optional(),
    }),
  }),
});

export const CardWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
});

export const PaymentQueryFilterSchema = z.object({
  status: z.string().optional(),
  order_id: z.string().optional(),
  customer_id: z.string().optional(),
  provider: z.string().optional(),
  method: z.string().optional(),
  reconciliation_status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// SPRINT 12: FINANCIAL LEDGER, SETTLEMENTS & PAYOUTS
// ============================================================================

export const LedgerEntryDirectionSchema = z.enum(['DEBIT', 'CREDIT']);

export const SettlementCalculateSchema = z.object({
  merchantId: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export const SettlementApproveSchema = z.object({
  note: z.string().optional(),
});

export const SettlementPaySchema = z.object({
  paymentReference: z.string().min(1, 'Payment reference is required'),
});

export const RiderPayoutCalculateSchema = z.object({
  riderId: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export const RiderPayoutApproveSchema = z.object({
  note: z.string().optional(),
});

export const RiderPayoutPaySchema = z.object({
  provider: z.string().default('MPESA_B2C'),
  providerReference: z.string().optional(),
});

export const FinancialAdjustmentCreateSchema = z.object({
  reasonCode: z.enum([
    'MERCHANT_CORRECTION',
    'RIDER_CORRECTION',
    'CUSTOMER_REFUND_ADJUSTMENT',
    'PAYMENT_PROCESSOR_ADJUSTMENT',
    'MANUAL_FINANCE_CORRECTION',
  ]),
  targetAccountId: z.string().min(1, 'Target account ID is required'),
  offsetAccountId: z.string().min(1, 'Offset account ID is required'),
  direction: LedgerEntryDirectionSchema,
  amountMinor: z.number().int().positive('Amount must be positive integer minor unit'),
  currency: z.string().default('KES'),
  note: z.string().min(3, 'Detailed audit note is required for financial adjustments'),
});

export const CommissionRuleCreateSchema = z.object({
  merchantId: z.string().optional(),
  percentageRate: z.number().min(0).max(1, 'Percentage rate must be between 0 and 1'),
  fixedFeeMinor: z.number().int().nonnegative().default(0),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
});







