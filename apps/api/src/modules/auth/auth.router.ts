import { enrollMfa, verifyMfa } from './mfa';
/**
 * DEETOO - Authentication Endpoints Router
 * Implements /api/v1/auth routes complying with DEE-API-001 & Sprint 2 specs
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@deetoo/types';
import {
  CustomerRegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  OtpRequestSchema,
  OtpConfirmSchema,
} from '@deetoo/validation';
import { AppError } from '../../middleware/error-handler';
import {
  applyAuthTransport,
  clearAuthTransport,
  getRefreshToken,
} from './auth.transport';
import { authService } from './auth.service';
import { authRepository } from './auth.repository';
import { requireAuth, AuthenticatedRequest } from './auth.middleware';
import {
  createAuthRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  otpRateLimiter,
  refreshRateLimiter,
} from './rate-limit.middleware';

export const authRouter = Router();

/**
 * 1. POST /api/v1/auth/register/customer
 * Customer self-service registration (Section 9)
 */
authRouter.post(
  '/register/customer',
  registerRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CustomerRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid registration parameters', parsed.error.format());
      }

      const result = await authService.registerCustomer({
        name: parsed.data.name,
        email: parsed.data.email,
        phone_e164: parsed.data.phone_e164,
        password: parsed.data.password,
        requestId: (req as any).requestId,
        ipAddress: req.ip,
        deviceInfo: req.headers['user-agent'],
      });

      const safeResult = applyAuthTransport(req, res, result);
      const response: ApiResponse<typeof safeResult> = {
        data: safeResult,
        requestId: (req as any).requestId,
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 2. POST /api/v1/auth/login
 * Universal login for Customer, Merchant, Rider, Admin & Staff (Section 10)
 */
authRouter.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid login parameters', parsed.error.format());
      }

      const result = await authService.login({
        identifier: parsed.data.identifier,
        password: parsed.data.password,
        deviceInfo: parsed.data.device_info || req.headers['user-agent'],
        deviceId: parsed.data.device_id,
        ipAddress: req.ip,
        requestId: (req as any).requestId,
      });

      const safeResult = applyAuthTransport(req, res, result);
      const response: ApiResponse<typeof safeResult> = {
        data: safeResult,
        requestId: (req as any).requestId,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. POST /api/v1/auth/refresh
 * Token refresh with rotation & replay detection (Section 13)
 */
authRouter.post(
  '/refresh',
  refreshRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawRefreshToken = getRefreshToken(req);
      if (!rawRefreshToken) {
        throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'No refresh token provided');
      }

      const result = await authService.refreshToken(rawRefreshToken, {
        ipAddress: req.ip,
        requestId: (req as any).requestId,
      });

      const safeResult = applyAuthTransport(req, res, result);
      const response: ApiResponse<typeof safeResult> = {
        data: safeResult,
        requestId: (req as any).requestId,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 4. GET /api/v1/auth/me
 * Retrieves active safe user identity & role/scope profile (Section 30)
 */
authRouter.get(
  '/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authUser = await authService.getMe(req.session!.user_id);
      const response: ApiResponse<typeof authUser> = {
        data: authUser,
        requestId: (req as any).requestId,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 5. POST /api/v1/auth/logout
 * Terminates active session (Section 18)
 */
authRouter.post(
  '/logout',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.session?.session_id) {
        await authService.logout(req.session.session_id, req.session.user_id, (req as any).requestId);
      }
      clearAuthTransport(res);
      res.json({
        data: { message: 'Successfully logged out' },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 6. GET /api/v1/auth/sessions
 * List active sessions for current user (Section 17)
 */
authRouter.get(
  '/sessions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sessions = await authRepository.listUserSessions(req.session!.user_id);
      const safeSessions = sessions.map((s) => ({
        id: s.id,
        current: s.id === req.session?.session_id,
        ip_address: s.ip_address,
        device_info: s.device_info,
        last_used_at: s.last_used_at,
        created_at: s.created_at,
        is_active: !s.revoked_at && new Date(s.expires_at).getTime() > Date.now(),
      }));

      res.json({
        data: safeSessions,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 7. POST /api/v1/auth/sessions/:id/revoke
 * Revoke specific session (Section 17)
 */
authRouter.post(
  '/sessions/:id/revoke',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetSessionId = req.params.id;
      await authService.revokeSession(
        targetSessionId,
        req.session!.user_id,
        false,
        (req as any).requestId
      );
      res.json({
        data: { message: 'Session successfully revoked' },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 8. POST /api/v1/auth/sessions/revoke-all
 * Revoke all sessions for current user (Section 17)
 */
authRouter.post(
  '/sessions/revoke-all',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await authService.revokeAllSessions(
        req.session!.user_id,
        req.session!.user_id,
        (req as any).requestId
      );
      clearAuthTransport(res);
      res.json({
        data: { message: 'All active sessions have been terminated' },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 9. POST /api/v1/auth/password/forgot
 * Request password reset token (Section 31)
 */
authRouter.post(
  '/password/forgot',
  passwordResetRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ForgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid identifier', parsed.error.format());
      }

      const result = await authService.requestPasswordReset(parsed.data.identifier, (req as any).requestId);
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 10. POST /api/v1/auth/password/reset
 * Confirm password reset with token (Section 32)
 */
authRouter.post(
  '/password/reset',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid password reset input', parsed.error.format());
      }

      const result = await authService.resetPassword(
        parsed.data.token,
        parsed.data.new_password,
        (req as any).requestId
      );
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 11. POST /api/v1/auth/verify/otp-request
 * Request phone verification OTP (Section 33)
 */
authRouter.post(
  '/verify/otp-request',
  otpRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = OtpRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid phone number', parsed.error.format());
      }

      const result = await authService.requestOtp(
        parsed.data.phone_e164,
        parsed.data.purpose,
        (req as any).requestId
      );
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 12. POST /api/v1/auth/verify/otp-confirm
 * Confirm phone verification OTP (Section 34)
 */
authRouter.post(
  '/verify/otp-confirm',
  otpRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = OtpConfirmSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid verification parameters', parsed.error.format());
      }

      const result = await authService.confirmOtp(
        parsed.data.phone_e164,
        parsed.data.code,
        (req as any).requestId
      );
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);


const mfaRateLimiter=createAuthRateLimiter({keyPrefix:'auth:mfa',windowMs:60000,max:30});
authRouter.post('/mfa/enroll', requireAuth, mfaRateLimiter, async (req: AuthenticatedRequest, res, next) => {
  try { res.setHeader('Cache-Control','no-store'); res.json(await enrollMfa(req.user!.id,req.body.password)); } catch(error) { next(error); }
});
authRouter.post('/mfa/verify', requireAuth, mfaRateLimiter, async (req: AuthenticatedRequest, res, next) => {
  try { res.json(await verifyMfa(req.user!.id,req.session!.session_id,req.body.code)); } catch(error) { next(error); }
});
