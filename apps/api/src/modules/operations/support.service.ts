import { authRepository } from '../auth/auth.repository';
import { transactionalService } from '../../db/transaction';
import { AppError } from "../../middleware/error-handler";
/**
 * DEETOO - Support Service
 * Sprint 13: Customer, Merchant, Rider, and Operations Support Workflow
 * Handles case lifecycle, internal vs customer-visible notes, and refund issuance.
 */

import { randomUUID } from "crypto";
import { logger } from "@deetoo/utils";
import {
  SupportCase,
  SupportCaseNote,
  SupportCaseStatus,
  SupportCasePriority,
  SupportCaseCategory,
  SupportNoteVisibility,
  Refund,
  PaymentStatus,
} from "@deetoo/types";
import { operationsRepository } from "./operations.repository";
import { paymentRepository } from "../payment/payment.repository";
import { paymentService } from "../payment/payment.service";
import { orderRepository } from "../order/order.repository";
import { orderEventBroker } from "../realtime/event-broker";

export interface SupportViewer {
  id: string;
  name: string;
  email?: string;
  roles: string[];
  isStaff: boolean; // true for admin, ops, support
  merchant_ids?: string[];
  rider_id?: string;
}

export class SupportService {
  /**
   * Create a new support case
   */
  public async createCase(params: {
    customer_id?: string | null;
    merchant_id?: string | null;
    rider_id?: string | null;
    order_id?: string | null;
    delivery_id?: string | null;
    payment_id?: string | null;
    category: SupportCaseCategory | string;
    priority?: SupportCasePriority;
    subject: string;
    description: string;
    creator: { id: string; name: string; role: string };
  }): Promise<SupportCase> {
    // If order_id provided, validate existence and link customer/merchant if missing
    if (params.order_id) {
      const order = await orderRepository.findById(params.order_id);
      if (order) {
        if (!params.customer_id) params.customer_id = order.customer_id;
        if (!params.merchant_id)
          params.merchant_id =
            (order as any).merchant_id || (order as any).branch_id;
      }
    }

    const caseId = randomUUID();
    const supportCase = await operationsRepository.createSupportCase({
      id: caseId,
      customer_id: params.customer_id,
      merchant_id: params.merchant_id,
      rider_id: params.rider_id,
      order_id: params.order_id,
      delivery_id: params.delivery_id,
      payment_id: params.payment_id,
      category: params.category,
      priority: params.priority || "MEDIUM",
      subject: params.subject,
      description: params.description,
    });

    // Add initial customer-visible note with the initial description
    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: params.creator.id,
      author_role: params.creator.role,
      author_name: params.creator.name,
      visibility: "CUSTOMER_VISIBLE",
      body: params.description,
      created_at: new Date().toISOString(),
    });

    // Emit realtime event
    await orderEventBroker.publish("admin:operations", {
      channel: "admin:operations",
      type: "support.case_created",
      orderId: params.order_id || "",
      orderNumber: supportCase.case_number,
      status: "OPEN" as any,
      timestamp: new Date().toISOString(),
      data: supportCase,
    });

    return supportCase;
  }

  /**
   * Get support case by ID, enforcing role-based visibility and masking internal notes
   */
  public async getCaseById(
    caseId: string,
    viewer: SupportViewer,
  ): Promise<{ case: SupportCase; notes: SupportCaseNote[] }> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    // Role-based authorization
    if (!viewer.isStaff) {
      const isCustomerOwner =
        supportCase.customer_id && supportCase.customer_id === viewer.id;
      const isMerchantOwner =
        supportCase.merchant_id &&
        viewer.merchant_ids?.includes(supportCase.merchant_id);
      const isRiderOwner =
        supportCase.rider_id &&
        (supportCase.rider_id === viewer.rider_id ||
          supportCase.rider_id === viewer.id);

      if (!isCustomerOwner && !isMerchantOwner && !isRiderOwner) {
        throw new AppError(
          403,
          "FORBIDDEN_CASE",
          "Access denied to this support case",
        );
      }
    }

    if (viewer.roles.includes('support')) {
      await authRepository.createAuditLog({actor_user_id:viewer.id,actor_role:'support',action:'SUPPORT_CASE_READ' as any,resource_type:'SUPPORT_CASE',resource_id:caseId,reason:'Case investigation',metadata:{order_id:supportCase.order_id}});
    }
    const notes = await operationsRepository.getSupportCaseNotes(
      caseId,
      viewer.isStaff,
    );

    return {
      case: supportCase,
      notes,
    };
  }

  /**
   * List support cases with role filtering
   */
  public async listCases(
    filter: {
      status?: SupportCaseStatus;
      priority?: SupportCasePriority;
      order_id?: string;
      limit?: number;
      offset?: number;
    },
    viewer: SupportViewer,
  ): Promise<{ cases: SupportCase[]; total: number }> {
    const queryFilter: any = { ...filter };

    if (!viewer.isStaff) {
      // Non-staff only see their own
      if (viewer.roles.includes("customer")) {
        queryFilter.customer_id = viewer.id;
      } else if (viewer.roles.includes("rider")) {
        queryFilter.rider_id = viewer.rider_id || viewer.id;
      } else if (
        viewer.roles.some((role) =>
          [
            "merchant",
            "merchant_owner",
            "merchant_manager",
            "merchant_staff",
          ].includes(role),
        )
      ) {
        // if user has single merchant
        if (viewer.merchant_ids && viewer.merchant_ids.length > 0) {
          queryFilter.merchant_id = viewer.merchant_ids[0];
        } else {
          return { cases: [], total: 0 };
        }
      } else {
        return { cases: [], total: 0 };
      }
    }

    return operationsRepository.findSupportCases(queryFilter);
  }

  /**
   * Add a note to a support case with internal leak protection
   */
  public async addNote(
    caseId: string,
    author: SupportViewer,
    visibility: SupportNoteVisibility,
    body: string,
  ): Promise<SupportCaseNote> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await this.getCaseById(caseId, author);

    // Non-staff users can NEVER add INTERNAL notes
    let noteVisibility = visibility;
    if (!author.isStaff) {
      noteVisibility = "CUSTOMER_VISIBLE";
    }

    const note: SupportCaseNote = {
      id: randomUUID(),
      case_id: caseId,
      author_user_id: author.id,
      author_role: author.roles[0] || "customer",
      author_name: author.name,
      visibility: noteVisibility,
      body,
      created_at: new Date().toISOString(),
    };

    const savedNote = await operationsRepository.addSupportCaseNote(note);

    // If customer replied while case was waiting on customer, switch to IN_PROGRESS
    if (!author.isStaff && supportCase.status === "WAITING_CUSTOMER") {
      await operationsRepository.updateSupportCase(caseId, {
        status: "IN_PROGRESS",
      });
    }

    return savedNote;
  }

  /**
   * Assign support case to an agent
   */
  public async assignCase(
    caseId: string,
    agentId: string,
    agentName: string,
    actor: SupportViewer,
  ): Promise<SupportCase> {
    const updated = await operationsRepository.updateSupportCase(caseId, {
      assigned_agent_id: agentId,
      assigned_agent_name: agentName,
      status: "IN_PROGRESS",
    });

    if (!updated) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: "SYSTEM",
      author_name: actor.name,
      visibility: "INTERNAL",
      body: `Case assigned to ${agentName}`,
      created_at: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Update support case status
   */
  public async updateStatus(
    caseId: string,
    status: SupportCaseStatus,
    actor: SupportViewer,
  ): Promise<SupportCase> {
    const updated = await operationsRepository.updateSupportCase(caseId, {
      status,
    });
    if (!updated) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }
    return updated;
  }

  /**
   * Resolve support case
   */
  public async resolveCase(
    caseId: string,
    resolutionCode: string,
    resolutionNotes: string,
    actor: SupportViewer,
  ): Promise<SupportCase> {
    const now = new Date().toISOString();
    const updated = await operationsRepository.updateSupportCase(caseId, {
      status: "RESOLVED",
      resolution_code: resolutionCode as any,
      resolution_notes: resolutionNotes,
      resolved_at: now,
    });

    if (!updated) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: actor.roles[0] || "support",
      author_name: actor.name,
      visibility: "CUSTOMER_VISIBLE",
      body: `Case marked as resolved: ${resolutionNotes}`,
      created_at: now,
    });

    return updated;
  }

  /**
   * Customer Refund Support Workflow: Initiate refund directly linked to support case
   */
  public async triggerSupportRefund(
    caseId: string,
    params: {
      orderId: string;
      amountMinor: number;
      reasonCategory: any;
      notes: string;
    },
    actor: SupportViewer,
  ): Promise<{ refund: Refund; supportCase: SupportCase }> {
    if (!actor.roles.some(role => ['admin','finance'].includes(role))) {
      throw new AppError(403, 'REFUND_APPROVAL_REQUIRED', 'Support refund execution requires the configured approval workflow');
    }
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    if (supportCase.order_id !== params.orderId) throw new AppError(403,'FORBIDDEN_ORDER','Refund order must match the support case');

    // Find completed payment for order
    const payments = await paymentRepository.findPaymentsByOrderId(
      params.orderId,
    );
    const completedPayment = payments.find(
      (p) =>
        p.status === PaymentStatus.CAPTURED ||
        (p.status as string) === "COMPLETED",
    );

    if (!completedPayment) {
      throw new Error(
        `No completed payment found for order ${params.orderId} to refund against`,
      );
    }

    // Request refund via payment service
    const refund = await paymentService.requestRefund({
      paymentId: completedPayment.id,
      amountMinor: params.amountMinor,
      reasonCode: params.reasonCategory || "SUPPORT_REFUND",
      reasonCategory: params.reasonCategory,
      note: `[Support Case #${supportCase.case_number}] ${params.notes}`,
      requestedBy: actor.id,
    });

    // Link refund to support case
    const updatedCase = await operationsRepository.updateSupportCase(caseId, {
      refund_id: refund.id,
      payment_id: completedPayment.id,
      order_id: params.orderId,
    });

    // Add note to case timeline
    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: "support",
      author_name: actor.name,
      visibility: "CUSTOMER_VISIBLE",
      body: `Refund of KES ${(params.amountMinor / 100).toFixed(2)} processed (Ref: ${refund.id}).`,
      created_at: new Date().toISOString(),
    });

    logger.info("Support refund successfully triggered", {
      service: "support-service",
      caseId,
      refundId: refund.id,
      amountMinor: params.amountMinor,
      actor: actor.name,
    });

    return {
      refund,
      supportCase: updatedCase || supportCase,
    };
  }
}

export const supportService = transactionalService(new SupportService());
