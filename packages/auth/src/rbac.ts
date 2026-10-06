/**
 * DEETOO - Core RBAC & Security Matrix (Isomorphic / Client & Server Safe)
 * Authorization logic implementing DEE-SEC-001 & Sprint 2 Specs
 */

import { UserRole, UserSession, UserStatus } from '@deetoo/types';

export interface AuthorizationContext {
  session: UserSession;
  resourceOwnerId?: string;
  merchantId?: string;
  branchId?: string;
  assignedRiderId?: string;
}

export const PERMISSIONS = {
  // Domain Core Matrix (Sprint 2 Section 24)
  MERCHANT_READ: 'merchant.read',
  MERCHANT_MANAGE: 'merchant.manage',
  MENU_READ: 'menu.read',
  MENU_MANAGE: 'menu.manage',
  ORDER_READ: 'order.read',
  ORDER_MANAGE: 'order.manage',
  RIDER_READ: 'rider.read',
  RIDER_MANAGE: 'rider.manage',
  RIDER_REVIEW: 'rider.review',
  RIDER_APPROVE: 'rider.approve',
  RIDER_SUSPEND: 'rider.suspend',
  RIDER_MANAGE_ZONE: 'rider.manage_zone',
  RIDER_LOCATION_READ: 'rider.location.read',
  PAYMENT_READ: 'payment.read',
  REFUND_MANAGE: 'refund.manage',
  SETTLEMENT_READ: 'settlement.read',
  SETTLEMENT_MANAGE: 'settlement.manage',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  IDENTITY_PROVISION: 'identity.provision',
  IDENTITY_EDIT: 'identity.edit',
  IDENTITY_DEACTIVATE: 'identity.deactivate',
  CUSTOMER_PROFILE_MANAGE: 'customer.profile.manage',
  MERCHANT_PROFILE_MANAGE: 'merchant.profile.manage',
  RIDER_PROFILE_MANAGE: 'rider.profile.manage',
  SUPPORT_CASE_MANAGE: 'support.case.manage',
  SUPPORT_RESOLUTION_PROPOSE: 'support.resolution.propose',
  SUPPORT_RESOLUTION_CONFIRM: 'support.resolution.confirm',

  // Customer Scopes
  CUSTOMER_READ_OWN: 'customer:read:own',
  CUSTOMER_ORDER_CREATE: 'customer:order:create',
  CUSTOMER_ORDER_CANCEL: 'customer:order:cancel',

  // Merchant Granular Scopes
  MERCHANT_BRANCH_OPERATE: 'merchant:branch:operate',
  MERCHANT_MENU_MANAGE: 'merchant:menu:manage',
  MERCHANT_ORDER_ACCEPT: 'merchant:order:accept',
  MERCHANT_ORDER_PREPARE: 'merchant:order:prepare',
  MERCHANT_ORDER_READY: 'merchant:order:ready',

  // Rider Scopes
  RIDER_AVAILABILITY_SET: 'rider:availability:set',
  RIDER_LOCATION_PUBLISH: 'rider:location:publish',
  RIDER_OFFER_ACCEPT: 'rider:offer:accept',
  RIDER_DELIVERY_CONFIRM: 'rider:delivery:confirm',

  // Operations & Support Scopes
  OPS_LIVE_MONITOR: 'ops:live:monitor',
  OPS_DISPATCH_REASSIGN: 'ops:dispatch:reassign',
  SUPPORT_CASE_CREATE: 'support:case:create',

  // Finance Scopes
  FINANCE_LEDGER_VIEW: 'finance:ledger:view',
  FINANCE_REFUND_APPROVE: 'finance:refund:approve',
  FINANCE_SETTLEMENT_GENERATE: 'finance:settlement:generate',
  FINANCE_SETTLEMENT_APPROVE: 'finance:settlement:approve',
  FINANCE_SETTLEMENT_PAY: 'finance:settlement:pay',
  FINANCE_PAYOUT_GENERATE: 'finance:payout:generate',
  FINANCE_PAYOUT_APPROVE: 'finance:payout:approve',
  FINANCE_PAYOUT_PAY: 'finance:payout:pay',
  FINANCE_ADJUSTMENT_CREATE: 'finance:adjustment:create',
  FINANCE_PROFITABILITY_VIEW: 'finance:profitability:view',
  RIDER_EARNINGS_VIEW: 'rider:earnings:view',
  MERCHANT_FINANCE_VIEW: 'merchant:finance:view',

  // Admin Full Access
  ADMIN_FULL_ACCESS: 'admin:full:access',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Standard Role-to-Permissions Mapping (Section 22 & 25)
 */
export const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  [UserRole.CUSTOMER]: [
    PERMISSIONS.CUSTOMER_READ_OWN,
    PERMISSIONS.CUSTOMER_ORDER_CREATE,
    PERMISSIONS.CUSTOMER_ORDER_CANCEL,
    PERMISSIONS.ORDER_READ,
  ],
  [UserRole.MERCHANT_OWNER]: [
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.MERCHANT_MANAGE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_MANAGE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.SETTLEMENT_MANAGE,
    PERMISSIONS.MERCHANT_FINANCE_VIEW,
    PERMISSIONS.MERCHANT_BRANCH_OPERATE,
    PERMISSIONS.MERCHANT_ORDER_ACCEPT,
    PERMISSIONS.MERCHANT_ORDER_PREPARE,
    PERMISSIONS.MERCHANT_ORDER_READY,
  ],
  [UserRole.MERCHANT_MANAGER]: [
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_MANAGE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.MERCHANT_BRANCH_OPERATE,
    PERMISSIONS.MERCHANT_ORDER_ACCEPT,
    PERMISSIONS.MERCHANT_ORDER_PREPARE,
    PERMISSIONS.MERCHANT_ORDER_READY,
  ],
  [UserRole.MERCHANT_STAFF]: [
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.MERCHANT_BRANCH_OPERATE,
    PERMISSIONS.MERCHANT_ORDER_PREPARE,
    PERMISSIONS.MERCHANT_ORDER_READY,
  ],
  [UserRole.MERCHANT]: [
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.MERCHANT_MANAGE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_MANAGE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.MERCHANT_BRANCH_OPERATE,
    PERMISSIONS.MERCHANT_ORDER_ACCEPT,
    PERMISSIONS.MERCHANT_ORDER_PREPARE,
    PERMISSIONS.MERCHANT_ORDER_READY,
  ],
  [UserRole.RIDER]: [
    PERMISSIONS.RIDER_READ,
    PERMISSIONS.RIDER_AVAILABILITY_SET,
    PERMISSIONS.RIDER_LOCATION_PUBLISH,
    PERMISSIONS.RIDER_OFFER_ACCEPT,
    PERMISSIONS.RIDER_DELIVERY_CONFIRM,
    PERMISSIONS.RIDER_EARNINGS_VIEW,
    PERMISSIONS.ORDER_READ,
  ],
  [UserRole.SUPPORT]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.RIDER_READ,
    PERMISSIONS.SUPPORT_CASE_CREATE,
    PERMISSIONS.CUSTOMER_READ_OWN,
  ],
  [UserRole.FINANCE]: [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.REFUND_MANAGE,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.SETTLEMENT_MANAGE,
    PERMISSIONS.FINANCE_LEDGER_VIEW,
    PERMISSIONS.FINANCE_REFUND_APPROVE,
    PERMISSIONS.FINANCE_SETTLEMENT_GENERATE,
    PERMISSIONS.FINANCE_SETTLEMENT_APPROVE,
    PERMISSIONS.FINANCE_SETTLEMENT_PAY,
    PERMISSIONS.FINANCE_PAYOUT_GENERATE,
    PERMISSIONS.FINANCE_PAYOUT_APPROVE,
    PERMISSIONS.FINANCE_PAYOUT_PAY,
    PERMISSIONS.FINANCE_ADJUSTMENT_CREATE,
    PERMISSIONS.FINANCE_PROFITABILITY_VIEW,
  ],
  [UserRole.OPS]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.RIDER_READ,
    PERMISSIONS.RIDER_MANAGE,
    PERMISSIONS.RIDER_REVIEW,
    PERMISSIONS.RIDER_APPROVE,
    PERMISSIONS.RIDER_SUSPEND,
    PERMISSIONS.RIDER_MANAGE_ZONE,
    PERMISSIONS.RIDER_LOCATION_READ,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.OPS_LIVE_MONITOR,
    PERMISSIONS.OPS_DISPATCH_REASSIGN,
  ],
  [UserRole.ADMIN]: [
    ...Object.values(PERMISSIONS).filter(
      (permission) =>
        ![
          PERMISSIONS.IDENTITY_PROVISION,
          PERMISSIONS.IDENTITY_EDIT,
          PERMISSIONS.IDENTITY_DEACTIVATE,
          PERMISSIONS.ROLE_MANAGE,
        ].includes(permission as any),
    ),
    PERMISSIONS.CUSTOMER_PROFILE_MANAGE,
    PERMISSIONS.MERCHANT_PROFILE_MANAGE,
    PERMISSIONS.RIDER_PROFILE_MANAGE,
    PERMISSIONS.SUPPORT_CASE_MANAGE,
    PERMISSIONS.SUPPORT_RESOLUTION_PROPOSE,
  ],
  [UserRole.SUPER_ADMIN]: Object.values(PERMISSIONS),
};

