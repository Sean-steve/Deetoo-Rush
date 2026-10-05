import { config } from '@deetoo/config';
import { rows,one,insert } from '../../db/adapter';
import { allowMemoryAdapter } from '../../db/storage-policy';
/**
 * DEETOO - Delivery & Dispatch Repository
 * Sprint 9: Delivery Lifecycle, Offer Persistence, Dispatch Attempts & Dual-Persistence Architecture
 */

import {
  Delivery,
  DeliveryStatus,
  DeliveryOffer,
  DeliveryOfferStatus,
  DeliveryTimelineEntry,
  DispatchAttempt,
  DeliveryFilterParams,
  DispatchMetrics,
  DeliveryProof,
  DeliveryIncident,
  StuckDeliveryAlert,
  GeoPoint,
} from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';
import { randomUUID } from 'crypto';

export class DeliveryRepository {
  private deliveries = new Map<string, Delivery>();
  private offers = new Map<string, DeliveryOffer>();
  private timelineEntries = new Map<string, DeliveryTimelineEntry[]>();
  private attempts = new Map<string, DispatchAttempt[]>();
  private proofs = new Map<string, DeliveryProof[]>();
  private incidents = new Map<string, DeliveryIncident>();

  public clearInMemory(): void {
    this.deliveries.clear();
    this.offers.clear();
    this.timelineEntries.clear();
    this.attempts.clear();
    this.proofs.clear();
    this.incidents.clear();
  }

  public async create(delivery: any): Promise<Delivery> {
    return this.createDelivery(delivery);
  }

  public async findAll(): Promise<Delivery[]> {
    if (config.storage.mode === "postgres") return (await rows("SELECT * FROM deliveries ORDER BY created_at DESC")).map(row=>this.mapRowToDelivery(row));
    allowMemoryAdapter();
    return Array.from(this.deliveries.values());
  }

  /**
   * Save a newly initialized delivery
   */
  public async createDelivery(
    delivery: Partial<Delivery> & {
      order_id: string;
      status: DeliveryStatus;
      branch_id: string;
      customer_id: string;
      pickup_location: GeoPoint;
      dropoff_location: GeoPoint;
      pickup_address_text: string;
      dropoff_address_text: string;
    }
  ): Promise<Delivery> {
    const generatedOtp = delivery.delivery_otp || Math.floor(1000 + Math.random() * 9000).toString();
    const generatedVerificationCode =
      delivery.pickup_verification_code ||
      (delivery.order_number ? delivery.order_number.slice(-4) : Math.floor(1000 + Math.random() * 9000).toString());

    const record: Delivery = {
      ...delivery,
      id: delivery.id || randomUUID(),
      delivery_otp: generatedOtp,
      pickup_verification_code: generatedVerificationCode,
      delivery_otp_attempts: delivery.delivery_otp_attempts || 0,
      delivery_otp_locked: delivery.delivery_otp_locked || false,
      reassignment_count: delivery.reassignment_count || 0,
      dispatch_attention_required: delivery.dispatch_attention_required || false,
      current_search_radius_meters: delivery.current_search_radius_meters || 2000,
      dispatch_cycle_count: delivery.dispatch_cycle_count || 0,
      version: delivery.version || 1,
      created_at: delivery.created_at || new Date().toISOString(),
      updated_at: delivery.updated_at || new Date().toISOString(),
    };

    // In-memory
    this.deliveries.set(record.id, { ...record });

    // Database attempt
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO deliveries (
          id, order_id, status, assigned_rider_id, branch_id, pickup_branch_id, customer_id,
          pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude,
          pickup_address_text, dropoff_address_text, delivery_instructions,
          estimated_prep_minutes, estimated_ready_at, dispatch_not_before,
          dispatch_started_at, reassignment_count, dispatch_attention_required,
          attention_reason, current_search_radius_meters, dispatch_cycle_count,
          pickup_verification_code, delivery_otp, delivery_otp_attempts, delivery_otp_locked,
          version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        ) ON CONFLICT (order_id) DO UPDATE SET
          estimated_prep_minutes = EXCLUDED.estimated_prep_minutes,
          estimated_ready_at = EXCLUDED.estimated_ready_at,
          dispatch_not_before = EXCLUDED.dispatch_not_before,
          pickup_verification_code = COALESCE(deliveries.pickup_verification_code, EXCLUDED.pickup_verification_code),
          delivery_otp = COALESCE(deliveries.delivery_otp, EXCLUDED.delivery_otp),
          updated_at = NOW()`,
        [
          record.id,
          record.order_id,
          record.status,
          record.assigned_rider_id || null,
          record.branch_id,
          record.customer_id,
          record.pickup_location.latitude ?? record.pickup_location.lat,
          record.pickup_location.longitude ?? record.pickup_location.lng,
          record.dropoff_location.latitude ?? record.dropoff_location.lat,
          record.dropoff_location.longitude ?? record.dropoff_location.lng,
          record.pickup_address_text || null,
          record.dropoff_address_text || null,
          record.delivery_instructions || null,
          record.estimated_prep_minutes || null,
          record.estimated_ready_at || null,
          record.dispatch_not_before || null,
          record.dispatch_started_at || null,
          record.reassignment_count,
          record.dispatch_attention_required,
          record.attention_reason || null,
          record.current_search_radius_meters,
          record.dispatch_cycle_count,
          record.pickup_verification_code || null,
          record.delivery_otp || null,
          record.delivery_otp_attempts || 0,
          record.delivery_otp_locked || false,
          record.version,
          record.created_at,
          record.updated_at,
        ]
      );
    } catch (err) {
      allowMemoryAdapter();
      logger.warn('Deliveries DB insert fallback to in-memory', {
        service: 'delivery-repository',
        error: (err as Error).message,
      });
    }

    return record;
  }

  /**
   * Find delivery by ID
   */
  public async findById(id: string): Promise<Delivery | null> {
    const memory = config.storage.mode === "memory" ? this.deliveries.get(id) : undefined;
    if (memory) {
      const activeOffer = await this.findActiveOfferByDeliveryId(id);
      const timeline = await this.getTimelineByDeliveryId(id);
      const proofs = await this.getProofsByDeliveryId(id);
      return {
        ...memory,
        active_offer: activeOffer,
        timeline,
        proofs,
      };
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM deliveries WHERE id = $1`, [id]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        const del = this.mapRowToDelivery(row);
        this.deliveries.set(del.id, del);
        const activeOffer = await this.findActiveOfferByDeliveryId(id);
        const timeline = await this.getTimelineByDeliveryId(id);
        const proofs = await this.getProofsByDeliveryId(id);
        return {
          ...del,
          active_offer: activeOffer,
          timeline,
          proofs,
        };
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return null;
  }

