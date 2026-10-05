/**
 * DEETOO - Core Type Foundation
 * Central contracts for cross-application TypeScript contracts
 * Based on DEE-ARC-001, DEE-DOM-001, DEE-STATE-001, DEE-API-001
 */

// ==========================================
// 1. Value Objects
// ==========================================

export interface Money {
  /** Integer minor units (e.g. 150000 = 1500.00 KES). Floating point forbidden. */
  amount_minor: number;
  /** ISO 4217 3-letter currency code (e.g. "KES") */
  currency: string;
}

export interface GeoPoint {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  observed_at?: string;
}

export interface AddressSnapshot {
  label?: string;
  recipient_name: string;
  phone_e164?: string;
  phone?: string;
  address_text?: string;
  formatted_address?: string;
  location: GeoPoint;
  instructions?: string;
}

export interface PriceSnapshot {
  subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  discount_minor: number;
  total_minor: number;
  currency: string;
}

// ==========================================
// 2. State Machine Enums
// ==========================================

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PLACED = 'PLACED',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PLACED, OrderStatus.CANCELLED],
  [OrderStatus.PLACED]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export enum DeliveryStatus {
  UNASSIGNED = 'UNASSIGNED',
  OFFERED = 'OFFERED',
  ASSIGNED = 'ASSIGNED',
  ARRIVED_PICKUP = 'ARRIVED_PICKUP',
  PICKED_UP = 'PICKED_UP',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED_DROPOFF = 'ARRIVED_DROPOFF',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.UNASSIGNED]: [DeliveryStatus.OFFERED, DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.OFFERED]: [DeliveryStatus.ASSIGNED, DeliveryStatus.UNASSIGNED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.ASSIGNED]: [DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.UNASSIGNED, DeliveryStatus.OFFERED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.ARRIVED_PICKUP]: [DeliveryStatus.PICKED_UP, DeliveryStatus.UNASSIGNED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.PICKED_UP]: [DeliveryStatus.EN_ROUTE, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.EN_ROUTE]: [DeliveryStatus.ARRIVED_DROPOFF, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  [DeliveryStatus.ARRIVED_DROPOFF]: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.CANCELLED]: [],
  [DeliveryStatus.FAILED]: [], // Recovery is an explicit Ops command, never an ordinary state transition
};

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return DELIVERY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  MPESA = 'MPESA',
  CARD = 'CARD',
}

export enum PaymentProvider {
  MPESA = 'MPESA',
  SAFARICOM_MPESA = 'SAFARICOM_MPESA',
  CARD = 'CARD',
  MOCK = 'MOCK',
}

export enum PaymentReconciliationStatus {
  UNRECONCILED = 'UNRECONCILED',
  MATCHED = 'MATCHED',
  MISMATCHED = 'MISMATCHED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
}

export enum RefundStatus {
  REQUESTED = 'REQUESTED',
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum RefundReasonCode {
  MERCHANT_REJECTED = 'MERCHANT_REJECTED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ITEM_MISSING = 'ITEM_MISSING',
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  CUSTOMER_SUPPORT_ADJUSTMENT = 'CUSTOMER_SUPPORT_ADJUSTMENT',
  OTHER = 'OTHER',
}

export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [PaymentStatus.INITIATED, PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.INITIATED]: [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.PENDING]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
  ],
  [PaymentStatus.AUTHORIZED]: [PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.CAPTURED]: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.EXPIRED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const REFUND_STATUS_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  [RefundStatus.REQUESTED]: [RefundStatus.PENDING, RefundStatus.SUCCEEDED, RefundStatus.FAILED, RefundStatus.CANCELLED],
  [RefundStatus.PENDING]: [RefundStatus.SUCCEEDED, RefundStatus.FAILED, RefundStatus.CANCELLED],
  [RefundStatus.SUCCEEDED]: [],
  [RefundStatus.FAILED]: [],
  [RefundStatus.CANCELLED]: [],
};

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return REFUND_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PaymentTimelineEntry {
  id: string;
  payment_id: string;
  event_type: string;
  from_status: PaymentStatus | null;
  to_status: PaymentStatus;
  provider_reference?: string | null;
  reason_code?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface PaymentProviderEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  payment_id?: string | null;
  event_type: string;
  payload_hash: string;
  raw_payload: Record<string, unknown>;
  processing_status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'DUPLICATE';
  received_at: string;
  processed_at?: string | null;
}

export interface Payment {
  checkout_url?: string | null;
  id: string;
  order_id: string;
  customer_id: string;
  provider: PaymentProvider | string;
  method: PaymentMethod | string;
  status: PaymentStatus;
  currency: string;
  amount_minor: number;
  amount?: number;
  captured_minor: number;
  refunded_minor: number;
  provider_payment_id?: string | null;
  provider_reference?: string | null;
  merchant_request_id?: string | null;
  checkout_request_id?: string | null;
  mpesa_receipt_number?: string | null;
  phone?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  reconciliation_status?: PaymentReconciliationStatus;
  idempotency_key?: string | null;
  initiated_at?: string | null;
  authorized_at?: string | null;
  captured_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  timeline?: PaymentTimelineEntry[];
  created_at: string;
  updated_at: string;
}

export interface RefundTimelineEntry {
  id: string;
  refund_id: string;
  from_status: RefundStatus | null;
  to_status: RefundStatus;
  reason_code?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  order_id: string;
  amount_minor: number;
  currency: string;
  status: RefundStatus;
  reason_code: RefundReasonCode | string;
  note?: string | null;
  requested_by: string;
  provider_refund_id?: string | null;
  requested_at: string;
  processed_at?: string | null;
  failed_at?: string | null;
  timeline?: RefundTimelineEntry[];
  created_at: string;
  updated_at: string;
}

export interface PaymentInitiationInput {
  method: 'MPESA' | 'CARD';
  phone?: string;
  payment_method_token?: string;
}

export interface AdminRefundInput {
  amount_minor?: number;
  amount?: number;
  reason_code: RefundReasonCode | string;
  note?: string;
}

export interface PaymentFilterParams {
  status?: PaymentStatus | string;
  order_id?: string;
  customer_id?: string;
  provider?: string;
  method?: string;
  reconciliation_status?: PaymentReconciliationStatus | string;
  search?: string;
  page?: number;
  limit?: number;
}

export enum BranchOperationalStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  PAUSED = 'PAUSED',
  BUSY = 'BUSY',
  TEMPORARILY_UNAVAILABLE = 'TEMPORARILY_UNAVAILABLE',
}

export enum MerchantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum MerchantApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum BranchAdminStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum MembershipRole {
  MERCHANT_OWNER = 'merchant_owner',
  MERCHANT_MANAGER = 'merchant_manager',
  MERCHANT_STAFF = 'merchant_staff',
}

export enum MembershipStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum ServiceZoneStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum RiderOnboardingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RiderOperationalStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum RiderWorkStatus {
  OFFLINE = 'OFFLINE',
  ONLINE_AVAILABLE = 'ONLINE_AVAILABLE',
  ONLINE_UNAVAILABLE = 'ONLINE_UNAVAILABLE',
  BUSY = 'BUSY',
}

export enum VehicleType {
  BICYCLE = 'BICYCLE',
  MOTORBIKE = 'MOTORBIKE',
  CAR = 'CAR',
}

export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const RIDER_WORK_STATUS_TRANSITIONS: Record<RiderWorkStatus, RiderWorkStatus[]> = {
  [RiderWorkStatus.OFFLINE]: [RiderWorkStatus.ONLINE_AVAILABLE],
  [RiderWorkStatus.ONLINE_AVAILABLE]: [
    RiderWorkStatus.OFFLINE,
    RiderWorkStatus.ONLINE_UNAVAILABLE,
    RiderWorkStatus.BUSY,
  ],
  [RiderWorkStatus.ONLINE_UNAVAILABLE]: [
    RiderWorkStatus.OFFLINE,
    RiderWorkStatus.ONLINE_AVAILABLE,
  ],
  [RiderWorkStatus.BUSY]: [
    RiderWorkStatus.ONLINE_AVAILABLE,
    RiderWorkStatus.ONLINE_UNAVAILABLE,
    RiderWorkStatus.OFFLINE,
  ],
};

