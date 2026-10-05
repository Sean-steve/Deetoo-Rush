import { config } from '@deetoo/config';
import { requestDurableIdentity, confirmDurableOtp } from './identity-delivery';
import { requireSimulationMode } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
import { merchantRepository } from "../merchant/merchant.repository";
/**
 * DEETOO - Authentication Business Logic Service
 * Implements authentication, session lifecycle, rotation, and password flows
 */

import crypto from "crypto";
import {
  UserRole,
  UserStatus,
  AuthUser,
  LoginResponse,
  AuditAction,
} from "@deetoo/types";
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  signAccessToken,
  getPermissionsForRoles,
} from "@deetoo/auth";
import { normalizeEmail, normalizePhoneE164 } from "@deetoo/validation";
import { AppError } from "../../middleware/error-handler";
import { authRepository, UserRecord } from "./auth.repository";

export class AuthService {
  /**
   * Safe mapping from database UserRecord to public AuthUser
   */
  public async toAuthUser(user: UserRecord): Promise<AuthUser> {
    const roles = await authRepository.getUserRoles(user.id);
    const permissions = getPermissionsForRoles(roles);

    let name: string | null = null;
    let customer_id: string | undefined;
    let rider_id: string | undefined;
    let merchant_ids: string[] | undefined;
    let branch_ids: string[] | undefined;

    const customerProfile = await authRepository.getCustomerProfile(user.id);
    if (customerProfile) {
      name = customerProfile.name;
      customer_id = customerProfile.id;
    }

    const riderProfile = await authRepository.getRiderProfile(user.id);
    if (riderProfile) {
      rider_id = riderProfile.id;
    }

    const memberships = (
      await merchantRepository.getMembershipsForUser(user.id)
    ).filter((m) => m.status === "ACTIVE");
    if (memberships.length > 0) {
      merchant_ids = memberships.map((m) => m.merchant_id);
      branch_ids = memberships.flatMap((m) => m.branch_ids);
    }

    return {
      id: user.id,
      email: user.email,
      phone_e164: user.phone_e164,
      status: user.status,
      name,
      email_verified_at: user.email_verified_at,
      phone_verified_at: user.phone_verified_at,
      roles,
      permissions,
      merchant_ids,
      branch_ids,
      rider_id,
      customer_id,
      created_at: user.created_at,
    };
  }

  /**
   * Customer Self-Registration (Section 9)
   */
  public async registerCustomer(params: {
    name: string;
    email?: string;
    phone_e164?: string;
    password: string;
    requestId?: string;
    ipAddress?: string;
    deviceInfo?: string;
  }): Promise<LoginResponse & { refreshToken: string }> {
    const email = params.email ? normalizeEmail(params.email) : null;
    const phone = params.phone_e164
      ? normalizePhoneE164(params.phone_e164)
      : null;

    if (!email && !phone) {
      throw new AppError(
        400,
        "VALIDATION_FAILED",
        "Either email or phone number is required",
      );
    }

    // Check existing
    if (email) {
      const existing = await authRepository.findUserByEmail(email);
      if (existing) {
        throw new AppError(
          409,
          "IDENTITY_CONFLICT",
          "An account with this email already exists",
        );
      }
    }
    if (phone) {
      const existing = await authRepository.findUserByPhone(phone);
      if (existing) {
        throw new AppError(
          409,
          "IDENTITY_CONFLICT",
          "An account with this phone number already exists",
        );
      }
    }

    const passwordHash = await hashPassword(params.password);
    const userId = crypto.randomUUID();

    const user = await authRepository.createUser({
      id: userId,
      email,
      phone_e164: phone,
      password_hash: passwordHash,
      status: UserStatus.ACTIVE,
    });

    // Assign Customer Role & Profile
    await authRepository.setUserRoles(user.id, [UserRole.CUSTOMER]);
    await authRepository.createCustomerProfile({
      id: `cust_${userId.substring(0, 8)}`,
      user_id: user.id,
      name: params.name,
    });

    // Audit registration
    await authRepository.createAuditLog({
      actor_user_id: user.id,
      actor_role: UserRole.CUSTOMER,
      action: AuditAction.USER_REGISTERED,
      resource_type: "USER",
      resource_id: user.id,
      request_id: params.requestId,
      metadata: { email, phone, registration_flow: "CUSTOMER_SELF_SERVE" },
    });

    // Auto-login session creation
    return this.createSessionAndTokens(user, {
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
      requestId: params.requestId,
    });
  }

