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
  SupportCaseParticipant,
  SupportParticipantType,
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
import { riderRepository } from "../rider/rider.repository";
import { deliveryRepository } from "../order/delivery.repository";

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
    // Hydrate linked parties from the transactional graph so an order dispute
    // automatically becomes a Customer ↔ Merchant ↔ Rider conversation.
    if (params.order_id) {
      const order = await orderRepository.findById(params.order_id);
      if (order) {
        if (!params.customer_id) params.customer_id = order.customer_id;
        if (!params.merchant_id) {
          const directMerchantId = (order as any).merchant_id;
          if (directMerchantId) {
            params.merchant_id = directMerchantId;
          } else if ((order as any).branch_id) {
            const branch = await merchantRepository.findBranchById(
              (order as any).branch_id,
            );
            params.merchant_id = branch?.merchant_id || null;
          }
        }
      }
    }

    if (params.delivery_id) {
      const delivery = await deliveryRepository.findById(params.delivery_id);
      if (delivery) {
        if (!params.order_id) params.order_id = delivery.order_id;
        if (!params.rider_id && delivery.assigned_rider_id) {
          params.rider_id = delivery.assigned_rider_id;
        }
      }
    }

    // When only an order is supplied, link the current/most relevant delivery
    // so Rider participation can be included automatically when custody exists.
    if (params.order_id && !params.delivery_id) {
      const delivery = await deliveryRepository.findByOrderId(params.order_id);
      if (delivery) {
        params.delivery_id = delivery.id;
        if (!params.rider_id && delivery.assigned_rider_id) {
          params.rider_id = delivery.assigned_rider_id;
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
      message_type: "MESSAGE",
      body: params.description,
      created_at: new Date().toISOString(),
    });

    const participantNow = new Date().toISOString();
    if (params.customer_id) {
      await operationsRepository.addSupportCaseParticipant({
        id: randomUUID(),
        case_id: caseId,
        participant_type: "CUSTOMER",
        user_id: params.customer_id,
        entity_id: params.customer_id,
        display_name:
          params.creator.id === params.customer_id
            ? params.creator.name
            : "Customer",
        required_confirmation: true,
        confirmation_status: "PENDING",
        created_at: participantNow,
        updated_at: participantNow,
      });
    }
    if (params.merchant_id) {
      const merchant = await merchantRepository.findMerchantById(params.merchant_id);
      await operationsRepository.addSupportCaseParticipant({
        id: randomUUID(),
        case_id: caseId,
        participant_type: "MERCHANT",
        user_id: null,
        entity_id: params.merchant_id,
        display_name: merchant?.display_name || "Merchant",
        required_confirmation: true,
        confirmation_status: "PENDING",
        created_at: participantNow,
        updated_at: participantNow,
      });
    }
    if (params.rider_id) {
      const rider = await riderRepository.findProfileById(params.rider_id);
      await operationsRepository.addSupportCaseParticipant({
        id: randomUUID(),
        case_id: caseId,
        participant_type: "RIDER",
        user_id: rider?.userId || null,
        entity_id: params.rider_id,
        display_name: rider?.name || "Rider",
        required_confirmation: true,
        confirmation_status: "PENDING",
        created_at: participantNow,
        updated_at: participantNow,
      });
    }

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
  ): Promise<{
    case: SupportCase;
    notes: SupportCaseNote[];
    participants: SupportCaseParticipant[];
    attachments: any[];
  }> {
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
    const participants = await operationsRepository.getSupportCaseParticipants(caseId);
    const attachments = await operationsRepository.getSupportCaseAttachments(caseId);
    const allowedVisibilities: SupportNoteVisibility[] = viewer.isStaff
      ? [
          "INTERNAL",
          "CUSTOMER_VISIBLE",
          "ALL_PARTICIPANTS",
          "CUSTOMER_ONLY",
          "MERCHANT_ONLY",
          "RIDER_ONLY",
        ]
      : viewer.roles.includes("customer")
        ? ["CUSTOMER_VISIBLE", "ALL_PARTICIPANTS", "CUSTOMER_ONLY"]
        : viewer.roles.includes("rider")
          ? ["ALL_PARTICIPANTS", "RIDER_ONLY"]
          : ["ALL_PARTICIPANTS", "MERCHANT_ONLY"];

    const notes = await operationsRepository.getSupportCaseMessages(
      caseId,
      allowedVisibilities,
    );

    return {
      case: { ...supportCase, participants, attachments },
      notes,
      participants,
      attachments,
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
    options: {
      attachmentIds?: string[];
      messageType?: "MESSAGE" | "SYSTEM" | "RESOLUTION" | "CONFIRMATION";
    } = {},
  ): Promise<SupportCaseNote> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await this.getCaseById(caseId, author);

    // Participants speak in the shared conversation by default. Only staff can
    // target a specific party or write internal notes.
    let noteVisibility = visibility;
    if (!author.isStaff) {
      noteVisibility = "ALL_PARTICIPANTS";
    }

    const note: SupportCaseNote = {
      id: randomUUID(),
      case_id: caseId,
      author_user_id: author.id,
      author_role: author.roles[0] || "customer",
      author_name: author.name,
      visibility: noteVisibility,
      message_type: options.messageType || "MESSAGE",
      body,
      created_at: new Date().toISOString(),
    };

    const savedNote = await operationsRepository.addSupportCaseNote(note);

    for (const mediaId of options.attachmentIds || []) {
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

    // A participant reply re-opens the conversation from any waiting/resolution state.

    if (
      !author.isStaff &&
      [
        "WAITING_CUSTOMER",
        "WAITING_MERCHANT",
        "WAITING_RIDER",
        "RESOLUTION_PROPOSED",
        "PARTY_CONFIRMATION",
      ].includes(supportCase.status)
    ) {
      await operationsRepository.resetSupportCaseConfirmations(caseId);
      await operationsRepository.updateSupportCase(caseId, {
        status: "IN_CONVERSATION",
        resolution_proposed_at: null,
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
    if (["RESOLVED", "CLOSED", "PARTY_CONFIRMATION"].includes(status)) {
      throw new AppError(
        409,
        "SUPPORT_RESOLUTION_WORKFLOW_REQUIRED",
        "Use the resolution proposal and participant confirmation workflow to close a case",
      );
    }
    const updated = await operationsRepository.updateSupportCase(caseId, {
      status,
    });
    if (!updated) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }
    return updated;
  }

  /**
   * Propose a case resolution. A proposal is not a closure: all required
   * participants must confirm before the case is automatically closed.
   */
  public async resolveCase(
    caseId: string,
    resolutionCode: string,
    resolutionNotes: string,
    actor: SupportViewer,
  ): Promise<SupportCase> {
    if (!actor.isStaff) {
      throw new AppError(403, "SUPPORT_STAFF_REQUIRED", "Only support staff can propose a resolution");
    }

    const now = new Date().toISOString();
    await operationsRepository.resetSupportCaseConfirmations(caseId);
    const updated = await operationsRepository.updateSupportCase(caseId, {
      status: "PARTY_CONFIRMATION",
      resolution_code: resolutionCode as any,
      resolution_notes: resolutionNotes,
      resolution_proposed_at: now,
      resolved_at: null,
      closed_at: null,
      closure_reason: null,
    });

    if (!updated) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }

    await this.addNote(
      caseId,
      actor,
      "ALL_PARTICIPANTS",
      `Proposed resolution: ${resolutionNotes}`,
      { messageType: "RESOLUTION" },
    );

    await authRepository.createAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.roles[0] || "support",
      action: "SUPPORT_RESOLUTION_PROPOSED" as any,
      resource_type: "SUPPORT_CASE",
      resource_id: caseId,
      reason: resolutionCode,
      metadata: { resolution_notes: resolutionNotes },
    });

    return updated;
  }

  private participantForViewer(
    supportCase: SupportCase,
    participants: SupportCaseParticipant[],
    viewer: SupportViewer,
  ): SupportCaseParticipant | undefined {
    if (viewer.roles.includes("customer")) {
      return participants.find(
        (participant) =>
          participant.participant_type === "CUSTOMER" &&
          (participant.user_id === viewer.id ||
            participant.entity_id === supportCase.customer_id),
      );
    }
    if (viewer.roles.includes("rider")) {
      return participants.find(
        (participant) =>
          participant.participant_type === "RIDER" &&
          (participant.user_id === viewer.id ||
            participant.entity_id === viewer.rider_id),
      );
    }
    if (
      viewer.roles.some((role) =>
        ["merchant", "merchant_owner", "merchant_manager", "merchant_staff"].includes(role),
      )
    ) {
      return participants.find(
        (participant) =>
          participant.participant_type === "MERCHANT" &&
          Boolean(
            participant.entity_id &&
              viewer.merchant_ids?.includes(participant.entity_id),
          ),
      );
    }
    return undefined;
  }

  public async confirmResolution(
    caseId: string,
    viewer: SupportViewer,
    accepted: boolean,
    note?: string,
  ): Promise<SupportCase> {
    const supportCase = await operationsRepository.getSupportCaseById(caseId);
    if (!supportCase) {
      throw new AppError(404, "CASE_NOT_FOUND", "Support case not found");
    }
    if (supportCase.status !== "PARTY_CONFIRMATION") {
      throw new AppError(
        409,
        "SUPPORT_RESOLUTION_NOT_PENDING",
        "There is no resolution awaiting participant confirmation",
      );
    }

    await this.getCaseById(caseId, viewer);
    const participants = await operationsRepository.getSupportCaseParticipants(caseId);
    const participant = this.participantForViewer(supportCase, participants, viewer);
    if (!participant) {
      throw new AppError(
        403,
        "SUPPORT_PARTICIPANT_REQUIRED",
        "Only a case participant can confirm the proposed resolution",
      );
    }

    const confirmation = await operationsRepository.confirmSupportCaseParticipant(
      participant.id,
      accepted ? "ACCEPTED" : "DISPUTED",
      note,
    );
    if (!confirmation) {
      throw new AppError(404, "SUPPORT_PARTICIPANT_NOT_FOUND", "Case participant not found");
    }

    await this.addNote(
      caseId,
      viewer,
      "ALL_PARTICIPANTS",
      accepted
        ? `${participant.display_name || participant.participant_type} accepted the proposed resolution.`
        : `${participant.display_name || participant.participant_type} disputed the proposed resolution${note ? `: ${note}` : "."}`,
      { messageType: "CONFIRMATION" },
    );

    if (!accepted) {
      const reopened = await operationsRepository.updateSupportCase(caseId, {
        status: "IN_CONVERSATION",
        resolved_at: null,
        closed_at: null,
        closure_reason: "PARTICIPANT_DISPUTED_RESOLUTION",
      });
      return reopened || supportCase;
    }

    const refreshedParticipants =
      await operationsRepository.getSupportCaseParticipants(caseId);
    const allConfirmed = refreshedParticipants
      .filter((item) => item.required_confirmation)
      .every((item) =>
        ["ACCEPTED", "ACKNOWLEDGED"].includes(item.confirmation_status),
      );

    if (!allConfirmed) {
      return (
        (await operationsRepository.getSupportCaseById(caseId)) || supportCase
      );
    }

    const now = new Date().toISOString();
    const closed = await operationsRepository.updateSupportCase(caseId, {
      status: "CLOSED",
      resolved_at: now,
      closed_at: now,
      closure_reason: "ALL_PARTICIPANTS_CONFIRMED",
    });

    await operationsRepository.addSupportCaseNote({
      id: randomUUID(),
      case_id: caseId,
      author_user_id: viewer.id,
      author_role: "SYSTEM",
      author_name: "DeeToo Support",
      visibility: "ALL_PARTICIPANTS",
      message_type: "SYSTEM",
      body: "Case closed after all required participants confirmed the resolution.",
      created_at: now,
    });

    return closed || supportCase;
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
    if (!actor.roles.some(role => ['super_admin','admin','finance'].includes(role))) {
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
      visibility: "ALL_PARTICIPANTS",
      message_type: "SYSTEM",
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
