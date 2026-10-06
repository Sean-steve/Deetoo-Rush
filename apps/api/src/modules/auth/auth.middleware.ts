import { sensitiveWriteRateLimiter } from './rate-limit.middleware';
import { ACCESS_COOKIE_NAME, readCookie } from './auth.transport';
import { config } from '@deetoo/config';
import { requireRecentMfa } from './mfa';
/**
 * DEETOO - Authentication & Authorization Middlewares
 * Implements server-side authentication, role guards, and resource scope enforcement
 */

import { Request, Response, NextFunction } from "express";
import { UserRole, UserSession, UserStatus, AuthUser } from "@deetoo/types";
import {
  verifyAccessToken,
  hasRole,
  hasPermission,
  evaluateAccess,
} from "@deetoo/auth";
import { AppError } from "../../middleware/error-handler";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  session?: UserSession;
}

/**
 * Extracts bearer token from Authorization header or cookie
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  // Browser clients authenticate with a host-only HttpOnly access cookie.
  return readCookie(req, ACCESS_COOKIE_NAME);
}

/**
 * Require valid authenticated user session
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication token required");
    }

    const payload = verifyAccessToken<{
      sub: string;
      sessionId: string;
      roles: UserRole[];
      permissions?: string[];
      merchant_ids?: string[];
      branch_ids?: string[];
      rider_id?: string;
      customer_id?: string;
    }>(token);

    if (!payload || !payload.sub || !payload.sessionId) {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "Access token is invalid or expired",
      );
    }

    // Verify session in repository has not been revoked
    const sessionRecord = await authRepository.findSessionById(
      payload.sessionId,
    );
    if (
      !sessionRecord ||
      sessionRecord.revoked_at ||
      sessionRecord.user_id !== payload.sub ||
      new Date(sessionRecord.expires_at).getTime() <= Date.now()
    ) {
      throw new AppError(
        401,
        "SESSION_REVOKED",
        "Session has been revoked or expired. Please re-authenticate.",
      );
    }

    // Verify user exists and is active
    const user = await authRepository.findUserById(payload.sub);
    if (!user) {
      throw new AppError(401, "USER_NOT_FOUND", "User account does not exist");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(
        403,
        "ACCOUNT_INACTIVE",
        `User account is ${user.status.toLowerCase()}. Access denied.`,
      );
    }

    const authUser = await authService.toAuthUser(user);

    req.user = authUser;
    req.session = {
      user_id: user.id,
      session_id: sessionRecord.id,
      email: user.email,
      phone_e164: user.phone_e164,
      status: user.status,
      roles: authUser.roles,
      permissions: authUser.permissions,
      merchant_ids: authUser.merchant_ids,
      branch_ids: authUser.branch_ids,
      rider_id: authUser.rider_id,
      customer_id: authUser.customer_id,
    };

    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      await new Promise<void>((resolve,reject) => { void sensitiveWriteRateLimiter(req,res,error => error ? reject(error) : resolve()); });
    }
    if (config.storage.mode === 'postgres' && !config.localWorkflow && !['GET','HEAD','OPTIONS'].includes(req.method)
      && !req.originalUrl.split('?')[0].startsWith('/api/v1/auth/')
      && authUser.roles.some(role => ['super_admin','admin','finance','ops'].includes(role))) {
      await requireRecentMfa(user.id, sessionRecord.id);
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication: populates user/session if present, does not reject if absent
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = extractToken(req);
    if (!token) return next();

    const payload = verifyAccessToken<{ sub: string; sessionId: string }>(
      token,
    );
    if (!payload) return next();

    const sessionRecord = await authRepository.findSessionById(
      payload.sessionId,
    );
    if (
      !sessionRecord ||
      sessionRecord.revoked_at ||
      sessionRecord.user_id !== payload.sub ||
      new Date(sessionRecord.expires_at).getTime() <= Date.now()
    )
      return next();

    const user = await authRepository.findUserById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) return next();

    req.user = await authService.toAuthUser(user);
    req.session = {
      user_id: user.id,
      session_id: sessionRecord.id,
      email: user.email,
      phone_e164: user.phone_e164,
      status: user.status,
      roles: req.user.roles,
      permissions: req.user.permissions,
      merchant_ids: req.user.merchant_ids,
      branch_ids: req.user.branch_ids,
      rider_id: req.user.rider_id,
      customer_id: req.user.customer_id,
    };

    next();
  } catch {
    next();
  }
}

/**
 * Enforce minimum Role requirement (Section 22 & 23)
 */
export function requireRole(...allowedRoles: (UserRole | string)[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }

    const requiresSuperAdmin = allowedRoles.some(
      (role) => String(role).toLowerCase() === UserRole.SUPER_ADMIN,
    );
    const isSuperAdmin = req.session.roles.includes(UserRole.SUPER_ADMIN);
    const hasAllowed =
      (isSuperAdmin && !requiresSuperAdmin) ||
      allowedRoles.some((role) => req.session!.roles.includes(role as UserRole));
    if (!hasAllowed) {
      return next(
        new AppError(
          403,
          "FORBIDDEN_ROLE",
          `Access denied. Requires one of roles: ${allowedRoles.join(", ")}`,
        ),
      );
    }

    next();
  };
}

/**
 * Enforce specific permission requirement (Section 24 & 25)
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }

    if (hasRole(req.session, UserRole.ADMIN)) {
      return next();
    }

    const hasAll = requiredPermissions.every((p) =>
      hasPermission(req.session, p),
    );
    if (!hasAll) {
      return next(
        new AppError(
          403,
          "INSUFFICIENT_PERMISSIONS",
          `Access denied. Missing required permission: ${requiredPermissions.join(", ")}`,
        ),
      );
    }

    next();
  };
}

/**
 * Enforce resource scope (Resource Owner, Branch, Merchant, or Rider)
 */
export function requireResourceScope(
  resolveContext: (req: AuthenticatedRequest) => {
    permission?: string;
    resourceOwnerId?: string;
    merchantId?: string;
    branchId?: string;
    assignedRiderId?: string;
  },
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }

    const context = resolveContext(req);
    const authorized = evaluateAccess(req.session, context);

    if (!authorized) {
      return next(
        new AppError(
          403,
          "FORBIDDEN_SCOPE",
          "Access denied. You do not have authorization to access this resource or branch scope.",
        ),
      );
    }

    next();
  };
}
