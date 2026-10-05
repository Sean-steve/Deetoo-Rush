import { randomUUID } from 'node:crypto';
import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { allowMemoryAdapter } from '../../db/storage-policy';

export type PayoutOwnerType = 'MERCHANT' | 'RIDER';
export type PayoutMethod = 'MPESA_B2C' | 'BANK_GATEWAY';
export type DisbursementResourceType = 'SETTLEMENT' | 'PAYOUT';
export type DisbursementStatus = 'CREATED' | 'SUBMITTED' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';

export interface PayoutDestination {
  id: string;
  owner_type: PayoutOwnerType;
  owner_id: string;
  method: PayoutMethod;
  provider: string;
  provider_beneficiary_ciphertext: string;
  masked_destination: string;
  currency: string;
  active: boolean;
  verified_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisbursementAttempt {
  id: string;
  resource_type: DisbursementResourceType;
  resource_id: string;
  destination_id: string;
  provider: string;
  amount_minor: number;
  currency: string;
  status: DisbursementStatus;
  idempotency_key: string;
  provider_request_id?: string | null;
  provider_reference?: string | null;
  failure_code?: string | null;
  failure_reason?: string | null;
  callback_payload_hash?: string | null;
  callback_received_at?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  initiated_by?: string | null;
  created_at: string;
  updated_at: string;
}

class DisbursementRepository {
  private destinations = new Map<string, PayoutDestination>();
  private attempts = new Map<string, DisbursementAttempt>();