  /**
   * Centralized Login for All User Roles (Section 10)
   */
  public async login(params: {
    identifier: string;
    password: string;
    deviceInfo?: string;
    deviceId?: string;
    ipAddress?: string;
    requestId?: string;
  }): Promise<LoginResponse & { refreshToken: string }> {
    const identifier = params.identifier.trim();
    const user = await authRepository.findUserByIdentifier(identifier);

    // Generic error to prevent identity enumeration
    if (!user) {
      await authRepository.createAuditLog({
        actor_user_id: null,
        actor_role: null,
        action: AuditAction.LOGIN_FAILED,
        resource_type: "AUTH",
        request_id: params.requestId,
        reason: "User not found",
        metadata: { identifier, ip: params.ipAddress },
      });
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email/phone or password",
      );
    }

    // Verify Password
    const isValidPassword = await verifyPassword(
      params.password,
      user.password_hash,
    );
    if (!isValidPassword) {
      await authRepository.createAuditLog({
        actor_user_id: user.id,
        actor_role: null,
        action: AuditAction.LOGIN_FAILED,
        resource_type: "AUTH",
        resource_id: user.id,
        request_id: params.requestId,
        reason: "Password mismatch",
        metadata: { ip: params.ipAddress },
      });
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email/phone or password",
      );
    }

    // Account Status Guard (Section 5)
    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(
        403,
        "ACCOUNT_SUSPENDED",
        "Your account has been suspended by administration. Please contact support.",
      );
    }
    if (user.status === UserStatus.DISABLED) {
      throw new AppError(
        403,
        "ACCOUNT_DISABLED",
        "Your account has been disabled.",
      );
    }
    if (user.status === UserStatus.PENDING) {
      throw new AppError(
        403,
        "ACCOUNT_PENDING",
        "Your account is pending verification.",
      );
    }

    // Update last login
    await authRepository.updateLastLogin(user.id);

    // Create session & tokens
    const result = await this.createSessionAndTokens(user, {
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
      requestId: params.requestId,
    });

    await authRepository.createAuditLog({
      actor_user_id: user.id,
      actor_role: result.user.roles[0] || "unknown",
      action: AuditAction.LOGIN_SUCCEEDED,
      resource_type: "SESSION",
      resource_id: result.session.id,
      request_id: params.requestId,
      metadata: {
        ip: params.ipAddress,
        device: params.deviceInfo,
      },
    });

    return result;
  }

  /**
   * Internal helper: generate session, hashed refresh token, access token
   */
  private async createSessionAndTokens(
    user: UserRecord,
    options?: {
      ipAddress?: string;
      deviceInfo?: string;
      requestId?: string;
    },
  ): Promise<LoginResponse & { refreshToken: string }> {
    const rawRefreshToken = generateSecureToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const sessionId = crypto.randomUUID();

    // Refresh token expiry: 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await authRepository.createSession({
      id: sessionId,
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      expires_at: expiresAt,
      ip_address: options?.ipAddress || null,
      device_info: options?.deviceInfo || null,
    });

    const authUser = await this.toAuthUser(user);

    // Access token (JWT with 15 minutes validity)
    const accessToken = signAccessToken({
      sub: user.id,
      sessionId,
      roles: authUser.roles,
      permissions: authUser.permissions,
      email: authUser.email,
      phone_e164: authUser.phone_e164,
      merchant_ids: authUser.merchant_ids,
      branch_ids: authUser.branch_ids,
      rider_id: authUser.rider_id,
      customer_id: authUser.customer_id,
    });

    return {
      user: authUser,
      accessToken,
      refreshToken: rawRefreshToken,
      session: {
        id: sessionId,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  /**
   * Token Refresh & One-Time Rotation (Section 13)
   */
  public async refreshToken(
    rawRefreshToken: string,
    options?: { ipAddress?: string; requestId?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    session: { id: string; expiresAt: string };
  }> {
    if (!rawRefreshToken) {
      throw new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Refresh token is required",
      );
    }

    const incomingHash = hashToken(rawRefreshToken);
    const session =
      await authRepository.findSessionByRefreshTokenHash(incomingHash);

    if (!session) {
      throw new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Invalid or expired session",
      );
    }

    if (session.revoked_at) {
      // Possible token replay attack! Revoke all sessions for this user (Section 13)
      await authRepository.revokeAllUserSessions(session.user_id);
      await authRepository.createAuditLog({
        actor_user_id: session.user_id,
        action: AuditAction.SESSION_REVOKED,
        resource_type: "SESSION",
        resource_id: session.id,
        reason:
          "Revoked refresh token reuse detected - all sessions terminated",
        request_id: options?.requestId,
      });
      throw new AppError(
        401,
        "SESSION_COMPROMISED",
        "Session was previously revoked. Please log in again.",
      );
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new AppError(
        401,
        "SESSION_EXPIRED",
        "Session has expired. Please log in again.",
      );
    }

    // Verify user is still active
    const user = await authRepository.findUserById(session.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError(
        403,
        "ACCOUNT_INACTIVE",
        "User account is suspended or no longer active",
      );
    }

    // Rotate refresh token
    const newRawRefreshToken = generateSecureToken(32);
    const newRefreshTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 30);

    await authRepository.rotateSessionToken(
      session.id,
      newRefreshTokenHash,
      newExpiresAt,
    );
    await authRepository.updateSessionLastUsed(session.id, options?.ipAddress);

    const authUser = await this.toAuthUser(user);
    const newAccessToken = signAccessToken({
      sub: user.id,
      sessionId: session.id,
      roles: authUser.roles,
      permissions: authUser.permissions,
      email: authUser.email,
      phone_e164: authUser.phone_e164,
      merchant_ids: authUser.merchant_ids,
      branch_ids: authUser.branch_ids,
      rider_id: authUser.rider_id,
      customer_id: authUser.customer_id,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      session: {
        id: session.id,
        expiresAt: newExpiresAt.toISOString(),
      },
    };
  }

  /**
   * Session Logout (Section 18)
   */
  public async logout(
    sessionId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await authRepository.revokeSession(sessionId);
    await authRepository.createAuditLog({
      actor_user_id: userId,
      action: AuditAction.LOGOUT,
      resource_type: "SESSION",
      resource_id: sessionId,
      request_id: requestId,
    });
  }

  /**
   * Revoke specific session (e.g. from user devices list)
   */
  public async revokeSession(
    targetSessionId: string,
    actorUserId: string,
    isAdmin = false,
    requestId?: string,
  ): Promise<void> {
    const session = await authRepository.findSessionById(targetSessionId);
    if (!session) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    if (!isAdmin && session.user_id !== actorUserId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Cannot revoke session belonging to another user",
      );
    }

    await authRepository.revokeSession(targetSessionId);
    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      action: AuditAction.SESSION_REVOKED,
      resource_type: "SESSION",
      resource_id: targetSessionId,
      request_id: requestId,
    });
  }

  /**
   * Revoke all sessions for a user
   */
  public async revokeAllSessions(
    userId: string,
    actorUserId: string,
    requestId?: string,
  ): Promise<void> {
    await authRepository.revokeAllUserSessions(userId);
    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      action: AuditAction.SESSION_REVOKED,
      resource_type: "USER_SESSIONS",
      resource_id: userId,
      request_id: requestId,
      metadata: { target_user_id: userId, all_sessions: true },
    });
  }

  /**
   * Request Password Reset (Section 31)
   */
  public async requestPasswordReset(
    identifier: string,
    requestId?: string,
  ): Promise<{ message: string }> {
    if (config.storage.mode === 'postgres') return requestDurableIdentity('RESET', identifier, requestId);
    requireSimulationMode();
    const user = await authRepository.findUserByIdentifier(identifier);
    // Generic message prevents user enumeration
    const genericResponse = {
      message:
        "If an account exists with this email or phone, password reset instructions have been sent.",
    };

    if (!user || user.status === UserStatus.DISABLED) {
      return genericResponse;
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour validity

    await authRepository.createPasswordResetToken({
      id: crypto.randomUUID(),
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    await authRepository.createAuditLog({
      actor_user_id: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      resource_type: "USER",
      resource_id: user.id,
      request_id: requestId,
      metadata: { identifier },
    });

    // In dev / sandbox, we attach simulated token in metadata for automated testing & E2E smoke tests
    return {
      ...genericResponse,
      ...(process.env.NODE_ENV !== "production" ? { dev_token: rawToken } : {}),
    } as any;
  }

  /**
   * Reset Password with Token (Section 32)
   */
  public async resetPassword(
    token: string,
    newPassword: string,
    requestId?: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(token);
    const record = await authRepository.findPasswordResetToken(tokenHash);

    if (
      !record ||
      record.used_at ||
      new Date(record.expires_at).getTime() < Date.now()
    ) {
      throw new AppError(
        400,
        "INVALID_RESET_TOKEN",
        "Password reset token is invalid, expired, or already used",
      );
    }

    const newHash = await hashPassword(newPassword);
    await authRepository.updateUserPassword(record.user_id, newHash);
    await authRepository.markPasswordResetTokenUsed(record.id);

    // Invalidate all active sessions for security
    await authRepository.revokeAllUserSessions(record.user_id);

    await authRepository.createAuditLog({
      actor_user_id: record.user_id,
      action: AuditAction.PASSWORD_CHANGED,
      resource_type: "USER",
      resource_id: record.user_id,
      request_id: requestId,
      reason: "Password reset completed via token",
    });

    return {
      message:
        "Password has been successfully reset. Please log in with your new password.",
    };
  }

  /**
   * Request Phone Verification OTP (Section 33 & 34)
   */
  public async requestOtp(
    phone_e164: string,
    purpose: string = "VERIFICATION",
    requestId?: string,
  ): Promise<{ message: string; dev_otp?: string }> {
    const normalized = normalizePhoneE164(phone_e164);
    if (config.storage.mode === 'postgres') {
      if (purpose !== 'VERIFICATION') throw new AppError(400, 'UNSUPPORTED_OTP_PURPOSE', 'Only phone verification is supported by this endpoint');
      return requestDurableIdentity('OTP', normalized, requestId);
    }
    const user = await authRepository.findUserByPhone(normalized);

    requireSimulationMode();
    // 6-digit OTP code
    const otpCode = "123456"; // Explicit fixture adapter only; durable delivery is not configured.
    const tokenHash = hashToken(otpCode);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes

    if (user) {
      await authRepository.createVerificationToken({
        id: crypto.randomUUID(),
        user_id: user.id,
        type: `PHONE_${purpose}`,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      await authRepository.createAuditLog({
        actor_user_id: user.id,
        action: AuditAction.OTP_REQUESTED,
        resource_type: "VERIFICATION",
        resource_id: user.id,
        request_id: requestId,
        metadata: { phone: normalized, purpose },
      });
    }

    return {
      message: "Verification code sent.",
      ...(process.env.NODE_ENV !== "production" ? { dev_otp: otpCode } : {}),
    };
  }

  /**
   * Confirm Phone Verification OTP (Section 34)
   */
  public async confirmOtp(
    phone_e164: string,
    code: string,
    requestId?: string,
  ): Promise<{ verified: boolean; message: string }> {
    const normalized = normalizePhoneE164(phone_e164);
    if (config.storage.mode === 'postgres') return confirmDurableOtp(normalized, code, requestId);
    const user = await authRepository.findUserByPhone(normalized);

    if (!user) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "No user found with this phone number",
      );
    }

    const token = await authRepository.getLatestVerificationToken(
      user.id,
      "PHONE_VERIFICATION",
    );
    if (
      !token ||
      token.verified_at ||
      new Date(token.expires_at).getTime() < Date.now()
    ) {
      throw new AppError(
        400,
        "INVALID_OTP",
        "Verification code is invalid or has expired",
      );
    }

    if (token.attempts >= 5) {
      throw new AppError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Too many failed verification attempts. Please request a new code.",
      );
    }

    await authRepository.incrementVerificationAttempt(token.id);
    const inputHash = hashToken(code);

    if (inputHash !== token.token_hash) {
      throw new AppError(400, "INVALID_OTP", "Incorrect verification code");
    }

    await authRepository.markVerificationTokenVerified(token.id);

    // Update user phone_verified_at
    const now = new Date().toISOString();
    user.phone_verified_at = now;

    await authRepository.createAuditLog({
      actor_user_id: user.id,
      action: AuditAction.OTP_VERIFIED,
      resource_type: "USER",
      resource_id: user.id,
      request_id: requestId,
      metadata: { phone: normalized },
    });

    return { verified: true, message: "Phone number verified successfully" };
  }

  /**
   * Load current user safe profile
   */
  public async getMe(userId: string): Promise<AuthUser> {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    }
    return this.toAuthUser(user);
  }
}

export const authService = transactionalService(new AuthService());
