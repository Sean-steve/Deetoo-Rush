import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireAuth } from '../auth/auth.middleware';
import { AppError } from '../../middleware/error-handler';
import { mediaService } from './media.service';
import { deliveryRepository } from '../order/delivery.repository';
import { riderRepository } from '../rider/rider.repository';
import { DeliveryStatus } from '@deetoo/types';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

function roles(req: AuthenticatedRequest): Set<string> {
  return new Set((req.user?.roles || []).map((role: any) => String(role).toLowerCase()));
}

async function assertPurposeScope(
  req: AuthenticatedRequest,
  purpose: string,
  referenceId?: string,
): Promise<void> {
  const normalized = purpose.toUpperCase();
  if (normalized === 'DELIVERY_PROOF') {
    if (!referenceId) {
      throw new AppError(400, 'MEDIA_REFERENCE_REQUIRED', 'Delivery proof requires a delivery reference');
    }
    const rider = await riderRepository.findProfileByUserId(req.user!.id);
    const delivery = await deliveryRepository.findById(referenceId);
    if (!rider || !delivery || delivery.assigned_rider_id !== rider.id) {
      throw new AppError(403, 'MEDIA_DELIVERY_FORBIDDEN', 'Delivery proof can only be uploaded by the assigned rider');
    }
    if (
      ![
        DeliveryStatus.EN_ROUTE,
        DeliveryStatus.ARRIVED_DROPOFF,
      ].includes(delivery.status)
    ) {
      throw new AppError(
        409,
        'MEDIA_DELIVERY_STATE_INVALID',
        'Delivery proof media can only be prepared after pickup while delivering to the customer',
      );
    }
    return;
  }

  if (normalized === 'RIDER_DOCUMENT' && !roles(req).has('rider')) {
    throw new AppError(403, 'MEDIA_PURPOSE_FORBIDDEN', 'Only riders can upload rider documents');
  }
  if (normalized === 'MERCHANT_IMAGE') {
    const r = roles(req);
    if (!r.has('merchant_owner') && !r.has('merchant_manager') && !r.has('admin')) {
      throw new AppError(403, 'MEDIA_PURPOSE_FORBIDDEN', 'Merchant image upload requires merchant management access');
    }
  }
}

mediaRouter.post(
  '/uploads',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const purpose = String(req.body?.purpose || '').trim().toUpperCase();
      const contentType = String(req.body?.content_type || '').trim().toLowerCase();
      const referenceType = req.body?.reference_type
        ? String(req.body.reference_type).slice(0, 50)
        : undefined;
      const referenceId = req.body?.reference_id
        ? String(req.body.reference_id)
        : undefined;

      if (!purpose || !contentType) {
        throw new AppError(400, 'MEDIA_UPLOAD_INVALID', 'purpose and content_type are required');
      }
      await assertPurposeScope(req, purpose, referenceId);

      const result = await mediaService.createUpload({
        ownerUserId: req.user!.id,
        purpose,
        contentType,
        referenceType,
        referenceId,
      });
      res.status(201).json({
        data: {
          media_id: result.media.id,
          status: result.media.status,
          upload_url: result.uploadUrl,
          upload_headers: result.uploadHeaders,
          expires_in_seconds: result.expiresInSeconds,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

mediaRouter.post(
  '/uploads/:id/complete',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const media = await mediaService.completeUpload(req.params.id, req.user!.id);
      res.json({
        data: {
          media_id: media.id,
          status: media.status,
          byte_size: media.byte_size,
          verified_at: media.verified_at,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

mediaRouter.get(
  '/:id/read-url',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const r = roles(req);
      const privileged = r.has('admin') || r.has('ops') || r.has('support');
      const readUrl = await mediaService.getReadUrl(req.params.id, req.user!.id, privileged);
      res.json({
        data: { url: readUrl, expires_in_seconds: 300 },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);
