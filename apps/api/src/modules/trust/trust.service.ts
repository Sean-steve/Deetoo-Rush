import { randomUUID } from "node:crypto";
import { config } from "@deetoo/config";
import { TrustCaseSummary } from "@deetoo/types";
import { getDbPool } from "../../db/client";
import { AppError } from "../../middleware/error-handler";
import { supportService, SupportViewer } from "../operations/support.service";
import { fraudRiskService } from "../operations/risk.service";
import { orderRepository } from "../order/order.repository";
import { deliveryRepository } from "../order/delivery.repository";
import { paymentRepository } from "../payment/payment.repository";
import { merchantRepository } from "../merchant/merchant.repository";

export type TrustActor = SupportViewer;

type EvidenceType =
  | "PHOTO"
  | "VIDEO"
  | "DOCUMENT"
  | "DELIVERY_PROOF"
  | "GPS_HISTORY"
  | "ORDER_EVENT"
  | "PAYMENT_EVIDENCE"
  | "OTP_EVIDENCE"
  | "SYSTEM_EVENT";

type TrustEvidence = {
  id: string;
  trust_case_id: string;
  evidence_type: EvidenceType;
  media_object_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  summary?: string | null;
  snapshot: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
};

type ConductReport = {
  id: string;
  trust_case_id: string;
  rider_id: string;
  customer_id?: string | null;
  order_id?: string | null;
  delivery_id?: string | null;
  conduct_type: "EXTRA_PAYMENT_REQUEST" | "OFF_PLATFORM_PAYMENT" | "HARASSMENT" | "OTHER";
  authoritative_amount_minor?: number | null;
  requested_amount_minor?: number | null;
  currency: string;
  status: "OPEN" | "INVESTIGATING" | "SUBSTANTIATED" | "UNSUBSTANTIATED" | "CLOSED";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
};

function openedParty(actor: TrustActor): "CUSTOMER" | "MERCHANT" | "RIDER" | "STAFF" {
  if (actor.isStaff) return "STAFF";
  if (actor.roles.includes("rider")) return "RIDER";
  if (actor.roles.some((r) => ["merchant", "merchant_owner", "merchant_manager", "merchant_staff"].includes(r))) {
    return "MERCHANT";
  }
  return "CUSTOMER";
}

export class TrustService {
  private trustCases = new Map<string, TrustCaseSummary & { opened_by_party: string; opened_by_user_id: string }>();
  private evidence = new Map<string, TrustEvidence[]>();
  private conductReports = new Map<string, ConductReport>();

  public clearInMemory(): void {
    this.trustCases.clear();
    this.evidence.clear();
    this.conductReports.clear();
  }