/**
 * Normalizes role string to canonical enum value
 */
export function normalizeRole(role: string): UserRole | null {
  const clean = role.trim().toLowerCase();
  const values = Object.values(UserRole);
  for (const v of values) {
    if (v.toLowerCase() === clean) {
      return v;
    }
  }
  return null;
}

/**
 * Resolves full list of deduplicated permissions for an array of roles
 */
export function getPermissionsForRoles(roles: (UserRole | string)[]): string[] {
  const permSet = new Set<string>();
  for (const r of roles) {
    const canonical = typeof r === 'string' ? normalizeRole(r) : r;
    if (canonical && ROLE_PERMISSIONS_MAP[canonical]) {
      for (const p of ROLE_PERMISSIONS_MAP[canonical]) {
        permSet.add(p);
      }
    }
  }
  return Array.from(permSet);
}

/**
 * Check if the active session is authorized for a specific role
 */
export function hasRole(
  session: { roles?: UserRole[] } | UserSession | undefined,
  requiredRole: UserRole | string
): boolean {
  if (!session || !session.roles) return false;
  const canonicalRequired = typeof requiredRole === 'string' ? normalizeRole(requiredRole) : requiredRole;
  return session.roles.some((r) => {
    const canonical = typeof r === 'string' ? normalizeRole(r) : r;
    if (canonical === UserRole.SUPER_ADMIN) return true;
    if (canonicalRequired === UserRole.SUPER_ADMIN) {
      return canonical === UserRole.SUPER_ADMIN;
    }
    if (canonical === UserRole.ADMIN) return true;
    return Boolean(canonicalRequired && canonical === canonicalRequired);
  });
}

