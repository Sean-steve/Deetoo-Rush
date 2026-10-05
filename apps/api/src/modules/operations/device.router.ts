import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireAuth } from '../auth/auth.middleware';
import { AppError } from '../../middleware/error-handler';
import {
  DeviceRecipientType,
  deviceRegistrationRepository,
} from './device-registration.repository';

export const deviceRouter = Router();
deviceRouter.use(requireAuth);

function compatibleRecipientType(req: AuthenticatedRequest, requested?: string): DeviceRecipientType {
  const roles = new Set((req.user?.roles || []).map((role: any) => String(role).toLowerCase()));
  const allowed: DeviceRecipientType[] = [];
  if (roles.has('rider')) allowed.push('RIDER');
  if (roles.has('customer')) allowed.push('CUSTOMER');
  if (
    roles.has('merchant_owner') ||
    roles.has('merchant_manager') ||
    roles.has('merchant_staff')
  ) allowed.push('MERCHANT');
  if (roles.has('admin') || roles.has('ops') || roles.has('support') || roles.has('finance')) {
    allowed.push('ADMIN');
  }

  if (!allowed.length) {
    throw new AppError(403, 'DEVICE_REGISTRATION_ROLE_FORBIDDEN', 'This account cannot register an application device');
  }

  if (requested) {
    const normalized = requested.toUpperCase() as DeviceRecipientType;
    if (!allowed.includes(normalized)) {
      throw new AppError(403, 'DEVICE_REGISTRATION_ROLE_FORBIDDEN', 'Device recipient type is not permitted for this account');
    }
    return normalized;
  }
  return allowed[0];
}

deviceRouter.post(
  '/register',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pushToken = String(req.body?.push_token || '').trim();
      const platform = String(req.body?.platform || '').toUpperCase();
      if (pushToken.length < 20 || pushToken.length > 4096) {
        throw new AppError(400, 'INVALID_PUSH_TOKEN', 'A valid native push token is required');
      }
      if (!['ANDROID', 'IOS', 'WEB'].includes(platform)) {
        throw new AppError(400, 'INVALID_DEVICE_PLATFORM', 'Unsupported device platform');
      }

      const registration = await deviceRegistrationRepository.upsert({
        userId: req.user!.id,
        recipientType: compatibleRecipientType(req, req.body?.recipient_type),
        platform: platform as any,
        pushToken,
        deviceId: req.body?.device_id ? String(req.body.device_id).slice(0, 160) : undefined,
        appVersion: req.body?.app_version ? String(req.body.app_version).slice(0, 80) : undefined,
      });

      res.status(201).json({
        data: {
          id: registration.id,
          recipient_type: registration.recipient_type,
          platform: registration.platform,
          active: registration.active,
          last_seen_at: registration.last_seen_at,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

deviceRouter.post(
  '/unregister',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pushToken = String(req.body?.push_token || '').trim();
      if (!pushToken) {
        throw new AppError(400, 'INVALID_PUSH_TOKEN', 'Push token is required');
      }
      await deviceRegistrationRepository.deactivate(req.user!.id, pushToken);
      res.json({ data: { unregistered: true }, requestId: (req as any).requestId });
    } catch (err) {
      next(err);
    }
  },
);
