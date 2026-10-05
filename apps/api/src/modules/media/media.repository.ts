import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { allowMemoryAdapter } from '../../db/storage-policy';

export type MediaStatus = 'REQUESTED' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';
export interface MediaObjectRecord {
  id: string;
  owner_user_id: string;
  purpose: string;
  reference_type?: string | null;
  reference_id?: string | null;
  bucket: string;
  object_key: string;
  content_type: string;
  byte_size?: number | null;
  status: MediaStatus;
  provider_etag?: string | null;
  created_at: string;
  verified_at?: string | null;
  updated_at: string;
}

class MediaRepository {
  private memory = new Map<string, MediaObjectRecord>();

  async create(record: MediaObjectRecord): Promise<MediaObjectRecord> {
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `INSERT INTO media_objects (
          id, owner_user_id, purpose, reference_type, reference_id, bucket,
          object_key, content_type, byte_size, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          record.id,
          record.owner_user_id,
          record.purpose,
          record.reference_type || null,
          record.reference_id || null,
          record.bucket,
          record.object_key,
          record.content_type,
          record.byte_size || null,
          record.status,
          record.created_at,
          record.updated_at,
        ],
      );
      return this.map(res.rows[0]);
    }
    allowMemoryAdapter();
    this.memory.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<MediaObjectRecord | null> {
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query('SELECT * FROM media_objects WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.map(res.rows[0]) : null;
    }
    allowMemoryAdapter();
    return this.memory.get(id) || null;
  }

  async markVerified(id: string, input: { byteSize: number; etag?: string }): Promise<MediaObjectRecord> {
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `UPDATE media_objects
         SET status = 'VERIFIED', byte_size = $2, provider_etag = $3,
             verified_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, input.byteSize, input.etag || null],
      );
      if (!res.rows[0]) throw new Error('Media object not found');
      return this.map(res.rows[0]);
    }
    allowMemoryAdapter();
    const current = this.memory.get(id);
    if (!current) throw new Error('Media object not found');
    const updated: MediaObjectRecord = {
      ...current,
      status: 'VERIFIED',
      byte_size: input.byteSize,
      provider_etag: input.etag || null,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.memory.set(id, updated);
    return updated;
  }

  private map(row: any): MediaObjectRecord {
    return {
      id: row.id,
      owner_user_id: row.owner_user_id,
      purpose: row.purpose,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      bucket: row.bucket,
      object_key: row.object_key,
      content_type: row.content_type,
      byte_size: row.byte_size == null ? null : Number(row.byte_size),
      status: row.status,
      provider_etag: row.provider_etag,
      created_at: new Date(row.created_at).toISOString(),
      verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}

export const mediaRepository = new MediaRepository();
