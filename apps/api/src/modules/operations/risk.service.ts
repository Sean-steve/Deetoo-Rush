import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Fraud & Risk Service
 * Sprint 13: Rule-Based Fraud Signals, Abuse Detection & Review Workflow
 */

import { randomUUID } from 'crypto';
import { logger } from '@deetoo/utils';
import {
  RiskSignal,
  RiskSignalType,
  RiskSignalStatus,
  IncidentSeverity,
} from '@deetoo/types';
import { operationsRepository } from './operations.repository';
import { paymentRepository } from '../payment/payment.repository';
import { orderRepository } from '../order/order.repository';
import { deliveryRepository } from '../order/delivery.repository';

export class FraudRiskService {
  /**
   * Record or update a risk signal
   */
  public async recordRiskSignal(params: {
    signalType: RiskSignalType | string;
    severity?: IncidentSeverity;
    customerId?: string | null;
    merchantId?: string | null;
    riderId?: string | null;
    orderId?: string | null;
    paymentId?: string | null;
    promotionId?: string | null;
    scoreWeight?: number;
    metadata?: Record<string, any>;
  }): Promise<RiskSignal> {
    const signal: RiskSignal = {
      id: randomUUID(),
      signal_type: params.signalType,
      severity: params.severity || 'MEDIUM',
      customer_id: params.customerId || null,
      merchant_id: params.merchantId || null,
      rider_id: params.riderId || null,
      order_id: params.orderId || null,
      payment_id: params.paymentId || null,
      promotion_id: params.promotionId || null,
      score_weight: params.scoreWeight ?? 15,
      metadata: params.metadata || {},
      status: 'OPEN',
      detected_at: new Date().toISOString(),
    };

    logger.warn('Risk signal detected', {
      service: 'risk-service',
      signalType: signal.signal_type,
      customerId: signal.customer_id,
      merchantId: signal.merchant_id,
      riderId: signal.rider_id,
      scoreWeight: signal.score_weight,
    });

    return operationsRepository.createRiskSignal(signal);
  }

  /**
   * Evaluates Customer Risk Signals
   */
  public async evaluateCustomerRisk(customerId: string): Promise<RiskSignal[]> {
    const generated: RiskSignal[] = [];

    try {
      // 1. Check Excessive Refunds
      const rawOrders = await orderRepository.findCustomerOrders(customerId, { limit: 100 });
      const ordersList = Array.isArray(rawOrders) ? rawOrders : ((rawOrders as any).orders || []);
      let refundCount = 0;
      let totalCompletedMinor = 0;
      let totalRefundedMinor = 0;

      for (const ord of ordersList) {
        if (ord.status === 'DELIVERED') {
          totalCompletedMinor += ord.pricing?.total_minor || 0;
        }
        const refunds = await paymentRepository.findRefundsByOrderId(ord.id);
        if (refunds && refunds.length > 0) {
          refundCount += refunds.length;
          for (const ref of refunds) {
            totalRefundedMinor += ref.amount_minor;
          }
        }
      }

      if (refundCount >= 3 || (totalCompletedMinor > 0 && totalRefundedMinor / totalCompletedMinor > 0.4)) {
        const sig = await this.recordRiskSignal({
          signalType: 'EXCESSIVE_REFUNDS',
          severity: refundCount >= 5 ? 'HIGH' : 'MEDIUM',
          customerId,
          scoreWeight: 25,
          metadata: { refundCount, totalCompletedMinor, totalRefundedMinor },
        });
        generated.push(sig);
      }

      // 2. Check Multiple Payment Failures
      const allPayments = await paymentRepository.findAll();
      const customerPayments = allPayments.filter((p) => p.customer_id === customerId);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentFailed = customerPayments.filter(
        (p) => p.status === 'FAILED' && new Date(p.created_at).getTime() > twoHoursAgo
      );

      if (recentFailed.length >= 3) {
        const sig = await this.recordRiskSignal({
          signalType: 'MULTIPLE_FAILED_PAYMENTS',
          severity: recentFailed.length >= 5 ? 'HIGH' : 'MEDIUM',
          customerId,
          scoreWeight: 20,
          metadata: { failedCount: recentFailed.length, windowHours: 2 },
        });
        generated.push(sig);
      }

      // 3. Check Unusual Order Velocity (e.g. >= 4 orders placed within 15 minutes)
      const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
      const recentOrders = ordersList.filter(
        (o: any) => new Date(o.created_at).getTime() > fifteenMinsAgo
      );

      if (recentOrders.length >= 4) {
        const sig = await this.recordRiskSignal({
          signalType: 'UNUSUAL_ORDER_VELOCITY',
          severity: 'HIGH',
          customerId,
          scoreWeight: 30,
          metadata: { orderCount: recentOrders.length, windowMinutes: 15 },
        });
        generated.push(sig);
      }
    } catch (err: any) {
      logger.error('Error evaluating customer risk', { error: err.message, customerId });
    }

    return generated;
  }