  async createDestination(input: Omit<PayoutDestination, 'id' | 'created_at' | 'updated_at'>): Promise<PayoutDestination> {
    const now = new Date().toISOString();
    const record: PayoutDestination = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `INSERT INTO payout_destinations (
          id, owner_type, owner_id, method, provider, provider_beneficiary_ciphertext,
          masked_destination, currency, active, verified_at, created_by, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (owner_type, owner_id, method) WHERE active = TRUE
        DO UPDATE SET provider=EXCLUDED.provider,
          provider_beneficiary_ciphertext=EXCLUDED.provider_beneficiary_ciphertext,
          masked_destination=EXCLUDED.masked_destination,
          currency=EXCLUDED.currency,
          verified_at=EXCLUDED.verified_at,
          created_by=EXCLUDED.created_by,
          updated_at=NOW()
        RETURNING *`,
        [record.id, record.owner_type, record.owner_id, record.method, record.provider,
          record.provider_beneficiary_ciphertext, record.masked_destination, record.currency,
          record.active, record.verified_at || null, record.created_by || null, record.created_at, record.updated_at],
      );
      return this.mapDestination(res.rows[0]);
    }
    allowMemoryAdapter();
    for (const [id, existing] of this.destinations) {
      if (existing.owner_type === record.owner_type && existing.owner_id === record.owner_id &&
          existing.method === record.method && existing.active) {
        this.destinations.set(id, { ...existing, ...record, id, created_at: existing.created_at });
        return this.destinations.get(id)!;
      }
    }
    this.destinations.set(record.id, record);
    return record;
  }

  async getDestination(id: string): Promise<PayoutDestination | null> {
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query('SELECT * FROM payout_destinations WHERE id=$1', [id]);
      return res.rows[0] ? this.mapDestination(res.rows[0]) : null;
    }
    allowMemoryAdapter();
    return this.destinations.get(id) || null;
  }

  async findActiveDestination(ownerType: PayoutOwnerType, ownerId: string, destinationId?: string): Promise<PayoutDestination | null> {
    if (destinationId) {
      const found = await this.getDestination(destinationId);
      return found && found.active && found.owner_type === ownerType && found.owner_id === ownerId ? found : null;
    }
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `SELECT * FROM payout_destinations WHERE owner_type=$1 AND owner_id=$2 AND active=true
         ORDER BY verified_at DESC NULLS LAST, updated_at DESC LIMIT 1`,
        [ownerType, ownerId],
      );
      return res.rows[0] ? this.mapDestination(res.rows[0]) : null;
    }
    allowMemoryAdapter();
    return Array.from(this.destinations.values()).find(
      (d) => d.owner_type === ownerType && d.owner_id === ownerId && d.active,
    ) || null;
  }

  async createAttempt(input: Omit<DisbursementAttempt, 'id' | 'created_at' | 'updated_at'>): Promise<DisbursementAttempt> {
    const now = new Date().toISOString();
    const record: DisbursementAttempt = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `INSERT INTO disbursement_attempts (
          id,resource_type,resource_id,destination_id,provider,amount_minor,currency,status,
          idempotency_key,provider_request_id,provider_reference,failure_code,failure_reason,
          callback_payload_hash,callback_received_at,submitted_at,completed_at,initiated_by,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (idempotency_key) DO UPDATE SET updated_at=disbursement_attempts.updated_at
        RETURNING *`,
        [record.id,record.resource_type,record.resource_id,record.destination_id,record.provider,
          record.amount_minor,record.currency,record.status,record.idempotency_key,
          record.provider_request_id||null,record.provider_reference||null,record.failure_code||null,
          record.failure_reason||null,record.callback_payload_hash||null,record.callback_received_at||null,
          record.submitted_at||null,record.completed_at||null,record.initiated_by||null,record.created_at,record.updated_at],
      );
      return this.mapAttempt(res.rows[0]);
    }
    allowMemoryAdapter();
    const existing = Array.from(this.attempts.values()).find((a) => a.idempotency_key === record.idempotency_key);
    if (existing) return existing;
    this.attempts.set(record.id, record);
    return record;
  }

  async updateAttempt(id: string, updates: Partial<DisbursementAttempt>): Promise<DisbursementAttempt> {
    const existing = await this.getAttempt(id);
    if (!existing) throw new Error('Disbursement attempt not found');
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `UPDATE disbursement_attempts SET status=$2,provider_request_id=$3,provider_reference=$4,
          failure_code=$5,failure_reason=$6,callback_payload_hash=$7,callback_received_at=$8,
          submitted_at=$9,completed_at=$10,updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id,updated.status,updated.provider_request_id||null,updated.provider_reference||null,
          updated.failure_code||null,updated.failure_reason||null,updated.callback_payload_hash||null,
          updated.callback_received_at||null,updated.submitted_at||null,updated.completed_at||null],
      );
      return this.mapAttempt(res.rows[0]);
    }
    allowMemoryAdapter();
    this.attempts.set(id, updated);
    return updated;
  }

  async getAttempt(id: string): Promise<DisbursementAttempt | null> {
    if (config.storage.mode === 'postgres') {
      const res=await getDbPool().query('SELECT * FROM disbursement_attempts WHERE id=$1',[id]);
      return res.rows[0] ? this.mapAttempt(res.rows[0]) : null;
    }
    allowMemoryAdapter();
    return this.attempts.get(id) || null;
  }

  async findAttemptByProviderRequest(provider: string, requestId: string): Promise<DisbursementAttempt | null> {
    if (config.storage.mode === 'postgres') {
      const res=await getDbPool().query(
        'SELECT * FROM disbursement_attempts WHERE provider=$1 AND provider_request_id=$2 ORDER BY created_at DESC LIMIT 1',
        [provider,requestId],
      );
      return res.rows[0] ? this.mapAttempt(res.rows[0]) : null;
    }
    allowMemoryAdapter();
    return Array.from(this.attempts.values()).find(
      (a) => a.provider===provider && a.provider_request_id===requestId,
    ) || null;
  }

  async listAttempts(filter: {resourceType?: DisbursementResourceType; resourceId?: string; status?: DisbursementStatus; limit?: number}={}): Promise<DisbursementAttempt[]> {
    if (config.storage.mode === 'postgres') {
      const params:any[]=[]; let where='1=1';
      if(filter.resourceType){params.push(filter.resourceType);where+=` AND resource_type=$${params.length}`;}
      if(filter.resourceId){params.push(filter.resourceId);where+=` AND resource_id=$${params.length}`;}
      if(filter.status){params.push(filter.status);where+=` AND status=$${params.length}`;}
      params.push(Math.min(filter.limit||100,500));
      const res=await getDbPool().query(`SELECT * FROM disbursement_attempts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,params);
      return res.rows.map((row:any)=>this.mapAttempt(row));
    }
    allowMemoryAdapter();
    return Array.from(this.attempts.values()).filter(a =>
      (!filter.resourceType||a.resource_type===filter.resourceType) &&
      (!filter.resourceId||a.resource_id===filter.resourceId) &&
      (!filter.status||a.status===filter.status)
    ).slice(0,filter.limit||100);
  }

  private mapDestination(row:any):PayoutDestination {
    return {...row,active:Boolean(row.active),
      verified_at:row.verified_at?new Date(row.verified_at).toISOString():null,
      created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()};
  }
  private mapAttempt(row:any):DisbursementAttempt {
    return {...row,amount_minor:Number(row.amount_minor),
      callback_received_at:row.callback_received_at?new Date(row.callback_received_at).toISOString():null,
      submitted_at:row.submitted_at?new Date(row.submitted_at).toISOString():null,
      completed_at:row.completed_at?new Date(row.completed_at).toISOString():null,
      created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()};
  }
}

export const disbursementRepository = new DisbursementRepository();
