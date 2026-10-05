import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { mediaRepository, MediaObjectRecord } from './media.repository';

const CONTENT_TYPES: Record<string, string[]> = {
  DELIVERY_PROOF: ['image/jpeg', 'image/png', 'image/webp'],
  DELIVERY_INCIDENT: ['image/jpeg', 'image/png', 'image/webp'],
  RIDER_DOCUMENT: ['image/jpeg', 'image/png', 'application/pdf'],
  MERCHANT_IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORT_ATTACHMENT: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function storageConfig() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET || '';
  const region = process.env.OBJECT_STORAGE_REGION || '';
  if (!bucket || !region) {
    throw new AppError(
      503,
      'PRIVATE_STORAGE_UNCONFIGURED',
      'Private object storage is not configured',
    );
  }
  return {
    bucket,
    region,
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || undefined,
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    maxBytes: Number(process.env.OBJECT_STORAGE_MAX_UPLOAD_BYTES || DEFAULT_MAX_BYTES),
  };
}

class MediaService {
  private s3: S3Client | null = null;

  private client(): S3Client {
    const cfg = storageConfig();
    if (!this.s3) {
      this.s3 = new S3Client({
        region: cfg.region,
        endpoint: cfg.endpoint,
        forcePathStyle: cfg.forcePathStyle,
        credentials:
          cfg.accessKeyId && cfg.secretAccessKey
            ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
            : undefined,
      });
    }
    return this.s3;
  }

  private validatePurposeAndType(purpose: string, contentType: string): void {
    const allowed = CONTENT_TYPES[purpose];
    if (!allowed) {
      throw new AppError(400, 'MEDIA_PURPOSE_INVALID', 'Unsupported private media purpose');
    }
    if (!allowed.includes(contentType)) {
      throw new AppError(
        400,
        'MEDIA_CONTENT_TYPE_INVALID',
        `Content type ${contentType} is not permitted for ${purpose}`,
      );
    }
  }

  async createUpload(input: {
    ownerUserId: string;
    purpose: string;
    contentType: string;
    referenceType?: string;
    referenceId?: string;
  }): Promise<{
    media: MediaObjectRecord;
    uploadUrl: string;
    uploadHeaders: Record<string, string>;
    expiresInSeconds: number;
  }> {
    const purpose = input.purpose.toUpperCase();
    const contentType = input.contentType.toLowerCase();
    this.validatePurposeAndType(purpose, contentType);

    const id = randomUUID();
    const objectKey = `private/${purpose.toLowerCase()}/${input.ownerUserId}/${id}`;
    const now = new Date().toISOString();

    if (config.storage.mode === 'memory') {
      const media = await mediaRepository.create({
        id,
        owner_user_id: input.ownerUserId,
        purpose,
        reference_type: input.referenceType || null,
        reference_id: input.referenceId || null,
        bucket: 'memory-private',
        object_key: objectKey,
        content_type: contentType,
        byte_size: null,
        status: 'REQUESTED',
        created_at: now,
        updated_at: now,
      });
      return {
        media,
        uploadUrl: `memory://media/${id}`,
        uploadHeaders: { 'content-type': contentType },
        expiresInSeconds: 600,
      };
    }

    const cfg = storageConfig();
    const media = await mediaRepository.create({
      id,
      owner_user_id: input.ownerUserId,
      purpose,
      reference_type: input.referenceType || null,
      reference_id: input.referenceId || null,
      bucket: cfg.bucket,
      object_key: objectKey,
      content_type: contentType,
      byte_size: null,
      status: 'REQUESTED',
      created_at: now,
      updated_at: now,
    });

    const command = new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      ContentType: contentType,
      Metadata: {
        owner: input.ownerUserId,
        purpose,
        reference: input.referenceId || '',
      },
    });
    const uploadUrl = await getSignedUrl(this.client(), command, { expiresIn: 600 });
    return {
      media,
      uploadUrl,
      uploadHeaders: { 'content-type': contentType },
      expiresInSeconds: 600,
    };
  }

  async completeUpload(mediaId: string, ownerUserId: string): Promise<MediaObjectRecord> {
    const media = await mediaRepository.findById(mediaId);
    if (!media || media.owner_user_id !== ownerUserId) {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Private media object not found');
    }
    if (media.status === 'VERIFIED') return media;

    if (config.storage.mode === 'memory') {
      return mediaRepository.markVerified(media.id, { byteSize: 1 });
    }

    const cfg = storageConfig();
    const head = await this.client().send(
      new HeadObjectCommand({ Bucket: media.bucket, Key: media.object_key }),
    );
    const byteSize = Number(head.ContentLength || 0);
    if (!byteSize || byteSize > cfg.maxBytes) {
      throw new AppError(400, 'MEDIA_SIZE_INVALID', 'Uploaded private media has an invalid size');
    }
    if (head.ContentType && head.ContentType.toLowerCase() !== media.content_type.toLowerCase()) {
      throw new AppError(400, 'MEDIA_CONTENT_TYPE_MISMATCH', 'Uploaded media type does not match the signed request');
    }
    return mediaRepository.markVerified(media.id, {
      byteSize,
      etag: head.ETag?.replaceAll('"', ''),
    });
  }

  async assertVerifiedOwnedMedia(
    mediaId: string,
    ownerUserId: string,
    purpose: string,
    referenceId?: string,
  ): Promise<MediaObjectRecord> {
    const media = await mediaRepository.findById(mediaId);
    if (!media || media.owner_user_id !== ownerUserId) {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Private media object not found');
    }
    if (media.status !== 'VERIFIED') {
      throw new AppError(409, 'MEDIA_NOT_VERIFIED', 'Private media upload has not been verified');
    }
    if (media.purpose !== purpose.toUpperCase()) {
      throw new AppError(409, 'MEDIA_PURPOSE_MISMATCH', 'Private media is not valid for this purpose');
    }
    if (referenceId && media.reference_id !== referenceId) {
      throw new AppError(409, 'MEDIA_REFERENCE_MISMATCH', 'Private media is bound to another resource');
    }
    return media;
  }

  async getReadUrl(mediaId: string, requestingUserId: string, privileged = false): Promise<string> {
    const media = await mediaRepository.findById(mediaId);
    if (!media || media.status !== 'VERIFIED') {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Private media object not found');
    }
    if (!privileged && media.owner_user_id !== requestingUserId) {
      throw new AppError(403, 'MEDIA_FORBIDDEN', 'You cannot access this private media');
    }
    if (config.storage.mode === 'memory') return `memory://media/${media.id}`;

    return getSignedUrl(
      this.client(),
      new GetObjectCommand({ Bucket: media.bucket, Key: media.object_key }),
      { expiresIn: 300 },
    );
  }
}

export const mediaService = new MediaService();
