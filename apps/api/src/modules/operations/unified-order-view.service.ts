import { config } from '@deetoo/config';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Unified Order Operational View Service
 * Sprint 13: 360-degree Order Correlator & Global Operations Search
 */

import { logger } from '@deetoo/utils';
import { UnifiedOrderOperationalView } from '@deetoo/types';
import { orderRepository } from '../order/order.repository';
import { deliveryRepository } from '../order/delivery.repository';
import { paymentRepository } from '../payment/payment.repository';
import { operationsRepository } from './operations.repository';
import { fraudRiskService } from './risk.service';
import { riderRepository } from '../rider/rider.repository';

export class UnifiedOrderViewService {
  /**
   * Correlates full lifecycle state for an order into a single authoritative operational view
   */
  public async getUnifiedOrderView(orderIdOrNumber: string): Promise<UnifiedOrderOperationalView | null> {
    // 1. Locate Order
    let order = (config.storage.mode === "memory" || /^[0-9a-f-]{36}$/i.test(orderIdOrNumber)) ? await orderRepository.findById(orderIdOrNumber) : null;
    if (!order) {
      order = await orderRepository.findByOrderNumber(orderIdOrNumber);
    }
    if (!order) {
      return null;
    }

    const orderId = order.id;

    // 2. Fetch Payments & Refunds
    const payments = await paymentRepository.findPaymentsByOrderId(orderId);
    const refunds = await paymentRepository.findRefundsByOrderId(orderId);

    // 3. Fetch Delivery & Offers
    const delivery = await deliveryRepository.findByOrderId(orderId);
    let offers: any[] = [];
    let riderInfo: any = null;

    if (delivery) {
      const allOffers = await deliveryRepository.getOffersByDeliveryId(delivery.id);
      offers = allOffers || [];

      if (delivery.rider_id) {
        try {
          const profile = await riderRepository.findProfileById(delivery.rider_id);
          if (profile) {
            riderInfo = {
              id: profile.id,
              name: profile.name || (profile as any).full_name || 'Courier',
              phone: profile.phone_e164,
              operationalStatus: profile.operationalStatus,
              location: delivery.last_location || null,
            };
          }
        } catch {
          // ignore rider lookup errors
        }
      }
    }

    // 4. Fetch Support Cases
    const { cases: supportCases } = await operationsRepository.findSupportCases({ order_id: orderId });

    // 5. Fetch Operational Incidents
    const { incidents } = await operationsRepository.findIncidents({ order_id: orderId });

    // 6. Fetch Notifications
    const { notifications } = await operationsRepository.findNotifications({
      recipient_id: order.customer_id,
      limit: 20,
    });
    const orderNotifications = notifications.filter(
      (n) => n.payload?.orderId === orderId || n.payload?.orderNumber === order?.order_number
    );

    // 7. Calculate Financial Summary
    const gmvMinor = order.pricing?.total_minor || 0;
    const commissionMinor = order.pricing?.platform_fee_minor || Math.round(gmvMinor * 0.15);
    const riderEarningsMinor = delivery?.estimated_payout_minor || 15000;
    const netPlatformRevenueMinor = commissionMinor - (order.pricing?.discount_minor || 0);

    // 8. Customer Risk Evaluation
    let customerRiskScore = 0;
    try {
      const riskSummary = await fraudRiskService.calculateRiskScore('CUSTOMER', order.customer_id);
      customerRiskScore = riskSummary.totalScore;
    } catch {
      // ignore
    }

    return {
      order,
      customer: {
        id: order.customer_id,
        name: order.customer_name || 'Customer',
        phone: order.customer_phone,
        riskScore: customerRiskScore,
      },
      merchant: {
        id: (order as any).merchant_id || '',
        name: (order as any).merchant_name || 'Merchant',
        branchId: order.branch_id,
        branchName: order.branch_name || 'Branch',
      },
      payments,
      refunds,
      delivery,
      rider: riderInfo,
      timeline: order.timeline || [],
      offers,
      supportCases,
      incidents,
      notifications: orderNotifications,
      financialSummary: {
        gmvMinor,
        commissionMinor,
        riderEarningsMinor,
        netPlatformRevenueMinor,
      },
    };
  }

  /**
   * Universal search across Order #, Public Code, Customer, Phone, Merchant, Payment Ref, and Support Case
   */
  public async globalOperationsSearch(query: string): Promise<{
    orders: any[];
    supportCases: any[];
    incidents: any[];
    payments: any[];
  }> {
    if (!query || query.trim().length === 0) {
      return { orders: [], supportCases: [], incidents: [], payments: [] };
    }

    const q = query.trim().toLowerCase();

    // 1. Search Orders
    const { orders } = await orderRepository.findAllOrders({ search: q, limit: 10 });

    // 2. Search Support Cases
    const { cases } = await operationsRepository.findSupportCases({ limit: 50 });
    const matchingCases = cases.filter(
      (c) =>
        c.case_number.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    ).slice(0, 10);

    // 3. Search Incidents
    const { incidents } = await operationsRepository.findIncidents({ limit: 50 });
    const matchingIncidents = incidents.filter(
      (i) =>
        i.type.toLowerCase().includes(q) ||
        i.reason_code.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        (i.details && i.details.toLowerCase().includes(q))
    ).slice(0, 10);

    // 4. Search Payments
    const allPayments = await paymentRepository.findAll();
    const matchingPayments = allPayments.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.provider_reference && p.provider_reference.toLowerCase().includes(q)) ||
        (p.order_id && p.order_id.toLowerCase().includes(q))
    ).slice(0, 10);

    return {
      orders,
      supportCases: matchingCases,
      incidents: matchingIncidents,
      payments: matchingPayments,
    };
  }
}

export const unifiedOrderViewService = transactionalService(new UnifiedOrderViewService());
