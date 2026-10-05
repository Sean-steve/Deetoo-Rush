import { Payment } from '@deetoo/types';
import { requireSimulationMode } from '../../../db/storage-policy';
/**
 * DEETOO - M-PESA Safaricom Daraja Provider Adapter
 * Implements Daraja STK Push (Lipa na M-PESA Online), callback verification,
 * ResultCode normalization, and query status (Section 10, 11)
 */

import crypto from 'crypto';
import { formatMpesaPhone } from '@deetoo/validation';
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

export class MpesaPaymentProvider implements IPaymentProvider {
  public readonly simulated = true;
  public readonly providerId = 'MPESA';

  /**
   * Normalize Safaricom Daraja ResultCode into canonical internal reason code
   */
  public mapDarajaResultCode(resultCode: number): {
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
    failureCode?: string;
  } {
    if (resultCode === 0) {
      return { status: 'SUCCESS' };
    }
    if (resultCode === 1032) {
      return { status: 'CANCELLED', failureCode: 'CUSTOMER_CANCELLED' };
    }
    if (resultCode === 1) {
      return { status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' };
    }
    if (resultCode === 1037) {
      return { status: 'FAILED', failureCode: 'TIMEOUT' };
    }
    if (resultCode === 2001) {
      return { status: 'FAILED', failureCode: 'INVALID_CREDENTIALS' };
    }
    return { status: 'FAILED', failureCode: 'PROVIDER_DECLINED' };
  }

  /**
   * Initiates Lipa na M-PESA STK Push
   */
  public async initiatePayment(input: ProviderInitiateInput): Promise<ProviderInitiateResult> {
    requireSimulationMode();
    if (!input.phone) {
      throw new Error('Phone number is required for M-PESA STK Push');
    }

    const formattedPhone = formatMpesaPhone(input.phone);
    if (!/^254[71]\d{8}$/.test(formattedPhone)) {
      throw new Error(`Invalid Kenyan mobile number for M-PESA STK Push: ${formattedPhone}`);
    }

    // Amount in KES whole units (Daraja expects integer/standard units)
    const amountKes = Math.round(input.amountMinor / 100);
    if (amountKes <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const merchantRequestId = `MR_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.info('Initiated M-PESA STK Push', {
      service: 'payment-mpesa',
      metadata: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        formattedPhone,
        amountKes,
        merchantRequestId,
        checkoutRequestId,
      },
    });

    return {
      success: true,
      receiver: 'fixture-receiver',
      providerPaymentId: checkoutRequestId,
      providerReference: checkoutRequestId,
      merchantRequestId,
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'Success. Request accepted for processing',
      customerMessage: 'Success. Request accepted for processing',
      rawResponse: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Success. Request accepted for processing',
      },
    };
  }

  /**
   * Verify authenticity of incoming M-PESA webhook callback
   */
  public verifyCallback(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | unknown
  ): boolean {
    requireSimulationMode();
    const configuredSecret = config.payment.mpesa.webhookSecret;
    // In test and dev environments, allow standard verification
    if (config.isTest || !configuredSecret) {
      return true;
    }

    const authHeader = headers['authorization'] || headers['x-webhook-secret'] || headers['x-daraja-token'];
    if (typeof authHeader === 'string' && authHeader.includes(configuredSecret)) {
      return true;
    }

    // Also support HMAC-SHA256 signature verification if signature header present
    const signatureHeader = headers['x-mpesa-signature'] || headers['x-signature'];
    if (signatureHeader && typeof rawBody === 'string') {
      const expectedSignature = crypto
        .createHmac('sha256', configuredSecret)
        .update(rawBody)
        .digest('hex');
      return signatureHeader === expectedSignature;
    }

    // Default to true in non-strict development unless invalid header provided
    return config.isDevelopment;
  }

  /**
   * Parses and validates raw Daraja STK callback JSON payload
   */
  public parseCallback(rawPayload: unknown): ProviderCallbackResult {
    const payload = (rawPayload || {}) as any;
    const stkCallback = payload?.Body?.stkCallback || payload?.stkCallback || payload;

    const merchantRequestId = stkCallback?.MerchantRequestID;
    const checkoutRequestId = stkCallback?.CheckoutRequestID;
    const resultCode = typeof stkCallback?.ResultCode === 'number' ? stkCallback.ResultCode : -1;
    const resultDesc = stkCallback?.ResultDesc || 'Unknown result';

    if (!merchantRequestId || !checkoutRequestId) {
      return {
        isValid: false,
        providerEventId: `evt_${Date.now()}`,
        eventType: 'mpesa.stk.unknown',
        status: 'FAILED',
        failureCode: 'INVALID_PAYLOAD_STRUCTURE',
        failureMessage: 'Missing MerchantRequestID or CheckoutRequestID in callback',
        rawPayload: payload,
      };
    }

    const { status, failureCode } = this.mapDarajaResultCode(resultCode);

    let amountMinor: number | undefined;
    let receiptNumber: string | undefined;

    // Extract metadata items if callback was successful
    const items = stkCallback?.CallbackMetadata?.Item;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.Name === 'Amount' && item.Value !== undefined) {
          amountMinor = Math.round(Number(item.Value) * 100);
        }
        if (item.Name === 'MpesaReceiptNumber' && item.Value !== undefined) {
          receiptNumber = String(item.Value);
        }
      }
    }


    return {
      isValid: status !== 'SUCCESS' || (!!receiptNumber && Number.isSafeInteger(amountMinor) && amountMinor! > 0),
      providerEventId: `${checkoutRequestId}:${resultCode}`,
      eventType: 'mpesa.stk.callback',
      merchantRequestId,
      checkoutRequestId,
      providerReference: receiptNumber || checkoutRequestId,
      status,
      amountMinor,
      receiptNumber,
      failureCode,
      failureMessage: resultDesc,
      rawPayload: payload,
    };
  }

  /**
   * Queries payment status (Daraja STK Query simulation / implementation)
   */
  public async verifyPayment(payment: Payment, callback?: ProviderCallbackResult): Promise<ProviderStatusResult> {
    requireSimulationMode();
    if (!callback) return {status:'PENDING',verified:true,rawResponse:{simulated:true}};
    if (callback.checkoutRequestId !== payment.checkout_request_id || (callback.merchantRequestId && callback.merchantRequestId !== payment.merchant_request_id)) throw new Error('Fixture callback identity mismatch');
    return {status:callback.status==='SUCCESS'?'CAPTURED':callback.status==='CANCELLED'?'CANCELLED':'FAILED',verified:true,
      amountMinor:callback.amountMinor,currency:payment.currency,receiver:'fixture-receiver',paymentId:payment.id,orderId:payment.order_id,
      providerReference:callback.receiptNumber||callback.providerReference,receiptNumber:callback.receiptNumber,rawResponse:{simulated:true,eventId:callback.providerEventId}};
  }
  public async voidPayment(_payment: Payment): Promise<void> { requireSimulationMode(); }

  public async queryStatus(
    checkoutRequestId: string,
    metadata?: Record<string, unknown>
  ): Promise<ProviderStatusResult> {
    requireSimulationMode();
    return {
      status: 'CAPTURED',
      providerReference: checkoutRequestId,
      rawResponse: {
        ResponseCode: '0',
        ResponseDescription: 'The service request has been accepted successfully',
        MerchantRequestID: metadata?.merchantRequestId || 'MR_QUERY',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: '0',
        ResultDesc: 'The service request is processed successfully.',
      },
    };
  }

  /**
   * Handles M-PESA B2C refund / reversal
   */
  public async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    requireSimulationMode();
    const refundReference = `REV_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    logger.info('Processed M-PESA reversal/refund', {
      service: 'payment-mpesa',
      metadata: {
        refundId: input.refundId,
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        refundReference,
      },
    });

    return {
      success: true,
      providerRefundId: `fixture-refund:${input.refundId}`,
      verified: true, amountMinor: input.amountMinor, currency: input.currency,
      rawResponse: {
        ConversationID: `AG_${Date.now()}`,
        OriginatorConversationID: refundReference,
        ResponseCode: '0',
        ResponseDesc: 'Accept the service request successfully.',
      },
    };
  }
}

export const mpesaPaymentProvider = new MpesaPaymentProvider();