export function canTransitionRiderWorkStatus(
  from: RiderWorkStatus,
  to: RiderWorkStatus
): boolean {
  if (from === to) return true;
  const allowed = RIDER_WORK_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface RiderProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  name?: string;
  phone: string;
  phone_e164?: string;
  onboardingStatus: RiderOnboardingStatus;
  operationalStatus: RiderOperationalStatus;
  workStatus: RiderWorkStatus;
  vehicleType?: VehicleType;
  vehicleRegistration?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  lastKnownLatitude?: number | null;
  lastKnownLongitude?: number | null;
  lastLocationAt?: string | null;
  serviceZoneIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RiderVehicle {
  id: string;
  riderId: string;
  type: VehicleType;
  registrationNumber?: string | null;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RiderServiceZone {
  id: string;
  riderId: string;
  zoneId: string;
  createdAt: string;
}

export interface RiderAvailabilitySession {
  id: string;
  riderId: string;
  startedAt: string;
  endedAt?: string | null;
  startZoneId?: string | null;
  endReason?: 'OFFLINE' | 'SUSPENDED' | 'STALE' | 'ADMIN' | null;
}

export interface RiderLocationUpdate {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
  receivedAt?: string;
}

export interface RiderLiveLocation {
  riderId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
  receivedAt: string;
  isStale?: boolean;
}

export interface RiderEligibilityResult {
  eligible: boolean;
  reasons: string[];
  details?: {
    userActive: boolean;
    onboardingApproved: boolean;
    operationalActive: boolean;
    workStatusAvailable: boolean;
    locationFresh: boolean;
    vehicleValid: boolean;
    zoneValid: boolean;
    lastLocationAgeSeconds?: number;
  };
}

export interface RiderAdminMetrics {
  totalRiders: number;
  pendingApproval: number;
  approved: number;
  active: number;
  online: number;
  available: number;
  suspended: number;
  staleLocation: number;
}

// ==========================================
// 3. Roles and Scopes (DEE-SEC-001)
// ==========================================

export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum UserRole {
  CUSTOMER = 'customer',
  MERCHANT = 'merchant',
  MERCHANT_OWNER = 'merchant_owner',
  MERCHANT_MANAGER = 'merchant_manager',
  MERCHANT_STAFF = 'merchant_staff',
  RIDER = 'rider',
  SUPPORT = 'support',
  FINANCE = 'finance',
  OPS = 'ops',
  ADMIN = 'admin',
}

export enum ResourceScope {
  OWN_RESOURCE = 'OWN_RESOURCE',
  BRANCH = 'BRANCH',
  MERCHANT = 'MERCHANT',
  ASSIGNED_DELIVERY = 'ASSIGNED_DELIVERY',
  PLATFORM = 'PLATFORM',
}

export interface UserSession {
  user_id: string;
  session_id?: string;
  email?: string | null;
  phone_e164?: string | null;
  status?: UserStatus;
  roles: UserRole[];
  permissions?: string[];
  merchant_ids?: string[];
  branch_ids?: string[];
  rider_id?: string;
  customer_id?: string;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  phone_e164?: string | null;
  status: UserStatus;
  name?: string | null;
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  roles: UserRole[];
  permissions: string[];
  merchant_ids?: string[];
  branch_ids?: string[];
  rider_id?: string;
  customer_id?: string;
  created_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: AuthUser;
  /** Present for bearer/native transport; omitted for HttpOnly browser-cookie transport. */
  accessToken?: string;
  /** Present for bearer/native transport; omitted for HttpOnly browser-cookie transport. */
  refreshToken?: string;
  session: {
    id: string;
    expiresAt: string;
  };
}

export enum AuditAction {
  USER_REGISTERED = 'USER_REGISTERED',
  LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
  OTP_REQUESTED = 'OTP_REQUESTED',
  OTP_VERIFIED = 'OTP_VERIFIED',
  MERCHANT_CREATED = 'MERCHANT_CREATED',
  MERCHANT_UPDATED = 'MERCHANT_UPDATED',
  MERCHANT_SUBMITTED = 'MERCHANT_SUBMITTED',
  MERCHANT_APPROVED = 'MERCHANT_APPROVED',
  MERCHANT_REJECTED = 'MERCHANT_REJECTED',
  MERCHANT_SUSPENDED = 'MERCHANT_SUSPENDED',
  MERCHANT_REACTIVATED = 'MERCHANT_REACTIVATED',
  BRANCH_CREATED = 'BRANCH_CREATED',
  BRANCH_UPDATED = 'BRANCH_UPDATED',
  BRANCH_SUSPENDED = 'BRANCH_SUSPENDED',
  BRANCH_REACTIVATED = 'BRANCH_REACTIVATED',
  BRANCH_OPENED = 'BRANCH_OPENED',
  BRANCH_CLOSED = 'BRANCH_CLOSED',
  BRANCH_MARKED_BUSY = 'BRANCH_MARKED_BUSY',
  BRANCH_MARKED_UNAVAILABLE = 'BRANCH_MARKED_UNAVAILABLE',
  MERCHANT_MEMBER_INVITED = 'MERCHANT_MEMBER_INVITED',
  MERCHANT_MEMBER_ROLE_CHANGED = 'MERCHANT_MEMBER_ROLE_CHANGED',
  MERCHANT_MEMBER_REVOKED = 'MERCHANT_MEMBER_REVOKED',
  SERVICE_ZONE_CREATED = 'SERVICE_ZONE_CREATED',
  SERVICE_ZONE_UPDATED = 'SERVICE_ZONE_UPDATED',
  SERVICE_ZONE_ACTIVATED = 'SERVICE_ZONE_ACTIVATED',
  SERVICE_ZONE_DEACTIVATED = 'SERVICE_ZONE_DEACTIVATED',
  BRANCH_SERVICE_ZONE_ASSIGNED = 'BRANCH_SERVICE_ZONE_ASSIGNED',
  BRANCH_SERVICE_ZONE_REMOVED = 'BRANCH_SERVICE_ZONE_REMOVED',
  CATALOGUE_MENU_CREATED = 'CATALOGUE_MENU_CREATED',
  CATALOGUE_MENU_UPDATED = 'CATALOGUE_MENU_UPDATED',
  CATALOGUE_MENU_DELETED = 'CATALOGUE_MENU_DELETED',
  CATALOGUE_MENU_BRANCHES_ASSIGNED = 'CATALOGUE_MENU_BRANCHES_ASSIGNED',
  CATALOGUE_CATEGORY_CREATED = 'CATALOGUE_CATEGORY_CREATED',
  CATALOGUE_CATEGORY_UPDATED = 'CATALOGUE_CATEGORY_UPDATED',
  CATALOGUE_CATEGORY_DELETED = 'CATALOGUE_CATEGORY_DELETED',
  CATALOGUE_CATEGORIES_REORDERED = 'CATALOGUE_CATEGORIES_REORDERED',
  CATALOGUE_ITEM_CREATED = 'CATALOGUE_ITEM_CREATED',
  CATALOGUE_ITEM_UPDATED = 'CATALOGUE_ITEM_UPDATED',
  CATALOGUE_ITEM_DELETED = 'CATALOGUE_ITEM_DELETED',
  CATALOGUE_ITEMS_REORDERED = 'CATALOGUE_ITEMS_REORDERED',
  CATALOGUE_ITEM_AVAILABILITY_CHANGED = 'CATALOGUE_ITEM_AVAILABILITY_CHANGED',
  CATALOGUE_MODIFIER_GROUP_CREATED = 'CATALOGUE_MODIFIER_GROUP_CREATED',
  CATALOGUE_MODIFIER_GROUP_UPDATED = 'CATALOGUE_MODIFIER_GROUP_UPDATED',
  CATALOGUE_MODIFIER_GROUP_DELETED = 'CATALOGUE_MODIFIER_GROUP_DELETED',
  CATALOGUE_MODIFIER_OPTION_CREATED = 'CATALOGUE_MODIFIER_OPTION_CREATED',
  CATALOGUE_MODIFIER_OPTION_UPDATED = 'CATALOGUE_MODIFIER_OPTION_UPDATED',
  CATALOGUE_MODIFIER_OPTION_DELETED = 'CATALOGUE_MODIFIER_OPTION_DELETED',
  CATALOGUE_BRANCH_OVERRIDE_UPDATED = 'CATALOGUE_BRANCH_OVERRIDE_UPDATED',
  CUSTOMER_PROFILE_UPDATED = 'CUSTOMER_PROFILE_UPDATED',
  CUSTOMER_ADDRESS_CREATED = 'CUSTOMER_ADDRESS_CREATED',
  CUSTOMER_ADDRESS_UPDATED = 'CUSTOMER_ADDRESS_UPDATED',
  CUSTOMER_ADDRESS_DELETED = 'CUSTOMER_ADDRESS_DELETED',
  CUSTOMER_DEFAULT_ADDRESS_SET = 'CUSTOMER_DEFAULT_ADDRESS_SET',
  RIDER_PROFILE_CREATED = 'RIDER_PROFILE_CREATED',
  RIDER_PROFILE_UPDATED = 'RIDER_PROFILE_UPDATED',
  RIDER_ONBOARDING_SUBMITTED = 'RIDER_ONBOARDING_SUBMITTED',
  RIDER_APPROVED = 'RIDER_APPROVED',
  RIDER_REJECTED = 'RIDER_REJECTED',
  RIDER_SUSPENDED = 'RIDER_SUSPENDED',
  RIDER_REACTIVATED = 'RIDER_REACTIVATED',
  RIDER_VEHICLE_ADDED = 'RIDER_VEHICLE_ADDED',
  RIDER_VEHICLE_UPDATED = 'RIDER_VEHICLE_UPDATED',
  RIDER_ZONE_ASSIGNED = 'RIDER_ZONE_ASSIGNED',
  RIDER_ZONE_REMOVED = 'RIDER_ZONE_REMOVED',
  RIDER_AVAILABILITY_CHANGED = 'RIDER_AVAILABILITY_CHANGED',
}

export interface AuditLogEntry {
  id: string | number;
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  request_id?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ==========================================
// 4. API Envelopes & Standards (DEE-API-001)
// ==========================================

export interface PaginationMeta {
  next_cursor?: string | null;
  has_more: boolean;
  total_count?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
  requestId?: string;
  success?: boolean;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

// ==========================================
// 5. System Health Contract
// ==========================================

export interface DependencyHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  environment: string;
  dependencies: {
    postgres: DependencyHealth;
    postgis: DependencyHealth;
    redis: DependencyHealth;
  };
}

// ==========================================
// 6. Sprint 3 Merchant Domain Interfaces
// ==========================================

export interface Merchant {
  id: string;
  legal_name: string;
  display_name: string;
  slug?: string;
  description?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  status: MerchantStatus;
  approval_status: MerchantApprovalStatus;
  rejection_reason?: string;
  commission_bps: number;
  settlement_schedule: string;
  created_at: string;
  updated_at: string;
}

export interface BranchStructuredAddress {
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  region: string;
  country_code: string;
  postal_code?: string;
  address_text?: string;
}

export interface MerchantBranch {
  id: string;
  merchant_id: string;
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  region: string;
  country_code: string;
  postal_code?: string;
  address_text: string;
  latitude: number;
  longitude: number;
  status: BranchAdminStatus;
  operational_status: BranchOperationalStatus;
  timezone: string;
  currency: string;
  min_order_minor: number;
  prep_default_min: number;
  created_at: string;
  updated_at: string;
  service_zones?: string[];
}

export interface BranchOpeningHour {
  id: string;
  branch_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  open_time: string; // HH:mm
  close_time: string; // HH:mm
  is_closed: boolean;
  created_at?: string;
}

export interface ServiceZoneConfig {
  base_delivery_fee_minor: number;
  service_fee_minor: number;
  max_radius_km: number;
  [key: string]: unknown;
}

export interface ServiceZone {
  id: string;
  name: string;
  city_id: string;
  status: ServiceZoneStatus;
  boundary?: unknown; // PostGIS MultiPolygon or GeoJSON Feature
  config: ServiceZoneConfig;
  created_at?: string;
}

export interface BranchServiceZone {
  branch_id: string;
  service_zone_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface MerchantMembership {
  id: string;
  merchant_id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  user_phone?: string;
  role_code: MembershipRole;
  status: MembershipStatus;
  branch_ids: string[];
  created_at?: string;
}

export interface MerchantInvitation {
  id: string;
  merchant_id: string;
  email: string;
  phone_e164?: string;
  role_code: MembershipRole;
  branch_ids: string[];
  invitation_token: string;
  status: InvitationStatus;
  expires_at: string;
  invited_by_user_id?: string;
  created_at: string;
}

export interface BranchAvailability {
  is_available: boolean;
  reasons: string[];
  merchant_approved: boolean;
  merchant_active: boolean;
  branch_active: boolean;
  has_active_zone: boolean;
  operational_status_open: boolean;
  within_hours: boolean;
  current_local_time: string;
  timezone: string;
}

// ==========================================
// 7. Sprint 4 Menu & Catalogue Domain Interfaces
// ==========================================

export interface Menu {
  id: string;
  merchant_id: string;
  name: string;
  description?: string;
  currency: string;
  is_active: boolean;
  assigned_branch_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface MenuBranchAssignment {
  menu_id: string;
  branch_id: string;
  is_active: boolean;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  menu_id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  menu_id: string;
  category_id: string;
  sku?: string;
  name: string;
  description?: string;
  price_minor: number; // Integer minor units (e.g. 125000 = KES 1,250.00)
  currency: string;
  image_url?: string;
  is_available: boolean; // Base catalogue availability
  sort_order: number;
  modifier_group_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface ModifierGroup {
  id: string;
  merchant_id: string;
  name: string;
  min_selections: number; // 0 for optional, >= 1 for required
  max_selections: number; // >= min_selections
  is_required: boolean;
  options?: ModifierOption[];
  created_at: string;
  updated_at: string;
}

export interface ModifierOption {
  id: string;
  modifier_group_id: string;
  name: string;
  price_delta_minor: number; // Additional cost in integer minor units (e.g. 5000 = KES 50.00)
  is_available: boolean; // Base availability
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemModifierGroup {
  item_id: string;
  modifier_group_id: string;
  sort_order: number;
}

export interface MenuItemBranchOverride {
  branch_id: string;
  item_id: string;
  is_available: boolean;
  price_override_minor?: number | null;
  updated_at: string;
}

export interface ModifierOptionBranchOverride {
  branch_id: string;
  modifier_option_id: string;
  is_available: boolean;
  price_delta_override_minor?: number | null;
  updated_at: string;
}

export interface EnrichedModifierOption extends ModifierOption {
  effective_available: boolean;
  effective_price_delta_minor: number;
  is_branch_override: boolean;
}

export interface EnrichedModifierGroup extends Omit<ModifierGroup, 'options'> {
  options: EnrichedModifierOption[];
}

export interface EnrichedMenuItem extends MenuItem {
  category_name?: string;
  effective_available: boolean;
  effective_price_minor: number;
  is_branch_override: boolean;
  modifier_groups: EnrichedModifierGroup[];
}

export interface EnrichedCategoryWithItems extends MenuCategory {
  items: EnrichedMenuItem[];
}

export interface PublicModifierOption {
  id: string;
  name: string;
  price_delta_minor: number;
  is_available: boolean;
}

export interface PublicModifierGroup {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  options: PublicModifierOption[];
}

export interface PublicMenuItem {
  id: string;
  name: string;
  description?: string;
  price_minor: number;
  currency: string;
  image_url?: string;
  is_available: boolean;
  modifier_groups: PublicModifierGroup[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  items: PublicMenuItem[];
}

export interface PublicRestaurantMenu {
  menu: Menu;
  branch: {
    id: string;
    name: string;
    address_text: string;
    operational_status: string;
    currency: string;
  };
  merchant: {
    id: string;
    display_name: string;
    logo_url?: string;
    description?: string;
  };
  categories: PublicMenuCategory[];
}

// ==========================================
// 8. Sprint 5 Customer Profiles, Addresses, Discovery & Serviceability
// ==========================================

export interface CustomerProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
  email: string;
  default_address_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: 'Home' | 'Work' | 'Other' | string;
  recipient_name?: string;
  phone_e164?: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  region: string;
  country_code: string;
  postal_code?: string;
  address_text: string;
  latitude: number;
  longitude: number;
  delivery_instructions?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  city?: string;
  place_id?: string;
}

export interface AutocompletePrediction {
  description: string;
  place_id: string;
  main_text: string;
  secondary_text?: string;
  latitude?: number;
  longitude?: number;
}

export type ServiceabilityReasonCode =
  | 'SERVICEABLE'
  | 'OUTSIDE_SERVICE_AREA'
  | 'NO_ACTIVE_BRANCHES'
  | 'ZONE_DISABLED'
  | 'BRANCH_UNAVAILABLE'
  | 'LOCATION_REQUIRED';

export interface ServiceabilityCheckResult {
  serviceable: boolean;
  zone_id?: string | null;
  zone_name?: string | null;
  reason_code: ServiceabilityReasonCode;
  eligible_branch_count: number;
  customer_location?: {
    latitude: number;
    longitude: number;
  };
}

export interface RestaurantCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  image_url?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RestaurantCategoryAssignment {
  category_id: string;
  branch_id: string;
  merchant_id?: string;
  created_at?: string;
}

export type BranchOpenStatus = 'OPEN' | 'CLOSED' | 'BUSY' | 'UNAVAILABLE';

export interface PublicRestaurantBranch {
  branch_id: string;
  merchant_id: string;
  merchant_name: string;
  branch_name: string;
  slug?: string;
  logo_url?: string;
  cover_url?: string;
  categories: string[];
  category_ids: string[];
  address_text: string;
  city: string;
  latitude: number;
  longitude: number;
  distance_meters?: number;
  distance_km?: number;
  min_order_minor: number;
  currency: string;
  prep_default_min: number;
  open_status: BranchOpenStatus;
  is_open_now: boolean;
  is_busy: boolean;
  status_badge_text: string;
  opening_hours: BranchOpeningHour[];
  serviceable: boolean;
}

export interface PublicRestaurantDetail {
  branch: PublicRestaurantBranch;
  merchant: {
    id: string;
    display_name: string;
    description?: string;
    logo_url?: string;
  };
  opening_hours: BranchOpeningHour[];
  serviceability?: {
    serviceable: boolean;
    zone_id?: string | null;
    zone_name?: string | null;
    reason_code: string;
  };
}

export interface RestaurantDiscoveryQuery {
  latitude?: number;
  longitude?: number;
  search?: string;
  category?: string;
  open_now?: boolean;
  sort?: 'recommended' | 'distance' | 'open_now';
  page?: number;
  limit?: number;
}

// ==========================================
// 8. Sprint 6: Cart, Pricing, Promotions & Checkout
// ==========================================

export enum CartStatus {
  ACTIVE = 'ACTIVE',
  CHECKED_OUT = 'CHECKED_OUT',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED',
}

export interface Cart {
  id: string;
  customer_id: string;
  branch_id: string;
  currency: string;
  status: CartStatus;
  applied_promo_code?: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  menu_item_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  modifier_option_ids: string[];
}

export interface EnrichedCartModifierSelection {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_delta_minor: number;
  is_available: boolean;
}

export interface EnrichedCartItem {
  id: string;
  cart_id: string;
  menu_item_id: string;
  item_name: string;
  item_image_url?: string;
  quantity: number;
  unit_base_price_minor: number;
  unit_modifiers_price_minor: number;
  unit_total_price_minor: number;
  line_total_minor: number;
  is_available: boolean;
  price_changed: boolean;
  modifiers: EnrichedCartModifierSelection[];
}

export type CartWarningCode =
  | 'ITEM_PRICE_CHANGED'
  | 'ITEM_UNAVAILABLE'
  | 'MODIFIER_UNAVAILABLE'
  | 'RESTAURANT_CLOSED'
  | 'MINIMUM_ORDER_NOT_MET'
  | 'OUTSIDE_DELIVERY_RANGE'
  | 'BRANCH_NOT_SERVICEABLE'
  | 'PROMOTION_NO_LONGER_VALID';

export interface CartWarning {
  code: CartWarningCode;
  message: string;
  item_id?: string;
  item_name?: string;
  details?: Record<string, unknown>;
}

export interface CartPricingBreakdown {
  items_subtotal_minor: number;
  modifiers_subtotal_minor: number;
  subtotal_minor: number;
  minimum_order_minor: number;
  minimum_order_met: boolean;
  minimum_order_remaining_minor: number;
  estimated_delivery_fee_minor: number;
  estimated_service_fee_minor: number;
  discount_minor: number;
  estimated_total_minor: number;
}

export interface EnrichedCart {
  id: string;
  customer_id: string;
  branch_id: string;
  branch: {
    id: string;
    merchant_id: string;
    name: string;
    merchant_name: string;
    min_order_minor: number;
    currency: string;
    open_status: BranchOpenStatus;
    is_open_now: boolean;
    address_text: string;
    latitude: number;
    longitude: number;
  };
  items: EnrichedCartItem[];
  total_quantity: number;
  currency: string;
  pricing: CartPricingBreakdown;
  applied_promo?: {
    code: string;
    type: PromotionType;
    discount_minor: number;
    description: string;
  };
  warnings: CartWarning[];
  created_at: string;
  updated_at: string;
}

export enum PromotionType {
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  PERCENTAGE = 'PERCENTAGE',
  FREE_DELIVERY = 'FREE_DELIVERY',
}

export enum PromotionFundingSource {
  DEETOO = 'DEETOO',
  MERCHANT = 'MERCHANT',
  SHARED = 'SHARED',
}

export enum PromotionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
}

export interface Promotion {
  id: string;
  code: string;
  type: PromotionType;
  value_minor_or_bps: number;
  status: PromotionStatus;
  start_at: string;
  end_at: string;
  minimum_basket_minor: number;
  usage_limit: number;
  times_used: number;
  per_customer_limit: number;
  merchant_id?: string | null;
  branch_id?: string | null;
  zone_id?: string | null;
  funding_source: PromotionFundingSource;
  merchant_funding_bps: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryPricingRule {
  id: string;
  zone_id?: string | null;
  base_fee_minor: number;
  included_distance_meters: number;
  per_km_fee_minor: number;
  minimum_fee_minor: number;
  maximum_fee_minor: number;
  max_delivery_distance_meters: number;
  status: 'ACTIVE' | 'INACTIVE';
  effective_from: string;
  effective_until?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceFeeRule {
  id: string;
  fee_type: 'PERCENTAGE' | 'FIXED' | 'HYBRID';
  percentage_basis_points: number;
  fixed_fee_minor: number;
  minimum_fee_minor: number;
  maximum_fee_minor: number;
  status: 'ACTIVE' | 'INACTIVE';
  effective_from: string;
  effective_until?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CheckoutQuote {
  binding_hash?: string;
  cart_items_snapshot?: EnrichedCartItem[];
  pricing_rule_snapshot?: Record<string, any>;
  id: string;
  quote_id: string;
  customer_id: string;
  cart_id: string;
  branch_id: string;
  branch_name: string;
  delivery_address_id: string;
  delivery_address_snapshot: AddressSnapshot;
  currency: string;
  items_subtotal_minor: number;
  modifiers_subtotal_minor: number;
  gross_subtotal_minor: number;
  discount_minor: number;
  discount_funding_source?: PromotionFundingSource;
  net_subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  tax_minor: number;
  total_minor: number;
  distance_meters: number;
  estimated_duration_min: number;
  delivery_pricing_rule_id: string;
  service_fee_rule_id: string;
  promotion_id?: string;
  promotion_code?: string;
  expires_at: string;
  created_at: string;
}

export interface AddToCartInput {
  branch_id: string;
  menu_item_id: string;
  quantity: number;
  modifier_option_ids?: string[];
  force_clear_existing?: boolean;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface GenerateQuoteInput {
  payment_method?: 'MPESA' | 'CARD';
  address_id: string;
  notes?: string;
}

// ==========================================
// 9. Sprint 7: Core Order Engine & Merchant Workflow
// ==========================================

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  source_modifier_option_id?: string | null;
  group_name: string;
  option_name: string;
  unit_price_delta_minor: number;
  quantity: number;
  created_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  source_menu_item_id?: string | null;
  catalogue_item_id?: string | null;
  item_name: string;
  quantity: number;
  unit_base_minor?: number;
  line_total_minor?: number;
  base_price_amount?: number;
  total_price_amount?: number;
  item_snapshot?: {
    description?: string;
    image_url?: string;
    category_id?: string;
    category_name?: string;
    unit_modifiers_minor?: number;
    unit_total_minor?: number;
    [key: string]: unknown;
  };
  modifiers: OrderItemModifier[];
}

export interface PricingSnapshot {
  financial_snapshot?: Record<string, any>;
  items_subtotal_minor: number;
  modifiers_subtotal_minor: number;
  gross_subtotal_minor: number;
  discount_minor: number;
  discount_funding_source?: PromotionFundingSource;
  net_subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  distance_meters?: number;
  estimated_duration_min?: number;
}

export interface PromotionSnapshot {
  promotion_id: string;
  promotion_code: string;
  promotion_type: PromotionType;
  discount_minor: number;
  funding_source: PromotionFundingSource;
  merchant_funded_amount_minor: number;
  platform_funded_amount_minor: number;
}

export interface OrderTimelineEntry {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_type: 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'SYSTEM';
  actor_id?: string | null;
  actor_name?: string | null;
  reason_code?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Order {
  id: string;
  public_code: string;
  order_number: string;
  checkout_quote_id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  branch_id: string;
  branch_name?: string;
  merchant_id: string;
  merchant_name?: string;
  status: OrderStatus;
  currency: string;
  subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  discount_minor: number;
  total_minor: number;
  pricing?: {
    subtotal_minor?: number;
    delivery_fee_minor?: number;
    service_fee_minor?: number;
    discount_minor?: number;
    total_minor?: number;
    [key: string]: any;
  };
  rider_id?: string | null;
  subtotal_amount?: number;
  tax_amount?: number;
  delivery_fee_amount?: number;
  tip_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  payment_status?: string;
  payment_method?: string;
  items: OrderItem[];
  delivery_address_snapshot: AddressSnapshot;
  pricing_snapshot: PricingSnapshot;
  promotion_snapshot?: PromotionSnapshot | null;
  special_instructions?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  placed_at?: string | null;
  accepted_at?: string | null;
  preparing_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  cancelled_by_type?: string | null;
  cancelled_by_id?: string | null;
  timeline: OrderTimelineEntry[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderInput {
  quote_id?: string;
  quoteId?: string;
  special_instructions?: string;
}

export interface AcceptOrderInput {
  preparation_minutes?: number;
  estimatedPreparationMinutes?: number;
}

export interface RejectOrderInput {
  reason_code?: string;
  reasonCode?: string;
  note?: string;
}

export interface CancelOrderInput {
  reason_code?: string;
  reasonCode?: string;
  note?: string;
}

export interface OrderFilterParams {
  status?: OrderStatus | string;
  branch_id?: string;
  branchId?: string;
  customer_id?: string;
  customerId?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface RealtimeOrderEvent {
  type: 'order.placed' | 'order.accepted' | 'order.rejected' | 'order.preparing' | 'order.ready' | 'order.cancelled' | 'order.completed' | 'connected' | 'heartbeat' | string;
  channel: string;
  order_id?: string;
  orderId?: string;
  order_number?: string;
  status?: OrderStatus | string;
  branch_id?: string;
  customer_id?: string;
  timestamp: string;
  data?: Partial<Order> | Record<string, any>;
  [key: string]: any;
}

export interface PromotionRedemption {
  id: string;
  promotion_id: string;
  customer_id: string;
  order_id: string;
  discount_minor: number;
  created_at: string;
}

// ==========================================
// 10. Sprint 9: Dispatch, Rider Matching & Delivery Engine
// ==========================================

export enum DeliveryOfferStatus {
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export type RiderOfferRejectionReasonCode =
  | 'TOO_FAR'
  | 'ENDING_SHIFT'
  | 'VEHICLE_ISSUE'
  | 'AREA_UNFAMILIAR'
  | 'INSUFFICIENT_PAY'
  | 'PERSONAL_EMERGENCY'
  | 'OTHER';

export interface DeliveryTimelineEntry {
  id: string;
  delivery_id: string;
  from_status: DeliveryStatus | null;
  to_status: DeliveryStatus;
  actor_type: 'SYSTEM' | 'RIDER' | 'ADMIN' | 'MERCHANT';
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  reason_code?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  order_number?: string;
  status: DeliveryStatus;
  assigned_rider_id?: string | null;
  assigned_rider_name?: string | null;
  assigned_rider_phone?: string | null;
  rider_id?: string | null;
  pickup?: { branch_id?: string; [key: string]: any };
  last_location?: GeoPoint | any;
  estimated_payout_minor?: number;
  metadata?: Record<string, any>;
  branch_id: string;
  branch_name?: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  pickup_location: GeoPoint;
  dropoff_location: GeoPoint;
  pickup_address_text: string;
  dropoff_address_text: string;
  delivery_instructions?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  dispatch_not_before?: string | null;
  dispatch_started_at?: string | null;
  assigned_at?: string | null;
  arrived_pickup_at?: string | null;
  picked_up_at?: string | null;
  en_route_at?: string | null;
  arrived_dropoff_at?: string | null;
  delivered_at?: string | null;
  pickup_verification_code?: string | null;
  delivery_otp?: string | null;
  delivery_otp_attempts?: number;
  delivery_otp_locked?: boolean;
  failed_at?: string | null;
  failure_reason?: string | null;
  failure_note?: string | null;
  proof_type?: string | null;
  proof_ref?: string | null;
  proofs?: DeliveryProof[];
  stuck_flag?: string | null;
  stuck_detected_at?: string | null;
  reassignment_count: number;
  dispatch_attention_required: boolean;
  attention_reason?: string | null;
  current_search_radius_meters: number;
  dispatch_cycle_count: number;
  version: number;
  timeline?: DeliveryTimelineEntry[];
  active_offer?: DeliveryOffer | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryOffer {
  id: string;
  delivery_id: string;
  order_id: string;
  order_number?: string;
  rider_id: string;
  rider_name?: string;
  status: DeliveryOfferStatus;
  rank: number;
  score: number;
  distance_to_pickup_meters: number;
  estimated_pickup_eta_seconds: number;
  offered_at: string;
  expires_at: string;
  responded_at?: string | null;
  rejection_reason?: RiderOfferRejectionReasonCode | string | null;
  rejection_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DispatchCandidate {
  riderId: string;
  userId: string;
  riderName: string;
  phone: string;
  vehicleType: string;
  latitude: number;
  longitude: number;
  distanceToPickupMeters: number;
  estimatedPickupEtaSeconds: number;
  rank: number;
  score: number;
  scoreBreakdown?: {
    distanceScore: number;
    etaScore: number;
    activityScore: number;
    rejectionPenalty: number;
  };
}

export interface DispatchAttempt {
  id: string;
  delivery_id: string;
  attempt_number: number;
  search_radius_meters: number;
  candidate_count: number;
  candidates_snapshot: DispatchCandidate[];
  started_at: string;
  ended_at?: string | null;
  result?: 'OFFERED' | 'NO_CANDIDATES' | 'EXHAUSTED' | 'ASSIGNED';
  metadata?: Record<string, unknown>;
}

export interface DispatchConfig {
  initialSearchRadius: number; // meters, default 2000
  radiusExpansionSteps: number[]; // e.g. [2000, 4000, 6000]
  maxSearchRadius: number; // meters, default 8000
  offerTimeoutSeconds: number; // default 30
  maxOffersPerCycle: number; // default 5
  retryIntervalsSeconds: number[]; // default [30, 60, 120]
  pickupArrivalBufferSeconds: number; // default 120
  expectedRiderPickupTravelTimeSeconds: number; // default 480
  maxActiveDeliveriesPerRider: number; // default 1
  routingCandidateLimit: number; // default 10
  dispatchSlaSeconds: number; // default 480
}

export interface DispatchTimingResult {
  estimatedReadyAt: string;
  estimatedRiderTravelSeconds: number;
  pickupArrivalBufferSeconds: number;
  dispatchNotBefore: string;
  shouldDispatchNow: boolean;
  reason: string;
}

export interface RiderOfferCardSummary {
  offerId: string;
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  pickupAddress: string;
  pickupLocation: GeoPoint;
  dropoffAddress: string;
  dropoffLocation: GeoPoint;
  distanceToPickupMeters: number;
  estimatedPickupEtaMinutes: number;
  estimatedDropoffDistanceMeters: number;
  estimatedEarningsMinor: number;
  itemCount: number;
  expiresAt: string;
  secondsRemaining: number;
}

export interface AdminManualAssignInput {
  rider_id: string;
  note?: string;
}

export interface AdminUnassignInput {
  reason_code: string;
  note?: string;
  retrigger_dispatch?: boolean;
}

export interface RiderReleaseInput {
  reason_code: string;
  note?: string;
}

export interface DeliveryFilterParams {
  status?: DeliveryStatus | DeliveryStatus[] | string | string[];
  assigned_rider_id?: string;
  branch_id?: string;
  attention_required?: boolean;
  search?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface DispatchMetrics {
  totalDeliveries: number;
  unassignedCount: number;
  offeredCount: number;
  assignedCount: number;
  attentionRequiredCount: number;
  averageTimeToAssignSeconds: number;
  offerAcceptanceRatePercent: number;
  totalOffersSent: number;
  totalOffersAccepted: number;
  totalOffersRejected: number;
  totalOffersExpired: number;
  averageSearchRadiusMeters: number;
}

// ==========================================
// 11. Sprint 10: Delivery Execution Lifecycle, Proof of Delivery, Incidents & Tracking
// ==========================================

export type DeliveryProofType = 'OTP' | 'PHOTO' | 'SIGNATURE' | 'CONTACTLESS_CONFIRMATION';

export interface DeliveryProof {
  id: string;
  delivery_id: string;
  type: DeliveryProofType;
  proof_value?: string;
  storage_url?: string;
  metadata?: Record<string, unknown>;
  created_by_rider_id?: string;
  created_at: string;
}

export type DeliveryFailureReasonCode =
  | 'CUSTOMER_UNREACHABLE'
  | 'CUSTOMER_REFUSED'
  | 'INCORRECT_ADDRESS'
  | 'ACCESS_DENIED'
  | 'ACCIDENT_OR_EMERGENCY'
  | 'MERCHANT_CLOSED'
  | 'DAMAGED_IN_TRANSIT'
  | 'OTHER';

export interface DeliveryIncident {
  id: string;
  delivery_id: string;
  order_id: string;
  rider_id?: string | null;
  reason_code: DeliveryFailureReasonCode | string;
  note?: string | null;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  reported_by_type: 'RIDER' | 'CUSTOMER' | 'MERCHANT' | 'SYSTEM' | 'ADMIN';
  reported_by_id?: string | null;
  resolved_by_id?: string | null;
  resolution_action?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface CustomerTrackingRiderSafe {
  id: string;
  firstName: string;
  vehicleType: VehicleType | string;
  vehicleRegistrationMasked?: string;
  phoneProxy?: string;
}

export interface CustomerTrackingResponse {
  orderId: string;
  orderNumber: string;
  publicCode: string;
  deliveryStatus: DeliveryStatus;
  statusMessage: string;
  restaurant: {
    name: string;
    address: string;
    location: GeoPoint;
    branchId: string;
  };
  dropoff: {
    address: string;
    location: GeoPoint;
    instructions?: string | null;
  };
  rider?: CustomerTrackingRiderSafe | null;
  riderLiveLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    recordedAt: string;
    isStale?: boolean;
  } | null;
  estimatedEtaMinutes?: number | null;
  estimatedArrivalAt?: string | null;
  deliveryOtp?: string | null;
  timeline: DeliveryTimelineEntry[];
}

export interface RiderDeliveryDetail {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  publicCode: string;
  status: DeliveryStatus;
  pickup: {
    name: string;
    address: string;
    location: GeoPoint;
    instructions?: string | null;
    phoneProxy?: string;
    itemsSummary: {
      itemCount: number;
      items: Array<{ name: string; quantity: number }>;
    };
    isReady: boolean;
  };
  dropoff: {
    recipientName: string;
    address: string;
    location: GeoPoint;
    instructions?: string | null;
    phoneProxy?: string;
  };
  pickupVerificationCode: string;
  navigation: {
    pickupMapsUrl: string;
    dropoffMapsUrl: string;
  };
  proofRequirements: {
    otpRequired: boolean;
    photoAllowed: boolean;
  };
  timestamps: {
    assignedAt?: string | null;
    arrivedPickupAt?: string | null;
    pickedUpAt?: string | null;
    enRouteAt?: string | null;
    arrivedDropoffAt?: string | null;
    deliveredAt?: string | null;
    failedAt?: string | null;
  };
}

export type StuckReason =
  | 'EXCEEDED_PICKUP_SLA'
  | 'EXCEEDED_KITCHEN_WAIT_SLA'
  | 'EXCEEDED_EN_ROUTE_SLA'
  | 'EXCEEDED_DROPOFF_WAIT_SLA'
  | 'RIDER_UNRESPONSIVE';

export interface StuckDeliveryAlert {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryStatus;
  phase?: DeliveryStatus;
  riderId?: string | null;
  riderName?: string | null;
  branchName?: string;
  stuckReason: StuckReason;
  elapsedMinutes: number;
  stuckDurationMinutes?: number;
  thresholdMinutes: number;
  detectedAt: string;
}

// ============================================================================
// SPRINT 12: FINANCIAL LEDGER, SETTLEMENTS, RIDER EARNINGS & PROFITABILITY
// ============================================================================

export enum LedgerAccountType {
  CUSTOMER_REFUND_PAYABLE = 'CUSTOMER_REFUND_PAYABLE', // Liability: duplicate captured funds awaiting return
  CUSTOMER_FUNDS_CLEARING = 'CUSTOMER_FUNDS_CLEARING',       // Asset: customer funds held before order completion/refund
  MERCHANT_PAYABLE = 'MERCHANT_PAYABLE',                     // Liability: net funds owed to merchant
  RIDER_PAYABLE = 'RIDER_PAYABLE',                           // Liability: earnings owed to rider
  PLATFORM_COMMISSION_REVENUE = 'PLATFORM_COMMISSION_REVENUE', // Revenue: Deetoo commission from food sales
  PLATFORM_DELIVERY_REVENUE = 'PLATFORM_DELIVERY_REVENUE',     // Revenue: delivery fees collected from customer
  PLATFORM_SERVICE_FEE_REVENUE = 'PLATFORM_SERVICE_FEE_REVENUE', // Revenue: platform service fees
  PROMOTION_EXPENSE_PLATFORM = 'PROMOTION_EXPENSE_PLATFORM',   // Expense: platform-funded customer discounts
  PROMOTION_EXPENSE_MERCHANT = 'PROMOTION_EXPENSE_MERCHANT',   // Deduction/Contra: merchant-funded discounts
  PAYMENT_PROCESSOR_FEE_EXPENSE = 'PAYMENT_PROCESSOR_FEE_EXPENSE', // Expense: provider fees (M-Pesa / Card)
  RIDER_DELIVERY_EXPENSE = 'RIDER_DELIVERY_EXPENSE',           // Expense: courier fulfillment compensation
  REFUND_EXPENSE_PLATFORM = 'REFUND_EXPENSE_PLATFORM',         // Expense: platform-funded refunds / goodwill
  SETTLEMENT_CLEARING = 'SETTLEMENT_CLEARING',               // Asset/Clearing: outbound merchant bank/M-Pesa clearing
  RIDER_PAYOUT_CLEARING = 'RIDER_PAYOUT_CLEARING',           // Asset/Clearing: outbound rider M-Pesa B2C clearing
  GENERAL_ADJUSTMENT_CLEARING = 'GENERAL_ADJUSTMENT_CLEARING'  // Clearing: finance manual corrections
}

export enum LedgerAccountOwnerType {
  PLATFORM = 'PLATFORM',
  MERCHANT = 'MERCHANT',
  RIDER = 'RIDER',
  CUSTOMER = 'CUSTOMER',
  SYSTEM = 'SYSTEM'
}

export enum LedgerEntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

export enum LedgerTransactionType {
  PAYMENT_CAPTURED = 'PAYMENT_CAPTURED',
  ORDER_ECONOMICS = 'ORDER_ECONOMICS',
  REFUND_REVERSAL = 'REFUND_REVERSAL',
  RIDER_EARNING = 'RIDER_EARNING',
  MERCHANT_SETTLEMENT = 'MERCHANT_SETTLEMENT',
  RIDER_PAYOUT = 'RIDER_PAYOUT',
  FINANCIAL_ADJUSTMENT = 'FINANCIAL_ADJUSTMENT'
}

export enum LedgerTransactionStatus {
  POSTED = 'POSTED',
  REVERSED = 'REVERSED'
}

export interface LedgerAccount {
  id: string;
  account_number: string;
  account_type: LedgerAccountType;
  owner_type: LedgerAccountOwnerType;
  owner_id?: string | null;
  currency: string;
  balance_minor: number;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  account_type?: LedgerAccountType;
  direction: LedgerEntryDirection;
  amount_minor: number;
  currency: string;
  description?: string;
  created_at: string;
}

export interface LedgerTransaction {
  id: string;
  transaction_type: LedgerTransactionType;
  reference_type: string;
  reference_id: string;
  idempotency_key: string;
  currency: string;
  description: string;
  status: LedgerTransactionStatus;
  total_amount_minor: number;
  effective_at: string;
  created_at: string;
  entries?: LedgerEntry[];
}

export interface MerchantCommissionRule {
  id: string;
  merchant_id?: string | null; // null for platform default rule
  percentage_rate: number;      // e.g. 0.20 for 20%
  fixed_fee_minor: number;
  effective_from: string;
  effective_until?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export enum RiderEarningStatus {
  PENDING = 'PENDING',
  ELIGIBLE = 'ELIGIBLE',
  RESERVED = 'RESERVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED'
}

export interface RiderEarning {
  id: string;
  rider_id: string;
  delivery_id: string;
  order_id: string;
  base_amount_minor: number;
  distance_amount_minor: number;
  waiting_amount_minor: number;
  bonus_amount_minor: number;
  adjustment_amount_minor: number;
  total_amount_minor: number;
  currency: string;
  status: RiderEarningStatus;
  rules_snapshot: Record<string, unknown>;
  created_at: string;
  settled_at?: string | null;
}

export enum MerchantSettlementStatus {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface MerchantSettlementLine {
  id: string;
  settlement_id: string;
  entry_type: 'ORDER' | 'REFUND' | 'ADJUSTMENT';
  reference_id: string;
  gross_amount_minor: number;
  commission_amount_minor: number;
  net_amount_minor: number;
  description?: string;
  created_at: string;
}

export interface MerchantSettlement {
  id: string;
  settlement_number: string;
  merchant_id: string;
  currency: string;
  period_start: string;
  period_end: string;
  gross_order_value_minor: number;
  commission_amount_minor: number;
  promotion_amount_minor: number;
  refund_amount_minor: number;
  adjustment_amount_minor: number;
  net_settlement_amount_minor: number;
  status: MerchantSettlementStatus;
  calculated_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
  failure_reason?: string | null;
  created_at: string;
  lines?: MerchantSettlementLine[];
}

export enum RiderPayoutStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface RiderPayoutLine {
  id: string;
  payout_id: string;
  earning_id: string;
  amount_minor: number;
  created_at: string;
}

export interface RiderPayout {
  id: string;
  payout_number: string;
  rider_id: string;
  currency: string;
  amount_minor: number;
  period_start: string;
  period_end: string;
  status: RiderPayoutStatus;
  provider: string;
  provider_reference?: string | null;
  calculated_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  lines?: RiderPayoutLine[];
}

export enum FinancialAdjustmentReason {
  MERCHANT_CORRECTION = 'MERCHANT_CORRECTION',
  RIDER_CORRECTION = 'RIDER_CORRECTION',
  CUSTOMER_REFUND_ADJUSTMENT = 'CUSTOMER_REFUND_ADJUSTMENT',
  PAYMENT_PROCESSOR_ADJUSTMENT = 'PAYMENT_PROCESSOR_ADJUSTMENT',
  MANUAL_FINANCE_CORRECTION = 'MANUAL_FINANCE_CORRECTION'
}

export interface FinancialAdjustment {
  id: string;
  reason_code: FinancialAdjustmentReason;
  target_account_id: string;
  offset_account_id: string;
  direction: LedgerEntryDirection;
  amount_minor: number;
  currency: string;
  note: string;
  requested_by: string;
  approved_by?: string | null;
  ledger_transaction_id?: string | null;
  created_at: string;
}

export interface OrderFinancialSummary {
  order_id: string;
  order_number: string;
  merchant_id: string;
  currency: string;
  gmv_minor: number;
  gmvMinor?: number;
  food_subtotal_minor: number;
  commission_rate: number;
  commission_revenue_minor: number;
  delivery_revenue_minor: number;
  service_fee_revenue_minor: number;
  gross_platform_revenue_minor: number;
  rider_cost_minor: number;
  payment_processing_cost_minor: number;
  platform_funded_discount_minor: number;
  merchant_funded_discount_minor: number;
  refund_cost_minor: number;
  contribution_profit_minor: number;
  contribution_margin_pct: number;
  merchant_payable_minor: number;
  is_negative_margin: boolean;
  calculated_at: string;
  [key: string]: any;
}

export interface ProfitabilityMetrics {
  gmv_minor: number;
  gross_platform_revenue_minor: number;
  commission_revenue_minor: number;
  delivery_revenue_minor: number;
  service_fee_revenue_minor: number;
  rider_costs_minor: number;
  payment_processing_costs_minor: number;
  platform_discounts_minor: number;
  refund_costs_minor: number;
  contribution_profit_minor: number;
  contribution_margin_pct: number;
  order_count: number;
  average_order_value_minor: number;
  average_contribution_per_order_minor: number;
  negative_margin_order_count: number;
}

export interface FinancialReconciliationReport {
  generated_at: string;
  unreconciled_captured_payments: Array<{
    payment_id: string;
    order_id: string;
    amount_minor: number;
    captured_at: string;
    reason: string;
  }>;
  unreconciled_succeeded_refunds: Array<{
    refund_id: string;
    payment_id: string;
    amount_minor: number;
    reason: string;
  }>;
  unreconciled_delivered_deliveries: Array<{
    delivery_id: string;
    order_id: string;
    rider_id: string;
    reason: string;
  }>;
  unreconciled_completed_orders: Array<{
    order_id: string;
    order_number: string;
    reason: string;
  }>;
  unbalanced_ledger_transactions: Array<{
    transaction_id: string;
    total_debits_minor: number;
    total_credits_minor: number;
  }>;
  all_balanced: boolean;
}

// ============================================================================
// 14. Sprint 13: Operations, Support, Notifications, Risk, and Resilience Types
// ============================================================================

export type CancellationResponsibility = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'DEETOO' | 'SYSTEM';

export type CancellationReasonCode =
  | 'CUSTOMER_CHANGED_MIND'
  | 'CUSTOMER_UNREACHABLE'
  | 'CUSTOMER_WRONG_ADDRESS'
  | 'MERCHANT_REJECTED'
  | 'MERCHANT_OUT_OF_STOCK'
  | 'MERCHANT_UNRESPONSIVE'
  | 'MERCHANT_CLOSED'
  | 'RIDER_VEHICLE_BREAKDOWN'
  | 'RIDER_ACCIDENT'
  | 'NO_RIDER_AVAILABLE'
  | 'DELIVERY_FAILED'
  | 'SYSTEM_PAYMENT_FAILED'
  | 'SYSTEM_TIMEOUT'
  | 'OPERATIONS_CANCELLED';

export type RefundReasonCategory =
  | 'MISSING_ITEM'
  | 'WRONG_ITEM'
  | 'DAMAGED_ITEM'
  | 'LATE_DELIVERY'
  | 'FAILED_DELIVERY'
  | 'MERCHANT_REJECTION'
  | 'DUPLICATE_PAYMENT'
  | 'OVERCHARGED'
  | 'CUSTOMER_CANCELLED'
  | 'SUPPORT_GOODWILL'
  | 'FRAUD_ABUSE';

export type IncidentReasonCode =
  | 'MERCHANT_RESPONSE_DELAY'
  | 'ORDER_STUCK'
  | 'DISPATCH_NO_RIDER'
  | 'RIDER_LOCATION_STALE'
  | 'DELIVERY_DELAY'
  | 'CUSTOMER_UNREACHABLE'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_MISMATCH'
  | 'REFUND_FAILED'
  | 'SETTLEMENT_FAILED'
  | 'RIDER_PAYOUT_FAILED'
  | 'NOTIFICATION_FAILURE'
  | 'LEDGER_RECONCILIATION_FAILURE'
  | 'FRAUD_RISK'
  | 'SYSTEM_JOB_FAILURE';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

export type IncidentType =
  | 'ORDER_STUCK_PLACED'
  | 'ORDER_STUCK_PREPARING'
  | 'ORDER_STUCK_READY'
  | 'DELIVERY_DISPATCH_UNASSIGNED_TIMEOUT'
  | 'DELIVERY_PICKUP_DELAY'
  | 'DELIVERY_KITCHEN_WAIT_TIMEOUT'
  | 'DELIVERY_TRAVEL_DELAY'
  | 'RIDER_LOCATION_STALE'
  | 'PAYMENT_STUCK_PENDING'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'CUSTOMER_REFUND_FAILED'
  | 'MERCHANT_SETTLEMENT_FAILED'
  | 'RIDER_PAYOUT_FAILED'
  | 'NOTIFICATION_DELIVERY_FAILURE'
  | 'LEDGER_DISCREPANCY'
  | 'FRAUD_SUSPECTED'
  | 'ASYNC_JOB_DEAD_LETTER'
  | string;

export type IncidentTimelineAction =
  | 'CREATED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_UPDATED'
  | 'INCIDENT_ACKNOWLEDGED'
  | 'INCIDENT_INVESTIGATING'
  | 'INCIDENT_ASSIGNED'
  | 'INCIDENT_RESOLVED'
  | 'INCIDENT_DISMISSED'
  | 'INCIDENT_REOPENED'
  | 'SEVERITY_ESCALATED'
  | 'ACKNOWLEDGED'
  | 'NOTE_ADDED'
  | 'ASSIGNED'
  | 'ACTION_TAKEN'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'REOPENED'
  | string;

export interface IncidentTimelineEntry {
  id: string;
  incident_id: string;
  action: IncidentTimelineAction;
  actor_user_id?: string | null;
  actor_name?: string | null;
  note?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface OperationalIncident {
  id: string;
  type: IncidentReasonCode | string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  order_id?: string | null;
  delivery_id?: string | null;
  payment_id?: string | null;
  refund_id?: string | null;
  merchant_id?: string | null;
  rider_id?: string | null;
  customer_id?: string | null;
  reason_code: string;
  summary: string;
  details?: string | null;
  metadata?: Record<string, any>;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  detected_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  timeline?: IncidentTimelineEntry[];
}

export type SlaStatus = 'WITHIN_SLA' | 'WARNING' | 'BREACHED';

export interface SlaConfig {
  merchantResponseSlaMinutes: number;
  preparationDelayToleranceMinutes: number;
  dispatchAssignmentSlaMinutes: number;
  pickupArrivalSlaMinutes: number;
  pickupWaitSlaMinutes: number;
  deliveryTravelSlaMinutes: number;
  paymentPendingSlaMinutes: number;
  riderLocationStaleSlaMinutes: number;
  supportFirstResponseSlaMinutes: number;
}

export interface SlaEvaluationResult {
  entityType: 'ORDER' | 'DELIVERY' | 'PAYMENT' | 'SUPPORT_CASE';
  entityId: string;
  slaType: string;
  status: SlaStatus;
  elapsedMinutes: number;
  thresholdMinutes: number;
  details: string;
}

export type SupportCaseStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_CUSTOMER'
  | 'WAITING_MERCHANT'
  | 'WAITING_RIDER'
  | 'WAITING_INTERNAL'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type SupportCaseCategory =
  | 'ORDER_ISSUE'
  | 'PAYMENT_ISSUE'
  | 'REFUND'
  | 'MISSING_ITEM'
  | 'WRONG_ITEM'
  | 'DELIVERY_DELAY'
  | 'CUSTOMER_UNREACHABLE'
  | 'RIDER_ISSUE'
  | 'MERCHANT_ISSUE'
  | 'ACCOUNT_ISSUE'
  | 'OTHER';

export type SupportNoteVisibility = 'INTERNAL' | 'CUSTOMER_VISIBLE';

export type SupportResolutionCode =
  | 'REFUND_ISSUED'
  | 'ORDER_CANCELLED'
  | 'DELIVERY_COMPLETED'
  | 'MERCHANT_CONTACTED'
  | 'RIDER_REASSIGNED'
  | 'CUSTOMER_EDUCATED'
  | 'NO_ACTION_REQUIRED'
  | 'ESCALATED'
  | 'DISMISSED';

export interface SupportCase {
  id: string;
  case_number: string;
  customer_id?: string | null;
  merchant_id?: string | null;
  rider_id?: string | null;
  order_id?: string | null;
  delivery_id?: string | null;
  payment_id?: string | null;
  category: SupportCaseCategory;
  priority: SupportCasePriority;
  status: SupportCaseStatus;
  subject: string;
  description: string;
  resolution_code?: SupportResolutionCode | null;
  resolution_notes?: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  refund_id?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  notes?: SupportCaseNote[];
}

export interface SupportCaseNote {
  id: string;
  case_id: string;
  author_user_id: string;
  author_role?: string;
  author_name?: string;
  visibility: SupportNoteVisibility;
  body: string;
  created_at: string;
}

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';

export type NotificationRecipientType = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'ADMIN';

export type NotificationStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export type NotificationTemplateCode =
  | 'CUSTOMER_ORDER_ACCEPTED'
  | 'CUSTOMER_ORDER_REJECTED'
  | 'CUSTOMER_RIDER_ASSIGNED'
  | 'CUSTOMER_ORDER_PICKED_UP'
  | 'CUSTOMER_RIDER_ARRIVED'
  | 'CUSTOMER_ORDER_DELIVERED'
  | 'CUSTOMER_ORDER_DELAYED'
  | 'MERCHANT_NEW_ORDER'
  | 'MERCHANT_RIDER_ARRIVED'
  | 'RIDER_NEW_OFFER'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'REFUND_SUCCESS'
  | 'SUPPORT_CASE_UPDATED'
  | 'SLA_ALERT';

export interface NotificationRecord {
  id: string;
  recipient_type: NotificationRecipientType;
  recipient_id: string;
  channel: NotificationChannel;
  template_code: NotificationTemplateCode | string;
  status: NotificationStatus;
  subject?: string | null;
  payload: Record<string, any>;
  provider: string;
  provider_reference?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  failure_code?: string | null;
  failure_reason?: string | null;
  retry_count: number;
  max_retries: number;
  idempotency_key: string;
  read_at?: string | null;
  created_at: string;
}

export interface DeadLetterJob {
  id: string;
  job_type: string;
  job_id: string;
  payload: Record<string, any>;
  attempt_count: number;
  max_attempts: number;
  last_error: string;
  status: 'DEAD_LETTER' | 'RETRIED' | 'RESOLVED';
  failed_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export type RiskSignalType =
  | 'EXCESSIVE_REFUNDS'
  | 'MULTIPLE_PAYMENT_FAILURES'
  | 'PROMOTION_ABUSE'
  | 'MULTIPLE_ACCOUNTS_SAME_DEVICE'
  | 'REPEATED_ORDER_CANCELLATION'
  | 'UNUSUAL_ORDER_VELOCITY'
  | 'MULTIPLE_FAILED_PAYMENTS'
  | 'DUPLICATE_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'REFUND_FREQUENCY_HIGH'
  | 'REPEATED_MISSING_ITEM_CLAIMS'
  | 'REFUND_AMOUNT_HIGH'
  | 'GPS_ANOMALY'
  | 'IMPOSSIBLE_MOVEMENT'
  | 'REPEATED_ASSIGNMENT_RELEASE'
  | 'EXCESSIVE_OFFER_REJECTION'
  | 'REPEATED_DELIVERY_FAILURE'
  | 'HIGH_REJECTION_RATE'
  | 'HIGH_REFUND_RATE'
  | 'HIGH_MISSING_ITEM_RATE'
  | 'PREPARATION_DELAY_RATE';

export type RiskSignalStatus = 'OPEN' | 'REVIEWED' | 'DISMISSED' | 'CONFIRMED';

export interface RiskSignal {
  id: string;
  signal_type: RiskSignalType | string;
  severity: IncidentSeverity;
  customer_id?: string | null;
  merchant_id?: string | null;
  rider_id?: string | null;
  order_id?: string | null;
  payment_id?: string | null;
  promotion_id?: string | null;
  score_weight: number;
  metadata: Record<string, any>;
  status: RiskSignalStatus;
  detected_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
}

export interface OperationalKillSwitches {
  autoDispatchPaused: boolean;
  zonePaused: Record<string, boolean>;
  merchantPaused: Record<string, boolean>;
  paymentMethodPaused: Record<string, boolean>;
  liveTrackingPaused: boolean;
}

export interface UnifiedOrderOperationalView {
  order: any;
  customer?: any;
  merchant?: any;
  branch?: any;
  payment?: any;
  payments?: any[];
  refunds: any[];
  delivery?: any;
  rider?: any;
  orderTimeline?: any[];
  timeline?: any[];
  dispatchOffers?: any[];
  offers?: any[];
  supportCases: SupportCase[];
  incidents: OperationalIncident[];
  notifications: NotificationRecord[];
  financialSummary?: OrderFinancialSummary | Record<string, any> | null;
  riskScore?: number;
  fraudAlerts?: any[];
}

export interface OperationsOverviewMetrics {
  activeOrdersCount: number;
  unassignedDeliveriesCount: number;
  delayedDeliveriesCount: number;
  merchantResponseOverdueCount: number;
  riderLocationStaleCount: number;
  paymentsPendingTooLongCount: number;
  failedPaymentsCount: number;
  openSupportCasesCount: number;
  refundsRequiringAttentionCount: number;
  settlementFailuresCount: number;
  payoutFailuresCount: number;
  openIncidentsCount: number;
  highRiskSignalsCount: number;
  deadLetterJobsCount: number;
}