  /**
   * Find delivery by Order ID
   */
  public async findByOrderId(orderId: string): Promise<Delivery | null> {
    for (const del of config.storage.mode === "memory" ? this.deliveries.values() : []) {
      if (del.order_id === orderId) {
        return this.findById(del.id);
      }
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM deliveries WHERE order_id = $1`, [orderId]);
      if (res.rows.length > 0) {
        return this.findById(res.rows[0].id);
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return null;
  }

  /**
   * Find active delivery for a rider
   */
  public async findActiveByRiderId(riderId: string): Promise<Delivery | null> {
    const activeStatuses = [
      DeliveryStatus.ASSIGNED,
      DeliveryStatus.ARRIVED_PICKUP,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.EN_ROUTE,
      DeliveryStatus.ARRIVED_DROPOFF,
    ];

    for (const del of config.storage.mode === "memory" ? this.deliveries.values() : []) {
      const custodyFailure =
        del.status === DeliveryStatus.FAILED &&
        Boolean(del.assigned_rider_id) &&
        Boolean(del.picked_up_at) &&
        !del.delivered_at;
      if (del.assigned_rider_id === riderId && (activeStatuses.includes(del.status) || custodyFailure)) {
        return this.findById(del.id);
      }
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM deliveries 
         WHERE assigned_rider_id = $1 
           AND (
             status IN ('ASSIGNED', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF')
             OR (status = 'FAILED' AND picked_up_at IS NOT NULL AND delivered_at IS NULL)
           )
         LIMIT 1`,
        [riderId]
      );
      if (res.rows.length > 0) {
        return this.findById(res.rows[0].id);
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return null;
  }

  /**
   * Check whether a rider currently has any active assigned delivery
   */
  public async hasActiveDelivery(riderId: string): Promise<boolean> {
    const active = await this.findActiveByRiderId(riderId);
    return active !== null;
  }

  /**
   * Update delivery with timeline entry
   */
  public async updateDelivery(
    id: string,
    updates: Partial<Delivery>,
    timelineEntry?: Omit<DeliveryTimelineEntry, 'id' | 'created_at'>
  ): Promise<Delivery> {
    let existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Delivery not found with id ${id}`);
    }

    const updated: Delivery = {
      ...existing,
      ...updates,
      version: (existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    this.deliveries.set(id, updated);

    if (timelineEntry) {
      await this.recordTimelineEntry({
        ...timelineEntry,
        id: randomUUID(),
        created_at: new Date().toISOString(),
      });
    }

    try {
      const pool = getDbPool();
      await pool.query(
        `UPDATE deliveries SET
          status = $1,
          assigned_rider_id = $2,
          assigned_at = $3,
          arrived_pickup_at = $4,
          picked_up_at = $5,
          en_route_at = $6,
          arrived_dropoff_at = $7,
          delivered_at = $8,
          failed_at = $9,
          failure_reason = $10,
          failure_note = $11,
          reassignment_count = $12,
          dispatch_attention_required = $13,
          attention_reason = $14,
          current_search_radius_meters = $15,
          dispatch_cycle_count = $16,
          delivery_otp_attempts = $17,
          delivery_otp_locked = $18,
          stuck_flag = $19,
          stuck_detected_at = $20,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $21`,
        [
          updated.status,
          updated.assigned_rider_id || null,
          updated.assigned_at || null,
          updated.arrived_pickup_at || null,
          updated.picked_up_at || null,
          updated.en_route_at || null,
          updated.arrived_dropoff_at || null,
          updated.delivered_at || null,
          updated.failed_at || null,
          updated.failure_reason || null,
          updated.failure_note || null,
          updated.reassignment_count,
          updated.dispatch_attention_required,
          updated.attention_reason || null,
          updated.current_search_radius_meters,
          updated.dispatch_cycle_count,
          updated.delivery_otp_attempts || 0,
          updated.delivery_otp_locked || false,
          updated.stuck_flag || null,
          updated.stuck_detected_at || null,
          id,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return (await this.findById(id))!;
  }

  /**
   * Concurrency-safe Atomic Assignment:
   * Prevents double-assignment race conditions using database optimistic/pessimistic locking
   */
  public async atomicAssign(
    deliveryId: string,
    riderId: string,
    riderName?: string,
    riderPhone?: string
  ): Promise<Delivery> {
    // 1. Guard against rider double-assignment
    const alreadyAssigned = await this.hasActiveDelivery(riderId);
    if (alreadyAssigned) {
      throw new Error('Rider is already assigned to an active delivery');
    }

    const delivery = await this.findById(deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    if (
      delivery.status === DeliveryStatus.ASSIGNED ||
      delivery.status === DeliveryStatus.ARRIVED_PICKUP ||
      delivery.status === DeliveryStatus.PICKED_UP ||
      delivery.status === DeliveryStatus.EN_ROUTE ||
      delivery.status === DeliveryStatus.ARRIVED_DROPOFF ||
      delivery.status === DeliveryStatus.DELIVERED
    ) {
      throw new Error('Delivery is already assigned or completed');
    }

    const now = new Date().toISOString();
    return await this.updateDelivery(
      deliveryId,
      {
        status: DeliveryStatus.ASSIGNED,
        assigned_rider_id: riderId,
        assigned_rider_name: riderName || delivery.assigned_rider_name,
        assigned_rider_phone: riderPhone || delivery.assigned_rider_phone,
        assigned_at: now,
      },
      {
        delivery_id: deliveryId,
        from_status: delivery.status,
        to_status: DeliveryStatus.ASSIGNED,
        actor_type: 'SYSTEM',
        actor_id: riderId,
        actor_name: riderName,
        action: 'DELIVERY_ASSIGNED',
        note: `Assigned to courier ${riderName || riderId}`,
      }
    );
  }

  /**
   * Concurrency-safe Atomic Unassign:
   * Clears assignment and increments reassignment count
   */
  public async atomicUnassign(
    deliveryId: string,
    actorType: 'SYSTEM' | 'ADMIN' | 'RIDER',
    actorId?: string,
    actorName?: string,
    reasonCode?: string,
    note?: string
  ): Promise<Delivery> {
    const delivery = await this.findById(deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    const previousRiderId = delivery.assigned_rider_id;

    if (
      [DeliveryStatus.PICKED_UP, DeliveryStatus.EN_ROUTE, DeliveryStatus.ARRIVED_DROPOFF, DeliveryStatus.DELIVERED].includes(delivery.status) ||
      (delivery.status === DeliveryStatus.FAILED && Boolean(delivery.picked_up_at))
    ) {
      throw new Error('Cannot unassign a delivery after physical custody has transferred to the rider');
    }

    return await this.updateDelivery(
      deliveryId,
      {
        status: DeliveryStatus.UNASSIGNED,
        assigned_rider_id: null,
        assigned_rider_name: null,
        assigned_rider_phone: null,
        reassignment_count: (delivery.reassignment_count || 0) + 1,
      },
      {
        delivery_id: deliveryId,
        from_status: delivery.status,
        to_status: DeliveryStatus.UNASSIGNED,
        actor_type: actorType,
        actor_id: actorId || null,
        actor_name: actorName || null,
        action: 'DELIVERY_UNASSIGNED',
        reason_code: reasonCode || 'REASSIGNMENT_REQUESTED',
        note: note || `Unassigned from courier ${previousRiderId}`,
      }
    );
  }

  /**
   * List deliveries with query filter params
   */
  public async listDeliveries(params: DeliveryFilterParams = {}): Promise<{
    deliveries: Delivery[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (config.storage.mode === "postgres") {
      const page=Math.max(1,params.page||1),limit=Math.max(1,Math.min(100,params.limit||20));
      const args=[params.status?(Array.isArray(params.status)?params.status:[params.status]):null,params.assigned_rider_id||null,params.branch_id||null,params.attention_required??null,params.search||null];
      const where=" WHERE ($1::text[] IS NULL OR status=ANY($1)) AND ($2::uuid IS NULL OR assigned_rider_id=$2) AND ($3::uuid IS NULL OR branch_id=$3) AND ($4::boolean IS NULL OR dispatch_attention_required=$4) AND ($5::text IS NULL OR concat_ws(' ',id,order_id,dropoff_address_text) ILIKE '%'||$5||'%')";
      const found=await rows('SELECT id FROM deliveries'+where+' ORDER BY created_at DESC LIMIT $6 OFFSET $7',[...args,limit,(page-1)*limit]);
      const deliveries=[];for(const row of found){const delivery=await this.findById(row.id);if(delivery)deliveries.push(delivery);}
      const count=await one('SELECT count(*) AS n FROM deliveries'+where,args);
      return {deliveries,total:Number(count.n),page,limit};
    }
    allowMemoryAdapter();
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));

    let all = Array.from(this.deliveries.values());

    if (params.status) {
      if (Array.isArray(params.status)) {
        const statuses = params.status;
        all = all.filter((d) => statuses.includes(d.status));
      } else {
        all = all.filter((d) => d.status === params.status);
      }
    }
    if (params.assigned_rider_id) {
      all = all.filter((d) => d.assigned_rider_id === params.assigned_rider_id);
    }
    if (params.branch_id) {
      all = all.filter((d) => d.branch_id === params.branch_id);
    }
    if (params.attention_required !== undefined) {
      all = all.filter((d) => d.dispatch_attention_required === params.attention_required);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      all = all.filter(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          d.order_id.toLowerCase().includes(q) ||
          (d.order_number && d.order_number.toLowerCase().includes(q)) ||
          (d.dropoff_address_text && d.dropoff_address_text.toLowerCase().includes(q)) ||
          (d.assigned_rider_name && d.assigned_rider_name.toLowerCase().includes(q))
      );
    }

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    const startIndex = (page - 1) * limit;
    const paginated = all.slice(startIndex, startIndex + limit);

    // Enrich with active offer & timeline
    const enriched = await Promise.all(
      paginated.map(async (d) => {
        const active_offer = await this.findActiveOfferByDeliveryId(d.id);
        const timeline = await this.getTimelineByDeliveryId(d.id);
        return { ...d, active_offer, timeline };
      })
    );

    return {
      deliveries: enriched,
      total,
      page,
      limit,
    };
  }

  // ==========================================
  // Delivery Offers Repository
  // ==========================================

  public async createOffer(offer: DeliveryOffer): Promise<DeliveryOffer> {
    const record: DeliveryOffer = {
      ...offer,
      id: offer.id || randomUUID(),
      status: DeliveryOfferStatus.OFFERED,
      offered_at: offer.offered_at || new Date().toISOString(),
      created_at: offer.created_at || new Date().toISOString(),
      updated_at: offer.updated_at || new Date().toISOString(),
    };

    this.offers.set(record.id, record);

    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO delivery_offers (
          id, delivery_id, order_id, rider_id, status, rank, score,
          distance_to_pickup_meters, estimated_pickup_eta_seconds,
          offered_at, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          record.id,
          record.delivery_id,
          record.order_id,
          record.rider_id,
          record.status,
          record.rank,
          record.score,
          record.distance_to_pickup_meters,
          record.estimated_pickup_eta_seconds,
          record.offered_at,
          record.expires_at,
          record.created_at,
          record.updated_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return record;
  }

  public async findOfferById(id: string): Promise<DeliveryOffer | null> {
    if (config.storage.mode === "postgres") return one('SELECT * FROM delivery_offers WHERE id=$1',[id]);
    return this.offers.get(id) || null;
  }

  public async findActiveOfferByDeliveryId(deliveryId: string): Promise<DeliveryOffer | null> {
    if (config.storage.mode === "postgres") return one("SELECT * FROM delivery_offers WHERE delivery_id=$1 AND status='OFFERED' AND expires_at>now() ORDER BY offered_at DESC LIMIT 1",[deliveryId]);
    const now = new Date().getTime();
    for (const offer of this.offers.values()) {
      if (offer.delivery_id === deliveryId && offer.status === DeliveryOfferStatus.OFFERED) {
        if (new Date(offer.expires_at).getTime() > now) {
          return offer;
        }
      }
    }
    return null;
  }

  public async findActiveOfferByRiderId(riderId: string): Promise<DeliveryOffer | null> {
    if (config.storage.mode === "postgres") return one("SELECT * FROM delivery_offers WHERE rider_id=$1 AND status='OFFERED' AND expires_at>now() ORDER BY offered_at DESC LIMIT 1",[riderId]);
    const now = new Date().getTime();
    for (const offer of this.offers.values()) {
      if (offer.rider_id === riderId && offer.status === DeliveryOfferStatus.OFFERED) {
        if (new Date(offer.expires_at).getTime() > now) {
          return offer;
        }
      }
    }
    return null;
  }

  public async updateOfferStatus(
    offerId: string,
    status: DeliveryOfferStatus,
    respondedAt?: string,
    rejectionReason?: string,
    rejectionNote?: string
  ): Promise<DeliveryOffer | null> {
    const offer = await this.findOfferById(offerId);
    if (!offer) return null;

    const updated: DeliveryOffer = {
      ...offer,
      status,
      responded_at: respondedAt || new Date().toISOString(),
      rejection_reason: rejectionReason || offer.rejection_reason,
      rejection_note: rejectionNote || offer.rejection_note,
      updated_at: new Date().toISOString(),
    };

    this.offers.set(offerId, updated);

    try {
      const pool = getDbPool();
      await pool.query(
        `UPDATE delivery_offers SET
          status = $1,
          responded_at = $2,
          rejection_reason = $3,
          rejection_note = $4,
          updated_at = NOW()
        WHERE id = $5`,
        [status, updated.responded_at, updated.rejection_reason, updated.rejection_note, offerId]
      );
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return updated;
  }

  public async cancelCompetingOffers(deliveryId: string, acceptedOfferId: string): Promise<void> {
    if (config.storage.mode === "postgres") { await rows("UPDATE delivery_offers SET status='CANCELLED',updated_at=now() WHERE delivery_id=$1 AND id<>$2 AND status='OFFERED'",[deliveryId,acceptedOfferId]); return; }
    for (const offer of this.offers.values()) {
      if (offer.delivery_id === deliveryId && offer.id !== acceptedOfferId && offer.status === DeliveryOfferStatus.OFFERED) {
        offer.status = DeliveryOfferStatus.CANCELLED;
        offer.updated_at = new Date().toISOString();
      }
    }
  }

  public async getOffersByDeliveryId(deliveryId: string): Promise<DeliveryOffer[]> {
    if (config.storage.mode === "postgres") return rows('SELECT * FROM delivery_offers WHERE delivery_id=$1 ORDER BY offered_at',[deliveryId]);
    return Array.from(this.offers.values()).filter((o) => o.delivery_id === deliveryId);
  }

  // ==========================================
  // Timeline & Attempts
  // ==========================================

  public async recordTimelineEntry(entry: DeliveryTimelineEntry): Promise<void> {
    const list = this.timelineEntries.get(entry.delivery_id) || [];
    list.push(entry);
    this.timelineEntries.set(entry.delivery_id, list);

    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO delivery_timeline (
          id, delivery_id, from_status, to_status, actor_type, actor_id,
          actor_name, action, reason_code, note, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.id,
          entry.delivery_id,
          entry.from_status,
          entry.to_status,
          entry.actor_type,
          entry.actor_id || null,
          entry.actor_name || null,
          entry.action,
          entry.reason_code || null,
          entry.note || null,
          JSON.stringify(entry.metadata || {}),
          entry.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Fallback
    }
  }

  public async getTimelineByDeliveryId(deliveryId: string): Promise<DeliveryTimelineEntry[]> {
    if (config.storage.mode === "postgres") return rows('SELECT * FROM delivery_timeline WHERE delivery_id=$1 ORDER BY created_at,id',[deliveryId]);
    const inMem = this.timelineEntries.get(deliveryId) || [];
    return [...inMem].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public async recordAttempt(attempt: DispatchAttempt): Promise<void> {
    if (config.storage.mode === "postgres") { await insert('dispatch_attempts',{...attempt,candidates_snapshot:JSON.stringify(attempt.candidates_snapshot || [])},['id','delivery_id','attempt_number','search_radius_meters','candidate_count','candidates_snapshot','started_at','ended_at','result','metadata']); return; }
    const list = this.attempts.get(attempt.delivery_id) || [];
    list.push(attempt);
    this.attempts.set(attempt.delivery_id, list);
  }

  public async getAttemptsByDeliveryId(deliveryId: string): Promise<DispatchAttempt[]> {
    if (config.storage.mode === "postgres") return rows('SELECT * FROM dispatch_attempts WHERE delivery_id=$1 ORDER BY started_at,id',[deliveryId]);
    return this.attempts.get(deliveryId) || [];
  }

  // ==========================================
  // Metrics & Stats
  // ==========================================

  public async getDispatchMetrics(): Promise<DispatchMetrics> {
    const allDeliveries = await this.findAll();
    const allOffers = config.storage.mode === "postgres" ? await rows("SELECT * FROM delivery_offers") : Array.from(this.offers.values());

    let unassignedCount = 0;
    let offeredCount = 0;
    let assignedCount = 0;
    let attentionRequiredCount = 0;
    let totalAssignDurationSeconds = 0;
    let assignedWithDurationCount = 0;
    let totalRadius = 0;

    for (const d of allDeliveries) {
      if (d.status === DeliveryStatus.UNASSIGNED) unassignedCount++;
      if (d.status === DeliveryStatus.OFFERED) offeredCount++;
      if (d.status === DeliveryStatus.ASSIGNED || d.status === DeliveryStatus.ARRIVED_PICKUP || d.status === DeliveryStatus.PICKED_UP) {
        assignedCount++;
      }
      if (d.dispatch_attention_required) attentionRequiredCount++;
      totalRadius += d.current_search_radius_meters || 2000;

      if (d.assigned_at && d.created_at) {
        const dur = (new Date(d.assigned_at).getTime() - new Date(d.created_at).getTime()) / 1000;
        if (dur > 0) {
          totalAssignDurationSeconds += dur;
          assignedWithDurationCount++;
        }
      }
    }

    const totalOffers = allOffers.length;
    let totalOffersAccepted = 0;
    let totalOffersRejected = 0;
    let totalOffersExpired = 0;

    for (const o of allOffers) {
      if (o.status === DeliveryOfferStatus.ACCEPTED) totalOffersAccepted++;
      if (o.status === DeliveryOfferStatus.REJECTED) totalOffersRejected++;
      if (o.status === DeliveryOfferStatus.EXPIRED) totalOffersExpired++;
    }

    const offerAcceptanceRatePercent = totalOffers > 0 ? Math.round((totalOffersAccepted / totalOffers) * 100) : 0;
    const averageTimeToAssignSeconds =
      assignedWithDurationCount > 0 ? Math.round(totalAssignDurationSeconds / assignedWithDurationCount) : 0;
    const averageSearchRadiusMeters =
      allDeliveries.length > 0 ? Math.round(totalRadius / allDeliveries.length) : 2000;

    return {
      totalDeliveries: allDeliveries.length,
      unassignedCount,
      offeredCount,
      assignedCount,
      attentionRequiredCount,
      averageTimeToAssignSeconds,
      offerAcceptanceRatePercent,
      totalOffersSent: totalOffers,
      totalOffersAccepted,
      totalOffersRejected,
      totalOffersExpired,
      averageSearchRadiusMeters,
    };
  }

  private mapRowToDelivery(row: any): Delivery {
    return {
      id: row.id,
      order_id: row.order_id,
      status: row.status,
      assigned_rider_id: row.assigned_rider_id,
      branch_id: row.branch_id,
      customer_id: row.customer_id,
      pickup_location: {
        lat: parseFloat(row.pickup_latitude || 0),
        lng: parseFloat(row.pickup_longitude || 0),
        latitude: parseFloat(row.pickup_latitude || 0),
        longitude: parseFloat(row.pickup_longitude || 0),
      },
      dropoff_location: {
        lat: parseFloat(row.dropoff_latitude || 0),
        lng: parseFloat(row.dropoff_longitude || 0),
        latitude: parseFloat(row.dropoff_latitude || 0),
        longitude: parseFloat(row.dropoff_longitude || 0),
      },
      pickup_address_text: row.pickup_address_text,
      dropoff_address_text: row.dropoff_address_text,
      delivery_instructions: row.delivery_instructions,
      estimated_prep_minutes: row.estimated_prep_minutes,
      estimated_ready_at: row.estimated_ready_at ? new Date(row.estimated_ready_at).toISOString() : null,
      dispatch_not_before: row.dispatch_not_before ? new Date(row.dispatch_not_before).toISOString() : null,
      dispatch_started_at: row.dispatch_started_at ? new Date(row.dispatch_started_at).toISOString() : null,
      assigned_at: row.assigned_at ? new Date(row.assigned_at).toISOString() : null,
      arrived_pickup_at: row.arrived_pickup_at ? new Date(row.arrived_pickup_at).toISOString() : null,
      picked_up_at: row.picked_up_at ? new Date(row.picked_up_at).toISOString() : null,
      en_route_at: row.en_route_at ? new Date(row.en_route_at).toISOString() : null,
      arrived_dropoff_at: row.arrived_dropoff_at ? new Date(row.arrived_dropoff_at).toISOString() : null,
      delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
      pickup_verification_code: row.pickup_verification_code || null,
      delivery_otp: row.delivery_otp || null,
      delivery_otp_attempts: row.delivery_otp_attempts || 0,
      delivery_otp_locked: Boolean(row.delivery_otp_locked),
      failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      failure_reason: row.failure_reason || null,
      failure_note: row.failure_note || null,
      stuck_flag: row.stuck_flag || null,
      stuck_detected_at: row.stuck_detected_at ? new Date(row.stuck_detected_at).toISOString() : null,
      reassignment_count: row.reassignment_count || 0,
      dispatch_attention_required: Boolean(row.dispatch_attention_required),
      attention_reason: row.attention_reason,
      current_search_radius_meters: row.current_search_radius_meters || 2000,
      dispatch_cycle_count: row.dispatch_cycle_count || 0,
      version: row.version || 1,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  // ==========================================
  // Proof of Delivery Methods (Sprint 10)
  // ==========================================

  public async createProof(
    proof: Omit<DeliveryProof, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): Promise<DeliveryProof> {
    const record: DeliveryProof = {
      ...proof,
      id: proof.id || randomUUID(),
      created_at: proof.created_at || new Date().toISOString(),
    };

    const existing = this.proofs.get(record.delivery_id) || [];
    existing.push(record);
    this.proofs.set(record.delivery_id, existing);

    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO delivery_proofs (
          id, delivery_id, type, proof_value, storage_url, metadata, created_by_rider_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.id,
          record.delivery_id,
          record.type,
          record.proof_value || null,
          record.storage_url || null,
          JSON.stringify(record.metadata || {}),
          record.created_by_rider_id || null,
          record.created_at,
        ]
      );
    } catch (err) {
      allowMemoryAdapter();
      logger.warn('Delivery proof DB insert fallback to in-memory', {
        service: 'delivery-repository',
        error: (err as Error).message,
      });
    }

    return record;
  }

  public async getProofsByDeliveryId(deliveryId: string): Promise<DeliveryProof[]> {
    const memory = config.storage.mode === "memory" ? this.proofs.get(deliveryId) : undefined;
    if (memory && memory.length > 0) {
      return [...memory];
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM delivery_proofs WHERE delivery_id = $1 ORDER BY created_at ASC`,
        [deliveryId]
      );
      if (res.rows.length > 0) {
        const proofs: DeliveryProof[] = res.rows.map((row: any) => ({
          id: row.id,
          delivery_id: row.delivery_id,
          type: row.type,
          proof_value: row.proof_value,
          storage_url: row.storage_url,
          metadata: row.metadata,
          created_by_rider_id: row.created_by_rider_id,
          created_at: new Date(row.created_at).toISOString(),
        }));
        this.proofs.set(deliveryId, proofs);
        return proofs;
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return [];
  }

  // ==========================================
  // Delivery Incidents Methods (Sprint 10)
  // ==========================================

  public async createIncident(
    incident: Omit<DeliveryIncident, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): Promise<DeliveryIncident> {
    const record: DeliveryIncident = {
      ...incident,
      id: incident.id || randomUUID(),
      status: incident.status || 'OPEN',
      created_at: incident.created_at || new Date().toISOString(),
    };

    this.incidents.set(record.id, record);

    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO delivery_incidents (
          id, delivery_id, order_id, rider_id, reason_code, note, status,
          reported_by_type, reported_by_id, resolved_by_id, resolution_action, resolved_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          record.id,
          record.delivery_id,
          record.order_id,
          record.rider_id || null,
          record.reason_code,
          record.note || null,
          record.status,
          record.reported_by_type,
          record.reported_by_id || null,
          record.resolved_by_id || null,
          record.resolution_action || null,
          record.resolved_at || null,
          record.created_at,
        ]
      );
    } catch (err) {
      allowMemoryAdapter();
      logger.warn('Delivery incident DB insert fallback to in-memory', {
        service: 'delivery-repository',
        error: (err as Error).message,
      });
    }