  private async resolveLinks(
    actor: TrustActor,
    input: {
      order_id?: string;
      delivery_id?: string;
      payment_id?: string;
      refund_id?: string;
    },
  ): Promise<{
    order_id?: string | null;
    delivery_id?: string | null;
    payment_id?: string | null;
    refund_id?: string | null;
    merchant_id?: string | null;
    rider_id?: string | null;
    customer_id?: string | null;
  }> {
    let order = input.order_id ? await orderRepository.findById(input.order_id) : null;
    let delivery = input.delivery_id ? await deliveryRepository.findById(input.delivery_id) : null;

    if (delivery) {
      if (order && delivery.order_id !== order.id) {
        throw new AppError(409, "TRUST_LINK_MISMATCH", "Delivery does not belong to the supplied order");
      }
      order = order || (await orderRepository.findById(delivery.order_id));
    }

    let payment = input.payment_id ? await paymentRepository.findPaymentById(input.payment_id) : null;
    if (payment) {
      if (order && payment.order_id !== order.id) {
        throw new AppError(409, "TRUST_LINK_MISMATCH", "Payment does not belong to the supplied order");
      }
      order = order || (await orderRepository.findById(payment.order_id));
    }

    const refund = input.refund_id ? await paymentRepository.findRefundById(input.refund_id) : null;
    if (refund) {
      if (payment && refund.payment_id !== payment.id) {
        throw new AppError(409, "TRUST_LINK_MISMATCH", "Refund does not belong to the supplied payment");
      }
      payment = payment || (await paymentRepository.findPaymentById(refund.payment_id));
      if (payment) order = order || (await orderRepository.findById(payment.order_id));
    }

    if (input.order_id && !order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (input.delivery_id && !delivery) throw new AppError(404, "DELIVERY_NOT_FOUND", "Delivery not found");
    if (input.payment_id && !payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found");
    if (input.refund_id && !refund) throw new AppError(404, "REFUND_NOT_FOUND", "Refund not found");

    if (order && !delivery) delivery = await deliveryRepository.findByOrderId(order.id);

    let merchantId: string | null = (order as any)?.merchant_id || null;
    if (!merchantId && (order as any)?.branch_id) {
      const branch = await merchantRepository.findBranchById((order as any).branch_id);
      merchantId = branch?.merchant_id || null;
    }
    const riderId = delivery?.assigned_rider_id || null;
    const customerId = order?.customer_id || payment?.customer_id || null;

    if (!actor.isStaff && order) {
      const party = openedParty(actor);
      const authorized =
        (party === "CUSTOMER" && customerId === actor.id) ||
        (party === "MERCHANT" && Boolean(merchantId && actor.merchant_ids?.includes(merchantId))) ||
        (party === "RIDER" && Boolean(riderId && (riderId === actor.rider_id || riderId === actor.id)));
      if (!authorized) {
        throw new AppError(403, "FORBIDDEN_TRUST_CASE", "You are not a participant in the linked order or delivery");
      }
    }

    return {
      order_id: order?.id || null,
      delivery_id: delivery?.id || null,
      payment_id: payment?.id || null,
      refund_id: refund?.id || null,
      merchant_id: merchantId,
      rider_id: riderId,
      customer_id: customerId,
    };
  }

  private async saveTrustCase(
    trust: TrustCaseSummary & { opened_by_party: string; opened_by_user_id: string },
  ): Promise<void> {
    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO trust_cases
          (id,support_case_id,kind,opened_by_party,opened_by_user_id,order_id,delivery_id,payment_id,refund_id,merchant_id,rider_id,customer_id,allegation_code,review_status,enforcement_status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          trust.id, trust.support_case_id, trust.kind, trust.opened_by_party,
          trust.opened_by_user_id, trust.order_id || null, trust.delivery_id || null,
          trust.payment_id || null, trust.refund_id || null, trust.merchant_id || null,
          trust.rider_id || null, trust.customer_id || null, trust.allegation_code || null,
          trust.review_status, trust.enforcement_status, trust.created_at, trust.updated_at,
        ],
      );
    } else {
      this.trustCases.set(trust.id, trust);
    }
  }