/**
 * Check if the active session has a specific permission
 */
export function hasPermission(
  session: { roles?: UserRole[]; permissions?: string[] } | UserSession | undefined,
  permission: string
): boolean {
  if (!session || !session.roles) return false;
  if (hasRole(session, UserRole.SUPER_ADMIN)) return true;

  if (session.permissions && session.permissions.includes(permission)) {
    return true;
  }

  const rolePerms = getPermissionsForRoles(session.roles);
  return rolePerms.includes(permission) || rolePerms.includes(PERMISSIONS.ADMIN_FULL_ACCESS);
}

/**
 * Enforce resource ownership (DEE-SEC-001 Section 6)
 */
export function isResourceOwner(session: UserSession | undefined, ownerId: string): boolean {
  if (!session) return false;
  if (hasRole(session, UserRole.SUPER_ADMIN)) return true;
  if (hasRole(session, UserRole.ADMIN)) return true;
  return session.user_id === ownerId || session.customer_id === ownerId;
}

/**
 * Enforce merchant scope
 */
export function isMerchantScoped(session: UserSession | undefined, merchantId: string): boolean {
  if (!session) return false;
  if (hasRole(session, UserRole.SUPER_ADMIN) || hasRole(session, UserRole.ADMIN)) return true;
  return !!session.merchant_ids && session.merchant_ids.includes(merchantId);
}

/**
 * Enforce merchant branch scope (DEE-SEC-001 Section 6)
 */
export function isBranchScoped(session: UserSession | undefined, branchId: string): boolean {
  if (!session) return false;
  if (hasRole(session, UserRole.SUPER_ADMIN) || hasRole(session, UserRole.ADMIN)) return true;
  return !!session.branch_ids && session.branch_ids.includes(branchId);
}

/**
 * Enforce rider assignment scope
 */
export function isAssignedRider(session: UserSession | undefined, riderId: string): boolean {
  if (!session) return false;
  if (
    hasRole(session, UserRole.SUPER_ADMIN) ||
    hasRole(session, UserRole.ADMIN) ||
    hasRole(session, UserRole.OPS)
  ) return true;
  return session.rider_id === riderId;
}

/**
 * Comprehensive Authorization & Scoping Evaluator
 * Evaluates: Role + Permission + Resource Scope
 */
export function evaluateAccess(
  session: UserSession | undefined,
  options: {
    permission?: string;
    resourceOwnerId?: string;
    merchantId?: string;
    branchId?: string;
    assignedRiderId?: string;
  }
): boolean {
  if (!session) return false;
  if (session.status && session.status !== UserStatus.ACTIVE) return false;
  if (hasRole(session, UserRole.SUPER_ADMIN)) return true;

  // Check permission if specified
  if (options.permission && !hasPermission(session, options.permission)) {
    return false;
  }

  // Check resource owner if specified
  if (options.resourceOwnerId && !isResourceOwner(session, options.resourceOwnerId)) {
    return false;
  }

  // Check merchant scope if specified
  if (options.merchantId && !isMerchantScoped(session, options.merchantId)) {
    return false;
  }

  // Check branch scope if specified
  if (options.branchId && !isBranchScoped(session, options.branchId)) {
    return false;
  }

  // Check rider if specified
  if (options.assignedRiderId && !isAssignedRider(session, options.assignedRiderId)) {
    return false;
  }

  return true;
}
