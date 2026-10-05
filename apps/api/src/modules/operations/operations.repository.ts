import { randomUUID as durableEntityId } from 'node:crypto';
import { config } from '@deetoo/config';
import { allowMemoryAdapter } from '../../db/storage-policy';
/**
 * DEETOO - Operations & Support Repository
 * Sprint 13: Dual-layer persistence (PostgreSQL with resilient in-memory fallback)
 * Manages Operational Incidents, Support Cases, Notes, Notifications, Dead-Letter Jobs,
 * Fraud/Risk Signals, and Operational Kill Switches.
 */

import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';
import {
  OperationalIncident,
  IncidentTimelineEntry,
  IncidentTimelineAction,
  IncidentStatus,
  IncidentSeverity,
  SupportCase,
  SupportCaseNote,
  SupportCaseStatus,
  SupportCasePriority,
  NotificationRecord,
  NotificationStatus,
  DeadLetterJob,
  RiskSignal,
  RiskSignalStatus,
  OperationalKillSwitches,
} from '@deetoo/types';

const pool = {
  query: (...args: any[]) => (getDbPool() as any).query(...args),
  connect: () => getDbPool().connect(),
};

function generateCaseNumber(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SUP-${rand}`;
}

export class OperationsRepository {
  // In-Memory Fallback Stores
  public incidents: Map<string, OperationalIncident> = new Map();
  public incidentTimeline: Map<string, IncidentTimelineEntry[]> = new Map(); // incident_id -> entries
  public supportCases: Map<string, SupportCase> = new Map();
  public supportCaseNotes: Map<string, SupportCaseNote[]> = new Map(); // case_id -> notes
  public notifications: Map<string, NotificationRecord> = new Map();
  public deadLetterJobs: Map<string, DeadLetterJob> = new Map();
  public riskSignals: Map<string, RiskSignal> = new Map();
  public killSwitches: Map<string, { enabled: boolean; description?: string; updatedBy?: string; updatedAt: string }> = new Map();

  constructor() {
    this.seedDefaultKillSwitches();
  }

  private seedDefaultKillSwitches(): void {
    if (!config.storage.fixtures) return;
    this.killSwitches.set('auto_dispatch_paused', {
      enabled: false,
      description: 'Pause automated dispatch engine assignments',
      updatedAt: new Date().toISOString(),
    });
    this.killSwitches.set('zone_paused_all', {
      enabled: false,
      description: 'Global pause on accepting new orders in all zones',
      updatedAt: new Date().toISOString(),
    });
    this.killSwitches.set('payment_mpesa_paused', {
      enabled: false,
      description: 'Pause initiating new M-PESA STK pushes',
      updatedAt: new Date().toISOString(),
    });
    this.killSwitches.set('live_tracking_paused', {
      enabled: false,
      description: 'Fallback live GPS tracking to static delivery status',
      updatedAt: new Date().toISOString(),
    });
  }

  public clearInMemory(): void {
    this.incidents.clear();
    this.incidentTimeline.clear();
    this.supportCases.clear();
    this.supportCaseNotes.clear();
    this.notifications.clear();
    this.deadLetterJobs.clear();
    this.riskSignals.clear();
    this.killSwitches.clear();
    this.seedDefaultKillSwitches();
  }

  // ============================================================================
  // 1. Operational Incidents & Deduplication
  // ============================================================================

  /**
   * Find an active incident by type and target entity for deduplication
   */
  public async findActiveIncidentByEntity(
    type: string,
    entityRef: {
      order_id?: string | null;
      delivery_id?: string | null;
      payment_id?: string | null;
      merchant_id?: string | null;
      rider_id?: string | null;
    }
  ): Promise<OperationalIncident | null> {
    const activeStatuses: IncidentStatus[] = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'];
    try {
      let query = `
        SELECT * FROM operational_incidents 
        WHERE type = $1 AND status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')
      `;
      const params: any[] = [type];
      let paramIdx = 2;

      if (entityRef.order_id) {
        query += ` AND order_id = $${paramIdx++}`;
        params.push(entityRef.order_id);
      } else if (entityRef.delivery_id) {
        query += ` AND delivery_id = $${paramIdx++}`;
        params.push(entityRef.delivery_id);
      } else if (entityRef.payment_id) {
        query += ` AND payment_id = $${paramIdx++}`;
        params.push(entityRef.payment_id);
      } else if (entityRef.merchant_id) {
        query += ` AND merchant_id = $${paramIdx++}`;
        params.push(entityRef.merchant_id);
      } else if (entityRef.rider_id) {
        query += ` AND rider_id = $${paramIdx++}`;
        params.push(entityRef.rider_id);
      }

      query += ` ORDER BY created_at DESC LIMIT 1`;
      const res = await pool.query(query, params);
      if (res.rows && res.rows.length > 0) {
        return this.mapIncident(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback to in-memory
    }

    for (const inc of config.storage.mode === "memory" ? this.incidents.values() : []) {
      if (inc.type === type && activeStatuses.includes(inc.status)) {
        if (entityRef.order_id && inc.order_id === entityRef.order_id) return inc;
        if (entityRef.delivery_id && inc.delivery_id === entityRef.delivery_id) return inc;
        if (entityRef.payment_id && inc.payment_id === entityRef.payment_id) return inc;
        if (entityRef.merchant_id && inc.merchant_id === entityRef.merchant_id) return inc;
        if (entityRef.rider_id && inc.rider_id === entityRef.rider_id) return inc;
      }
    }
    return null;
  }

  public async createIncident(data: Omit<OperationalIncident, 'created_at' | 'updated_at'>): Promise<OperationalIncident> {
    const now = new Date().toISOString();
    const incident: OperationalIncident = {
      ...data,
      status: data.status || 'OPEN',
      created_at: now,
      updated_at: now,
    };

    try {
      await pool.query(
        `INSERT INTO operational_incidents (
          id, type, severity, status, order_id, delivery_id, payment_id, refund_id,
          merchant_id, rider_id, customer_id, reason_code, summary, details, metadata,
          assigned_to_user_id, assigned_to_name, detected_at, acknowledged_at, resolved_at,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          incident.id,
          incident.type,
          incident.severity,
          incident.status,
          incident.order_id || null,
          incident.delivery_id || null,
          incident.payment_id || null,
          incident.refund_id || null,
          incident.merchant_id || null,
          incident.rider_id || null,
          incident.customer_id || null,
          incident.reason_code,
          incident.summary,
          incident.details || null,
          JSON.stringify(incident.metadata || {}),
          incident.assigned_to_user_id || null,
          incident.assigned_to_name || null,
          incident.detected_at,
          incident.acknowledged_at || null,
          incident.resolved_at || null,
          incident.created_at,
          incident.updated_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // In-memory fallback
    }

    this.incidents.set(incident.id, incident);

    // Add initial timeline entry
    await this.addIncidentTimeline({
      id: durableEntityId(),
      incident_id: incident.id,
      action: 'CREATED',
      actor_name: 'SYSTEM',
      note: `Incident detected: ${incident.summary}`,
      metadata: incident.metadata,
      created_at: now,
    });

    return incident;
  }

  public async getIncidentById(id: string): Promise<OperationalIncident | null> {
    try {
      const res = await pool.query(`SELECT * FROM operational_incidents WHERE id = $1`, [id]);
      if (res.rows && res.rows.length > 0) {
        const inc = this.mapIncident(res.rows[0]);
        inc.timeline = await this.getIncidentTimeline(id);
        return inc;
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    const inc = config.storage.mode === "memory" ? this.incidents.get(id) : undefined;
    if (!inc) return null;
    return {
      ...inc,
      timeline: await this.getIncidentTimeline(id),
    };
  }

  public async findIncidents(filter: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    type?: string;
    order_id?: string;
    delivery_id?: string;
    payment_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ incidents: OperationalIncident[]; total: number }> {
    try {
      let query = `SELECT * FROM operational_incidents WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (filter.status) {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
      if (filter.severity) {
        query += ` AND severity = $${idx++}`;
        params.push(filter.severity);
      }
      if (filter.type) {
        query += ` AND type = $${idx++}`;
        params.push(filter.type);
      }
      if (filter.order_id) {
        query += ` AND order_id = $${idx++}`;
        params.push(filter.order_id);
      }
      if (filter.delivery_id) {
        query += ` AND delivery_id = $${idx++}`;
        params.push(filter.delivery_id);
      }
      if (filter.payment_id) {
        query += ` AND payment_id = $${idx++}`;
        params.push(filter.payment_id);
      }

      query += ` ORDER BY created_at DESC`;
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const res = await pool.query(query, params);
      const total = res.rows.length;
      return {
        incidents: res.rows.map((r: any) => this.mapIncident(r)),
        total,
      };
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    let items = Array.from(this.incidents.values());
    if (filter.status) items = items.filter((i) => i.status === filter.status);
    if (filter.severity) items = items.filter((i) => i.severity === filter.severity);
    if (filter.type) items = items.filter((i) => i.type === filter.type);
    if (filter.order_id) items = items.filter((i) => i.order_id === filter.order_id);
    if (filter.delivery_id) items = items.filter((i) => i.delivery_id === filter.delivery_id);
    if (filter.payment_id) items = items.filter((i) => i.payment_id === filter.payment_id);

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = items.length;
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return {
      incidents: items.slice(offset, offset + limit),
      total,
    };
  }

  public async updateIncident(id: string, updates: Partial<OperationalIncident>): Promise<OperationalIncident | null> {
    const existing = await this.getIncidentById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: OperationalIncident = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    try {
      await pool.query(
        `UPDATE operational_incidents SET
          severity = $1, status = $2, details = $3, metadata = $4,
          assigned_to_user_id = $5, assigned_to_name = $6,
          acknowledged_at = $7, resolved_at = $8, updated_at = $9
        WHERE id = $10`,
        [
          updated.severity,
          updated.status,
          updated.details || null,
          JSON.stringify(updated.metadata || {}),
          updated.assigned_to_user_id || null,
          updated.assigned_to_name || null,
          updated.acknowledged_at || null,
          updated.resolved_at || null,
          updated.updated_at,
          id,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.incidents.set(id, updated);
    return updated;
  }

  public async addIncidentTimeline(entry: IncidentTimelineEntry): Promise<IncidentTimelineEntry> {
    try {
      await pool.query(
        `INSERT INTO operational_incident_timeline (
          id, incident_id, action, actor_user_id, actor_name, note, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.id,
          entry.incident_id,
          entry.action,
          entry.actor_user_id || null,
          entry.actor_name || null,
          entry.note || null,
          JSON.stringify(entry.metadata || {}),
          entry.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    const list = this.incidentTimeline.get(entry.incident_id) || [];
    list.push(entry);
    this.incidentTimeline.set(entry.incident_id, list);
    return entry;
  }

  public async getIncidentTimeline(incidentId: string): Promise<IncidentTimelineEntry[]> {
    try {
      const res = await pool.query(
        `SELECT * FROM operational_incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC`,
        [incidentId]
      );
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          incident_id: r.incident_id,
          action: r.action,
          actor_user_id: r.actor_user_id,
          actor_name: r.actor_name,
          note: r.note,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {},
          created_at: new Date(r.created_at).toISOString(),
        }));
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    return config.storage.mode === "memory" ? this.incidentTimeline.get(incidentId) || [] : [];
  }

  private mapIncident(row: any): OperationalIncident {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      order_id: row.order_id,
      delivery_id: row.delivery_id,
      payment_id: row.payment_id,
      refund_id: row.refund_id,
      merchant_id: row.merchant_id,
      rider_id: row.rider_id,
      customer_id: row.customer_id,
      reason_code: row.reason_code,
      summary: row.summary,
      details: row.details,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      assigned_to_user_id: row.assigned_to_user_id,
      assigned_to_name: row.assigned_to_name,
      detected_at: new Date(row.detected_at).toISOString(),
      acknowledged_at: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
      resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  // ============================================================================
  // 2. Support Cases & Notes
  // ============================================================================

  public async createSupportCase(data: {
    id: string;
    customer_id?: string | null;
    merchant_id?: string | null;
    rider_id?: string | null;
    order_id?: string | null;
    delivery_id?: string | null;
    payment_id?: string | null;
    category: any;
    priority?: SupportCasePriority;
    subject: string;
    description: string;
    assigned_agent_id?: string | null;
    assigned_agent_name?: string | null;
  }): Promise<SupportCase> {
    const now = new Date().toISOString();
    const caseNumber = generateCaseNumber();
    const supportCase: SupportCase = {
      id: data.id,
      case_number: caseNumber,
      customer_id: data.customer_id || null,
      merchant_id: data.merchant_id || null,
      rider_id: data.rider_id || null,
      order_id: data.order_id || null,
      delivery_id: data.delivery_id || null,
      payment_id: data.payment_id || null,
      category: data.category,
      priority: data.priority || 'MEDIUM',
      status: 'OPEN',
      subject: data.subject,
      description: data.description,
      assigned_agent_id: data.assigned_agent_id || null,
      assigned_agent_name: data.assigned_agent_name || null,
      created_at: now,
      updated_at: now,
    };

    try {
      await pool.query(
        `INSERT INTO support_cases (
          id, case_number, customer_id, merchant_id, rider_id, order_id, delivery_id, payment_id,
          category, priority, status, subject, description, assigned_agent_id, assigned_agent_name,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          supportCase.id,
          supportCase.case_number,
          supportCase.customer_id,
          supportCase.merchant_id,
          supportCase.rider_id,
          supportCase.order_id,
          supportCase.delivery_id,
          supportCase.payment_id,
          supportCase.category,
          supportCase.priority,
          supportCase.status,
          supportCase.subject,
          supportCase.description,
          supportCase.assigned_agent_id,
          supportCase.assigned_agent_name,
          supportCase.created_at,
          supportCase.updated_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.supportCases.set(supportCase.id, supportCase);
    return supportCase;
  }

  public async getSupportCaseById(id: string): Promise<SupportCase | null> {
    try {
      const res = await pool.query(`SELECT * FROM support_cases WHERE id = $1`, [id]);
      if (res.rows && res.rows.length > 0) {
        return this.mapSupportCase(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }
    return config.storage.mode === "memory" ? (this.supportCases.get(id) || null) : null;
  }

  public async getSupportCaseByNumber(caseNumber: string): Promise<SupportCase | null> {
    try {
      const res = await pool.query(`SELECT * FROM support_cases WHERE case_number = $1`, [caseNumber]);
      if (res.rows && res.rows.length > 0) {
        return this.mapSupportCase(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }
    for (const c of config.storage.mode === "memory" ? this.supportCases.values() : []) {
      if (c.case_number === caseNumber) return c;
    }
    return null;
  }

  public async findSupportCases(filter: {
    customer_id?: string;
    merchant_id?: string;
    rider_id?: string;
    order_id?: string;
    status?: SupportCaseStatus;
    priority?: SupportCasePriority;
    limit?: number;
    offset?: number;
  }): Promise<{ cases: SupportCase[]; total: number }> {
    try {
      let query = `SELECT * FROM support_cases WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (filter.customer_id) {
        query += ` AND customer_id = $${idx++}`;
        params.push(filter.customer_id);
      }
      if (filter.merchant_id) {
        query += ` AND merchant_id = $${idx++}`;
        params.push(filter.merchant_id);
      }
      if (filter.rider_id) {
        query += ` AND rider_id = $${idx++}`;
        params.push(filter.rider_id);
      }
      if (filter.order_id) {
        query += ` AND order_id = $${idx++}`;
        params.push(filter.order_id);
      }
      if (filter.status) {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
      if (filter.priority) {
        query += ` AND priority = $${idx++}`;
        params.push(filter.priority);
      }

      query += ` ORDER BY created_at DESC`;
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const res = await pool.query(query, params);
      return {
        cases: res.rows.map((r: any) => this.mapSupportCase(r)),
        total: res.rows.length,
      };
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    let items = Array.from(this.supportCases.values());
    if (filter.customer_id) items = items.filter((c) => c.customer_id === filter.customer_id);
    if (filter.merchant_id) items = items.filter((c) => c.merchant_id === filter.merchant_id);
    if (filter.rider_id) items = items.filter((c) => c.rider_id === filter.rider_id);
    if (filter.order_id) items = items.filter((c) => c.order_id === filter.order_id);
    if (filter.status) items = items.filter((c) => c.status === filter.status);
    if (filter.priority) items = items.filter((c) => c.priority === filter.priority);

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = items.length;
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return {
      cases: items.slice(offset, offset + limit),
      total,
    };
  }

  public async updateSupportCase(id: string, updates: Partial<SupportCase>): Promise<SupportCase | null> {
    const existing = await this.getSupportCaseById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: SupportCase = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    try {
      await pool.query(
        `UPDATE support_cases SET
          status = $1, priority = $2, resolution_code = $3, resolution_notes = $4,
          assigned_agent_id = $5, assigned_agent_name = $6, refund_id = $7,
          resolved_at = $8, updated_at = $9
        WHERE id = $10`,
        [
          updated.status,
          updated.priority,
          updated.resolution_code || null,
          updated.resolution_notes || null,
          updated.assigned_agent_id || null,
          updated.assigned_agent_name || null,
          updated.refund_id || null,
          updated.resolved_at || null,
          updated.updated_at,
          id,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.supportCases.set(id, updated);
    return updated;
  }

  public async addSupportCaseNote(note: SupportCaseNote): Promise<SupportCaseNote> {
    try {
      await pool.query(
        `INSERT INTO support_case_notes (
          id, case_id, author_user_id, author_role, author_name, visibility, body, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          note.id,
          note.case_id,
          note.author_user_id,
          note.author_role || null,
          note.author_name || null,
          note.visibility,
          note.body,
          note.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    const notes = this.supportCaseNotes.get(note.case_id) || [];
    notes.push(note);
    this.supportCaseNotes.set(note.case_id, notes);
    return note;
  }

  public async getSupportCaseNotes(caseId: string, isInternalViewer: boolean): Promise<SupportCaseNote[]> {
    try {
      let query = `SELECT * FROM support_case_notes WHERE case_id = $1`;
      if (!isInternalViewer) {
        query += ` AND visibility = 'CUSTOMER_VISIBLE'`;
      }
      query += ` ORDER BY created_at ASC`;
      const res = await pool.query(query, [caseId]);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          case_id: r.case_id,
          author_user_id: r.author_user_id,
          author_role: r.author_role,
          author_name: r.author_name,
          visibility: r.visibility,
          body: r.body,
          created_at: new Date(r.created_at).toISOString(),
        }));
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    const notes = config.storage.mode === "memory" ? this.supportCaseNotes.get(caseId) || [] : [];
    if (isInternalViewer) {
      return notes;
    }
    return notes.filter((n) => n.visibility === 'CUSTOMER_VISIBLE');
  }

  private mapSupportCase(row: any): SupportCase {
    return {
      id: row.id,
      case_number: row.case_number,
      customer_id: row.customer_id,
      merchant_id: row.merchant_id,
      rider_id: row.rider_id,
      order_id: row.order_id,
      delivery_id: row.delivery_id,
      payment_id: row.payment_id,
      category: row.category,
      priority: row.priority,
      status: row.status,
      subject: row.subject,
      description: row.description,
      resolution_code: row.resolution_code,
      resolution_notes: row.resolution_notes,
      assigned_agent_id: row.assigned_agent_id,
      assigned_agent_name: row.assigned_agent_name,
      refund_id: row.refund_id,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    };
  }

  // ============================================================================
  // 3. Notifications & Idempotency
  // ============================================================================

  public async getNotificationByIdempotencyKey(idempotencyKey: string): Promise<NotificationRecord | null> {
    try {
      const res = await pool.query(`SELECT * FROM notifications WHERE idempotency_key = $1`, [idempotencyKey]);
      if (res.rows && res.rows.length > 0) {
        return this.mapNotification(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    for (const n of config.storage.mode === "memory" ? this.notifications.values() : []) {
      if (n.idempotency_key === idempotencyKey) return n;
    }
    return null;
  }

  public async createNotification(record: NotificationRecord): Promise<NotificationRecord> {
    // Idempotency check first
    const existing = await this.getNotificationByIdempotencyKey(record.idempotency_key);
    if (existing) {
      return existing;
    }

    try {
      await pool.query(
        `INSERT INTO notifications (
          id, recipient_type, recipient_id, channel, template_code, status, subject, payload,
          provider, provider_reference, scheduled_at, sent_at, delivered_at, failed_at,
          failure_code, failure_reason, retry_count, max_retries, idempotency_key, read_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          record.id,
          record.recipient_type,
          record.recipient_id,
          record.channel,
          record.template_code,
          record.status,
          record.subject || null,
          JSON.stringify(record.payload || {}),
          record.provider,
          record.provider_reference || null,
          record.scheduled_at || null,
          record.sent_at || null,
          record.delivered_at || null,
          record.failed_at || null,
          record.failure_code || null,
          record.failure_reason || null,
          record.retry_count,
          record.max_retries,
          record.idempotency_key,
          record.read_at || null,
          record.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.notifications.set(record.id, record);
    return record;
  }

  public async getNotificationById(id: string): Promise<NotificationRecord | null> {
    try {
      const res = await pool.query(`SELECT * FROM notifications WHERE id = $1`, [id]);
      if (res.rows && res.rows.length > 0) {
        return this.mapNotification(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }
    return config.storage.mode === "memory" ? (this.notifications.get(id) || null) : null;
  }

  public async updateNotification(id: string, updates: Partial<NotificationRecord>): Promise<NotificationRecord | null> {
    const existing = await this.getNotificationById(id);
    if (!existing) return null;

    const updated: NotificationRecord = {
      ...existing,
      ...updates,
    };

    try {
      await pool.query(
        `UPDATE notifications SET
          status = $1, provider = $2, provider_reference = $3, scheduled_at = $4,
          sent_at = $5, delivered_at = $6, failed_at = $7, failure_code = $8,
          failure_reason = $9, retry_count = $10, read_at = $11
        WHERE id = $12`,
        [
          updated.status,
          updated.provider,
          updated.provider_reference || null,
          updated.scheduled_at || null,
          updated.sent_at || null,
          updated.delivered_at || null,
          updated.failed_at || null,
          updated.failure_code || null,
          updated.failure_reason || null,
          updated.retry_count,
          updated.read_at || null,
          id,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.notifications.set(id, updated);
    return updated;
  }

  public async claimPendingNotifications(limit = 25): Promise<NotificationRecord[]> {
    if (config.storage.mode === "postgres") {
      const res = await getDbPool().query(
        `WITH candidates AS (
           SELECT id
           FROM notifications
           WHERE (
               status IN ('PENDING','FAILED')
               OR (status = 'QUEUED' AND scheduled_at <= NOW())
             )
             AND retry_count < max_retries
             AND (scheduled_at IS NULL OR scheduled_at <= NOW())
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notifications n
         SET status = 'QUEUED',
             scheduled_at = NOW() + INTERVAL '30 seconds',
             failure_code = NULL,
             failure_reason = NULL
         FROM candidates c
         WHERE n.id = c.id
         RETURNING n.*`,
        [Math.max(1, Math.min(limit, 100))],
      );
      return res.rows.map((row: any) => this.mapNotification(row));
    }

    allowMemoryAdapter();
    const now = Date.now();
    return Array.from(this.notifications.values())
      .filter((record) =>
        (
          ['PENDING', 'FAILED'].includes(record.status) ||
          (record.status === 'QUEUED' &&
            Boolean(record.scheduled_at) &&
            new Date(record.scheduled_at as string).getTime() <= now)
        ) &&
        record.retry_count < record.max_retries &&
        (!record.scheduled_at || new Date(record.scheduled_at).getTime() <= now),
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, limit)
      .map((record) => {
        const queued = {
          ...record,
          status: 'QUEUED' as NotificationStatus,
          scheduled_at: new Date(Date.now() + 30_000).toISOString(),
        };
        this.notifications.set(record.id, queued);
        return queued;
      });
  }

  public async findNotifications(filter: {
    recipient_type?: string;
    recipient_id?: string;
    channel?: string;
    status?: NotificationStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: NotificationRecord[]; total: number }> {
    try {
      let query = `SELECT * FROM notifications WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (filter.recipient_type) {
        query += ` AND recipient_type = $${idx++}`;
        params.push(filter.recipient_type);
      }
      if (filter.recipient_id) {
        query += ` AND recipient_id = $${idx++}`;
        params.push(filter.recipient_id);
      }
      if (filter.channel) {
        query += ` AND channel = $${idx++}`;
        params.push(filter.channel);
      }
      if (filter.status) {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }

      query += ` ORDER BY created_at DESC`;
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const res = await pool.query(query, params);
      return {
        notifications: res.rows.map((r: any) => this.mapNotification(r)),
        total: res.rows.length,
      };
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    let items = Array.from(this.notifications.values());
    if (filter.recipient_type) items = items.filter((n) => n.recipient_type === filter.recipient_type);
    if (filter.recipient_id) items = items.filter((n) => n.recipient_id === filter.recipient_id);
    if (filter.channel) items = items.filter((n) => n.channel === filter.channel);
    if (filter.status) items = items.filter((n) => n.status === filter.status);

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = items.length;
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return {
      notifications: items.slice(offset, offset + limit),
      total,
    };
  }

  private mapNotification(row: any): NotificationRecord {
    return {
      id: row.id,
      recipient_type: row.recipient_type,
      recipient_id: row.recipient_id,
      channel: row.channel,
      template_code: row.template_code,
      status: row.status,
      subject: row.subject,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {},
      provider: row.provider,
      provider_reference: row.provider_reference,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
      failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      failure_code: row.failure_code,
      failure_reason: row.failure_reason,
      retry_count: row.retry_count,
      max_retries: row.max_retries,
      idempotency_key: row.idempotency_key,
      read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  // ============================================================================
  // 4. Dead-Letter Queue (DLQ)
  // ============================================================================

  public async createDeadLetterJob(job: DeadLetterJob): Promise<DeadLetterJob> {
    try {
      await pool.query(
        `INSERT INTO dead_letter_jobs (
          id, job_type, job_id, payload, attempt_count, max_attempts, last_error, status, failed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          job.id,
          job.job_type,
          job.job_id,
          JSON.stringify(job.payload || {}),
          job.attempt_count,
          job.max_attempts,
          job.last_error,
          job.status,
          job.failed_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.deadLetterJobs.set(job.id, job);
    return job;
  }

  public async getDeadLetterJobById(id: string): Promise<DeadLetterJob | null> {
    try {
      const res = await pool.query(`SELECT * FROM dead_letter_jobs WHERE id = $1`, [id]);
      if (res.rows && res.rows.length > 0) {
        return this.mapDeadLetterJob(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }
    return config.storage.mode === "memory" ? (this.deadLetterJobs.get(id) || null) : null;
  }

  public async updateDeadLetterJob(id: string, updates: Partial<DeadLetterJob>): Promise<DeadLetterJob | null> {
    const existing = await this.getDeadLetterJobById(id);
    if (!existing) return null;

    const updated: DeadLetterJob = {
      ...existing,
      ...updates,
    };

    try {
      await pool.query(
        `UPDATE dead_letter_jobs SET status = $1, resolved_at = $2, resolved_by = $3 WHERE id = $4`,
        [updated.status, updated.resolved_at || null, updated.resolved_by || null, id]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.deadLetterJobs.set(id, updated);
    return updated;
  }

  public async findDeadLetterJobs(filter: {
    status?: 'DEAD_LETTER' | 'RETRIED' | 'RESOLVED';
    job_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: DeadLetterJob[]; total: number }> {
    try {
      let query = `SELECT * FROM dead_letter_jobs WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (filter.status) {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
      if (filter.job_type) {
        query += ` AND job_type = $${idx++}`;
        params.push(filter.job_type);
      }

      query += ` ORDER BY failed_at DESC`;
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const res = await pool.query(query, params);
      return {
        jobs: res.rows.map((r: any) => this.mapDeadLetterJob(r)),
        total: res.rows.length,
      };
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    let items = Array.from(this.deadLetterJobs.values());
    if (filter.status) items = items.filter((j) => j.status === filter.status);
    if (filter.job_type) items = items.filter((j) => j.job_type === filter.job_type);

    items.sort((a, b) => new Date(b.failed_at).getTime() - new Date(a.failed_at).getTime());
    const total = items.length;
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return {
      jobs: items.slice(offset, offset + limit),
      total,
    };
  }

  private mapDeadLetterJob(row: any): DeadLetterJob {
    return {
      id: row.id,
      job_type: row.job_type,
      job_id: row.job_id,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {},
      attempt_count: row.attempt_count,
      max_attempts: row.max_attempts,
      last_error: row.last_error,
      status: row.status,
      failed_at: new Date(row.failed_at).toISOString(),
      resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      resolved_by: row.resolved_by,
    };
  }

  // ============================================================================
  // 5. Fraud & Risk Signals
  // ============================================================================

  public async createRiskSignal(signal: RiskSignal): Promise<RiskSignal> {
    try {
      await pool.query(
        `INSERT INTO risk_signals (
          id, signal_type, severity, customer_id, merchant_id, rider_id, order_id, payment_id,
          promotion_id, score_weight, metadata, status, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          signal.id,
          signal.signal_type,
          signal.severity,
          signal.customer_id || null,
          signal.merchant_id || null,
          signal.rider_id || null,
          signal.order_id || null,
          signal.payment_id || null,
          signal.promotion_id || null,
          signal.score_weight,
          JSON.stringify(signal.metadata || {}),
          signal.status,
          signal.detected_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.riskSignals.set(signal.id, signal);
    return signal;
  }

  public async getRiskSignalById(id: string): Promise<RiskSignal | null> {
    try {
      const res = await pool.query(`SELECT * FROM risk_signals WHERE id = $1`, [id]);
      if (res.rows && res.rows.length > 0) {
        return this.mapRiskSignal(res.rows[0]);
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }
    return config.storage.mode === "memory" ? (this.riskSignals.get(id) || null) : null;
  }

  public async updateRiskSignal(id: string, updates: Partial<RiskSignal>): Promise<RiskSignal | null> {
    const existing = await this.getRiskSignalById(id);
    if (!existing) return null;

    const updated: RiskSignal = {
      ...existing,
      ...updates,
    };

    try {
      await pool.query(
        `UPDATE risk_signals SET status = $1, reviewed_at = $2, reviewed_by = $3, review_notes = $4 WHERE id = $5`,
        [updated.status, updated.reviewed_at || null, updated.reviewed_by || null, updated.review_notes || null, id]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.riskSignals.set(id, updated);
    return updated;
  }

  public async findRiskSignals(filter: {
    customer_id?: string;
    merchant_id?: string;
    rider_id?: string;
    order_id?: string;
    status?: RiskSignalStatus;
    severity?: IncidentSeverity;
    limit?: number;
    offset?: number;
  }): Promise<{ signals: RiskSignal[]; total: number }> {
    try {
      let query = `SELECT * FROM risk_signals WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (filter.customer_id) {
        query += ` AND customer_id = $${idx++}`;
        params.push(filter.customer_id);
      }
      if (filter.merchant_id) {
        query += ` AND merchant_id = $${idx++}`;
        params.push(filter.merchant_id);
      }
      if (filter.rider_id) {
        query += ` AND rider_id = $${idx++}`;
        params.push(filter.rider_id);
      }
      if (filter.order_id) {
        query += ` AND order_id = $${idx++}`;
        params.push(filter.order_id);
      }
      if (filter.status) {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
      if (filter.severity) {
        query += ` AND severity = $${idx++}`;
        params.push(filter.severity);
      }

      query += ` ORDER BY detected_at DESC`;
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const res = await pool.query(query, params);
      return {
        signals: res.rows.map((r: any) => this.mapRiskSignal(r)),
        total: res.rows.length,
      };
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    let items = Array.from(this.riskSignals.values());
    if (filter.customer_id) items = items.filter((s) => s.customer_id === filter.customer_id);
    if (filter.merchant_id) items = items.filter((s) => s.merchant_id === filter.merchant_id);
    if (filter.rider_id) items = items.filter((s) => s.rider_id === filter.rider_id);
    if (filter.order_id) items = items.filter((s) => s.order_id === filter.order_id);
    if (filter.status) items = items.filter((s) => s.status === filter.status);
    if (filter.severity) items = items.filter((s) => s.severity === filter.severity);

    items.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
    const total = items.length;
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return {
      signals: items.slice(offset, offset + limit),
      total,
    };
  }

  private mapRiskSignal(row: any): RiskSignal {
    return {
      id: row.id,
      signal_type: row.signal_type,
      severity: row.severity,
      customer_id: row.customer_id,
      merchant_id: row.merchant_id,
      rider_id: row.rider_id,
      order_id: row.order_id,
      payment_id: row.payment_id,
      promotion_id: row.promotion_id,
      score_weight: row.score_weight,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      status: row.status,
      detected_at: new Date(row.detected_at).toISOString(),
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      reviewed_by: row.reviewed_by,
      review_notes: row.review_notes,
    };
  }

  // ============================================================================
  // 6. Operational Kill Switches
  // ============================================================================

  public async getKillSwitches(): Promise<Record<string, { enabled: boolean; description?: string; updatedBy?: string; updatedAt: string }>> {
    try {
      const res = await pool.query(`SELECT * FROM operational_kill_switches`);
      if (res.rows && res.rows.length > 0) {
        const result: Record<string, any> = {};
        for (const row of res.rows) {
          result[row.key_name] = {
            enabled: row.enabled,
            description: row.description,
            updatedBy: row.updated_by,
            updatedAt: new Date(row.updated_at).toISOString(),
          };
        }
        return result;
      }
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    const result: Record<string, any> = {};
    for (const [key, val] of config.storage.mode === "memory" ? this.killSwitches.entries() : []) {
      result[key] = { ...val };
    }
    return result;
  }

  public async isKillSwitchActive(keyName: string): Promise<boolean> {
    const switches = await this.getKillSwitches();
    return switches[keyName]?.enabled === true;
  }

  public async setKillSwitch(keyName: string, enabled: boolean, updatedBy?: string, description?: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO operational_kill_switches (key_name, enabled, description, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key_name) DO UPDATE SET enabled = $2, updated_by = $4, updated_at = $5`,
        [keyName, enabled, description || null, updatedBy || null, now]
      );
    } catch {
      allowMemoryAdapter();
      // fallback
    }

    this.killSwitches.set(keyName, {
      enabled,
      description: description || this.killSwitches.get(keyName)?.description,
      updatedBy,
      updatedAt: now,
    });
  }
}

export const operationsRepository = new OperationsRepository();
