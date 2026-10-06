import { randomUUID } from "node:crypto";
import { config } from "@deetoo/config";
import { OrderStatus } from "@deetoo/types";
import { getDbPool } from "../../db/client";
import { orderRepository } from "../order/order.repository";
import { deliveryRepository } from "../order/delivery.repository";
import { paymentRepository } from "../payment/payment.repository";
import { trustService, TrustActor } from "./trust.service";

export type CancellationStage =
  | "BEFORE_ACCEPTANCE"
  | "PREPARATION"
  | "RIDER_ASSIGNED"
  | "AFTER_PICKUP"
  | "TERMINAL";

export type CancellationOutcome = "AUTO_CANCEL" | "SUPPORT_REVIEW" | "NOT_CANCELLABLE";

export interface CancellationAssessment {
  id: string;
  order_id: string;
  requested_by: string;
  stage: CancellationStage;
  outcome: CancellationOutcome;
  customer_refund_minor?: number | null;
  merchant_compensation_minor?: number | null;
  rider_compensation_minor?: number | null;
  support_case_id?: string | null;
  reason_code?: string | null;
  calculation_snapshot: Record<string, unknown>;
  created_at: string;
}

export class CancellationPolicyService {
  private assessments = new Map<string, CancellationAssessment>();

  public clearInMemory(): void {
    this.assessments.clear();
  }

  private async persist(assessment: CancellationAssessment): Promise<CancellationAssessment> {
    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO cancellation_assessments
          (id,order_id,requested_by,stage,outcome,customer_refund_minor,merchant_compensation_minor,rider_compensation_minor,support_case_id,reason_code,calculation_snapshot,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          assessment.id,
          assessment.order_id,
          assessment.requested_by,
          assessment.stage,
          assessment.outcome,
          assessment.customer_refund_minor ?? null,
          assessment.merchant_compensation_minor ?? null,
          assessment.rider_compensation_minor ?? null,
          assessment.support_case_id || null,
          assessment.reason_code || null,
          JSON.stringify(assessment.calculation_snapshot || {}),
          assessment.created_at,
        ],
      );
    } else {
      this.assessments.set(assessment.id, assessment);
    }
    return assessment;
  }

  public async assessCustomerCancellation(
    actor: TrustActor,
    orderId: string,
    reasonCode: string,
    note?: string,
  ): Promise<CancellationAssessment> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");

    const delivery = await deliveryRepository.findByOrderId(orderId);
    const payments = await paymentRepository.findPaymentsByOrderId(orderId);
    const netCapturedMinor = payments.reduce(
      (sum: number, payment: any) =>
        sum + Math.max(0, (payment.captured_minor || 0) - (payment.refunded_minor || 0)),
      0,
    );

    let stage: CancellationStage;
    let outcome: CancellationOutcome;
    if ([OrderStatus.COMPLETED, OrderStatus.REJECTED, OrderStatus.CANCELLED].includes(order.status)) {
      stage = "TERMINAL";
      outcome = "NOT_CANCELLABLE";
    } else if (
      delivery &&
      (delivery.picked_up_at ||
        ["PICKED_UP", "EN_ROUTE", "ARRIVED_DROPOFF", "DELIVERED"].includes(String(delivery.status)))
    ) {
      stage = "AFTER_PICKUP";
      outcome = "SUPPORT_REVIEW";
    } else if (
      delivery?.assigned_rider_id &&
      ["ASSIGNED", "ARRIVED_PICKUP", "OFFERED"].includes(String(delivery.status))
    ) {
      stage = "RIDER_ASSIGNED";
      outcome = "SUPPORT_REVIEW";
    } else if ([OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY].includes(order.status)) {
      stage = "PREPARATION";
      outcome = "SUPPORT_REVIEW";
    } else {
      stage = "BEFORE_ACCEPTANCE";
      outcome = "AUTO_CANCEL";
    }

    const now = new Date().toISOString();
    const assessment: CancellationAssessment = {
      id: randomUUID(),
      order_id: order.id,
      requested_by: actor.id,
      stage,
      outcome,
      customer_refund_minor: outcome === "AUTO_CANCEL" ? netCapturedMinor : null,
      merchant_compensation_minor: outcome === "AUTO_CANCEL" ? 0 : null,
      rider_compensation_minor: outcome === "AUTO_CANCEL" ? 0 : null,
      support_case_id: null,
      reason_code: reasonCode,
      calculation_snapshot: {
        order_status: order.status,
        delivery_status: delivery?.status || null,
        rider_assigned: Boolean(delivery?.assigned_rider_id),
        pickup_completed: Boolean(delivery?.picked_up_at),
        net_captured_minor: netCapturedMinor,
        maximum_refundable_minor: netCapturedMinor,
        explanation:
          outcome === "AUTO_CANCEL"
            ? "Cancellation is before merchant acceptance; captured funds are eligible for the normal cancellation/refund workflow."
            : outcome === "SUPPORT_REVIEW"
              ? "Operational work has started. Merchant/Rider compensation and fault must be reviewed before money moves."
              : "The order is already terminal and cannot be cancelled.",
      },
      created_at: now,
    };

    if (outcome === "SUPPORT_REVIEW") {
      const opened = await trustService.openDispute(actor, {
        subject: `Cancellation review — ${order.order_number || order.id}`,
        description:
          note?.trim() ||
          `Cancellation requested during ${stage.toLowerCase().replaceAll("_", " ")}. DeeToo Support must review fulfilment progress and financial consequences before confirming the outcome.`,
        category: "CANCELLATION",
        order_id: order.id,
        delivery_id: delivery?.id,
        allegation_code: "CANCELLATION_REQUEST",
      });
      assessment.support_case_id = opened.support_case.id;
      assessment.calculation_snapshot = {
        ...assessment.calculation_snapshot,
        trust_case_id: opened.trust_case.id,
      };
    }

    return this.persist(assessment);
  }

  public async listForOrder(orderId: string): Promise<CancellationAssessment[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM cancellation_assessments WHERE order_id=$1 ORDER BY created_at DESC",
        [orderId],
      );
      return result.rows.map((row: any) => ({
        ...row,
        customer_refund_minor: row.customer_refund_minor == null ? null : Number(row.customer_refund_minor),
        merchant_compensation_minor: row.merchant_compensation_minor == null ? null : Number(row.merchant_compensation_minor),
        rider_compensation_minor: row.rider_compensation_minor == null ? null : Number(row.rider_compensation_minor),
        calculation_snapshot:
          typeof row.calculation_snapshot === "string"
            ? JSON.parse(row.calculation_snapshot)
            : row.calculation_snapshot || {},
        created_at: new Date(row.created_at).toISOString(),
      }));
    }
    return [...this.assessments.values()]
      .filter((item) => item.order_id === orderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export const cancellationPolicyService = new CancellationPolicyService();
