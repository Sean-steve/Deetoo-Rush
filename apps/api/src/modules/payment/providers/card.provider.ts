import { Payment } from '@deetoo/types';
import { requireSimulationMode } from '../../../db/storage-policy';
/**
 * DEETOO - Card Payment Provider Adapter
 * Handles tokenized card payments, webhook parsing, and refunds (Section 10)
 */

import crypto from 'crypto';
import { config } from '@deetoo/config';
import { logger } from '@deetoo/utils';
import {
  IPaymentProvider,
  ProviderInitiateInput,
  ProviderInitiateResult,
  ProviderCallbackResult,
  ProviderStatusResult,
  ProviderRefundInput,
  ProviderRefundResult,
} from './payment-provider.interface';

export class CardPaymentProvider implements IPaymentProvider {
  public readonly simulated = true;
  public readonly providerId = 'CARD';

  public async initiatePayment(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    requireSimulationMode();
    if (!input.paymentMethodToken) {
      // Mock card token fallback for testing/dev
      input.paymentMethodToken = `tok_card_${Date.now()}`;
    }

    const providerPaymentId = `pi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const providerReference = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info('Initiated Card Payment Intent', {
      service: 'payment-card',
      metadata: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        amountMinor: input.amountMinor,
        providerPaymentId,
      },
    });

    const clientSecret = `${providerPaymentId}_secret_${Math.random().toString(36).substring(2, 10)}`;

    return {
      success: true,
      receiver: 'fixture-receiver',
      providerPaymentId,
      providerReference,
      checkoutRequestId: providerPaymentId,
      merchantRequestId: providerPaymentId,
      clientSecret,
      responseCode: '200',
      responseDescription: 'Payment intent created successfully',
      rawResponse: {
        id: providerPaymentId,
        status: 'requires_capture',
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        client_secret: clientSecret,
      },
    };
  }

  public verifyCallback(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | unknown
  ): boolean {
    requireSimulationMode();
    if (config.isTest) {
      return true;
    }

    const signature = headers['stripe-signature'] || headers['x-card-signature'] || headers['x-webhook-signature'];
    const secret = config.payment.card.webhookSecret;

    if (!secret || !signature) {
      return config.isDevelopment;
    }

    if (typeof rawBody === 'string') {
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return String(signature).includes(computed);
    }

    return true;
  }

  public parseCallback(rawPayload: unknown): ProviderCallbackResult {
    const payload = (rawPayload || {}) as any;
    const eventId = payload.id || `evt_${Date.now()}`;
    const type = payload.type || 'payment_intent.succeeded';
    const obj = payload.data?.object || payload;

    const paymentIntentId = obj.id;
    const amountMinor = obj.amount || obj.amount_captured;
    const chargeId = obj.latest_charge || obj.charge_id || `ch_${Date.now()}`;

    const isSuccess = type === 'payment_intent.succeeded' || obj.status === 'succeeded';
    const isCancelled = type === 'payment_intent.canceled' || obj.status === 'canceled';

    return {
      isValid: true,
      providerEventId: eventId,
      eventType: type,
      providerReference: chargeId,
      merchantRequestId: paymentIntentId,
      checkoutRequestId: paymentIntentId,
      status: isSuccess ? 'SUCCESS' : isCancelled ? 'CANCELLED' : 'FAILED',
      amountMinor: typeof amountMinor === 'number' ? amountMinor : undefined,
      receiptNumber: chargeId,
      rawPayload: payload,
    };
  }

  public async verifyPayment(payment: Payment, callback?: ProviderCallbackResult): Promise<ProviderStatusResult> {
    requireSimulationMode();
    if (!callback) return {status:'PENDING',verified:true,rawResponse:{simulated:true}};
    if (callback.checkoutRequestId !== payment.checkout_request_id || (callback.merchantRequestId && callback.merchantRequestId !== payment.merchant_request_id)) throw new Error('Fixture callback identity mismatch');
    return {status:callback.status==='SUCCESS'?'CAPTURED':callback.status==='CANCELLED'?'CANCELLED':'FAILED',verified:true,
      amountMinor:callback.amountMinor,currency:payment.currency,receiver:'fixture-receiver',paymentId:payment.id,orderId:payment.order_id,
      providerReference:callback.receiptNumber||callback.providerReference,receiptNumber:callback.receiptNumber,rawResponse:{simulated:true,eventId:callback.providerEventId}};
  }
  public async voidPayment(_payment: Payment): Promise<void> { requireSimulationMode(); }

  public async queryStatus(providerPaymentId: string): Promise<ProviderStatusResult> {
    requireSimulationMode();
    return {
      status: 'CAPTURED',
      providerReference: providerPaymentId,
      rawResponse: {
        id: providerPaymentId,
        status: 'succeeded',
      },
    };
  }

  public async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    requireSimulationMode();
    const refundId = `re_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    logger.info('Processed Card Refund', {
      service: 'payment-card',
      metadata: {
        refundId: input.refundId,
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        providerRefundId: `fixture-refund:${input.refundId}`,
      },
    });

    return {
      success: true,
      providerRefundId: `fixture-refund:${input.refundId}`,
      verified: true, amountMinor: input.amountMinor, currency: input.currency,
      rawResponse: {
        id: refundId,
        status: 'succeeded',
        amount: input.amountMinor,
      },
    };
  }
}

export const cardPaymentProvider = new CardPaymentProvider();