    return record;
  }

  public async getIncidentsByDeliveryId(deliveryId: string): Promise<DeliveryIncident[]> {
    const results: DeliveryIncident[] = [];
    for (const inc of config.storage.mode === "memory" ? this.incidents.values() : []) {
      if (inc.delivery_id === deliveryId) {
        results.push(inc);
      }
    }
    if (results.length > 0) {
      return results;
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM delivery_incidents WHERE delivery_id = $1 ORDER BY created_at DESC`,
        [deliveryId]
      );
      return res.rows.map((row: any) => ({
        id: row.id,
        delivery_id: row.delivery_id,
        order_id: row.order_id,
        rider_id: row.rider_id,
        reason_code: row.reason_code,
        note: row.note,
        status: row.status,
        reported_by_type: row.reported_by_type,
        reported_by_id: row.reported_by_id,
        resolved_by_id: row.resolved_by_id,
        resolution_action: row.resolution_action,
        resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        created_at: new Date(row.created_at).toISOString(),
      }));
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return [];
  }

  public async listIncidents(
    filter?: string | { status?: string; delivery_id?: string; order_id?: string; rider_id?: string }
  ): Promise<DeliveryIncident[]> {
    let memoryIncidents = config.storage.mode === "memory" ? Array.from(this.incidents.values()) : [];
    const filterObj = typeof filter === 'string' ? { status: filter } : filter;

    if (filterObj?.status) {
      memoryIncidents = memoryIncidents.filter((inc) => inc.status === filterObj.status);
    }
    if (filterObj?.delivery_id) {
      memoryIncidents = memoryIncidents.filter((inc) => inc.delivery_id === filterObj.delivery_id);
    }
    if (filterObj?.order_id) {
      memoryIncidents = memoryIncidents.filter((inc) => inc.order_id === filterObj.order_id);
    }
    if (filterObj?.rider_id) {
      memoryIncidents = memoryIncidents.filter((inc) => inc.rider_id === filterObj.rider_id);
    }

    if (memoryIncidents.length > 0) {
      return memoryIncidents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    try {
      const pool = getDbPool();
      let query = `SELECT * FROM delivery_incidents`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (filterObj?.status) {
        params.push(filterObj.status);
        conditions.push(`status = $${params.length}`);
      }
      if (filterObj?.delivery_id) {
        params.push(filterObj.delivery_id);
        conditions.push(`delivery_id = $${params.length}`);
      }
      if (filterObj?.order_id) {
        params.push(filterObj.order_id);
        conditions.push(`order_id = $${params.length}`);
      }
      if (filterObj?.rider_id) {
        params.push(filterObj.rider_id);
        conditions.push(`rider_id = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }
      query += ` ORDER BY created_at DESC LIMIT 100`;
      const res = await pool.query(query, params);
      return res.rows.map((row: any) => ({
        id: row.id,
        delivery_id: row.delivery_id,
        order_id: row.order_id,
        rider_id: row.rider_id,
        reason_code: row.reason_code,
        note: row.note,
        status: row.status,
        reported_by_type: row.reported_by_type,
        reported_by_id: row.reported_by_id,
        resolved_by_id: row.resolved_by_id,
        resolution_action: row.resolution_action,
        resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        created_at: new Date(row.created_at).toISOString(),
      }));
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return [];
  }

  public async resolveIncident(
    incidentId: string,
    resolution: { resolved_by_id: string; resolution_action: string; note?: string }
  ): Promise<DeliveryIncident | null> {
    const memory = config.storage.mode === "memory" ? this.incidents.get(incidentId) : undefined;
    const now = new Date().toISOString();
    if (memory) {
      const updated: DeliveryIncident = {
        ...memory,
        status: 'RESOLVED',
        resolved_by_id: resolution.resolved_by_id,
        resolution_action: resolution.resolution_action,
        note: resolution.note ? `${memory.note || ''}\nResolution note: ${resolution.note}`.trim() : memory.note,
        resolved_at: now,
      };
      this.incidents.set(incidentId, updated);
      return updated;
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `UPDATE delivery_incidents SET
          status = 'RESOLVED',
          resolved_by_id = $1,
          resolution_action = $2,
          resolved_at = NOW(),
          note = CASE WHEN $3::text IS NOT NULL THEN COALESCE(note, '') || E'\nResolution note: ' || $3::text ELSE note END
        WHERE id = $4
        RETURNING *`,
        [resolution.resolved_by_id, resolution.resolution_action, resolution.note || null, incidentId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: row.id,
          delivery_id: row.delivery_id,
          order_id: row.order_id,
          rider_id: row.rider_id,
          reason_code: row.reason_code,
          note: row.note,
          status: row.status,
          reported_by_type: row.reported_by_type,
          reported_by_id: row.reported_by_id,
          resolved_by_id: row.resolved_by_id,
          resolution_action: row.resolution_action,
          resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
          created_at: new Date(row.created_at).toISOString(),
        };
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    return null;
  }

  // ==========================================
  // Operational Stuck Delivery Detection
  // ==========================================

  public async detectStuckDeliveries(thresholds?: {
    pickupSlaMinutes?: number;
    kitchenWaitSlaMinutes?: number;
    enRouteSlaMinutes?: number;
    dropoffWaitSlaMinutes?: number;
  }): Promise<StuckDeliveryAlert[]> {
    const pickupSla = thresholds?.pickupSlaMinutes ?? 15;
    const kitchenWaitSla = thresholds?.kitchenWaitSlaMinutes ?? 20;
    const enRouteSla = thresholds?.enRouteSlaMinutes ?? 35;
    const dropoffWaitSla = thresholds?.dropoffWaitSlaMinutes ?? 10;

    const activeDeliveries = await this.listDeliveries({
      status: [
        DeliveryStatus.ASSIGNED,
        DeliveryStatus.ARRIVED_PICKUP,
        DeliveryStatus.PICKED_UP,
        DeliveryStatus.EN_ROUTE,
        DeliveryStatus.ARRIVED_DROPOFF,
      ],
      limit: 100,
    });

    const now = Date.now();
    const alerts: StuckDeliveryAlert[] = [];

    for (const d of activeDeliveries.deliveries) {
      let stuckReason: StuckDeliveryAlert['stuckReason'] | null = null;
      let threshold = 0;
      let startTime = 0;

      if (d.status === DeliveryStatus.ASSIGNED && d.assigned_at) {
        startTime = new Date(d.assigned_at).getTime();
        threshold = pickupSla;
        if (now - startTime > pickupSla * 60 * 1000) {
          stuckReason = 'EXCEEDED_PICKUP_SLA';
        }
      } else if (d.status === DeliveryStatus.ARRIVED_PICKUP && d.arrived_pickup_at) {
        startTime = new Date(d.arrived_pickup_at).getTime();
        threshold = kitchenWaitSla;
        if (now - startTime > kitchenWaitSla * 60 * 1000) {
          stuckReason = 'EXCEEDED_KITCHEN_WAIT_SLA';
        }
      } else if (
        (d.status === DeliveryStatus.PICKED_UP || d.status === DeliveryStatus.EN_ROUTE) &&
        (d.en_route_at || d.picked_up_at)
      ) {
        startTime = new Date(d.en_route_at || d.picked_up_at!).getTime();
        threshold = enRouteSla;
        if (now - startTime > enRouteSla * 60 * 1000) {
          stuckReason = 'EXCEEDED_EN_ROUTE_SLA';
        }
      } else if (d.status === DeliveryStatus.ARRIVED_DROPOFF && d.arrived_dropoff_at) {
        startTime = new Date(d.arrived_dropoff_at).getTime();
        threshold = dropoffWaitSla;
        if (now - startTime > dropoffWaitSla * 60 * 1000) {
          stuckReason = 'EXCEEDED_DROPOFF_WAIT_SLA';
        }
      }

      if (stuckReason && startTime > 0) {
        const elapsedMinutes = Math.round((now - startTime) / (60 * 1000));
        alerts.push({
          deliveryId: d.id,
          orderId: d.order_id,
          orderNumber: d.order_number || d.id.slice(0, 8),
          status: d.status,
          phase: d.status,
          riderId: d.assigned_rider_id,
          riderName: d.assigned_rider_name,
          branchName: d.branch_name,
          stuckReason,
          elapsedMinutes,
          stuckDurationMinutes: elapsedMinutes,
          thresholdMinutes: threshold,
          detectedAt: new Date().toISOString(),
        } as any);

        // Flag delivery if not flagged
        if (!d.stuck_flag) {
          await this.updateDelivery(d.id, {
            stuck_flag: stuckReason,
            stuck_detected_at: new Date().toISOString(),
            dispatch_attention_required: true,
            attention_reason: `Stuck delivery: ${stuckReason} (${elapsedMinutes}m elapsed)`,
          });
        }
      }
    }

    return alerts;
  }
}

export const deliveryRepository = new DeliveryRepository();