  private async addEvidenceRecord(evidence: TrustEvidence): Promise<TrustEvidence> {
    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO dispute_evidence
          (id,trust_case_id,evidence_type,media_object_id,reference_type,reference_id,summary,snapshot,created_by,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          evidence.id, evidence.trust_case_id, evidence.evidence_type,
          evidence.media_object_id || null, evidence.reference_type || null,
          evidence.reference_id || null, evidence.summary || null,
          JSON.stringify(evidence.snapshot || {}), evidence.created_by || null,
          evidence.created_at,
        ],
      );
    } else {
      const list = this.evidence.get(evidence.trust_case_id) || [];
      list.push(evidence);
      this.evidence.set(evidence.trust_case_id, list);
    }
    return evidence;
  }

  private async createSystemEvidence(trust: TrustCaseSummary, actorId: string): Promise<void> {
    if (trust.order_id) {
      const order = await orderRepository.findById(trust.order_id);
      if (order) {
        await this.addEvidenceRecord({
          id: randomUUID(),
          trust_case_id: trust.id,
          evidence_type: "ORDER_EVENT",
          reference_type: "ORDER",
          reference_id: order.id,
          summary: "Order lifecycle snapshot when dispute was opened",
          snapshot: {
            order_number: order.order_number,
            status: order.status,
            total_minor: order.total_minor,
            currency: order.currency,
            timeline: (order.timeline || []).map((event: any) => ({
              from_status: event.from_status,
              to_status: event.to_status,
              reason_code: event.reason_code || null,
              created_at: event.created_at,
            })),
          },
          created_by: actorId,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (trust.delivery_id) {
      const delivery = await deliveryRepository.findById(trust.delivery_id);
      if (delivery) {
        const proofs = await deliveryRepository.getProofsByDeliveryId(delivery.id);
        const timeline = await deliveryRepository.getTimelineByDeliveryId(delivery.id);
        await this.addEvidenceRecord({
          id: randomUUID(),
          trust_case_id: trust.id,
          evidence_type: "DELIVERY_PROOF",
          reference_type: "DELIVERY",
          reference_id: delivery.id,
          summary: "Delivery proof and lifecycle snapshot",
          snapshot: {
            status: delivery.status,
            assigned_rider_id: delivery.assigned_rider_id || null,
            picked_up_at: delivery.picked_up_at || null,
            arrived_dropoff_at: delivery.arrived_dropoff_at || null,
            delivered_at: delivery.delivered_at || null,
            proofs: proofs.map((proof: any) => ({
              type: proof.type,
              created_at: proof.created_at,
              verified: proof.type === "OTP" ? proof.proof_value === "OTP_VERIFIED" : undefined,
              media_object_id: proof.media_object_id || undefined,
            })),
            timeline: timeline.map((event: any) => ({
              from_status: event.from_status,
              to_status: event.to_status,
              action: event.action,
              reason_code: event.reason_code || null,
              created_at: event.created_at,
            })),
          },
          created_by: actorId,
          created_at: new Date().toISOString(),
        });
        await this.addEvidenceRecord({
          id: randomUUID(),
          trust_case_id: trust.id,
          evidence_type: "OTP_EVIDENCE",
          reference_type: "DELIVERY",
          reference_id: delivery.id,
          summary: "Handover-code verification metadata (secret code omitted)",
          snapshot: {
            attempts: delivery.delivery_otp_attempts || 0,
            locked: Boolean(delivery.delivery_otp_locked),
            otp_proof_recorded: proofs.some((proof: any) => proof.type === "OTP" && proof.proof_value === "OTP_VERIFIED"),
          },
          created_by: actorId,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (trust.order_id) {
      const payments = await paymentRepository.findPaymentsByOrderId(trust.order_id);
      const refunds = await paymentRepository.findRefundsByOrderId(trust.order_id);
      if (payments.length || refunds.length) {
        await this.addEvidenceRecord({
          id: randomUUID(),
          trust_case_id: trust.id,
          evidence_type: "PAYMENT_EVIDENCE",
          reference_type: "ORDER",
          reference_id: trust.order_id,
          summary: "Payment/refund state snapshot",
          snapshot: {
            payments: payments.map((payment: any) => ({
              id: payment.id,
              method: payment.method,
              status: payment.status,
              amount_minor: payment.amount_minor,
              captured_minor: payment.captured_minor,
              refunded_minor: payment.refunded_minor,
              reconciliation_status: payment.reconciliation_status || null,
            })),
            refunds: refunds.map((item: any) => ({
              id: item.id,
              amount_minor: item.amount_minor,
              status: item.status,
              reason_code: item.reason_code,
            })),
          },
          created_by: actorId,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  public async openDispute(
    actor: TrustActor,
    input: {
      subject: string;
      description: string;
      category?: string;
      order_id?: string;
      delivery_id?: string;
      payment_id?: string;
      refund_id?: string;
      allegation_code?: string;
      media_ids?: string[];
    },
  ): Promise<{ trust_case: TrustCaseSummary; support_case: any }> {
    if (!input.subject?.trim() || !input.description?.trim()) {
      throw new AppError(400, "DISPUTE_DETAILS_REQUIRED", "Subject and description are required");
    }
    const links = await this.resolveLinks(actor, input);
    const party = openedParty(actor);

    const supportCase = await supportService.createCase({
      customer_id: links.customer_id || (party === "CUSTOMER" ? actor.id : undefined),
      merchant_id: links.merchant_id || (party === "MERCHANT" ? actor.merchant_ids?.[0] : undefined),
      rider_id: links.rider_id || (party === "RIDER" ? actor.rider_id : undefined),
      order_id: links.order_id || undefined,
      delivery_id: links.delivery_id || undefined,
      payment_id: links.payment_id || undefined,
      category: input.category || "DISPUTE",
      priority: "MEDIUM" as any,
      subject: input.subject.trim(),
      description: input.description.trim(),
      creator: { id: actor.id, name: actor.name, role: actor.roles[0] || "customer" },
    });

    const now = new Date().toISOString();
    const trust: TrustCaseSummary & { opened_by_party: string; opened_by_user_id: string } = {
      id: randomUUID(),
      support_case_id: supportCase.id,
      kind: "DISPUTE",
      review_status: "OPEN",
      enforcement_status: "NONE",
      ...links,
      allegation_code: input.allegation_code || "GENERAL_DISPUTE",
      created_at: now,
      updated_at: now,
      opened_by_party: party,
      opened_by_user_id: actor.id,
    };
    await this.saveTrustCase(trust);
    await this.createSystemEvidence(trust, actor.id);

    if (input.media_ids?.length) {
      await supportService.addNote(
        supportCase.id,
        actor,
        "ALL_PARTICIPANTS" as any,
        "Evidence attached to this dispute.",
        input.media_ids,
      );
      for (const mediaId of input.media_ids) {
        await this.addEvidenceRecord({
          id: randomUUID(),
          trust_case_id: trust.id,
          evidence_type: "DOCUMENT",
          media_object_id: mediaId,
          reference_type: "SUPPORT_CASE",
          reference_id: supportCase.id,
          summary: "Participant-supplied dispute evidence",
          snapshot: {},
          created_by: actor.id,
          created_at: new Date().toISOString(),
        });
      }
    }

    return { trust_case: trust, support_case: supportCase };
  }

  private async trustByIdOrSupportId(id: string): Promise<(TrustCaseSummary & { opened_by_party?: string; opened_by_user_id?: string }) | null> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM trust_cases WHERE id=$1 OR support_case_id=$1 LIMIT 1",
        [id],
      );
      const row = result.rows[0];
      return row ? {
        ...row,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      } : null;
    }
    return [...this.trustCases.values()].find((item) => item.id === id || item.support_case_id === id) || null;
  }

  private async evidenceForCase(trustId: string): Promise<TrustEvidence[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM dispute_evidence WHERE trust_case_id=$1 ORDER BY created_at",
        [trustId],
      );
      return result.rows.map((row: any) => ({
        ...row,
        snapshot: typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot || {},
        created_at: new Date(row.created_at).toISOString(),
      }));
    }
    return this.evidence.get(trustId) || [];
  }

  public async getDispute(
    id: string,
    actor: TrustActor,
  ): Promise<{ trust_case: TrustCaseSummary; conversation: any; evidence: TrustEvidence[] }> {
    const trust = await this.trustByIdOrSupportId(id);
    if (!trust || trust.kind !== "DISPUTE") throw new AppError(404, "DISPUTE_NOT_FOUND", "Dispute not found");
    const conversation = await supportService.getCaseById(trust.support_case_id, actor);
    let evidence = await this.evidenceForCase(trust.id);
    if (!actor.isStaff) {
      evidence = evidence.filter((item) => !["GPS_HISTORY", "SYSTEM_EVENT"].includes(item.evidence_type));
    }
    return { trust_case: trust, conversation, evidence };
  }

  public async listDisputes(actor: TrustActor): Promise<Array<TrustCaseSummary & { case_number?: string; subject?: string; status?: string }>> {
    if (config.storage.mode === "postgres") {
      let where = "t.kind='DISPUTE'";
      const params: any[] = [];
      if (!actor.isStaff) {
        if (openedParty(actor) === "CUSTOMER") {
          params.push(actor.id); where += ` AND t.customer_id=$${params.length}`;
        } else if (openedParty(actor) === "RIDER") {
          params.push(actor.rider_id || actor.id); where += ` AND t.rider_id=$${params.length}`;
        } else {
          params.push(actor.merchant_ids || []); where += ` AND t.merchant_id=ANY($${params.length}::uuid[])`;
        }
      }
      const result = await getDbPool().query(
        `SELECT t.*,s.case_number,s.subject,s.status
           FROM trust_cases t JOIN support_cases s ON s.id=t.support_case_id
          WHERE ${where} ORDER BY t.created_at DESC LIMIT 100`,
        params,
      );
      return result.rows.map((row: any) => ({
        ...row,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      }));
    }

    const items = [...this.trustCases.values()].filter((item) => item.kind === "DISPUTE");
    const visible: any[] = [];
    for (const item of items) {
      try {
        const conversation = await supportService.getCaseById(item.support_case_id, actor);
        visible.push({
          ...item,
          case_number: conversation.case.case_number,
          subject: conversation.case.subject,
          status: conversation.case.status,
        });
      } catch (error: any) {
        if (error?.statusCode !== 403 && error?.status !== 403) throw error;
      }
    }
    return visible.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async addEvidence(
    trustId: string,
    actor: TrustActor,
    input: {
      evidence_type: EvidenceType;
      media_object_id?: string;
      summary?: string;
      snapshot?: Record<string, unknown>;
    },
  ): Promise<TrustEvidence> {
    const trust = await this.trustByIdOrSupportId(trustId);
    if (!trust) throw new AppError(404, "TRUST_CASE_NOT_FOUND", "Trust case not found");
    await supportService.getCaseById(trust.support_case_id, actor);

    if (!actor.isStaff && ["GPS_HISTORY", "SYSTEM_EVENT"].includes(input.evidence_type)) {
      throw new AppError(403, "STAFF_EVIDENCE_ONLY", "This evidence class is restricted to authorized staff");
    }

    if (input.media_object_id) {
      await supportService.addNote(
        trust.support_case_id,
        actor,
        "ALL_PARTICIPANTS" as any,
        input.summary || "Evidence added to this case.",
        [input.media_object_id],
      );
    }

    return this.addEvidenceRecord({
      id: randomUUID(),
      trust_case_id: trust.id,
      evidence_type: input.evidence_type,
      media_object_id: input.media_object_id || null,
      reference_type: "SUPPORT_CASE",
      reference_id: trust.support_case_id,
      summary: input.summary || null,
      snapshot: input.snapshot || {},
      created_by: actor.id,
      created_at: new Date().toISOString(),
    });
  }

  public async reportExtraPaymentRequest(
    actor: TrustActor,
    input: {
      order_id: string;
      requested_amount_minor: number;
      description?: string;
      media_ids?: string[];
    },
  ): Promise<{ trust_case: TrustCaseSummary; support_case: any; conduct_report: ConductReport }> {
    if (!Number.isSafeInteger(input.requested_amount_minor) || input.requested_amount_minor < 0) {
      throw new AppError(400, "INVALID_REQUESTED_AMOUNT", "Requested amount must be a non-negative integer minor-unit amount");
    }
    const links = await this.resolveLinks(actor, { order_id: input.order_id });
    if (!links.rider_id || !links.delivery_id) {
      throw new AppError(409, "RIDER_NOT_LINKED", "This order does not currently have a linked Rider delivery");
    }
    const order = await orderRepository.findById(input.order_id);
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

    const payments = await paymentRepository.findPaymentsByOrderId(order.id);
    const netCaptured = payments.reduce(
      (sum: number, payment: any) => sum + Math.max(0, (payment.captured_minor || 0) - (payment.refunded_minor || 0)),
      0,
    );
    const authoritativeAmount = Math.max(0, (order.total_minor || 0) - netCaptured);
    const description = input.description?.trim() ||
      `A Rider requested KES ${(input.requested_amount_minor / 100).toFixed(2)} outside the amount shown by DeeToo.`;

    const supportCase = await supportService.createCase({
      customer_id: links.customer_id || undefined,
      merchant_id: links.merchant_id || undefined,
      rider_id: links.rider_id,
      order_id: links.order_id || undefined,
      delivery_id: links.delivery_id || undefined,
      payment_id: links.payment_id || undefined,
      category: "RIDER_CONDUCT",
      priority: "HIGH" as any,
      subject: "Report extra payment request",
      description,
      creator: { id: actor.id, name: actor.name, role: actor.roles[0] || "customer" },
    });

    const now = new Date().toISOString();
    const trust: TrustCaseSummary & { opened_by_party: string; opened_by_user_id: string } = {
      id: randomUUID(),
      support_case_id: supportCase.id,
      kind: "CONDUCT",
      review_status: "OPEN",
      enforcement_status: "NONE",
      ...links,
      allegation_code: "EXTRA_PAYMENT_REQUEST",
      created_at: now,
      updated_at: now,
      opened_by_party: openedParty(actor),
      opened_by_user_id: actor.id,
    };
    await this.saveTrustCase(trust);

    const report: ConductReport = {
      id: randomUUID(),
      trust_case_id: trust.id,
      rider_id: links.rider_id,
      customer_id: links.customer_id || null,
      order_id: links.order_id || null,
      delivery_id: links.delivery_id || null,
      conduct_type: "EXTRA_PAYMENT_REQUEST",
      authoritative_amount_minor: authoritativeAmount,
      requested_amount_minor: input.requested_amount_minor,
      currency: order.currency || "KES",
      status: "OPEN",
      created_at: now,
    };

    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO rider_conduct_reports
          (id,trust_case_id,rider_id,customer_id,order_id,delivery_id,conduct_type,authoritative_amount_minor,requested_amount_minor,currency,status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          report.id, report.trust_case_id, report.rider_id, report.customer_id,
          report.order_id, report.delivery_id, report.conduct_type,
          report.authoritative_amount_minor, report.requested_amount_minor,
          report.currency, report.status, report.created_at,
        ],
      );
    } else {
      this.conductReports.set(report.id, report);
    }

    await fraudRiskService.recordRiskSignal({
      signalType: "RIDER_EXTRA_PAYMENT_REQUEST",
      severity: "MEDIUM" as any,
      customerId: links.customer_id,
      merchantId: links.merchant_id,
      riderId: links.rider_id,
      orderId: links.order_id,
      scoreWeight: 15,
      metadata: {
        trust_case_id: trust.id,
        conduct_report_id: report.id,
        authoritative_amount_minor: authoritativeAmount,
        requested_amount_minor: input.requested_amount_minor,
        allegation_only: true,
      },
    });

    await this.addEvidenceRecord({
      id: randomUUID(),
      trust_case_id: trust.id,
      evidence_type: "SYSTEM_EVENT",
      reference_type: "ORDER",
      reference_id: order.id,
      summary: "Authoritative amount comparison",
      snapshot: {
        order_total_minor: order.total_minor,
        net_captured_minor: netCaptured,
        authoritative_amount_due_minor: authoritativeAmount,
        requested_amount_minor: input.requested_amount_minor,
      },
      created_by: actor.id,
      created_at: now,
    });
    await this.createSystemEvidence(trust, actor.id);

    if (input.media_ids?.length) {
      await supportService.addNote(
        supportCase.id,
        actor,
        "ALL_PARTICIPANTS" as any,
        "Evidence attached to the extra-payment report.",
        input.media_ids,
      );
    }

    return { trust_case: trust, support_case: supportCase, conduct_report: report };
  }

  public async listConductReports(): Promise<ConductReport[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM rider_conduct_reports ORDER BY created_at DESC LIMIT 200",
      );
      return result.rows.map((row: any) => ({
        ...row,
        authoritative_amount_minor: row.authoritative_amount_minor == null ? null : Number(row.authoritative_amount_minor),
        requested_amount_minor: row.requested_amount_minor == null ? null : Number(row.requested_amount_minor),
        created_at: new Date(row.created_at).toISOString(),
        reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      }));
    }
    return [...this.conductReports.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async reviewConduct(
    reportId: string,
    actor: TrustActor,
    decision: "SUBSTANTIATED" | "UNSUBSTANTIATED",
    note: string,
  ): Promise<{ report: ConductReport; enforcement_recommendation: string; human_review_required: true }> {
    if (!actor.isStaff || !actor.roles.some((role) => ["super_admin", "admin", "ops", "support"].includes(role))) {
      throw new AppError(403, "TRUST_REVIEW_REQUIRED", "Authorized Trust/Operations staff are required");
    }

    let report: ConductReport | undefined;
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query("SELECT * FROM rider_conduct_reports WHERE id=$1", [reportId]);
      if (result.rows[0]) report = { ...result.rows[0], requested_amount_minor: Number(result.rows[0].requested_amount_minor) };
    } else {
      report = this.conductReports.get(reportId);
    }
    if (!report) throw new AppError(404, "CONDUCT_REPORT_NOT_FOUND", "Conduct report not found");

    const now = new Date().toISOString();
    const updated: ConductReport = {
      ...report,
      status: decision,
      reviewed_by: actor.id,
      reviewed_at: now,
      review_note: note,
    };

    let substantiatedCount = 0;
    if (decision === "SUBSTANTIATED") {
      if (config.storage.mode === "postgres") {
        const result = await getDbPool().query(
          "SELECT count(*)::int AS n FROM rider_conduct_reports WHERE rider_id=$1 AND status='SUBSTANTIATED' AND id<>$2",
          [report.rider_id, report.id],
        );
        substantiatedCount = Number(result.rows[0]?.n || 0) + 1;
      } else {
        substantiatedCount =
          [...this.conductReports.values()].filter(
            (item) => item.id !== report!.id && item.rider_id === report!.rider_id && item.status === "SUBSTANTIATED",
          ).length + 1;
      }
    }

    const recommendation =
      decision === "UNSUBSTANTIATED"
        ? "NONE"
        : substantiatedCount >= 3
          ? "TEMP_SUSPENSION_RECOMMENDED"
          : substantiatedCount === 2
            ? "INVESTIGATION_RECOMMENDED"
            : "WARNING_RECOMMENDED";

    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        "UPDATE rider_conduct_reports SET status=$1,reviewed_by=$2,reviewed_at=$3,review_note=$4 WHERE id=$5",
        [decision, actor.id, now, note, report.id],
      );
      await getDbPool().query(
        `UPDATE trust_cases
            SET review_status=$1,enforcement_status=$2,updated_at=$3
          WHERE id=$4`,
        [
          decision,
          recommendation === "NONE" ? "NONE" : recommendation,
          now,
          report.trust_case_id,
        ],
      );
    } else {
      this.conductReports.set(updated.id, updated);
      const trust = this.trustCases.get(report.trust_case_id);
      if (trust) {
        this.trustCases.set(trust.id, {
          ...trust,
          review_status: decision,
          enforcement_status: recommendation === "NONE" ? "NONE" : recommendation,
          updated_at: now,
        });
      }
    }

    if (decision === "SUBSTANTIATED") {
      await fraudRiskService.recordRiskSignal({
        signalType: "RIDER_CONDUCT_CONFIRMED",
        severity: substantiatedCount >= 3 ? "HIGH" as any : "MEDIUM" as any,
        riderId: report.rider_id,
        orderId: report.order_id,
        customerId: report.customer_id,
        scoreWeight: Math.min(50, 15 + substantiatedCount * 10),
        metadata: {
          conduct_report_id: report.id,
          substantiated_count: substantiatedCount,
          enforcement_recommendation: recommendation,
          automatic_enforcement: false,
        },
      });
    }

    return {
      report: updated,
      enforcement_recommendation: recommendation,
      human_review_required: true,
    };
  }
}

export const trustService = new TrustService();