  /**
   * Evaluates Rider Risk Signals (Speed anomalies, excessive releases)
   */
  public async evaluateRiderRisk(riderId: string): Promise<RiskSignal[]> {
    const generated: RiskSignal[] = [];

    try {
      const allDeliveries = await deliveryRepository.findAll();
      const riderDeliveries = allDeliveries.filter((d) => d.rider_id === riderId);

      // Check delivery releases (unassigned after being assigned) in 24h
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentReleases = riderDeliveries.filter(
        (d) => d.metadata?.releasedByRider === true && new Date(d.updated_at).getTime() > oneDayAgo
      );

      if (recentReleases.length >= 3) {
        const sig = await this.recordRiskSignal({
          signalType: 'REPEATED_ASSIGNMENT_RELEASE',
          severity: 'HIGH',
          riderId,
          scoreWeight: 25,
          metadata: { releaseCount: recentReleases.length, windowHours: 24 },
        });
        generated.push(sig);
      }
    } catch (err: any) {
      logger.error('Error evaluating rider risk', { error: err.message, riderId });
    }

    return generated;
  }

  /**
   * Calculate Aggregate Risk Score for an Entity
   */
  public async calculateRiskScore(
    entityType: 'CUSTOMER' | 'RIDER' | 'MERCHANT',
    entityId: string
  ): Promise<{
    totalScore: number;
    signalCount: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    signals: RiskSignal[];
  }> {
    const filter: any = {
      status: 'OPEN',
    };

    if (entityType === 'CUSTOMER') filter.customer_id = entityId;
    if (entityType === 'RIDER') filter.rider_id = entityId;
    if (entityType === 'MERCHANT') filter.merchant_id = entityId;

    const { signals } = await operationsRepository.findRiskSignals(filter);
    signals.sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());
    const totalScore = signals.reduce((sum, s) => sum + s.score_weight, 0);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (totalScore >= 70) riskLevel = 'CRITICAL';
    else if (totalScore >= 40) riskLevel = 'HIGH';
    else if (totalScore >= 20) riskLevel = 'MEDIUM';

    return {
      totalScore,
      signalCount: signals.length,
      riskLevel,
      signals,
    };
  }

  /**
   * Review and disposition a risk signal
   */
  public async reviewSignal(
    signalId: string,
    status: 'CONFIRMED' | 'DISMISSED',
    reviewer: { id: string; name: string },
    notes?: string
  ): Promise<RiskSignal> {
    const existing = await operationsRepository.getRiskSignalById(signalId);
    if (!existing) {
      throw new Error(`Risk signal ${signalId} not found`);
    }

    const updated = await operationsRepository.updateRiskSignal(signalId, {
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer.name,
      review_notes: notes || `Signal marked as ${status} by ${reviewer.name}`,
    });

    return updated || existing;
  }
}

export const fraudRiskService = transactionalService(new FraudRiskService());
