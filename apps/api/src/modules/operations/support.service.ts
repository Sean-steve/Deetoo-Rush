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
import { mediaService } from "../media/media.service";
import { merchantRepository } from "../merchant/merchant.repository";

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
        if (!params.merchant_id) {
          params.merchant_id = (order as any).merchant_id || null;
          if (!params.merchant_id && (order as any).branch_id) {
            const branch = await merchantRepository.findBranchById((order as any).branch_id);
            params.merchant_id = branch?.merchant_id || null;
          }
        }
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
      visibility: "ALL_PARTICIPANTS",
      body: params.description,
      message_type: "MESSAGE",
      target_party: null,
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
  ): Promise<{ case: SupportCase; notes: SupportCaseNote[]; attachments: any[]; confirmations: any[] }> {
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
    const participantScope = viewer.isStaff
      ? undefined
      : this.resolveParticipantType(supportCase, viewer);
    const notes = await operationsRepository.getSupportCaseNotes(
      caseId,
      viewer.isStaff,
      participantScope,
    );
    const attachments = await operationsRepository.getSupportCaseAttachments(caseId);
    const confirmations = await operationsRepository.getSupportConfirmations(caseId);

    return {
      case: supportCase,
      notes,
      attachments,
      confirmations,
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
    mediaIds: string[] = [],
  ): Promise<SupportCaseNote> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await this.getCaseById(caseId, author);

    // Non-staff users can NEVER add internal or another party's private message.
    let noteVisibility = visibility;
    const participantType = this.resolveParticipantType(supportCase, author);
    if (!author.isStaff) {
      noteVisibility = "ALL_PARTICIPANTS";
      if (!participantType) {
        throw new AppError(403, "FORBIDDEN_CASE", "You are not a participant in this support case");
      }
    }

    const note: SupportCaseNote = {
      id: randomUUID(),
      case_id: caseId,
      author_user_id: author.id,
      author_role: author.roles[0] || "customer",
      author_name: author.name,
      visibility: noteVisibility,
      body,
      message_type: "MESSAGE",
      target_party:
        noteVisibility === "CUSTOMER_ONLY" ? "CUSTOMER" :
        noteVisibility === "MERCHANT_ONLY" ? "MERCHANT" :
        noteVisibility === "RIDER_ONLY" ? "RIDER" : null,
      created_at: new Date().toISOString(),
    };

    const savedNote = await operationsRepository.addSupportCaseNote(note);

    for (const mediaId of mediaIds) {
      await mediaService.assertVerifiedOwnedMedia(
        mediaId,
        author.id,
        "SUPPORT_ATTACHMENT",
        caseId,
      );
      await operationsRepository.addSupportCaseAttachment({
        id: randomUUID(),
        case_id: caseId,
        note_id: savedNote.id,
        media_object_id: mediaId,
        uploaded_by: author.id,
        created_at: new Date().toISOString(),
      });
    }

    // Any participant reply resumes the conversation while awaiting that party.
    if (!author.isStaff && [
      "WAITING_CUSTOMER","WAITING_MERCHANT","WAITING_RIDER",
      "RESOLUTION_PROPOSED","PARTY_CONFIRMATION","DISPUTED"
    ].includes(supportCase.status)) {
      await operationsRepository.updateSupportCase(caseId, {
        status: "IN_CONVERSATION",
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
      status: "ASSIGNED",
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
    if (!actor.isStaff) {
      throw new AppError(403, "STAFF_REQUIRED", "Only support staff can propose a resolution");
    }
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");

    const now = new Date().toISOString();
    const participants = this.requiredParticipants(supportCase);
    await operationsRepository.resetSupportConfirmations(caseId, participants);

    const updated = await operationsRepository.updateSupportCase(caseId, {
      status: participants.length ? "PARTY_CONFIRMATION" : "RESOLUTION_PROPOSED",
      resolution_code: resolutionCode as any,
      resolution_notes: resolutionNotes,
      resolution_proposed_at: now,
      resolved_at: null,
      disputed_at: null,
      closed_at: null,
    });

    if (!updated) throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");

    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: actor.roles[0] || "support",
      author_name: actor.name,
      visibility: "ALL_PARTICIPANTS",
      body: resolutionNotes,
      message_type: "RESOLUTION",
      target_party: null,
      created_at: now,
    });

    return updated;
  }

  public async respondToResolution(
    caseId: string,
    actor: SupportViewer,
    decision: "ACCEPTED" | "DISPUTED",
    comment?: string,
  ): Promise<SupportCase> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    if (actor.isStaff) {
      throw new AppError(403, "PARTICIPANT_REQUIRED", "Staff cannot confirm a participant's satisfaction");
    }
    const partyType = this.resolveParticipantType(supportCase, actor);
    if (!partyType) throw new AppError(403, "FORBIDDEN_CASE", "You are not a participant in this support case");
    const partyId =
      partyType === "CUSTOMER" ? supportCase.customer_id :
      partyType === "MERCHANT" ? supportCase.merchant_id :
      supportCase.rider_id;
    if (!partyId) throw new AppError(409, "PARTICIPANT_NOT_LINKED", "Participant is not linked to this case");

    const confirmation = await operationsRepository.setSupportConfirmation({
      caseId,
      partyType,
      partyId,
      decision,
      comment,
      decidedBy: actor.id,
    });
    if (!confirmation) {
      throw new AppError(409, "RESOLUTION_NOT_PROPOSED", "No pending resolution confirmation exists for this participant");
    }

    const now = new Date().toISOString();
    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: actor.roles[0] || partyType.toLowerCase(),
      author_name: actor.name,
      visibility: "ALL_PARTICIPANTS",
      body: comment || (decision === "ACCEPTED" ? "I accept this resolution." : "I do not accept this resolution."),
      message_type: "SYSTEM",
      target_party: null,
      created_at: now,
    });

    if (decision === "DISPUTED") {
      return (await operationsRepository.updateSupportCase(caseId, {
        status: "DISPUTED",
        disputed_at: now,
        resolved_at: null,
      }))!;
    }

    const confirmations = await operationsRepository.getSupportConfirmations(caseId);
    const allAccepted = confirmations.length > 0 && confirmations.every((item:any)=>item.decision === "ACCEPTED");
    if (allAccepted) {
      return (await operationsRepository.updateSupportCase(caseId, {
        status: "CLOSED",
        resolved_at: now,
        closed_at: now,
      }))!;
    }
    return (await operationsRepository.updateSupportCase(caseId, {
      status: "PARTY_CONFIRMATION",
    }))!;
  }

  public async forceCloseCase(
    caseId: string,
    actor: SupportViewer,
    reason: string,
  ): Promise<SupportCase> {
    if (!actor.roles.includes("super_admin")) {
      throw new AppError(403, "SUPER_ADMIN_REQUIRED", "Only Super Admin can override participant confirmation");
    }
    if (!reason?.trim()) throw new AppError(400, "REASON_REQUIRED", "Override close requires an audit reason");
    const now = new Date().toISOString();
    const updated = await operationsRepository.updateSupportCase(caseId, {
      status: "CLOSED",
      resolved_at: now,
      closed_at: now,
    });
    if (!updated) throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: actor.id,
      author_role: "super_admin",
      author_name: actor.name,
      visibility: "INTERNAL",
      body: `Super Admin closure override: ${reason}`,
      message_type: "SYSTEM",
      target_party: null,
      created_at: now,
    });
    return updated;
  }

  private resolveParticipantType(
    supportCase: SupportCase,
    viewer: SupportViewer,
  ): "CUSTOMER" | "MERCHANT" | "RIDER" | null {
    if (supportCase.customer_id && supportCase.customer_id === viewer.id) return "CUSTOMER";
    if (supportCase.merchant_id && viewer.merchant_ids?.includes(supportCase.merchant_id)) return "MERCHANT";
    if (supportCase.rider_id && (viewer.rider_id === supportCase.rider_id || viewer.id === supportCase.rider_id)) return "RIDER";
    return null;
  }

  private requiredParticipants(
    supportCase: SupportCase,
  ): Array<{party_type:"CUSTOMER"|"MERCHANT"|"RIDER";party_id:string}> {
    const result: Array<{party_type:"CUSTOMER"|"MERCHANT"|"RIDER";party_id:string}> = [];
    if (supportCase.customer_id) result.push({party_type:"CUSTOMER",party_id:supportCase.customer_id});
    if (supportCase.merchant_id) result.push({party_type:"MERCHANT",party_id:supportCase.merchant_id});
    if (supportCase.rider_id) result.push({party_type:"RIDER",party_id:supportCase.rider_id});
    return result;
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
